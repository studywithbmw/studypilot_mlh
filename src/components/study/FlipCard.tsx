import React, { useState, useEffect } from 'react';
import { Flashcard } from '../../types';
import { calculateSM2, formatIntervalLabel, SM2Rating } from '../../lib/sm2';
import { RotateCw, CheckCircle, Clock } from 'lucide-react';
import { Button } from '../ui/button';

interface FlipCardProps {
  card: Flashcard;
  onRate: (rating: SM2Rating) => void;
  currentIndex: number;
  totalCards: number;
}

export const FlipCard: React.FC<FlipCardProps> = ({
  card,
  onRate,
  currentIndex,
  totalCards,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);

  // Keyboard shortcut listener: Space to flip, 1-4 to rate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((f) => !f);
      } else if (isFlipped) {
        if (e.key === '1') onRate(1);
        else if (e.key === '2') onRate(2);
        else if (e.key === '3') onRate(3);
        else if (e.key === '4') onRate(4);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, onRate]);

  // Reset flip when card changes
  useEffect(() => {
    setIsFlipped(false);
  }, [card.id]);

  const ratingOptions: Array<{ rating: SM2Rating; label: string; key: string; color: string; desc: string }> = [
    { rating: 1, label: 'Again', key: '1', color: 'border-red-500/40 text-red-500 hover:bg-red-500/10', desc: 'Forgot completely' },
    { rating: 2, label: 'Hard', key: '2', color: 'border-amber-500/40 text-amber-500 hover:bg-amber-500/10', desc: 'Recalled with strain' },
    { rating: 3, label: 'Good', key: '3', color: 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10', desc: 'Normal recall' },
    { rating: 4, label: 'Easy', key: '4', color: 'border-blue-500/40 text-blue-500 hover:bg-blue-500/10', desc: 'Instant recall' },
  ];

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none">
      {/* Progress & Deck Status */}
      <div className="w-full flex items-center justify-between text-xs text-slate-500 mb-3 px-1 font-mono">
        <span>Card {currentIndex + 1} of {totalCards}</span>
        <span className="flex items-center gap-1 text-emerald-500">
          <Clock className="h-3 w-3" />
          <span>SM-2 Interval: {card.sm2.interval}d (EF: {card.sm2.easeFactor.toFixed(2)})</span>
        </span>
      </div>

      {/* 3D Flip Card Container */}
      <div
        onClick={() => setIsFlipped(!isFlipped)}
        className="w-full h-80 perspective-1000 cursor-pointer group"
      >
        <div
          className={`relative w-full h-full duration-500 transform-style-3d transition-transform ${
            isFlipped ? 'rotate-y-180' : ''
          }`}
        >
          {/* FRONT */}
          <div className="absolute inset-0 backface-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 flex flex-col justify-between shadow-lg hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                Prompt / Question
              </span>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <RotateCw className="h-3 w-3" />
                <span>Space to flip</span>
              </span>
            </div>

            <div className="text-center text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 leading-snug px-4">
              {card.front}
            </div>

            <div className="text-center text-xs text-slate-400">
              Click anywhere or press Spacebar to view answer
            </div>
          </div>

          {/* BACK */}
          <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border border-emerald-500/40 bg-white dark:bg-slate-900 p-8 flex flex-col justify-between shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded font-semibold">
                Answer & Explanation
              </span>
              <span className="text-[10px] text-slate-400">Rate difficulty below</span>
            </div>

            <div className="text-center text-base sm:text-lg text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed px-2 font-medium">
              {card.back}
            </div>

            <div className="text-center text-[11px] text-slate-400 font-mono">
              Use keys [1], [2], [3], [4] to grade
            </div>
          </div>
        </div>
      </div>

      {/* Rating Buttons with calculated next intervals */}
      <div className="w-full mt-6 grid grid-cols-4 gap-2">
        {ratingOptions.map((opt) => {
          const nextInterval = formatIntervalLabel(opt.rating, card.sm2);
          return (
            <button
              key={opt.rating}
              type="button"
              disabled={!isFlipped}
              onClick={(e) => {
                e.stopPropagation();
                onRate(opt.rating);
              }}
              className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                opt.color
              } ${!isFlipped ? 'opacity-40 pointer-events-none' : 'hover:scale-102 active:scale-98'}`}
            >
              <div className="flex items-center gap-1 text-xs font-semibold">
                <span>{opt.label}</span>
                <kbd className="text-[9px] font-mono opacity-60">[{opt.key}]</kbd>
              </div>
              <span className="font-mono text-[11px] font-bold mt-1 text-slate-800 dark:text-slate-200">
                {nextInterval}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
