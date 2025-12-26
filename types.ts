
export interface TranscriptionSegment {
  startTime: string; // Format like "00:00:00" or seconds
  endTime: string;
  text: string;
  translatedText?: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  modelName: string;
  error?: string;
  loading: boolean;
  translating?: boolean;
}

export interface AudioFileData {
  base64: string;
  mimeType: string;
  fileName: string;
  previewUrl: string;
}
