import React from 'react';
import { Citation } from '../../types';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../ui/hover-card';
import { FileText, ExternalLink, Bookmark } from 'lucide-react';

interface CitationChipProps {
  citation: Citation;
  index: number;
  onClick?: () => void;
}

export const CitationChip: React.FC<CitationChipProps> = ({
  citation,
  index,
  onClick,
}) => {
  return (
    <HoverCard openDelay={150} closeDelay={150}>
      <HoverCardTrigger asChild>
        <button
          onClick={onClick}
          className="inline-flex items-center justify-center font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded px-1.5 py-0.5 mx-0.5 align-baseline transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-xs"
          title={`Citation ${index}: ${citation.documentName}`}
        >
          [{index}]
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" side="top" className="w-80 p-3 shadow-xl border-emerald-500/20">
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 shrink-0">
            <FileText className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {citation.documentName}
              </span>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-medium shrink-0 ml-1">
                {citation.pageNumber ? `p. ${citation.pageNumber}` : citation.timestamp || 'Cited'}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 line-clamp-3 italic bg-slate-50 dark:bg-slate-800/60 p-2 rounded border border-slate-200/50 dark:border-slate-800/50">
              "{citation.snippet}"
            </p>
            <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400">
                Confidence: {Math.round((citation.confidence || 0.95) * 100)}%
              </span>
              <button
                onClick={onClick}
                className="text-[11px] font-medium text-emerald-500 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Jump to page</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
