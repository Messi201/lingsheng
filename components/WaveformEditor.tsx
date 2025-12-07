import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import { Icons } from '../constants';
import { audioBufferToWav, audioBufferToMp3 } from '../services/audioUtils';

interface WaveformEditorProps {
  audioBuffer: AudioBuffer;
  originalFileName: string;
  thumbnailBase64?: string;
  onReset: () => void;
  onDownloadSuccess: () => void;
}

export const WaveformEditor: React.FC<WaveformEditorProps> = ({ 
  audioBuffer, 
  originalFileName,
  onReset,
  onDownloadSuccess
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  
  // Custom Region State Refs
  const regionRef = useRef({ start: 0, end: 0 });
  const regionElementsRef = useRef<{
    layer: HTMLDivElement | null;
    box: HTMLDivElement | null;
    handleStart: HTMLDivElement | null;
    handleEnd: HTMLDivElement | null;
  }>({ layer: null, box: null, handleStart: null, handleEnd: null });

  // Drag State
  const dragRef = useRef<{
    target: 'start' | 'end' | 'box' | null;
    startX: number;
    startScrollLeft: number;
    startTimeState: { start: number; end: number };
  }>({ target: null, startX: 0, startScrollLeft: 0, startTimeState: { start: 0, end: 0 } });

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  // Metadata State
  const [fileName, setFileName] = useState(originalFileName.replace(/\.[^/.]+$/, "") + "_铃声");
  const [currentDuration, setCurrentDuration] = useState(0); 
  const [totalDuration, setTotalDuration] = useState(0); 
  const [currentTime, setCurrentTime] = useState(0); 
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav');
  
  // Editor State
  const [zoomLevel, setZoomLevel] = useState(0); 
  const [volume, setVolume] = useState(1.0);
  
  // Effects State
  const [fadeInDuration, setFadeInDuration] = useState(1.0);
  const [fadeOutDuration, setFadeOutDuration] = useState(1.0);
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0);

  // Refs for preview and processing
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  /**
   * Helper: Update DOM positions based on time state
   */
  const updateRegionDOM = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws || !regionElementsRef.current.box || !regionElementsRef.current.layer) return;

    const { start, end } = regionRef.current;
    const duration = ws.getDuration();
    if (duration <= 0) return;

    const wrapper = ws.getWrapper();
    const scrollWidth = wrapper.scrollWidth;
    
    // Sync layer width with wrapper scrollWidth to ensure handles can reach the end
    regionElementsRef.current.layer.style.width = `${scrollWidth}px`;

    const pxPerSec = scrollWidth / duration;
    const leftPx = start * pxPerSec;
    const widthPx = (end - start) * pxPerSec;

    regionElementsRef.current.box.style.left = `${leftPx}px`;
    regionElementsRef.current.box.style.width = `${widthPx}px`;

    // Update Time Labels
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
    };

    if (regionElementsRef.current.handleStart) {
      const startLabel = regionElementsRef.current.handleStart.querySelector('.time-label');
      if (startLabel) startLabel.textContent = formatTime(start);
    }

    if (regionElementsRef.current.handleEnd) {
      const endLabel = regionElementsRef.current.handleEnd.querySelector('.time-label');
      if (endLabel) endLabel.textContent = formatTime(end);
    }
  }, []);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    setIsReady(false);

    // --- 1. Create Advanced Canvas Gradients ---
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Gradient A: Base Wave (Darker Grey/Zinc)
    const baseGradient = ctx!.createLinearGradient(0, 0, 0, 128);
    baseGradient.addColorStop(0, '#52525b');
    baseGradient.addColorStop(0.5, '#3f3f46');
    baseGradient.addColorStop(1, '#18181b');

    // Gradient B: Progress Wave (Violet to Blue)
    const progressGradient = ctx!.createLinearGradient(0, 0, 0, 128);
    progressGradient.addColorStop(0, 'rgba(255,255,255,0.9)'); // Top shine
    progressGradient.addColorStop(0.3, '#a78bfa'); // Violet
    progressGradient.addColorStop(0.6, '#8b5cf6'); // Primary Violet
    progressGradient.addColorStop(1, '#3b82f6');   // Blue at bottom

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: baseGradient, 
      progressColor: progressGradient,
      cursorColor: '#ffffff',
      cursorWidth: 2,
      height: 96,
      normalize: false,
      minPxPerSec: zoomLevel,
      url: undefined,
      fillParent: true,
      autoScroll: true,
      autoCenter: true,
      interact: true,
      hideScrollbar: false,
    });

    wavesurferRef.current = ws;

    ws.registerPlugin(TimelinePlugin.create({
      height: 20, 
      style: {
        color: '#a1a1aa',
        fontSize: '10px',
        fontFamily: 'monospace',
      }
    }));

    // --- CUSTOM REGION DOM SETUP ---
    const wrapper = ws.getWrapper();

    // 0. Scroll Listener for Sync
    const handleScroll = () => updateRegionDOM();
    wrapper.addEventListener('scroll', handleScroll);
    
    // 1. Container Layer
    const layer = document.createElement('div');
    layer.className = 'custom-region-layer';
    Object.assign(layer.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        height: '100%',
        width: '100%', // Will be updated to scrollWidth dynamically
        pointerEvents: 'none', 
        zIndex: '10',
    });

    // 2. Region Box - Updated colors to match purple theme
    const box = document.createElement('div');
    box.className = 'custom-region-box';
    Object.assign(box.style, {
        position: 'absolute',
        top: '0',
        height: '100%',
        backgroundColor: 'rgba(139, 92, 246, 0.15)', // violet-500 low opacity
        borderTop: '1px solid rgba(139, 92, 246, 0.6)',
        borderBottom: '1px solid rgba(139, 92, 246, 0.6)',
        pointerEvents: 'auto', 
        cursor: 'move',
        touchAction: 'none', 
    });

    // 3. Start Handle
    const handleStart = document.createElement('div');
    handleStart.className = 'custom-region-handle start';
    handleStart.innerHTML = `
      <div class="handle-arrow"></div>
      <div class="time-label">00:00.0</div>
      <div class="connector"></div>
    `;
    Object.assign(handleStart.style, {
        position: 'absolute',
        left: '0',
        // top, bottom, width are handled by CSS class for refined styling
        transform: 'translateX(-50%)',
        cursor: 'ew-resize',
        zIndex: '20',
        touchAction: 'none',
        userSelect: 'none',
    });

    // 4. End Handle
    const handleEnd = document.createElement('div');
    handleEnd.className = 'custom-region-handle end';
    handleEnd.innerHTML = `
      <div class="handle-arrow"></div>
      <div class="time-label">00:00.0</div>
      <div class="connector"></div>
    `;
    Object.assign(handleEnd.style, {
        position: 'absolute',
        left: '100%', 
        // top, bottom, width are handled by CSS class for refined styling
        transform: 'translateX(-50%)',
        cursor: 'ew-resize',
        zIndex: '20',
        touchAction: 'none',
        userSelect: 'none',
    });

    box.appendChild(handleStart);
    box.appendChild(handleEnd);
    layer.appendChild(box);
    wrapper.appendChild(layer);

    regionElementsRef.current = { layer, box, handleStart, handleEnd };

    // --- INTERACTION LOGIC (Mouse & Touch) ---
    const getClientX = (e: MouseEvent | TouchEvent) => {
        if ('touches' in e) {
            return e.touches[0].clientX;
        }
        return (e as MouseEvent).clientX;
    };

    const handleDown = (e: MouseEvent | TouchEvent) => {
        const target = e.target as HTMLElement;
        const els = regionElementsRef.current;
        
        if (!els.box || !els.handleStart || !els.handleEnd) return;

        let targetType: 'start' | 'end' | 'box' | null = null;
        if (els.handleStart.contains(target)) targetType = 'start';
        else if (els.handleEnd.contains(target)) targetType = 'end';
        else if (els.box.contains(target)) targetType = 'box';
        else return;

        // Visual Feedback
        if (targetType === 'start') els.handleStart.classList.add('dragging');
        if (targetType === 'end') els.handleEnd.classList.add('dragging');

        e.stopPropagation(); 
        // Only prevent default on touch events to prevent scrolling, allow mouse interactions
        if ('touches' in e && e.cancelable) {
             e.preventDefault(); 
        }

        const wsWrapper = wavesurferRef.current?.getWrapper();
        
        dragRef.current = {
            target: targetType,
            startX: getClientX(e),
            startScrollLeft: wsWrapper ? wsWrapper.scrollLeft : 0, // Capture scroll
            startTimeState: { ...regionRef.current }
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('touchmove', handleMove, { passive: false });
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchend', handleUp);
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
        const { target, startX, startScrollLeft, startTimeState } = dragRef.current;
        const ws = wavesurferRef.current;
        
        if (!target || !ws) return;
        if (e.cancelable) e.preventDefault(); 

        const wrapper = ws.getWrapper();
        const duration = ws.getDuration();
        const scrollWidth = wrapper.scrollWidth;
        
        // Calculate Deltas including Scroll Offset
        const currentX = getClientX(e);
        const currentScrollLeft = wrapper.scrollLeft;
        
        const pxDeltaScreen = currentX - startX;
        const pxDeltaScroll = currentScrollLeft - startScrollLeft;
        const totalPxDelta = pxDeltaScreen + pxDeltaScroll;

        const pxPerSec = scrollWidth / duration;
        const timeDelta = totalPxDelta / pxPerSec;

        let newStart = regionRef.current.start;
        let newEnd = regionRef.current.end;

        if (target === 'start') {
            newStart = Math.min(Math.max(0, startTimeState.start + timeDelta), startTimeState.end - 0.1);
        } else if (target === 'end') {
            newEnd = Math.max(Math.min(duration, startTimeState.end + timeDelta), startTimeState.start + 0.1);
        } else if (target === 'box') {
            const span = startTimeState.end - startTimeState.start;
            newStart = Math.max(0, Math.min(duration - span, startTimeState.start + timeDelta));
            newEnd = newStart + span;
        }

        regionRef.current = { start: newStart, end: newEnd };
        setCurrentDuration(newEnd - newStart);
        updateRegionDOM();
    };

    const handleUp = () => {
        // Remove visual feedback
        if (regionElementsRef.current.handleStart) regionElementsRef.current.handleStart.classList.remove('dragging');
        if (regionElementsRef.current.handleEnd) regionElementsRef.current.handleEnd.classList.remove('dragging');

        dragRef.current.target = null;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        window.removeEventListener('touchend', handleUp);
        stopPreview();
    };

    // Attach listeners to DOM elements
    if (regionElementsRef.current.box) {
        // Use passive: false for touchstart to allow preventDefault
        regionElementsRef.current.box.addEventListener('mousedown', handleDown);
        regionElementsRef.current.box.addEventListener('touchstart', handleDown, { passive: false });
    }

    // --- EVENTS ---
    ws.on('ready', () => {
      setIsReady(true);
      const d = ws.getDuration();
      setTotalDuration(d);
      
      const initEnd = Math.min(d, 30);
      regionRef.current = { start: 0, end: initEnd };
      setCurrentDuration(initEnd);
      updateRegionDOM();
    });

    ws.on('redraw', () => updateRegionDOM());
    ws.on('zoom', () => updateRegionDOM());
    
    ws.on('timeupdate', (time) => {
      setCurrentTime(time);
      if (isPlaying) {
          const { start, end } = regionRef.current;
          if (time >= end || time < start) {
              ws.setTime(start);
          }
      }
    });

    ws.on('play', () => { setIsPlaying(true); stopPreview(); });
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => {
       if (isPlaying) ws.play();
       else setIsPlaying(false);
    });

    const wavBlob = audioBufferToWav(audioBuffer);
    const blobUrl = URL.createObjectURL(wavBlob);
    ws.load(blobUrl);

    return () => {
      if (wavesurferRef.current) {
        const wrapper = wavesurferRef.current.getWrapper();
        if (wrapper) wrapper.removeEventListener('scroll', handleScroll);
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      
      // Cleanup DOM listeners
      if (regionElementsRef.current.box) {
         regionElementsRef.current.box.removeEventListener('mousedown', handleDown);
         regionElementsRef.current.box.removeEventListener('touchstart', handleDown);
      }
      // Cleanup global listeners in case unmount happens during drag
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchend', handleUp);

      stopPreview();
      URL.revokeObjectURL(blobUrl);
    };
  }, [audioBuffer]); 

  // Update Zoom
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.zoom(zoomLevel);
      // Wait for next tick to let WaveSurfer update dimensions
      setTimeout(updateRegionDOM, 0);
    }
  }, [zoomLevel, isReady, updateRegionDOM]);

  // Update Volume
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      try { wavesurferRef.current.setVolume(volume > 1 ? 1 : volume); } catch (e) {}
    }
  }, [volume, isReady]);

  const toggleRawPlay = () => {
    if (!wavesurferRef.current || !isReady) return;
    
    if (isPlaying) {
      wavesurferRef.current.pause();
    } else {
      wavesurferRef.current.setTime(regionRef.current.start);
      wavesurferRef.current.play();
    }
  };

  const stopPreview = () => {
    if (previewSourceRef.current) {
      try { previewSourceRef.current.stop(); } catch (e) {}
      previewSourceRef.current = null;
    }
    if (previewContextRef.current) {
      previewContextRef.current.close();
      previewContextRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsPreviewing(false);
  };

  /**
   * Core Audio Processing Logic
   */
  const processAudioRegion = async (): Promise<AudioBuffer | null> => {
    const { start, end } = regionRef.current;
    let duration = end - start;

    if (duration <= 0) return null;

    const detuneFactor = Math.pow(2, pitch / 12);
    const effectiveRate = speed * detuneFactor;
    const outputDuration = duration / effectiveRate;

    const offlineCtx = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      outputDuration * audioBuffer.sampleRate,
      audioBuffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    
    source.playbackRate.value = speed;
    source.detune.value = pitch * 100;

    const gainNode = offlineCtx.createGain();
    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    source.start(0, start, duration);

    const fadeVolume = volume;
    gainNode.gain.setValueAtTime(0, 0);

    if (fadeInDuration > 0) {
      const safeFadeIn = Math.min(fadeInDuration, outputDuration / 2);
      gainNode.gain.linearRampToValueAtTime(fadeVolume, safeFadeIn);
    } else {
      gainNode.gain.setValueAtTime(fadeVolume, 0);
    }

    if (fadeOutDuration > 0) {
      const safeFadeOut = Math.min(fadeOutDuration, outputDuration / 2);
      const fadeOutStart = outputDuration - safeFadeOut;
      gainNode.gain.setValueAtTime(fadeVolume, fadeOutStart);
      gainNode.gain.linearRampToValueAtTime(0, outputDuration);
    }

    return await offlineCtx.startRendering();
  };

  const handlePreviewEffect = async () => {
    if (isPreviewing) {
      stopPreview();
      return;
    }

    if (isPlaying) {
      wavesurferRef.current?.pause();
    }

    try {
      const processedBuffer = await processAudioRegion();
      if (!processedBuffer) return;

      const { start } = regionRef.current;
      const regionDuration = regionRef.current.end - regionRef.current.start;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      previewContextRef.current = ctx;
      
      const source = ctx.createBufferSource();
      source.buffer = processedBuffer;
      source.connect(ctx.destination);
      
      const startTime = ctx.currentTime;
      const duration = processedBuffer.duration;

      source.onended = () => {
        setIsPreviewing(false);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      };
      
      previewSourceRef.current = source;
      source.start();
      setIsPreviewing(true);

      // Visual Playhead for Preview
      const tick = () => {
        if (!previewContextRef.current) return;
        
        const elapsed = previewContextRef.current.currentTime - startTime;
        if (elapsed > duration) return; 

        const progress = elapsed / duration;
        const currentWaveformTime = start + (progress * regionDuration);
        
        wavesurferRef.current?.setTime(currentWaveformTime);
        setCurrentTime(currentWaveformTime);

        animationFrameRef.current = requestAnimationFrame(tick);
      };
      
      tick();

    } catch (e) {
      console.error("Preview failed", e);
    }
  };

  const handleDownload = async () => {
    try {
      const processedBuffer = await processAudioRegion();
      if (!processedBuffer) return;

      let blob: Blob;
      let extension: string;

      if (exportFormat === 'wav') {
        blob = audioBufferToWav(processedBuffer);
        extension = 'wav';
      } else {
        blob = audioBufferToMp3(processedBuffer);
        extension = 'mp3';
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.${extension}`; 
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onDownloadSuccess();
    } catch (error) {
      console.error("Export failed", error);
      alert("生成铃声时出错，请重试。如果使用 MP3 遇到问题，请尝试切换回 WAV。");
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-fade-in pb-12">
      <style>{`
        /* --- ANIMATION DEFINITION --- */
        @keyframes breathe {
          0%, 100% {
            box-shadow: 0 0 5px rgba(139, 92, 246, 0.4);
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            box-shadow: 0 0 12px rgba(139, 92, 246, 0.6);
            transform: translate(-50%, -50%) scale(1.05);
          }
        }
        
        /* 核心手柄样式 - 替换原有 .custom-region-handle 相关代码 */
        .custom-region-handle {
          position: absolute;
          top: 10%;
          bottom: 10%;
          width: 10px;
          z-index: 20;
          cursor: ew-resize;
          touch-action: none;
          user-select: none;
          border-radius: 6px;
          /* 渐变主色调 - 与波形紫色呼应 */
          background: linear-gradient(90deg, #9333ea 0%, #6366f1 100%);
          /* 立体光影效果 */
          box-shadow: 
            0 0 0 1px rgba(255, 255, 255, 0.1) inset,
            0 2px 4px rgba(79, 70, 229, 0.3);
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* 手柄头部装饰 - 增强立体感 */
        .custom-region-handle::before {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          top: -4px;
          height: 4px;
          border-radius: 2px 2px 0 0;
          background: linear-gradient(90deg, #a855f7 0%, #7c3aed 100%);
          box-shadow: 0 -1px 2px rgba(139, 92, 246, 0.2) inset;
        }

        /* 手柄底部装饰 */
        .custom-region-handle::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: -4px;
          height: 4px;
          border-radius: 0 0 2px 2px;
          background: linear-gradient(90deg, #6d28d9 0%, #5b21b6 100%);
          box-shadow: 0 1px 2px rgba(79, 70, 229, 0.2) inset;
        }

        /* 箭头图标 - 居中悬浮效果 */
        .custom-region-handle .handle-arrow {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 14px;
          height: 14px;
          z-index: 52;
          transition: transform 0.2s ease;
        }

        /* 开始手柄箭头 */
        .custom-region-handle.start .handle-arrow {
          background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white' opacity='0.9'%3E%3Cpath d='M11 7L6 12l5 5V7z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-size: contain;
        }

        /* 结束手柄箭头 */
        .custom-region-handle.end .handle-arrow {
          background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white' opacity='0.9'%3E%3Cpath d='M13 7l5 5-5 5V7z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-size: contain;
        }

        /* 悬停状态 - 增强反馈 */
        .custom-region-handle:hover {
          width: 12px;
          background: linear-gradient(90deg, #a855f7 0%, #7c3aed 100%);
          box-shadow: 
            0 0 0 1px rgba(255, 255, 255, 0.15) inset,
            0 3px 8px rgba(79, 70, 229, 0.4);
        }

        .custom-region-handle:hover .handle-arrow {
          transform: translate(-50%, -50%) scale(1.15);
          opacity: 1;
        }

        /* 拖拽状态 - 动态反馈 */
        .custom-region-handle.dragging {
          background: linear-gradient(90deg, #c084fc 0%, #a78bfa 100%);
          box-shadow: 
            0 0 0 1px rgba(255, 255, 255, 0.2) inset,
            0 4px 12px rgba(139, 92, 246, 0.5);
          transform: scale(1.05);
        }

        /* 时间标签 - 悬浮提示 */
        .custom-region-handle .time-label {
          position: absolute;
          top: -30px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(30, 29, 47, 0.9);
          border: 1px solid rgba(139, 92, 246, 0.3);
          color: #e9d5ff;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s ease, transform 0.2s ease;
          transform: translateX(-50%) translateY(5px);
          z-index: 30;
        }

        .custom-region-handle:hover .time-label,
        .custom-region-handle.dragging .time-label {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }

        /* 连接线装饰 */
        .custom-region-handle .connector {
          position: absolute;
          top: 50%;
          width: 4px;
          height: 1px;
          background: rgba(168, 85, 247, 0.5);
        }

        .custom-region-handle.start .connector {
          right: 100%;
          transform: translateY(-50%);
        }

        .custom-region-handle.end .connector {
          left: 100%;
          transform: translateY(-50%);
        }
      `}</style>

      {/* 1. Header Row */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
        <div className="space-y-2 w-full md:w-auto">
           <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">铃声名称</label>
           <div className="flex gap-2">
             <input 
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-primary w-full md:w-64"
             />
           </div>
        </div>

        <button 
          onClick={onReset}
          className="text-zinc-500 hover:text-red-400 text-sm flex items-center gap-1 transition-colors"
        >
          <Icons.Trash />
          重置 / 上传新文件
        </button>
      </div>

      {/* 2. Editor Main Surface */}
      <div className="bg-surface rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden">
        
        {/* A. Waveform Area */}
        <div className="relative pt-4 pb-2 px-6 bg-zinc-900/50">
          <div ref={containerRef} className="w-full relative z-10 min-h-[120px] flex flex-col-reverse gap-2" />
          
          {/* Loading Overlay */}
          {!isReady && (
            <div className="absolute inset-0 bg-surface/80 z-20 flex items-center justify-center backdrop-blur-sm">
               <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-zinc-400 text-sm">加载波形中...</span>
               </div>
            </div>
          )}
        </div>

        {/* B. Transport Controls */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-zinc-800 bg-surface">
             <div className="flex items-center gap-4">
               <button 
                  onClick={toggleRawPlay}
                  className="w-12 h-12 bg-white hover:bg-zinc-200 rounded-full flex items-center justify-center text-black shadow-lg shadow-white/10 transition-all"
                  title="播放/暂停 (原始音频)"
                >
                  {isPlaying ? <Icons.Pause /> : <Icons.Play />}
                </button>
                
                {/* Time Display */}
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-1">
                     <span className="text-2xl font-mono font-bold text-white tracking-tight">
                        {currentTime.toFixed(1)}
                     </span>
                     <span className="text-sm font-mono text-zinc-500">
                        / {currentDuration.toFixed(1)}s
                     </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                    {currentDuration > 30 ? <span className="text-amber-500">选区过长</span> : "选区时长"}
                  </span>
                </div>
            </div>
            
            <div className="flex items-center gap-3 w-1/3 max-w-[200px]">
              <span className="text-zinc-500 text-xs whitespace-nowrap">缩放 (全景/细节)</span>
              <input 
                type="range" 
                min="0" 
                max="200" 
                step="5"
                value={zoomLevel} 
                onChange={(e) => setZoomLevel(Number(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-500"
              />
            </div>
        </div>

        {/* C. Sound Lab (Advanced Controls) */}
        <div className="bg-zinc-900/30 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-6">
            
            {/* Control Group 1: Fades */}
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">淡入时长</label>
                  <span className="text-xs font-mono text-primary">{fadeInDuration.toFixed(1)}s</span>
                </div>
                <input 
                  type="range" min="0" max="5" step="0.1"
                  value={fadeInDuration} onChange={(e) => setFadeInDuration(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">淡出时长</label>
                  <span className="text-xs font-mono text-primary">{fadeOutDuration.toFixed(1)}s</span>
                </div>
                <input 
                  type="range" min="0" max="5" step="0.1"
                  value={fadeOutDuration} onChange={(e) => setFadeOutDuration(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>

            {/* Control Group 2: Speed */}
            <div className="space-y-4">
               <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">播放速度</label>
                  <span className="text-xs font-mono text-secondary">{speed.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="2.0" step="0.1"
                  value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-secondary"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 font-mono pt-1">
                  <span>0.5x</span>
                  <span>1.0x</span>
                  <span>2.0x</span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-500 leading-tight">
                调整音频播放的快慢节奏。
              </p>
            </div>

            {/* Control Group 3: Pitch */}
            <div className="space-y-4">
               <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">音调 (变粗/变尖)</label>
                  <span className="text-xs font-mono text-accent">{pitch > 0 ? '+' : ''}{pitch}</span>
                </div>
                <input 
                  type="range" min="-12" max="12" step="1"
                  value={pitch} onChange={(e) => setPitch(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-accent"
                />
                 <div className="flex justify-between text-[10px] text-zinc-600 font-mono pt-1">
                  <span>深沉</span>
                  <span>原声</span>
                  <span>尖锐</span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-500 leading-tight">
                调整声音的高低，适合制作搞怪音效。
              </p>
            </div>

            {/* Control Group 4: Volume & Reset */}
             <div className="space-y-4">
               <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">总音量</label>
                  <span className="text-xs font-mono text-white">{(volume * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0.5" max="2.0" step="0.1"
                  value={volume} onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>
              <button 
                onClick={() => {
                  setSpeed(1);
                  setPitch(0);
                  setFadeInDuration(1);
                  setFadeOutDuration(1);
                  setVolume(1);
                }}
                className="w-full text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 py-2 rounded transition-colors"
              >
                重置所有效果
              </button>
            </div>
          </div>
        </div>
      </div>

       {/* Warning Toast */}
       {currentDuration > 30 && (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-4 py-3 rounded-lg text-sm flex items-center justify-center gap-2">
            <span>⚠️ 警告：音频长度超过 30 秒，建议缩短选区以便在 iPhone 上正常使用。</span>
          </div>
        )}

      {/* 3. Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <button 
          onClick={handlePreviewEffect}
          className={`
            h-14 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all
            ${isPreviewing 
              ? 'bg-secondary text-white animate-pulse shadow-secondary/20' 
              : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
            }
          `}
        >
          {isPreviewing ? (
            <>
              <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
              停止试听
            </>
          ) : (
            <>
              <Icons.Play />
              试听特效 (含变速变调)
            </>
          )}
        </button>

        <div className="flex gap-0 h-14 rounded-2xl overflow-hidden shadow-xl shadow-white/5 transition-transform hover:scale-[1.01]">
          <button 
            onClick={handleDownload}
            className="flex-1 bg-white hover:bg-zinc-200 text-black font-bold text-lg flex items-center justify-center gap-3 transition-colors"
          >
            <Icons.Download />
            下载铃声
          </button>
          <div className="w-px bg-zinc-300"></div>
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'wav' | 'mp3')}
            className="bg-white hover:bg-zinc-200 text-black font-bold text-sm px-4 outline-none cursor-pointer appearance-none text-center"
            style={{ textAlignLast: 'center' }}
            title="选择导出格式"
          >
            <option value="wav">.WAV</option>
            <option value="mp3">.MP3</option>
          </select>
        </div>
      </div>

      {/* 4. Instructions */}
      <div className="bg-zinc-900/50 rounded-xl p-6 text-sm text-zinc-400 border border-zinc-800">
        <h4 className="font-semibold text-zinc-300 mb-3 flex items-center gap-2 text-base">
          <span className="w-2 h-2 rounded-full bg-accent"></span>
          💡 iPhone 设置教程
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 leading-relaxed opacity-80">
          <p>1. <b>下载</b>：点击上方按钮保存文件（推荐使用 .WAV）。</p>
          <p>4. <b>导入</b>：点击右上角“环形”图标 > 文件。</p>
          <p>2. <b>库乐队</b>：打开 iPhone 自带的 GarageBand App。</p>
          <p>5. <b>制作</b>：拖入音频，剪辑好后长按项目分享。</p>
          <p>3. <b>创建</b>：新建“录音机”项目，点击左上角“砖墙”图标。</p>
          <p>6. <b>设置</b>：选择“电话铃声”即可自动导出。</p>
        </div>
      </div>
    </div>
  );
};