
import { GoogleGenAI, Type } from "@google/genai";
import { TranscriptionSegment } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const TRANSCRIPTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          startTime: {
            type: Type.STRING,
            description: "Timestamp mulai. WAJIB format HH:MM:SS.mmm (contoh: '00:00:01.234'). Jangan bulatkan.",
          },
          endTime: {
            type: Type.STRING,
            description: "Timestamp akhir. WAJIB format HH:MM:SS.mmm (contoh: '00:00:04.567').",
          },
          text: {
            type: Type.STRING,
            description: "Teks transkripsi.",
          },
        },
        required: ["startTime", "endTime", "text"],
      },
    },
  },
  required: ["segments"],
};

/**
 * Robustly normalizes timestamp strings to HH:MM:SS.mmm
 * Handles cases where models confuse HH:MM:SS with MM:SS:mmm
 */
function normalizeTimestamp(ts: string): string {
  if (!ts) return "00:00:00.000";
  
  // Clean string from any non-digit/colon/period characters
  const clean = ts.replace(/[^\d:.]/g, '');
  
  // Split by both : and . to identify components
  const components = clean.split(/[:.]/);
  
  let hh = "00", mm = "00", ss = "00", mmm = "000";

  if (components.length >= 4) {
    // Likely HH:MM:SS:mmm or HH:MM:SS.mmm
    [hh, mm, ss, mmm] = components;
  } else if (components.length === 3) {
    // Tricky case: HH:MM:SS or MM:SS:mmm?
    // If the 3rd component has 3 digits, it's almost certainly milliseconds
    if (components[2].length === 3) {
      [mm, ss, mmm] = components;
    } else {
      [hh, mm, ss] = components;
    }
  } else if (components.length === 2) {
    // Assume MM:SS
    [mm, ss] = components;
  } else if (components.length === 1) {
    // Assume seconds only
    ss = components[0];
  }

  // Final formatting and padding
  const fHH = hh.padStart(2, '0').substring(0, 2);
  const fMM = mm.padStart(2, '0').substring(0, 2);
  const fSS = ss.padStart(2, '0').substring(0, 2);
  const fMMM = mmm.padEnd(3, '0').substring(0, 3);

  return `${fHH}:${fMM}:${fSS}.${fMMM}`;
}

/**
 * Attempts to repair truncated JSON strings commonly returned by LLMs when hitting token limits.
 * Assumes the structure is {"segments": [...]}
 */
function tryRepairJson(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    // If it fails, try to repair
  }

  const trimmed = jsonString.trim();
  
  // 1. If it ends with a comma inside the array, remove it and close
  // 2. If it ends inside a string or object, find the last complete object close '}', cut, and close array.
  
  // Find the last occurrence of "}," which signifies the end of a segment object in the array
  // OR just "}" if it's the last one before truncation
  const lastObjectEnd = trimmed.lastIndexOf('}');
  
  if (lastObjectEnd === -1) {
    throw new Error("Response too short or malformed to repair.");
  }

  // Check if we are potentially inside the root object closing
  // The schema is { segments: [ ... ] }
  // So we expect the last valid char to be '}' of a segment, then maybe ']' then '}'
  
  // We will construct a string up to the last '}', close the array and root object.
  const repaired = trimmed.substring(0, lastObjectEnd + 1) + "]}";
  
  try {
    const parsed = JSON.parse(repaired);
    if (parsed.segments && Array.isArray(parsed.segments)) {
      return parsed;
    }
  } catch (e) {
    // Second attempt: Maybe the last '}' was the closing of the "segments" array or root object?
    // Unlikely if it was truncated inside a string as the error suggests.
    // Let's try to match all complete objects using Regex as a fallback for severe truncation.
    const segments = [];
    // Regex to match {"startTime": "...", "endTime": "...", "text": "..."}
    // We make it lenient on whitespace
    const segmentRegex = /\{\s*"startTime"\s*:\s*"([^"]+)"\s*,\s*"endTime"\s*:\s*"([^"]+)"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
    
    let match;
    while ((match = segmentRegex.exec(trimmed)) !== null) {
      segments.push({
        startTime: match[1],
        endTime: match[2],
        text: match[3]
      });
    }
    
    if (segments.length > 0) {
      return { segments };
    }
    
    throw e; // Rethrow original or new error if repair failed
  }
}

export async function transcribeAudio(
  modelName: string,
  audioBase64: string,
  mimeType: string,
  signal?: AbortSignal
): Promise<TranscriptionSegment[]> {
  try {
    const isGemini3 = modelName.includes('gemini-3');
    
    // Instruksi temporal yang lebih tajam
    const syncInstruction = isGemini3 
      ? "PERINGATAN: Jangan memberikan timestamp mulai sebelum suara vokal benar-benar terdengar (hindari antisipasi). Pastikan 'startTime' selaras dengan milidetik pertama fonem awal kata tersebut."
      : "PENTING: Gunakan format LENGKAP HH:MM:SS.mmm. Contoh: Jika 23 detik, tulis '00:00:23.000', JANGAN tulis '00:23:000'. Pastikan bagian jam (HH) selalu ada.";

    const precisionInstruction = "ANALISIS gelombang suara secara mendetail. JANGAN MEMBULATKAN waktu. Gunakan presisi milidetik (mmm) secara eksplisit. Format WAJIB: HH:MM:SS.mmm.";

    // New detailed instruction for segmentation to fix grouping/missing repetition issues
    const segmentationInstruction = `
    ATURAN SEGMENTASI & KELENGKAPAN (CRITICAL):
    1. SEGMENTASI GRANULAR: Pecah teks menjadi potongan-potongan kecil (per kalimat atau per frasa napas). JANGAN menggabungkan banyak kalimat dalam satu timestamp. Idealnya satu segmen < 7 detik.
    2. VERBATIM TOTAL (NO DEDUPLICATION): Transkripsikan setiap kata PERSIS seperti yang diucapkan.
    3. PENANGANAN PENGULANGAN & LIRIK:
       - JANGAN PERNAH MENGHILANGKAN PENGULANGAN. Jika penyanyi menyanyikan baris yang sama 3 kali, BUAT 3 SEGMEN TERPISAH dengan teks yang sama.
       - JANGAN melakukan 'deduplication' atau menyimpulkan teks.
       - Contoh: Jika liriknya "Baby, baby, baby", JANGAN tulis "Baby [x3]" atau hanya satu "Baby". Tulis lengkap: "Baby, baby, baby".
       - Jika ini adalah LAGU: Pastikan Refrain/Chorus ditulis lengkap SETIAP KALI muncul.
    4. NO GAPS: Pastikan tidak ada durasi audio yang terlewat tanpa transkripsi.
    `;

    const requestConfig: any = {
      responseMimeType: "application/json",
      responseSchema: TRANSCRIPTION_SCHEMA,
      temperature: 0.1,
    };

    // For Gemini 3, disable thinking to maximize output tokens for the actual transcription content
    if (isGemini3) {
      requestConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const abortPromise = new Promise<never>((_, reject) => {
      if (signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });

    // Race the API call against the abort signal
    const response: any = await Promise.race([
      ai.models.generateContent({
        model: modelName,
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: audioBase64,
                  mimeType: mimeType,
                },
              },
              {
                text: `Transkripsikan audio ini secara lengkap (VERBATIM).
                Ini mungkin berisi nyanyian/lirik yang berulang.
                 
                ${precisionInstruction}
                ${syncInstruction}
                ${segmentationInstruction}
                
                Format JSON: {"segments": [{"startTime": "HH:MM:SS.mmm", "endTime": "HH:MM:SS.mmm", "text": "..."}]}
                Pastikan konsistensi format waktu agar UI tidak melompat.`,
              },
            ],
          },
        ],
        config: requestConfig,
      }),
      abortPromise
    ]);

    let text = response.text;
    if (!text) throw new Error("Empty response from model");

    // Clean up potential markdown formatting
    text = text.trim();
    if (text.startsWith('```json')) {
      text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (text.startsWith('```')) {
      text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = tryRepairJson(text);
    const segments = parsed.segments || [];

    return segments.map((s: any) => ({
      startTime: normalizeTimestamp(String(s.startTime)),
      endTime: normalizeTimestamp(String(s.endTime)),
      text: String(s.text)
    }));
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw error;
    }
    console.error(`Error transcribing with ${modelName}:`, error);
    throw new Error(error.message || "Transcription failed");
  }
}

export async function translateSegments(
  segments: TranscriptionSegment[],
  targetLanguage: string
): Promise<TranscriptionSegment[]> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `Translate these segments into ${targetLanguage}. 
              PENTING: JANGAN MENGUBAH angka timestamp sedikitpun. Pertahankan format HH:MM:SS.mmm secara eksak.
              Data: ${JSON.stringify(segments)}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  startTime: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  text: { type: Type.STRING },
                  translatedText: { type: Type.STRING },
                },
                required: ["startTime", "endTime", "text", "translatedText"],
              },
            },
          },
        },
      },
    });

    let text = response.text;
    if (!text) throw new Error("Empty response from translation model");
    
    // Clean markdown for translation as well
    text = text.trim();
    if (text.startsWith('```json')) {
      text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (text.startsWith('```')) {
      text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(text);
    return parsed.segments || [];
  } catch (error: any) {
    console.error("Translation error:", error);
    throw error;
  }
}

export async function generateSpeech(text: string): Promise<string | undefined> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Zephyr' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("TTS error:", error);
    throw error;
  }
}
