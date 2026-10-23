import React from 'react';
import { Check, AlertCircle, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SkillChipProps {
  name: string;
  status: 'matched' | 'partial' | 'missing';
  subtitle?: string;
  priority?: 'high' | 'medium' | 'low';
  onClick?: () => void;
}

export const SkillChip: React.FC<SkillChipProps> = ({
  name,
  status,
  subtitle,
  priority,
  onClick,
}) => {
  const getStyles = () => {
    switch (status) {
      case 'matched':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
      case 'partial':
        return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
      case 'missing':
        return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'matched':
        return <Check className="h-3 w-3 text-emerald-500 shrink-0" />;
      case 'partial':
        return <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />;
      case 'missing':
        return <XCircle className="h-3 w-3 text-red-500 shrink-0" />;
    }
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-xl border flex flex-col justify-between transition-all select-none',
        getStyles(),
        onClick ? 'cursor-pointer hover:scale-101' : ''
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium text-xs">
          {getIcon()}
          <span className="font-semibold">{name}</span>
        </div>
        {priority && (
          <span className="font-mono text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400">
            {priority} priority
          </span>
        )}
      </div>
      {subtitle && (
        <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
          {subtitle}
        </p>
      )}
    </div>
  );
};
