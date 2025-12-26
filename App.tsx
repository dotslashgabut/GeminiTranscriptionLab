
import React, { useState, useRef, useEffect } from 'react';
import { AudioFileData, TranscriptionResult, TranscriptionSegment } from './types';
import { transcribeAudio, translateSegments } from './services/geminiService';
import SegmentItem from './components/SegmentItem';
import SkeletonLoader from './components/SkeletonLoader';
import * as Exporters from './utils/exporters';

const LANGUAGES = [
  "Indonesian", "English", "Japanese", "Korean", "Spanish", "French", "German", 
  "Chinese (Simplified)", "Chinese (Traditional)", "Arabic", "Russian", 
  "Portuguese", "Italian", "Dutch", "Turkish", "Vietnamese", "Thai", "Hindi",
  "Malay", "Filipino"
];

const App: React.FC = () => {
  const [audioFile, setAudioFile] = useState<AudioFileData | null>(null);
  const [targetLang, setTargetLang] = useState("Indonesian");
  const [currentTime, setCurrentTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [results, setResults] = useState<{
    left: TranscriptionResult;
    right: TranscriptionResult;
  }>({
    left: { modelName: 'gemini-2.5-flash', segments: [], loading: false },
    right: { modelName: 'gemini-3-flash-preview', segments: [], loading: false },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const appContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      appContainerRef.current?.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        setAudioFile({
          base64,
          mimeType: file.type,
          fileName: file.name,
          previewUrl: URL.createObjectURL(file),
        });
        setCurrentTime(0);
      };
      reader.readAsDataURL(file);
    }
  };

  const parseTimestamp = (timestamp: string): number => {
    if (!timestamp) return 0;
    const cleanTs = timestamp.replace(',', '.');
    const parts = cleanTs.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  };

  const handleSegmentClick = (startTime: string) => {
    if (audioRef.current) {
      const seconds = parseTimestamp(startTime);
      audioRef.current.currentTime = seconds;
      audioRef.current.play().catch(console.error);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const startTranscription = async () => {
    if (!audioFile) return;
    setResults({
      left: { ...results.left, loading: true, segments: [], error: undefined },
      right: { ...results.right, loading: true, segments: [], error: undefined },
    });
    const runTranscription = async (side: 'left' | 'right') => {
      try {
        const segments = await transcribeAudio(results[side].modelName, audioFile.base64, audioFile.mimeType);
        setResults(prev => ({ ...prev, [side]: { ...prev[side], segments, loading: false } }));
      } catch (err: any) {
        setResults(prev => ({ ...prev, [side]: { ...prev[side], error: err.message, loading: false } }));
      }
    };
    await Promise.all([runTranscription('left'), runTranscription('right')]);
  };

  const handleTranslate = async () => {
    setResults(prev => ({
      left: { ...prev.left, translating: true },
      right: { ...prev.right, translating: true }
    }));
    const runTranslate = async (side: 'left' | 'right') => {
      if (results[side].segments.length === 0) return;
      try {
        const translated = await translateSegments(results[side].segments, targetLang);
        setResults(prev => ({ ...prev, [side]: { ...prev[side], segments: translated, translating: false } }));
      } catch (err: any) {
        alert(`Translation failed: ${err.message}`);
        setResults(prev => ({ ...prev, [side]: { ...prev[side], translating: false } }));
      }
    };
    await Promise.all(['left', 'right'].map((s: any) => runTranslate(s as 'left' | 'right')));
  };

  const handleDownload = (side: 'left' | 'right', format: string, type: 'original' | 'translated') => {
    const segments = results[side].segments;
    if (segments.length === 0) return;

    const baseFileName = audioFile?.fileName.split('.').slice(0, -1).join('.') || 'audio';
    const modelTag = results[side].modelName.includes('2.5') ? 'f2.5' : 'f3';
    const langTag = type === 'translated' ? `_${targetLang}` : '';
    const filename = `${baseFileName}_${modelTag}${langTag}.${format.toLowerCase()}`;

    const totalDuration = audioRef.current && isFinite(audioRef.current.duration) 
      ? audioRef.current.duration 
      : undefined;

    let content = "";
    switch (format) {
      case 'TXT': content = Exporters.exportAsTXT(segments, type); break;
      case 'JSON': content = Exporters.exportAsJSON(segments, type); break;
      case 'SRT': content = Exporters.exportAsSRT(segments, type); break;
      case 'LRC': content = Exporters.exportAsLRC(segments, type, totalDuration); break;
    }
    
    Exporters.downloadFile(content, filename);
  };

  const isTranscribing = results.left.loading || results.right.loading;
  const isTranslating = results.left.translating || results.right.translating;
  const hasResults = results.left.segments.length > 0 || results.right.segments.length > 0;

  return (
    <div ref={appContainerRef} className={`min-h-screen flex flex-col overflow-hidden ${isFullscreen ? 'bg-slate-50' : 'bg-slate-50'}`}>
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                Gemini Transcription Lab
              </h1>
              <p className="text-slate-500 text-sm">Transcribe, Translate, and Compare Models</p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <input type="file" accept="audio/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
              <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                {audioFile ? 'Change Audio' : 'Upload Audio'}
              </button>
              
              <button
                disabled={!audioFile || isTranscribing}
                onClick={startTranscription}
                className={`px-5 py-2 text-sm font-bold text-white rounded-lg shadow-md transition-all ${
                  !audioFile || isTranscribing ? 'bg-slate-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isTranscribing ? 'Processing...' : 'Start Transcribe'}
              </button>

              <button 
                onClick={toggleFullscreen}
                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 shadow-sm bg-white"
              >
                {isFullscreen ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v5H3M21 8h-5V3M3 16h5v5M16 21v-5h5"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
                )}
              </button>

              {hasResults && (
                <div className="flex items-center gap-2 border-l pl-3 ml-1 border-slate-200">
                  <select 
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="text-sm border-slate-300 rounded-lg focus:ring-indigo-500 py-1.5 bg-white shadow-sm text-slate-900"
                  >
                    {LANGUAGES.map(l => <option key={l} value={l} className="text-slate-900">{l}</option>)}
                  </select>
                  <button
                    disabled={isTranslating}
                    onClick={handleTranslate}
                    className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-slate-300"
                  >
                    {isTranslating ? 'Translating...' : 'Translate'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {audioFile && (
            <div className="pt-4 border-t border-slate-100 flex items-center gap-4">
               <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selected Audio</p>
                  <p className="text-sm font-semibold text-slate-700 truncate">{audioFile.fileName}</p>
               </div>
               <audio 
                ref={audioRef} 
                src={audioFile.previewUrl} 
                onTimeUpdate={handleTimeUpdate}
                controls 
                className="h-10 flex-1 max-w-2xl" 
               />
            </div>
          )}
        </div>
      </header>

      <div className={`flex-1 flex flex-col overflow-hidden`}>
        <main className={`flex-1 w-full mx-auto grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-200 overflow-hidden shadow-inner ${isFullscreen ? 'h-full' : 'max-w-7xl'}`}>
          {(['left', 'right'] as const).map((side) => {
            const hasTranslation = results[side].segments.some(s => !!s.translatedText);
            return (
              <div key={side} className="bg-white flex flex-col h-full overflow-hidden">
                <div className={`p-4 border-b border-slate-200 flex-shrink-0 ${side === 'left' ? 'bg-slate-50' : 'bg-indigo-50/50'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">{results[side].modelName}</h2>
                      <p className="text-xs text-slate-500">{side === 'left' ? 'Efficiency Model' : 'Intelligence Model'}</p>
                    </div>
                    {results[side].segments.length > 0 && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold self-start sm:self-center">READY</span>
                    )}
                  </div>
                  
                  {results[side].segments.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-400 uppercase min-w-[60px]">Original:</span>
                        {['TXT', 'SRT', 'LRC', 'JSON'].map(format => (
                          <button
                            key={format}
                            onClick={() => handleDownload(side, format, 'original')}
                            className="px-2 py-0.5 text-[9px] font-bold border rounded bg-white hover:bg-slate-100 transition-colors shadow-sm text-slate-600 hover:text-blue-600"
                          >
                            {format}
                          </button>
                        ))}
                      </div>
                      {hasTranslation && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase min-w-[60px]">Translate:</span>
                          {['TXT', 'SRT', 'LRC', 'JSON'].map(format => (
                            <button
                              key={format}
                              onClick={() => handleDownload(side, format, 'translated')}
                              className="px-2 py-0.5 text-[9px] font-bold border border-indigo-100 rounded bg-indigo-50/30 hover:bg-indigo-50 transition-colors shadow-sm text-indigo-600 hover:text-indigo-800"
                            >
                              {format}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex-1 overflow-y-auto relative scroll-smooth bg-white">
                  {(results[side].loading || results[side].translating) ? (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center space-y-4">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm font-bold text-slate-600">{results[side].translating ? 'Translating...' : 'Transcribing...'}</p>
                    </div>
                  ) : null}

                  {results[side].error ? (
                    <div className="p-10 text-center">
                      <div className="text-red-500 mb-2 font-semibold">⚠️ Error</div>
                      <p className="text-slate-500 text-sm">{results[side].error}</p>
                    </div>
                  ) : results[side].segments.length > 0 ? (
                    results[side].segments.map((s, idx) => {
                      const start = parseTimestamp(s.startTime);
                      const end = parseTimestamp(s.endTime);
                      const isActive = currentTime >= start && currentTime < end;
                      
                      return (
                        <SegmentItem 
                          key={idx} 
                          segment={s} 
                          isActive={isActive}
                          onSelect={handleSegmentClick} 
                        />
                      );
                    })
                  ) : !results[side].loading && (
                    <div className="h-full flex flex-col items-center justify-center p-10 text-center opacity-40">
                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <p className="text-sm font-medium">No results to display</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </main>
      </div>

      <footer className="bg-slate-900 text-slate-400 p-4 text-xs border-t border-slate-800 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <span>Powered by Gemini API</span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Service Active</span>
          </div>
          <div className="flex gap-4">
             <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span>Click to Seek</span>
             </div>
             <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                <span>Real-time Highlighting</span>
             </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
