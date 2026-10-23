import React from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { ShieldCheck, AlertCircle, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ConfidenceBadgeProps {
  score?: number; // 0..100
  tier?: 'high' | 'medium' | 'low';
}

export const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({
  score = 95,
  tier = 'high',
}) => {
  const isHigh = tier === 'high' || score >= 85;
  const isMed = tier === 'medium' || (score >= 65 && score < 85);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'inline-flex items-center gap-1 font-mono text-[10px] font-medium px-2 py-0.5 rounded-full border cursor-help select-none',
            isHigh && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
            isMed && 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
            !isHigh && !isMed && 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
          )}
        >
          {isHigh ? (
            <ShieldCheck className="h-3 w-3" />
          ) : isMed ? (
            <AlertCircle className="h-3 w-3" />
          ) : (
            <HelpCircle className="h-3 w-3" />
          )}
          <span>{score}% Confidence</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <p className="font-semibold mb-0.5">
          {isHigh ? 'High Grounded Confidence' : isMed ? 'Moderate Match Confidence' : 'Low Evidence Match'}
        </p>
        <p className="text-slate-300">
          {isHigh
            ? 'Response statements are strictly backed by high-scoring cross-encoder passages from your uploaded documents.'
            : isMed
            ? 'Some inferences were drawn with moderate semantic coverage.'
            : 'Passages retrieved had low relevance scores. Consider uploading additional materials.'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};
