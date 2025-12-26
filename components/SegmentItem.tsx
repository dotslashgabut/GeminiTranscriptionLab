
import React, { useEffect, useRef, useState } from 'react';
import { TranscriptionSegment } from '../types';
import { generateSpeech } from '../services/geminiService';
import { decodeBase64, decodeAudioData } from '../utils/audio';

interface SegmentItemProps {
  segment: TranscriptionSegment;
  isActive?: boolean;
  onSelect: (startTime: string) => void;
}

const SegmentItem: React.FC<SegmentItemProps> = ({ segment, isActive, onSelect }) => {
  const elementRef = useRef<HTMLButtonElement>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (isActive && elementRef.current) {
      elementRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [isActive]);

  const handleSpeak = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSpeaking) return;
    if (!segment.translatedText) return;

    setIsSpeaking(true);
    try {
      const audioData = await generateSpeech(segment.translatedText);
      if (!audioData) throw new Error("No audio data received");

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const ctx = audioContextRef.current;
      const decodedBytes = decodeBase64(audioData);
      const audioBuffer = await decodeAudioData(decodedBytes, ctx, 24000, 1);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsSpeaking(false);
      source.start();
    } catch (error) {
      console.error("Failed to play TTS:", error);
      setIsSpeaking(false);
    }
  };

  return (
    <button
      ref={elementRef}
      onClick={() => onSelect(segment.startTime)}
      className={`w-full text-left group flex flex-col p-3 border-b border-slate-100 transition-all focus:outline-none ${
        isActive 
          ? 'bg-blue-100/70 border-l-4 border-l-blue-600 shadow-sm z-10' 
          : 'hover:bg-blue-50/50 border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded transition-colors ${
          isActive 
            ? 'text-white bg-blue-600' 
            : 'text-blue-600 bg-blue-50 group-hover:bg-blue-100'
        }`}>
          {segment.startTime} - {segment.endTime}
        </span>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="12" 
          height="12" 
          viewBox="0 0 24 24" 
          fill="currentColor" 
          className={`transition-opacity ${isActive ? 'text-blue-600 opacity-100' : 'text-blue-400 opacity-0 group-hover:opacity-100'}`}
        >
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      </div>
      <p className={`leading-relaxed text-sm transition-colors ${
        isActive ? 'text-slate-900 font-bold' : 'text-slate-700 group-hover:text-slate-900 font-medium'
      }`}>
        {segment.text}
      </p>
      {segment.translatedText && (
        <div className="mt-2 flex items-start gap-2">
          <p className={`leading-relaxed text-sm italic border-l-2 pl-2 transition-colors flex-1 ${
            isActive ? 'text-indigo-800 border-indigo-400 font-semibold' : 'text-indigo-600 border-indigo-100'
          }`}>
            {segment.translatedText}
          </p>
          <button 
            onClick={handleSpeak}
            disabled={isSpeaking}
            className={`flex-shrink-0 p-1.5 rounded-full transition-all ${
              isSpeaking 
                ? 'bg-indigo-100 text-indigo-400 animate-pulse' 
                : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100 active:scale-95'
            }`}
            title="Listen to translation"
          >
            {isSpeaking ? (
               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
            ) : (
               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            )}
          </button>
        </div>
      )}
    </button>
  );
};

export default SegmentItem;
