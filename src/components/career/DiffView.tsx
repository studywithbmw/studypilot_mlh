import React from 'react';
import { BulletRewriteItem } from '../../types';
import { Copy, Check, Sparkles, TrendingUp } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';

interface DiffViewProps {
  item: BulletRewriteItem;
  onQuantifyMore?: () => void;
  onMakeShorter?: () => void;
}

export const DiffView: React.FC<DiffViewProps> = ({
  item,
  onQuantifyMore,
  onMakeShorter,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(item.improved);
    setCopied(true);
    toast.success('Improved resume bullet copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4 text-xs">
      {/* Header and Score */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            Resume Bullet Transformation
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
          <TrendingUp className="h-3 w-3" />
          <span>+{item.quantificationScore}% Quantification Score</span>
        </div>
      </div>

      {/* Side-by-Side Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Original */}
        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-1.5">
          <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold">
            Before (Weak / Passive)
          </span>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed italic line-through opacity-80">
            "{item.original}"
          </p>
        </div>

        {/* Improved */}
        <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase text-emerald-600 dark:text-emerald-400 font-semibold">
              After (Impactful & Quantified)
            </span>
            <button
              onClick={handleCopy}
              className="p-1 text-slate-400 hover:text-emerald-500 rounded cursor-pointer transition-colors"
              title="Copy improved bullet"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-slate-900 dark:text-slate-100 font-medium leading-relaxed">
            "{item.improved}"
          </p>
        </div>
      </div>

      {/* Changes Summary and Quick Actions */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
        <span className="text-slate-500">
          <strong>Key Additions:</strong> {item.metricAdded}
        </span>

        <div className="flex items-center gap-2">
          {onQuantifyMore && (
            <Button variant="outline" size="sm" onClick={onQuantifyMore} className="text-xs">
              Make more quantified
            </Button>
          )}
          {onMakeShorter && (
            <Button variant="outline" size="sm" onClick={onMakeShorter} className="text-xs">
              Make it shorter
            </Button>
          )}
          <Button size="sm" onClick={handleCopy} className="text-xs">
            {copied ? 'Copied' : 'Copy Bullet'}
          </Button>
        </div>
      </div>
    </div>
  );
};
