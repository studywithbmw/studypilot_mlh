import React from 'react';
import { PipelineStatus } from '../../types';
import { CheckCircle2, AlertCircle, Loader2, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PipelineStatusBadgeProps {
  status: PipelineStatus;
  progress?: number;
  className?: string;
}

export const PipelineStatusBadge: React.FC<PipelineStatusBadgeProps> = ({
  status,
  progress = 100,
  className,
}) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'uploading' as PipelineStatus:
        return {
          label: 'Uploading',
          icon: Loader2,
          animate: true,
          color: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
        };
      case 'queued':
        return {
          label: 'Queued',
          icon: Clock,
          color: 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700',
        };
      case 'parsing':
        return {
          label: 'Parsing PDF',
          icon: Loader2,
          animate: true,
          color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        };
      case 'chunking':
        return {
          label: 'Chunking Passages',
          icon: Loader2,
          animate: true,
          color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
        };
      case 'embedding':
        return {
          label: 'Generating Embeddings',
          icon: Loader2,
          animate: true,
          color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
        };
      case 'ready':
        return {
          label: 'Ready for RAG',
          icon: CheckCircle2,
          color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        };
      case 'error':
        return {
          label: 'Ingestion Failed',
          icon: AlertCircle,
          color: 'bg-red-500/10 text-red-500 border-red-500/20',
        };
      default:
        // Unknown status must never crash the page.
        return {
          label: String(status ?? 'Processing'),
          icon: Loader2,
          animate: true,
          color: 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700',
        };
    }
  };

  const config = getBadgeConfig();
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium font-mono select-none',
        config.color,
        className
      )}
    >
      <Icon className={cn('h-3 w-3', config.animate && 'animate-spin')} />
      <span>{config.label}</span>
      {status !== 'ready' && status !== 'error' && progress !== undefined && (
        <span className="opacity-80">({progress}%)</span>
      )}
    </div>
  );
};
