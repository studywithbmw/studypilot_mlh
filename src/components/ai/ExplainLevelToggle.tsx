import React from 'react';
import { ExplanationLevel, EXPLANATION_LEVELS } from '../../lib/constants';
import { cn } from '../../lib/utils';

interface ExplainLevelToggleProps {
  value: ExplanationLevel;
  onChange: (level: ExplanationLevel) => void;
  className?: string;
  size?: 'sm' | 'default';
}

export const ExplainLevelToggle: React.FC<ExplainLevelToggleProps> = ({
  value,
  onChange,
  className,
  size = 'default',
}) => {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800/80 p-0.5 border border-slate-200/50 dark:border-slate-700/50',
        className
      )}
    >
      {EXPLANATION_LEVELS.map((level) => {
        const isActive = value === level.id;
        return (
          <button
            key={level.id}
            type="button"
            onClick={() => onChange(level.id)}
            title={level.description}
            className={cn(
              'rounded-md font-medium transition-all select-none cursor-pointer whitespace-nowrap',
              size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
              isActive
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            )}
          >
            {level.label}
          </button>
        );
      })}
    </div>
  );
};
