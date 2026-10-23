import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckSquare, FileText, FlaskConical, Globe, Square, Youtube, Zap } from 'lucide-react';
import { DocumentItem, ExamDocKind } from '@/types';
import { Dropzone } from '@/components/upload/Dropzone';
import { PipelineStatusBadge } from '@/components/upload/PipelineStatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface TagState {
  kind: ExamDocKind;
  year: string;
}

interface DocumentTaggerProps {
  documents: DocumentItem[];
  selection: Record<string, TagState>;
  title: string;
  isLoading: boolean;
  isUploading: boolean;
  isSubmitting: boolean;
  validationMessage: string | null;
  onTitleChange: (value: string) => void;
  onToggle: (docId: string, selected: boolean) => void;
  onKind: (docId: string, kind: ExamDocKind) => void;
  onYearChange: (docId: string, year: string) => void;
  onUpload: (files: File[]) => void;
  onAnalyze: () => void;
  onDemo: () => void;
}

function DocIcon({ type }: { type: DocumentItem['type'] }) {
  if (type === 'youtube') return <Youtube className="h-4 w-4 shrink-0 text-red-500" />;
  if (type === 'web') return <Globe className="h-4 w-4 shrink-0 text-blue-500" />;
  return <FileText className="h-4 w-4 shrink-0 text-emerald-500" />;
}

export const DocumentTagger: React.FC<DocumentTaggerProps> = ({
  documents,
  selection,
  title,
  isLoading,
  isUploading,
  isSubmitting,
  validationMessage,
  onTitleChange,
  onToggle,
  onKind,
  onYearChange,
  onUpload,
  onAnalyze,
  onDemo,
}) => {
  const { t } = useTranslation();
  const selectedCount = Object.keys(selection).length;

  return (
    <div className="space-y-5">
      <Dropzone onFilesAccepted={onUpload} disabled={isUploading} maxSizeMb={25} />

      <Card className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {t('exam.titleLabel')}
            </label>
            <Input
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder={t('exam.titlePlaceholder')}
              maxLength={160}
              className="mt-1.5 text-xs h-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onDemo}
              disabled={isSubmitting || isUploading}
              className="text-xs h-9 flex items-center gap-1.5"
            >
              <FlaskConical className="h-3.5 w-3.5 text-purple-400" />
              <span>{t('exam.demo')}</span>
            </Button>
            <Button
              size="sm"
              onClick={onAnalyze}
              disabled={isSubmitting || isUploading || selectedCount === 0}
              className="text-xs h-9 flex items-center gap-1.5 bg-emerald-500 text-white hover:bg-emerald-600"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>{isSubmitting ? t('exam.analyzing') : t('exam.analyze')}</span>
            </Button>
          </div>
        </div>

        {validationMessage && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">{validationMessage}</p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {t('exam.pickDocuments')}
            </span>
            {selectedCount > 0 && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {t('exam.selectedCount', { count: selectedCount })}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
              <p className="text-xs text-slate-500">{t('exam.noDocuments')}</p>
              <p className="text-[11px] text-slate-400">{t('exam.uploadHint')}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
              {documents.map((doc) => {
                const tagged = selection[doc.id];
                const isLink = doc.type === 'web' || doc.type === 'youtube';
                const selectable = doc.status === 'ready' && !isLink;
                return (
                  <div key={doc.id} className={cn('p-3', tagged && 'bg-emerald-500/[0.04]')}>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={!selectable}
                        onClick={() => onToggle(doc.id, !tagged)}
                        className={cn(
                          'shrink-0 cursor-pointer text-slate-400 hover:text-emerald-500',
                          !selectable && 'cursor-not-allowed opacity-40',
                        )}
                        title={isLink ? t('exam.linksUnsupported') : undefined}
                      >
                        {tagged ? (
                          <CheckSquare className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <DocIcon type={doc.type} />
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                          {doc.name}
                        </span>
                      </div>
                      <PipelineStatusBadge status={doc.status} progress={doc.progressPercent} />
                    </div>

                    {tagged && (
                      <div className="mt-2.5 ml-7 flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800">
                          {(['paper', 'syllabus'] as const).map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => onKind(doc.id, kind)}
                              className={cn(
                                'px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer transition-colors',
                                tagged.kind === kind
                                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                                  : 'text-slate-500',
                              )}
                            >
                              {kind === 'paper' ? t('exam.tagPaper') : t('exam.tagSyllabus')}
                            </button>
                          ))}
                        </div>

                        {tagged.kind === 'paper' && (
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1900}
                            max={2100}
                            value={tagged.year}
                            onChange={(event) => onYearChange(doc.id, event.target.value)}
                            placeholder={t('exam.year')}
                            aria-label={t('exam.year')}
                            className="h-7 w-24 text-[11px]"
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-400" />
          {t('exam.disclaimer')}
        </p>
      </Card>
    </div>
  );
};
