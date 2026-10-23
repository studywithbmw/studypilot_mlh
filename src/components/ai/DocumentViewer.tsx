import React from 'react';
import { DocumentItem, Citation } from '../../types';
import { FileText, Youtube, Globe, X, Bookmark } from 'lucide-react';
import { Button } from '../ui/button';

interface DocumentViewerProps {
  document: DocumentItem | null;
  activeCitation?: Citation | null;
  onClose?: () => void;
}

/** Shows the exact passage an answer was built from (the retrieved text, not a re-rendered page). */
export const DocumentViewer: React.FC<DocumentViewerProps> = ({ document, activeCitation, onClose }) => {
  if (!document && !activeCitation) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-slate-50/50 dark:bg-slate-900/30 border-l border-slate-200 dark:border-slate-800">
        <FileText className="h-8 w-8 mb-2 opacity-40 text-emerald-500" />
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">No source selected</p>
        <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
          Click a citation chip like [1] under an answer to see the exact passage it came from.
        </p>
      </div>
    );
  }

  const name = activeCitation?.documentName || document?.name || 'Source';
  const type = document?.type;
  const Icon = type === 'youtube' ? Youtube : type === 'web' ? Globe : FileText;
  const location = activeCitation?.pageNumber
    ? `Page ${activeCitation.pageNumber}`
    : activeCitation?.timestamp
      ? `At ${activeCitation.timestamp}`
      : null;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{name}</span>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4">
        {document && (
          <p className="font-mono text-[11px] text-slate-500">
            {document.type.toUpperCase()}
            {document.pageCount ? ` · ${document.pageCount} pages` : ''}
            {document.chunkCount ? ` · ${document.chunkCount} passages indexed` : ''}
          </p>
        )}

        {activeCitation ? (
          <div className="p-3.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 space-y-2">
            <div className="flex items-center justify-between text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="flex items-center gap-1.5">
                <Bookmark className="h-3 w-3" />
                CITED PASSAGE{location ? ` · ${location.toUpperCase()}` : ''}
              </span>
              <span className="font-mono">{Math.round(activeCitation.confidence * 100)}% match</span>
            </div>
            <p className="text-slate-900 dark:text-slate-100 leading-relaxed">{activeCitation.snippet}</p>
          </div>
        ) : (
          <p className="text-slate-400">Select a citation chip under an answer to see its passage here.</p>
        )}
      </div>
    </div>
  );
};
