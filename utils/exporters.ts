
import { TranscriptionSegment } from "../types";

/**
 * Robustly parses various timestamp formats into total seconds.
 */
const parseTimestampToSeconds = (ts: string | number): number => {
  if (ts === undefined || ts === null) return 0;
  let str = ts.toString().trim().toLowerCase();
  str = str.replace(/[ms]/g, '').replace(',', '.');

  if (str.includes(':')) {
    const parts = str.split(':').map(p => parseFloat(p) || 0);
    // HH:MM:SS.mmm
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    // MM:SS.mmm
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
  }
  return parseFloat(str) || 0;
};

const formatSecondsToSRT = (totalSeconds: number): string => {
  const roundedMs = Math.round(totalSeconds * 1000);
  const h = Math.floor(roundedMs / 3600000);
  const m = Math.floor((roundedMs % 3600000) / 60000);
  const s = Math.floor((roundedMs % 60000) / 1000);
  const ms = roundedMs % 1000;
  
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

const formatSecondsToLRC = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = (totalSeconds % 60);
  const sInt = Math.floor(s);
  const ms = Math.round((s % 1) * 100); // LRC usually uses 2 digits for ms (hundredths)

  return `[${m.toString().padStart(2, '0')}:${sInt.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}]`;
};

const escapeXml = (unsafe: string): string => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

export const downloadFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportAsTXT = (segments: TranscriptionSegment[], type: 'original' | 'translated'): string => {
  return segments.map(s => {
    return type === 'translated' ? (s.translatedText || '') : s.text;
  }).join('\n\n');
};

export const exportAsSRT = (segments: TranscriptionSegment[], type: 'original' | 'translated'): string => {
  return segments.map((s, i) => {
    const text = type === 'translated' ? (s.translatedText || '') : s.text;
    const start = formatSecondsToSRT(parseTimestampToSeconds(s.startTime));
    const end = formatSecondsToSRT(parseTimestampToSeconds(s.endTime));
    return `${i + 1}\n${start} --> ${end}\n${text}\n`;
  }).join('\n');
};

export const exportAsLRC = (segments: TranscriptionSegment[], type: 'original' | 'translated', totalDuration?: number): string => {
  const lines: string[] = [];
  // LRC needs time tag at start of line. Standard is [mm:ss.xx]
  // We handle simple synchronized lyrics.
  // Ideally, LRC is one line per timestamp. 
  
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const startTime = parseTimestampToSeconds(s.startTime);
    const text = type === 'translated' ? (s.translatedText || '') : s.text;

    // Remove newlines from text for LRC compatibility
    const cleanText = text.replace(/[\r\n]+/g, ' ');
    lines.push(`${formatSecondsToLRC(startTime)}${cleanText}`);
  }
  return lines.join('\n');
};

export const exportAsTTML = (segments: TranscriptionSegment[], type: 'original' | 'translated'): string => {
  const lines = segments.map((s) => {
    const text = type === 'translated' ? (s.translatedText || '') : s.text;
    // Ensure HH:MM:SS.mmm format for TTML if not already
    let start = s.startTime.includes('.') ? s.startTime : `${s.startTime}.000`;
    let end = s.endTime.includes('.') ? s.endTime : `${s.endTime}.000`;
    
    // Basic normalization to ensure HH:MM:SS.mmm if it came in as MM:SS.mmm
    if (start.length <= 9) start = "00:" + start;
    if (end.length <= 9) end = "00:" + end;

    return `      <p begin="${start}" end="${end}">${escapeXml(text)}</p>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling" xml:lang="en">
  <head>
    <styling>
      <style xml:id="defaultCaption" tts:fontSize="10px" tts:fontFamily="SansSerif" tts:fontWeight="normal" tts:fontStyle="normal" tts:textDecoration="none" tts:color="white" tts:backgroundColor="black" tts:textAlign="center" />
    </styling>
  </head>
  <body>
    <div style="defaultCaption">
${lines}
    </div>
  </body>
</tt>`;
};

export const exportAsJSON = (segments: TranscriptionSegment[], type: 'original' | 'translated'): string => {
  const data = segments.map(s => ({
    startTime: s.startTime,
    endTime: s.endTime,
    text: type === 'translated' ? (s.translatedText || '') : s.text
  }));
  return JSON.stringify(data, null, 2);
};
