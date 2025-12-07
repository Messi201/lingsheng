import React, { useState, useEffect } from 'react';
import { VideoUploader } from './components/VideoUploader';
import { WaveformEditor } from './components/WaveformEditor';
import { AppStep } from './types';
import { Icons } from './constants';

const App = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>('');
  const [thumbnailBase64, setThumbnailBase64] = useState<string | undefined>(undefined);
  
  // Stats State
  const [stats, setStats] = useState({ visitors: 0, downloads: 0 });

  // Initialize and increment stats on mount
  useEffect(() => {
    // Load from local storage, default to 0
    const savedVisitors = parseInt(localStorage.getItem('rt_visitors') || '0');
    const savedDownloads = parseInt(localStorage.getItem('rt_downloads') || '0');

    // Increment visitor count for current session
    const currentVisitors = savedVisitors + 1;
    const currentDownloads = savedDownloads;

    // Update state
    setStats({ visitors: currentVisitors, downloads: currentDownloads });

    // Persist visitor count immediately
    localStorage.setItem('rt_visitors', currentVisitors.toString());
  }, []);

  const handleDownloadIncrement = () => {
    setStats(prev => {
      const newCount = prev.downloads + 1;
      localStorage.setItem('rt_downloads', newCount.toString());
      return { ...prev, downloads: newCount };
    });
  };

  const handleFileLoaded = (buffer: AudioBuffer, file: File, thumbnail?: string) => {
    setAudioBuffer(buffer);
    setOriginalFileName(file.name);
    setThumbnailBase64(thumbnail);
    setStep(AppStep.EDIT);
  };

  const handleReset = () => {
    setAudioBuffer(null);
    setOriginalFileName('');
    setThumbnailBase64(undefined);
    setStep(AppStep.UPLOAD);
  };

  return (
    <div className="min-h-screen bg-background text-zinc-200 font-sans selection:bg-primary/30">
      {/* Navbar */}
      <nav className="border-b border-zinc-800 bg-surface/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Icons.Music />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">RingTone<span className="text-primary">AI</span></span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
             <a href="#" className="hover:text-white transition-colors">使用说明</a>
             <a href="#" className="hover:text-white transition-colors">支持格式</a>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12 space-y-4">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight">
            制作专属 <br className="md:hidden" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
              iPhone 铃声
            </span>
          </h1>
          <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mx-auto">
            几秒钟内将屏幕录制、视频或音乐转换为高品质铃声。<br/>
            完全免费，无需安装 App，且 100% 保护隐私。
          </p>

          {/* Real-time Stats Display */}
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 pt-4 animate-fade-in">
             <div className="flex items-center gap-2 bg-zinc-800/40 px-4 py-2 rounded-full border border-zinc-700/50 backdrop-blur-sm">
                <span className="text-zinc-400"><Icons.Users /></span>
                <span className="font-mono font-bold text-white">{stats.visitors.toLocaleString()}</span>
                <span className="text-xs text-zinc-500 uppercase tracking-wide">人正在使用</span>
             </div>
             <div className="flex items-center gap-2 bg-zinc-800/40 px-4 py-2 rounded-full border border-zinc-700/50 backdrop-blur-sm">
                <span className="text-primary"><Icons.Download /></span>
                <span className="font-mono font-bold text-white">{stats.downloads.toLocaleString()}</span>
                <span className="text-xs text-zinc-500 uppercase tracking-wide">次成功制作</span>
             </div>
          </div>
        </div>

        {step === AppStep.UPLOAD && (
          <div className="animate-fade-in-up">
            <VideoUploader onFileLoaded={handleFileLoaded} />
            
            <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
               <FeatureCard 
                 icon={<Icons.Scissors />}
                 title="精确裁剪"
                 desc="从您最喜爱的歌曲或视频中选择完美的 30 秒高潮片段。"
               />
               <FeatureCard 
                 icon={<Icons.Music />}
                 title="特效处理"
                 desc="支持淡入淡出、加速减速以及变声处理，打造独一无二的铃声。"
               />
               <FeatureCard 
                 icon={<Icons.Upload />}
                 title="即时转换"
                 desc="所有处理均在您的浏览器中本地完成。无需上传大文件，安全无忧。"
               />
            </div>
          </div>
        )}

        {step === AppStep.EDIT && audioBuffer && (
          <WaveformEditor 
            audioBuffer={audioBuffer} 
            originalFileName={originalFileName}
            thumbnailBase64={thumbnailBase64}
            onReset={handleReset}
            onDownloadSuccess={handleDownloadIncrement}
          />
        )}
      </main>
      
      <footer className="border-t border-zinc-800 py-8 mt-12 bg-surface/30">
        <div className="max-w-6xl mx-auto px-6 text-center text-zinc-500 text-sm">
          <p>© {new Date().getFullYear()} RingTone AI. 专为 iPhone 用户打造。</p>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
  <div className="bg-surface border border-zinc-800 p-6 rounded-2xl hover:border-zinc-700 transition-colors">
    <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-300 mb-4">
      {icon}
    </div>
    <h3 className="text-white font-bold mb-2">{title}</h3>
    <p className="text-zinc-400 text-sm leading-relaxed">{desc}</p>
  </div>
);

export default App;