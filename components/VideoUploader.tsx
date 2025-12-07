import React, { useRef, useState } from 'react';
import { Icons } from '../constants';

interface VideoUploaderProps {
  onFileLoaded: (buffer: AudioBuffer, file: File, thumbnail?: string) => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({ onFileLoaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setIsProcessing(true);
    let audioContext: AudioContext | null = null;
    
    try {
      // 1. Get Thumbnail if video
      let thumbnail: string | undefined;
      if (file.type.startsWith('video/')) {
        try {
          thumbnail = await generateThumbnail(file);
        } catch (e) {
          console.warn('Could not generate thumbnail', e);
        }
      }

      // 2. Decode Audio
      const arrayBuffer = await file.arrayBuffer();
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      onFileLoaded(audioBuffer, file, thumbnail);
    } catch (error) {
      console.error('Error processing file:', error);
      alert('无法处理此文件，请确保它是有效的音频或视频文件。');
    } finally {
      setIsProcessing(false);
      // Clean up audio context
      if (audioContext) {
        audioContext.close().catch(console.error);
      }
    }
  };

  const generateThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.playsInline = true;
      video.currentTime = 1; // Capture at 1s

      video.onloadeddata = () => {
        if (video.duration < 1) video.currentTime = 0;
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          URL.revokeObjectURL(video.src);
          resolve(dataUrl);
        } else {
          reject('Canvas context failed');
        }
      };

      video.onerror = (e) => reject(e);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div 
      className={`
        border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer
        flex flex-col items-center justify-center gap-6 group
        ${isDragging 
          ? 'border-primary bg-primary/10 scale-[1.02]' 
          : 'border-zinc-700 bg-surface/50 hover:border-zinc-500 hover:bg-surface'
        }
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="video/*,audio/*"
        onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
      />

      {isProcessing ? (
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          <p className="text-xl font-medium text-white">正在提取音频...</p>
          <p className="text-sm text-zinc-400">处理大文件可能需要几秒钟</p>
        </div>
      ) : (
        <>
          <div className="w-20 h-20 bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:text-primary group-hover:scale-110 transition-all duration-300 shadow-xl">
            <Icons.Upload />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-white">上传视频、录屏或音频</h3>
            <p className="text-zinc-400 text-lg">
              拖放文件到这里，或 <span className="text-primary hover:underline">点击浏览</span>
            </p>
          </div>

          <div className="flex gap-3 text-xs font-mono text-zinc-500 bg-zinc-900/50 px-4 py-2 rounded-full border border-zinc-800">
            <span>MP4</span>
            <span>MOV</span>
            <span>MP3</span>
            <span>WAV</span>
            <span>M4A</span>
          </div>
        </>
      )}
    </div>
  );
};