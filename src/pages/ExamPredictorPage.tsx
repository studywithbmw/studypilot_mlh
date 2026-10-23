import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  History,
  Loader2,
  Plus,
  Target,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { api } from '@/lib/api';
import { pollDocumentsUntilSettled } from '@/lib/api/documents';
import { ApiError } from '@/lib/api/http';
import {
  DocumentItem,
  ExamDocumentSelection,
  ExamDocKind,
  ExamReport,
  ExamReportSummary,
  ExamTopic,
} from '@/types';
import { DocumentTagger, TagState } from '@/components/exam/DocumentTagger';
import { ExamResults } from '@/components/exam/ExamResults';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTimeAgo } from '@/lib/utils';
import { toast } from 'sonner';

const errText = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

const isoInDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const isActive = (status: ExamReport['status']) => status === 'queued' || status === 'running';

export const ExamPredictorPage: React.FC = () => {
  const { activeWorkspaceId } = useWorkspaceStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [reports, setReports] = useState<ExamReportSummary[]>([]);
  const [report, setReport] = useState<ExamReport | null>(null);
  const [selection, setSelection] = useState<Record<string, TagState>>({});
  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState(isoInDays(30));

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Reset and reload whenever the active workspace changes.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    setReport(null);
    setSelection({});
    setValidationMessage(null);

    Promise.all([api.getDocuments(activeWorkspaceId), api.getExamReports(activeWorkspaceId)])
      .then(([docs, list]) => {
        if (cancelled) return;
        setDocuments(docs);
        setReports(list);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(errText(error, 'Could not load this workspace.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  // Poll the background analysis until it settles.
  useEffect(() => {
    if (!report || !isActive(report.status)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const next = await api.getExamReport(report.id);
        if (cancelled) return;
        setReport(next);
        if (next.status === 'ready') {
          api.getExamReports(activeWorkspaceId).then(setReports).catch(() => undefined);
        } else if (isActive(next.status)) {
          timer = setTimeout(tick, 1500);
        }
      } catch (error) {
        if (cancelled) return;
        setReport({
          ...report,
          status: 'error',
          progress: 100,
          error: errText(error, 'Lost contact with the server. Please try again.'),
        });
      }
    };

    timer = setTimeout(tick, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [report, activeWorkspaceId]);

  const handleToggle = (docId: string, selected: boolean) => {
    setSelection((previous) => {
      const next = { ...previous };
      if (selected) next[docId] = { kind: 'paper', year: String(new Date().getFullYear()) };
      else delete next[docId];
      return next;
    });
    setValidationMessage(null);
  };

  const handleKind = (docId: string, kind: ExamDocKind) => {
    setSelection((previous) =>
      previous[docId] ? { ...previous, [docId]: { ...previous[docId], kind } } : previous,
    );
  };

  const handleYear = (docId: string, year: string) => {
    setSelection((previous) =>
      previous[docId] ? { ...previous, [docId]: { ...previous[docId], year } } : previous,
    );
  };

  const buildPayload = (): ExamDocumentSelection[] =>
    Object.entries(selection).map(([documentId, tag]) => ({
      documentId,
      kind: tag.kind,
      ...(tag.kind === 'paper' ? { year: Number(tag.year) } : {}),
    }));

  const startReport = (created: ExamReport) => {
    setReport(created);
    setReports((previous) => [
      {
        id: created.id,
        workspaceId: created.workspaceId,
        title: created.title,
        status: created.status,
        progress: created.progress,
        questionCount: 0,
        years: [],
        topTopics: [],
        createdAt: created.createdAt,
      },
      ...previous.filter((item) => item.id !== created.id),
    ]);
  };

  const handleAnalyze = async () => {
    const tagged = Object.values(selection);
    if (!tagged.some((tag) => tag.kind === 'syllabus')) {
      setValidationMessage(t('exam.needSyllabus'));
      return;
    }
    if (!tagged.some((tag) => tag.kind === 'paper')) {
      setValidationMessage(t('exam.needPaper'));
      return;
    }
    const badYear = tagged.some(
      (tag) =>
        tag.kind === 'paper' &&
        (!tag.year || Number(tag.year) < 1900 || Number(tag.year) > 2100),
    );
    if (badYear) {
      setValidationMessage(t('exam.needYear'));
      return;
    }

    setIsSubmitting(true);
    setValidationMessage(null);
    try {
      startReport(await api.analyzeExam(activeWorkspaceId, buildPayload(), title.trim()));
      toast.success(t('exam.started'));
    } catch (error) {
      toast.error(errText(error, t('exam.analyzeFailed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemo = async () => {
    setIsSubmitting(true);
    try {
      startReport(await api.seedExamDemo(activeWorkspaceId));
      toast.success(t('exam.started'));
    } catch (error) {
      toast.error(errText(error, t('exam.analyzeFailed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpload = async (files: File[]) => {
    setIsUploading(true);
    try {
      for (const file of files) {
        await api.uploadDocument(activeWorkspaceId, file);
      }
      const docs = await pollDocumentsUntilSettled(() => api.getDocuments(activeWorkspaceId), {
        intervalMs: 1500,
        maxWaitMs: 180_000,
        onSnapshot: setDocuments,
      });
      setDocuments(docs);
      toast.success(t('exam.uploadDone', { count: files.length }));
    } catch (error) {
      toast.error(errText(error, t('exam.uploadFailed')));
    } finally {
      setIsUploading(false);
    }
  };

  const openReport = async (id: string) => {
    setBusyAction(`open:${id}`);
    try {
      setReport(await api.getExamReport(id));
    } catch (error) {
      toast.error(errText(error, t('exam.loadReportFailed')));
    } finally {
      setBusyAction(null);
    }
  };

  const handleFlashcards = async (topic: ExamTopic) => {
    setBusyAction(`cards:${topic.topic}`);
    try {
      const deck = await api.generateDeckFromDocument('', topic.topic, activeWorkspaceId);
      toast.success(t('exam.deckCreated', { count: deck.cardCount }));
    } catch (error) {
      toast.error(errText(error, t('exam.actionFailed')));
    } finally {
      setBusyAction(null);
    }
  };

  const handleQuiz = async (topic: ExamTopic) => {
    setBusyAction(`quiz:${topic.topic}`);
    try {
      const quiz = await api.generateQuiz({
        workspaceId: activeWorkspaceId,
        topic: topic.topic,
        difficulty: 'medium',
        count: 5,
      });
      toast.success(t('exam.quizCreated', { count: quiz.questions.length }));
      navigate('/app/quizzes');
    } catch (error) {
      toast.error(errText(error, t('exam.actionFailed')));
    } finally {
      setBusyAction(null);
    }
  };

  const handlePlanner = async () => {
    setBusyAction('planner');
    try {
      const plan = await api.createStudyPlan(activeWorkspaceId, {
        targetExamDate: examDate,
        dailyHours: 2,
        weakTopicPriority: true,
      });
      toast.success(t('exam.planCreated', { count: plan.tasks.length }));
      navigate('/app/planner');
    } catch (error) {
      toast.error(errText(error, t('exam.actionFailed')));
    } finally {
      setBusyAction(null);
    }
  };

  const showSetup = !report;

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-6xl mx-auto w-full">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-emerald-500" />
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {t('exam.title')}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">{t('exam.subtitle')}</p>
        </div>
        {report && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReport(null)}
            className="text-xs flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t('exam.newAnalysis')}</span>
          </Button>
        )}
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {loadError}
          </p>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()} className="text-xs">
            {t('exam.retry')}
          </Button>
        </div>
      )}

      {showSetup && (
        <DocumentTagger
          documents={documents}
          selection={selection}
          title={title}
          isLoading={isLoading}
          isUploading={isUploading}
          isSubmitting={isSubmitting}
          validationMessage={validationMessage}
          onTitleChange={setTitle}
          onToggle={handleToggle}
          onKind={handleKind}
          onYearChange={handleYear}
          onUpload={handleUpload}
          onAnalyze={handleAnalyze}
          onDemo={handleDemo}
        />
      )}

      {/* Progress */}
      {report && isActive(report.status) && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-emerald-500 animate-spin shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('exam.running')}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{report.title}</p>
            </div>
            <span className="ml-auto font-mono text-xs text-emerald-500">{report.progress}%</span>
          </div>
          <Progress value={report.progress} />
          <p className="text-[11px] text-slate-400">{t('exam.progressHint')}</p>
          <div className="space-y-2 pt-1">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      )}

      {/* Failure */}
      {report && report.status === 'error' && (
        <Card className="p-6 space-y-3 border-red-200 dark:border-red-900">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-semibold">{t('exam.errorTitle')}</p>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {report.error || t('exam.actionFailed')}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReport(null)}
              className="text-xs flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t('exam.backToSetup')}</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Results */}
      {report && report.status === 'ready' && report.topics.length > 0 && (
        <ExamResults
          report={report}
          busyAction={busyAction}
          examDate={examDate}
          onExamDateChange={setExamDate}
          onMakeFlashcards={handleFlashcards}
          onQuizMe={handleQuiz}
          onAddToPlanner={handlePlanner}
        />
      )}

      {report && report.status === 'ready' && report.topics.length === 0 && (
        <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
          {t('exam.noTopics')}
        </div>
      )}

      {/* History */}
      {reports.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />
            {t('exam.history')}
          </h3>
          <div className="space-y-2">
            {reports.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openReport(item.id)}
                disabled={busyAction === `open:${item.id}`}
                className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center justify-between gap-3 hover:border-emerald-500/40 transition-colors cursor-pointer disabled:opacity-60"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {item.title}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {t('exam.questionsCount', { count: item.questionCount })}
                    {item.topTopics.length > 0 && ` · ${item.topTopics.join(', ')}`}
                    {' · '}
                    {formatTimeAgo(item.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[10px] uppercase text-slate-400">
                    {t(`exam.status.${item.status}`)}
                  </span>
                  {isActive(item.status) && <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />}
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center pt-2">{t('exam.disclaimer')}</p>
    </div>
  );
};
