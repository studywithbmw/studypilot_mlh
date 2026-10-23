import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '../../lib/utils';

interface VoiceButtonProps {
  isListening: boolean;
  onToggle: () => void;
  className?: string;
  duration?: number;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  isListening,
  onToggle,
  className,
  duration = 0,
}) => {
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${remainder.toString().padStart(2, '0')}`;
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'relative p-2 rounded-lg transition-all flex items-center justify-center cursor-pointer select-none',
          isListening
            ? 'bg-red-500 text-white shadow-md shadow-red-500/30 scale-105 animate-pulse'
            : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800',
          className
        )}
        title={isListening ? 'Stop recording voice' : 'Dictate with voice'}
      >
        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>

      {isListening && (
        <span className="font-mono text-[11px] text-red-500 font-medium animate-pulse">
          {formatTime(duration)}
        </span>
      )}
    </div>
  );
};
