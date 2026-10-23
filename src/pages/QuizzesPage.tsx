import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  HelpCircle,
  Plus,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Flag,
  Layers,
  ArrowRight,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { api } from '@/lib/api';
import { Quiz, QuizQuestion } from '@/types';
import { QuestionCard } from '@/components/study/QuestionCard';
import { QuizTimer } from '@/components/study/QuizTimer';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ApiError } from '@/lib/api/http';
import { ConfirmDeleteDialog } from '@/components/common/ConfirmDeleteDialog';
import { toast } from 'sonner';

export const QuizzesPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeWorkspaceId } = useWorkspaceStore();

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizToDelete, setQuizToDelete] = useState<Quiz | null>(null);
  const [mode, setMode] = useState<'list' | 'setup' | 'runner' | 'results'>('list');
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);

  // Runner state
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Array<{ questionId: string; answer: string | number }>>([]);
  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);
  const [resultsData, setResultsData] = useState<{
    scorePercent: number;
    attempts: Array<{ questionId: string; isCorrect: boolean; aiFeedback?: string }>;
  } | null>(null);

  // Setup form state
  const [setupTopic, setSetupTopic] = useState('');
  const [setupDifficulty, setSetupDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [setupCount, setSetupCount] = useState(5);
  const [setupTimerMins, setSetupTimerMins] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadQuizzes();
    const topicParam = searchParams.get('topic');
    if (topicParam) {
      setSetupTopic(topicParam);
      setMode('setup');
    } else if (searchParams.get('new') === 'true' || searchParams.get('generate') === 'true') {
      setMode('setup');
    }
  }, [activeWorkspaceId, searchParams]);

  async function loadQuizzes() {
    try {
      const list = await api.getQuizzes(activeWorkspaceId);
      setQuizzes(list);
      if (list.length > 0 && !activeQuiz) {
        setActiveQuiz(list[0]);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not load your quizzes.');
    }
  }

  const handleStartSetupQuiz = async () => {
    setIsGenerating(true);
    try {
      const generated = await api.generateQuiz({
        workspaceId: activeWorkspaceId,
        topic: setupTopic.trim(),
        difficulty: setupDifficulty,
        count: setupCount,
        timedMinutes: setupTimerMins,
      });
      setActiveQuiz(generated);
      setCurrentQIndex(0);
      setUserAnswers([]);
      setFlaggedIds([]);
      setResultsData(null);
      setMode('runner');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not generate the quiz. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRecordAnswer = (ans: string | number) => {
    if (!activeQuiz) return;
    const q = activeQuiz.questions[currentQIndex];
    setUserAnswers((prev) => [
      ...prev.filter((a) => a.questionId !== q.id),
      { questionId: q.id, answer: ans },
    ]);
  };

  const submitCurrentQuiz = async () => {
    if (!activeQuiz || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const submission = await api.submitQuiz(activeQuiz.id, userAnswers);
      setResultsData(submission);
      setMode('results');
      await loadQuizzes();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not grade the quiz. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextQuestion = async () => {
    if (!activeQuiz) return;
    if (currentQIndex + 1 < activeQuiz.questions.length) {
      setCurrentQIndex((i) => i + 1);
    } else {
      await submitCurrentQuiz();
    }
  };

  const handleCreateFlashcardsFromMistakes = async () => {
    if (!activeQuiz) return;
    try {
      const deck = await api.deckFromQuizMistakes(activeQuiz.id);
      toast.success(`Created "${deck.title}" with ${deck.cardCount} cards.`);
      navigate('/app/flashcards');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not create flashcards.');
    }
  };

  // Accuracy per topic for the quiz just finished (computed from the real results).
  const topicStatsData = (() => {
    if (!activeQuiz || !resultsData) return [];
    const byTopic = new Map<string, { ok: number; total: number }>();
    for (const q of activeQuiz.questions) {
      const attempt = resultsData.attempts.find((a) => a.questionId === q.id);
      const row = byTopic.get(q.topic) ?? { ok: 0, total: 0 };
      row.total += 1;
      if (attempt?.isCorrect) row.ok += 1;
      byTopic.set(q.topic, row);
    }
    return [...byTopic.entries()].map(([topic, v]) => ({ topic, accuracy: Math.round((100 * v.ok) / v.total) }));
  })();

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Interactive Retention Quizzes
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            MCQ, true/false, and short answer diagnostic assessments with grounded explanations and citations
          </p>
        </div>

        <div className="flex items-center gap-2">
          {mode !== 'setup' && (
            <Button size="sm" onClick={() => setMode('setup')} className="text-xs flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              <span>Generate Quiz</span>
            </Button>
          )}
          {mode !== 'list' && (
            <Button variant="outline" size="sm" onClick={() => setMode('list')} className="text-xs">
              View History
            </Button>
          )}
        </div>
      </div>

      {/* VIEW: SETUP */}
      {mode === 'setup' && (
        <Card className="max-w-xl mx-auto">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-base">Quiz Generation Wizard</CardTitle>
            <p className="text-xs text-slate-500">
              Customize focus topics, question count, and difficulty level
            </p>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Target Topic / Focus
              </label>
              <input
                type="text"
                value={setupTopic}
                placeholder="e.g. Strict 2PL (leave empty to cover your whole workspace)"
                onChange={(e) => setSetupTopic(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Difficulty Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['easy', 'medium', 'hard'] as const).map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setSetupDifficulty(diff)}
                    className={`py-2 rounded-lg border text-xs font-semibold capitalize cursor-pointer transition-all ${
                      setupDifficulty === diff
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                <span>Number of Questions</span>
                <span className="font-mono text-emerald-500">{setupCount} questions</span>
              </div>
              <Slider
                value={[setupCount]}
                onValueChange={(val) => setSetupCount(val[0])}
                min={3}
                max={15}
                step={1}
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                <span>Timer Duration</span>
                <span className="font-mono text-emerald-500">{setupTimerMins} minutes</span>
              </div>
              <Slider
                value={[setupTimerMins]}
                onValueChange={(val) => setSetupTimerMins(val[0])}
                min={5}
                max={30}
                step={5}
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setMode('list')}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleStartSetupQuiz} disabled={isGenerating}>
                {isGenerating ? 'Writing questions…' : 'Start Quiz Session'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* VIEW: RUNNER */}
      {mode === 'runner' && activeQuiz && (
        <div className="space-y-4">
          {/* Top Progress and Timer Strip */}
          <div className="flex items-center justify-between text-xs text-slate-500 max-w-2xl mx-auto px-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{activeQuiz.title}</span>
            </div>
            <QuizTimer
              initialMinutes={activeQuiz.timedMinutes || 10}
              onTimeUp={() => {
                toast.warning('Time expired! Submitting your answers.');
                submitCurrentQuiz();
              }}
            />
          </div>

          <div className="max-w-2xl mx-auto">
            <Progress
              value={((currentQIndex + 1) / activeQuiz.questions.length) * 100}
              className="h-1.5"
            />
          </div>

          {/* Question Card Component */}
          <QuestionCard
            question={activeQuiz.questions[currentQIndex]}
            currentIndex={currentQIndex}
            totalQuestions={activeQuiz.questions.length}
            onAnswer={handleRecordAnswer}
            onNext={handleNextQuestion}
            isFlagged={flaggedIds.includes(activeQuiz.questions[currentQIndex].id)}
            onToggleFlag={() => {
              const id = activeQuiz.questions[currentQIndex].id;
              setFlaggedIds((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
              );
            }}
          />
        </div>
      )}

      {/* VIEW: RESULTS */}
      {mode === 'results' && activeQuiz && resultsData && (
        <div className="space-y-6 max-w-3xl mx-auto">
          {/* Score Header Card */}
          <Card className="text-center p-8 space-y-4 border-emerald-500/30 bg-emerald-500/5">
            <div className="w-24 h-24 rounded-full mx-auto border-4 border-emerald-500 flex flex-col items-center justify-center font-mono">
              <span className="text-3xl font-extrabold text-emerald-500">
                {resultsData.scorePercent}%
              </span>
              <span className="text-[9px] uppercase tracking-wider text-slate-400">Score</span>
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Quiz Session Completed!
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Completed in {activeQuiz.title} · Instant diagnostic feedback ready below
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateFlashcardsFromMistakes}
                className="text-xs flex items-center gap-1.5"
              >
                <Layers className="h-3.5 w-3.5 text-purple-500" />
                <span>Make Flashcards from Mistakes</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setCurrentQIndex(0);
                  setMode('runner');
                }}
                className="text-xs flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Retry Quiz</span>
              </Button>
            </div>
          </Card>

          {/* Per-Topic Accuracy Bar Chart */}
          <Card>
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-sm">Topic Accuracy Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicStatsData}>
                  <XAxis dataKey="topic" stroke="#64748b" fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Bar dataKey="accuracy" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Detailed Question Review List */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Detailed Question Answers & Explanations
            </h4>
            {activeQuiz.questions.map((q, idx) => {
              const attempt = resultsData.attempts.find((a) => a.questionId === q.id);
              const isCorrect = attempt?.isCorrect;
              return (
                <div
                  key={q.id}
                  className={`p-4 rounded-xl border space-y-2 text-xs ${
                    isCorrect
                      ? 'border-emerald-500/20 bg-emerald-500/5'
                      : 'border-red-500/20 bg-red-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-slate-900 dark:text-slate-100">
                      {idx + 1}. {q.prompt}
                    </span>
                    {isCorrect ? (
                      <span className="text-emerald-500 flex items-center gap-1 text-[11px]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Correct
                      </span>
                    ) : (
                      <span className="text-red-500 flex items-center gap-1 text-[11px]">
                        <XCircle className="h-3.5 w-3.5" /> Incorrect
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    <strong>Explanation:</strong> {q.explanation}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW: QUIZ HISTORY TABLE */}
      {mode === 'list' && (
        <div className="space-y-4">
          {quizzes.length === 0 && (
            <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
              No quizzes yet. Press <b>Generate Quiz</b> to create one from your documents.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizzes.map((quiz) => (
              <Card key={quiz.id} className="hover:border-emerald-500/40 transition-colors">
                <CardHeader className="p-5 pb-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono uppercase">
                    <span>{quiz.difficulty}</span>
                    <span className="text-emerald-500 font-bold">
                      {quiz.scorePercent !== undefined ? `${quiz.scorePercent}% Score` : 'Not Started'}
                    </span>
                  </div>
                  <CardTitle className="text-sm mt-1">{quiz.title}</CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0 space-y-3">
                  <p className="text-xs text-slate-400">{quiz.topic}</p>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="font-mono text-[11px] text-slate-400">
                      {quiz.questions.length} questions
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Delete quiz"
                      aria-label={`Delete quiz ${quiz.title}`}
                      onClick={() => setQuizToDelete(quiz)}
                      className="text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setActiveQuiz(quiz);
                        setCurrentQIndex(0);
                        setUserAnswers([]);
                        setMode('runner');
                      }}
                      className="text-xs h-7 flex items-center gap-1"
                    >
                      <Play className="h-3 w-3" />
                      <span>Take Quiz</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={quizToDelete !== null}
        onOpenChange={(o) => !o && setQuizToDelete(null)}
        itemName={quizToDelete?.title ?? ''}
        description="This quiz and its saved score will be deleted. Your documents are not affected."
        onConfirm={async () => {
          if (!quizToDelete) return;
          try {
            await api.deleteQuiz(quizToDelete.id);
            setQuizzes((prev) => prev.filter((q) => q.id !== quizToDelete.id));
            setActiveQuiz((cur) => (cur?.id === quizToDelete.id ? null : cur));
            toast.success('Quiz deleted.');
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : 'Could not delete the quiz.');
            throw e;
          }
        }}
      />
    </div>
  );
};