import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Image, Send, Loader2, Mic, Camera, X, Paperclip, EyeOff, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSupportedChatAudioMimeType } from '@/lib/chat-audio';

interface ChatInputBarProps {
  onSend: (text: string) => void;
  onSendAudio?: (blob: Blob) => void;
  onTypingChange?: (isTyping: boolean) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  onGallery?: () => void;
  onCamera?: () => void;
  onAttach?: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  viewOnceActive?: boolean;
  onViewOnceToggle?: () => void;
}

export function ChatInputBar({
  onSend, onSendAudio, onTypingChange, onRecordingChange, onGallery, onCamera, onAttach, disabled, sending, placeholder = 'Digite sua mensagem...', viewOnceActive, onViewOnceToggle,
}: ChatInputBarProps) {
  const [text, setText] = useState('');
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioVolumes, setAudioVolumes] = useState<number[]>(Array(15).fill(10));

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const isRecordingRef = useRef(false);

  const canSend = text.trim().length > 0 && !disabled && !sending && !isRecording;

  useEffect(() => {
    if (!isRecording) { setRecordingSeconds(0); return; }
    const t = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      audioContextRef.current?.close();
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      onTypingChange?.(false);
      onRecordingChange?.(false);
    };
  }, [onTypingChange, onRecordingChange]);

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
    onTypingChange?.(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    onTypingChange?.(e.target.value.trim().length > 0);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedChatAudioMimeType(type => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        cancelAnimationFrame(animFrameRef.current);
        audioContextRef.current?.close();
        const actualMimeType = audioChunksRef.current[0]?.type || mimeType || 'audio/mp4';
        const blob = new Blob(audioChunksRef.current, { type: actualMimeType.split(';')[0] });
        if (blob.size > 0) onSendAudio?.(blob);
        isRecordingRef.current = false;
        setIsRecording(false);
        onRecordingChange?.(false);
        setAudioVolumes(Array(15).fill(10));
      };
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const arr = new Uint8Array(analyser.frequencyBinCount);
      const update = () => {
        analyser.getByteFrequencyData(arr);
        const step = Math.floor(arr.length / 15);
        setAudioVolumes(Array.from({ length: 15 }, (_, i) => Math.max(8, (arr[i * step] / 255) * 100)));
        animFrameRef.current = requestAnimationFrame(update);
      };
      update();
      recorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);
      onTypingChange?.(false);
      onRecordingChange?.(true);
    } catch {
      alert('Não foi possível acessar o microfone.');
    }
  };

  const stopRecordingAndSend = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      const rec = mediaRecorderRef.current;
      rec.onstop = () => {
        (rec as any).stream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        cancelAnimationFrame(animFrameRef.current);
        audioContextRef.current?.close();
      };
      if (rec.state === 'recording') rec.stop();
    }
    isRecordingRef.current = false;
    setIsRecording(false);
    onRecordingChange?.(false);
    setRecordingSeconds(0);
    setAudioVolumes(Array(15).fill(10));
  };

  const handlePointerDown = () => {
    if (text.trim() || disabled) return;
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      startRecording();
    }, 300);
  };

  const handlePointerUp = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      return;
    }
    if (isRecordingRef.current) stopRecordingAndSend();
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="px-3 py-3 border-t border-surface-200 dark:border-surface-100/10 bg-card-bg flex-shrink-0 relative">
      <AnimatePresence>
        {showMediaMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMediaMenu(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full left-3 mb-2 bg-card-bg border border-surface-200 rounded-2xl shadow-xl overflow-hidden z-20 min-w-[160px]"
            >
              <button
                onClick={() => { setShowMediaMenu(false); onGallery?.(); }}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-text-primary hover:bg-surface-100 transition-colors"
              >
                <Image size={16} className="text-primary-600" />
                Galeria
              </button>
              <button
                onClick={() => { setShowMediaMenu(false); onCamera?.(); }}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-text-primary hover:bg-surface-100 transition-colors border-t border-surface-100"
              >
                <Camera size={16} className="text-primary-600" />
                Câmera
              </button>
              <button
                onClick={() => { setShowMediaMenu(false); onAttach?.(); }}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-text-primary hover:bg-surface-100 transition-colors border-t border-surface-100"
              >
                <Paperclip size={16} className="text-primary-600" />
                Arquivo
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.div
        className={cn(
          'flex items-end gap-2 rounded-2xl border bg-surface-50 dark:bg-surface-200/5 px-3 py-2 transition-colors duration-150',
          text.length > 0
            ? 'border-primary-400 dark:border-primary-600'
            : 'border-surface-200 dark:border-surface-100/10'
        )}
      >
        {!isRecording && (
          <div className="flex items-center gap-0.5 flex-shrink-0 mb-0.5">
            <button
              onClick={() => setShowMediaMenu(v => !v)}
              className="p-1.5 rounded-lg text-text-secondary hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              title="Mídia"
            >
              <Image size={16} />
            </button>
            <button
              onClick={onViewOnceToggle}
              title={viewOnceActive ? 'Visualização única ativada' : 'Enviar como visualização única'}
              className={cn(
                'relative p-1 rounded-md transition-all duration-150',
                viewOnceActive
                  ? 'text-primary-600 bg-primary-50 dark:bg-primary-900/30'
                  : 'text-text-secondary/50 hover:text-text-secondary hover:bg-surface-100'
              )}
            >
              {viewOnceActive ? <Eye size={13} /> : <EyeOff size={13} />}
              {viewOnceActive && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary-500" />
              )}
            </button>
          </div>
        )}

        {isRecording ? (
          <div className="flex items-center gap-2 flex-1 py-1">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
            <span className="text-xs font-medium tabular-nums text-text-secondary w-8 flex-shrink-0">
              {formatTime(recordingSeconds)}
            </span>
            <div className="flex items-center gap-[2px] h-6 flex-1">
              {audioVolumes.map((vol, i) => (
                <div
                  key={i}
                  className="w-[3px] bg-primary-500 rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(15, vol)}%` }}
                />
              ))}
            </div>
            <button
              onClick={cancelRecording}
              className="p-1 text-text-secondary hover:text-red-500 transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={disabled}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-secondary resize-none focus:outline-none leading-5 py-0.5 transition-all duration-150 disabled:opacity-50"
            style={{ minHeight: '20px', maxHeight: '96px' }}
          />
        )}

        <motion.button
          whileTap={(canSend || isRecording) ? { scale: 0.88 } : {}}
          onClick={() => { if (canSend) handleSend(); }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
          }}
          disabled={disabled}
          className={cn(
            'p-2 rounded-xl transition-all duration-150 flex-shrink-0 select-none touch-none',
            isRecording
              ? 'bg-red-500 text-white shadow-sm shadow-red-200'
              : canSend
                ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm shadow-primary-200'
                : 'bg-surface-200 dark:bg-surface-200/20 text-text-secondary/60'
          )}
        >
          {sending
            ? <Loader2 size={16} className="animate-spin" />
            : isRecording
              ? <Mic size={16} className="animate-pulse" />
              : canSend
                ? <Send size={16} />
                : <Mic size={16} />
          }
        </motion.button>
      </motion.div>
    </div>
  );
}
