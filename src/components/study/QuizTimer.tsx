import React, { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

interface QuizTimerProps {
  initialMinutes: number;
  onTimeUp?: () => void;
  isRunning?: boolean;
}

export const QuizTimer: React.FC<QuizTimerProps> = ({
  initialMinutes,
  onTimeUp,
  isRunning = true,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(initialMinutes * 60);

  useEffect(() => {
    if (!isRunning || secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onTimeUp?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, secondsLeft, onTimeUp]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const isUrgent = secondsLeft < 120; // under 2 minutes

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs font-semibold ${
        isUrgent
          ? 'bg-red-500/10 border-red-500/30 text-red-500 animate-pulse'
          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
      }`}
    >
      <Timer className="h-3.5 w-3.5" />
      <span>
        {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
      </span>
    </div>
  );
};
