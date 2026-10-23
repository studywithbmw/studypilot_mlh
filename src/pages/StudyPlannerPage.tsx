import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  BookOpen,
  HelpCircle,
  Layers,
  CalendarDays,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { api } from '@/lib/api';
import { StudyPlan, StudyTask } from '@/types';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/http';

const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const isoInDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

export const StudyPlannerPage: React.FC = () => {
  const { activeWorkspaceId } = useWorkspaceStore();
  const [plan, setPlan] = useState<StudyPlan | null>(null);

  // Form parameters
  const [targetDate, setTargetDate] = useState(isoInDays(14));
  const [dailyHours, setDailyHours] = useState(3);
  const [weakTopicPriority, setWeakTopicPriority] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    loadPlan();
  }, [activeWorkspaceId]);

  async function loadPlan() {
    try {
      const p = await api.getStudyPlan(activeWorkspaceId);
      setPlan(p);
      if (p) {
        setTargetDate(p.targetExamDate);
        setDailyHours(p.dailyHours);
        setWeakTopicPriority(p.weakTopicPriority);
      }
    } catch (e) {
      toast.error(errText(e, 'Could not load your study plan.'));
    }
  }

  const handleToggleTask = async (task: StudyTask) => {
    if (!plan) return;
    // Optimistic update, rolled back if the server rejects it.
    const previous = plan;
    const tasks = plan.tasks.map((t) => (t.id === task.id ? { ...t, isCompleted: !t.isCompleted } : t));
    setPlan({ ...plan, tasks, completionRate: Math.round((tasks.filter((t) => t.isCompleted).length / tasks.length) * 100) });
    try {
      setPlan(await api.setStudyTask(activeWorkspaceId, task.id, !task.isCompleted));
    } catch (e) {
      setPlan(previous);
      toast.error(errText(e, 'Could not update the task.'));
    }
  };

  const handleRescheduleMissed = async () => {
    if (!plan) return;
    try {
      setPlan(await api.rescheduleStudyPlan(activeWorkspaceId));
      toast.success('Missed tasks moved to today.');
    } catch (e) {
      toast.error(errText(e, 'Could not reschedule tasks.'));
    }
  };

  const handleRegenerate = async () => {
    setIsGenerating(true);
    try {
      const created = await api.createStudyPlan(activeWorkspaceId, {
        targetExamDate: targetDate,
        dailyHours,
        weakTopicPriority,
      });
      setPlan(created);
      if (created.tasks.length === 0) {
        toast.info('Upload a document first, then generate your plan.');
      } else {
        toast.success('Study plan created from your documents and weak topics.');
      }
    } catch (e) {
      toast.error(errText(e, 'Could not create the plan.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const getTaskIcon = (type: StudyTask['type']) => {
    switch (type) {
      case 'read':
        return <BookOpen className="h-3.5 w-3.5 text-blue-500" />;
      case 'quiz':
        return <HelpCircle className="h-3.5 w-3.5 text-amber-500" />;
      case 'flashcards':
        return <Layers className="h-3.5 w-3.5 text-purple-500" />;
      case 'revise':
        return <AlertTriangle className="h-3.5 w-3.5 text-emerald-500" />;
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Personalized Study Sprint Planner
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Dynamic calendar balancing target exam dates, daily hours, and weak-topic revision priorities
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRescheduleMissed}
            disabled={!plan}
            className="text-xs flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reschedule Missed Tasks</span>
          </Button>

          <Button
            size="sm"
            onClick={handleRegenerate}
            disabled={isGenerating}
            className="text-xs flex items-center gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{plan ? 'Regenerate Plan' : 'Generate Plan'}</span>
          </Button>
        </div>
      </div>

      {/* Plan Controls Card */}
      <Card>
        <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Target Exam Date */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
              Target Exam Date
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Exam in {daysUntil(targetDate)} days
            </span>
          </div>

          {/* Daily Hours Slider */}
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              <span>Daily Capacity</span>
              <span className="font-mono text-emerald-500">{dailyHours} hrs / day</span>
            </div>
            <Slider
              value={[dailyHours]}
              onValueChange={(v) => setDailyHours(v[0])}
              min={1}
              max={8}
              step={1}
            />
            <span className="text-[10px] text-slate-400 mt-1.5 block">
              Balances retention vs cognitive fatigue
            </span>
          </div>

          {/* Weak Topic Priority Toggle */}
          <div className="flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Weak Topic Priority
            </span>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Front-load difficult topics
              </span>
              <Switch checked={weakTopicPriority} onCheckedChange={setWeakTopicPriority} />
            </div>
          </div>
        </CardContent>
      </Card>

      {!plan && (
        <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
          No study plan yet. Pick your exam date and daily hours, then press <b>Generate Plan</b>. The plan is built from the
          documents you uploaded and the topics you miss in quizzes.
        </div>
      )}
      {plan && plan.tasks.length === 0 && (
        <div className="p-6 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center text-xs text-amber-600 dark:text-amber-400">
          Your workspace has no processed documents yet, so there is nothing to schedule. Upload a document and regenerate.
        </div>
      )}

      {/* Progress Ring & Timeline View */}
      {plan && plan.tasks.length > 0 && (
        <div className="space-y-6">
          {/* Progress Strip */}
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-emerald-500 flex items-center justify-center font-mono font-bold text-emerald-500 text-xs">
                {plan.completionRate}%
              </div>
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Sprint Completion Rate
                </span>
                <p className="text-[11px] text-slate-500">
                  {plan.tasks.filter((t) => t.isCompleted).length} of {plan.tasks.length} tasks completed
                </p>
              </div>
            </div>

            <span className="font-mono text-xs text-slate-400">
              Exam Target: {plan.targetExamDate}
            </span>
          </div>

          {/* Daily Task Timeline */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Scheduled Daily Milestone Timeline
            </h3>

            <div className="space-y-2.5">
              {plan.tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => handleToggleTask(task)}
                  className={`p-4 rounded-xl border transition-all flex items-center justify-between text-xs cursor-pointer ${
                    task.isCompleted
                      ? 'border-slate-200 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30 opacity-75'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      className={`p-1 rounded-md transition-colors ${
                        task.isCompleted
                          ? 'text-emerald-500 bg-emerald-500/10'
                          : 'text-slate-300 dark:text-slate-700 hover:text-emerald-500'
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-slate-100 dark:bg-slate-800">
                        {getTaskIcon(task.type)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span
                          className={`font-semibold truncate ${
                            task.isCompleted
                              ? 'line-through text-slate-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {task.title}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {task.topic} · {task.date}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400 shrink-0">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {task.durationMinutes}m
                    </span>
                    <span className="uppercase text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                      {task.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
