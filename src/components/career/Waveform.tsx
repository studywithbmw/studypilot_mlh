import React from 'react';
import { cn } from '../../lib/utils';

interface WaveformProps {
  isRecording: boolean;
  className?: string;
  barCount?: number;
}

export const Waveform: React.FC<WaveformProps> = ({
  isRecording,
  className,
  barCount = 24,
}) => {
  return (
    <div className={cn('flex items-center justify-center gap-1 h-12 py-2', className)}>
      {Array.from({ length: barCount }).map((_, i) => {
        // Random simulated heights
        const height = isRecording
          ? Math.max(15, Math.sin(i * 0.5 + Date.now() * 0.005) * 80 + 30)
          : 8;

        return (
          <div
            key={i}
            style={{ height: `${height}%` }}
            className={cn(
              'w-1 rounded-full transition-all duration-150',
              isRecording
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-slate-200 dark:bg-slate-800'
            )}
          />
        );
      })}
    </div>
  );
};
