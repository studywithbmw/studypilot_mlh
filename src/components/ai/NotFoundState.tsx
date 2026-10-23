import React from 'react';
import { SearchX, UploadCloud, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

interface NotFoundStateProps {
  query: string;
  onAnswerGeneral?: () => void;
  onUploadDocs?: () => void;
  onRephrase?: () => void;
}

export const NotFoundState: React.FC<NotFoundStateProps> = ({
  query,
  onAnswerGeneral,
  onUploadDocs,
  onRephrase,
}) => {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 p-4 text-xs space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 shrink-0 mt-0.5">
          <SearchX className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
            Not found in your uploaded documents
          </h4>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            We searched across your workspace chunks for <span className="font-mono text-slate-800 dark:text-slate-200">"{query}"</span>, but no passages met our minimum cross-encoder relevance threshold (0.65).
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-amber-500/20 flex flex-wrap items-center gap-2">
        {onAnswerGeneral && (
          <Button
            size="sm"
            variant="default"
            onClick={onAnswerGeneral}
            className="text-xs flex items-center gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Answer from General Knowledge (Uncited)
          </Button>
        )}
        {onUploadDocs && (
          <Button
            size="sm"
            variant="outline"
            onClick={onUploadDocs}
            className="text-xs flex items-center gap-1.5"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Upload Document Covering This
          </Button>
        )}
        {onRephrase && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRephrase}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="h-3 w-3" />
            Rephrase Query
          </Button>
        )}
      </div>
    </div>
  );
};
