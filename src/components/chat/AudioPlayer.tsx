import { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  src: string;
  isMe: boolean;
}

// Fixed waveform heights for each bar (deterministic, no random on render)
const BAR_HEIGHTS = [28, 45, 62, 75, 55, 80, 68, 90, 72, 58, 85, 65, 48, 76, 60, 42, 70, 55, 38, 52];

export function AudioPlayer({ src, isMe }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  };

  const formatTime = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const BARS = BAR_HEIGHTS.length;

  return (
    <div className="flex items-center gap-2 min-w-[190px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={togglePlay}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
          isMe
            ? 'bg-white/25 hover:bg-white/35 text-white'
            : 'bg-primary-100 dark:bg-primary-900/40 hover:bg-primary-200 dark:hover:bg-primary-900/60 text-primary-700 dark:text-primary-300'
        )}
      >
        {playing ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
      </button>

      <div className="flex items-center gap-[2px] flex-1 h-8">
        {BAR_HEIGHTS.map((baseH, i) => {
          const isFilled = i / BARS <= progress;
          return (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-full transition-[height] duration-150',
                playing && isFilled && 'animate-pulse',
                isFilled
                  ? isMe ? 'bg-white/90' : 'bg-primary-500'
                  : isMe ? 'bg-white/30' : 'bg-surface-300 dark:bg-surface-400/40'
              )}
              style={{
                height: `${baseH}%`,
                animationDelay: `${(i % 5) * 0.1}s`,
                animationDuration: '0.6s',
              }}
            />
          );
        })}
      </div>

      <span className={cn(
        'text-[10px] font-medium tabular-nums flex-shrink-0 w-8 text-right',
        isMe ? 'text-white/70' : 'text-text-secondary'
      )}>
        {playing ? formatTime(currentTime) : formatTime(duration)}
      </span>
    </div>
  );
}
