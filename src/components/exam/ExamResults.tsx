import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Award,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Flame,
  HelpCircle,
  Layers,
  Plus,
  Quote,
  Repeat,
  Sparkles,
} from 'lucide-react';
import { ExamReport, ExamTopic } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ExamResultsProps {
  report: ExamReport;
  busyAction: string | null;
  examDate: string;
  onExamDateChange: (value: string) => void;
  onMakeFlashcards: (topic: ExamTopic) => void;
  onQuizMe: (topic: ExamTopic) => void;
  onAddToPlanner: () => void;
}

const likelihoodTone = (value: number): string => {
  if (value >= 70) return 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (value >= 40) return 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10';
  return 'text-slate-500 border-slate-300 dark:border-slate-700 bg-slate-500/5';
};

const shortLabel = (value: string): string => (value.length > 22 ? `${value.slice(0, 20)}…` : value);

export const ExamResults: React.FC<ExamResultsProps> = ({
  report,
  busyAction,
  examDate,
  onExamDateChange,
  onMakeFlashcards,
  onQuizMe,
  onAddToPlanner,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(report.topics[0]?.topic ?? null);

  useEffect(() => {
    setExpanded(report.topics[0]?.topic ?? null);
  }, [report.id, report.topics]);

  const chartData = report.topics.slice(0, 10).map((topic) => ({
    name: shortLabel(topic.topic),
    likelihood: topic.likelihood,
  }));

  const maxYearCount = Math.max(
    1,
    ...report.topics.flatMap((topic) => Object.values(topic.yearCounts)),
  );

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{report.title}</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('exam.topicsCount', { count: report.topics.length })} ·{' '}
            {t('exam.questionsCount', { count: report.questionCount })}
            {report.years.length > 0 && ` · ${report.years.join(', ')}`}
          </p>
          <p className="text-[11px] text-slate-400">{report.disclaimer || t('exam.disclaimer')}</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {t('exam.plannerDate')}
            </label>
            <Input
              type="date"
              value={examDate}
              onChange={(event) => onExamDateChange(event.target.value)}
              className="mt-1 h-8 w-40 text-[11px]"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddToPlanner}
            disabled={busyAction === 'planner' || !examDate}
            className="text-xs h-8 flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5 text-emerald-500" />
            <span>{t('exam.addToPlanner')}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Likelihood bar chart */}
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm">{t('exam.likelihood')}</CardTitle>
            <p className="text-[11px] text-slate-400">{t('exam.likelihoodHint')}</p>
          </CardHeader>
          <CardContent className="p-5 pt-0 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="#334155" strokeOpacity={0.18} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(value) => [Number(value ?? 0).toFixed(1), t('exam.likelihood')]}
                />
                <Bar dataKey="likelihood" radius={[0, 4, 4, 0]} barSize={14}>
                  {chartData.map((entry, index) => (
                    <Cell key={entry.name} fill={index === 0 ? '#8b5cf6' : '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Topic x year heatmap */}
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm">{t('exam.heatmap')}</CardTitle>
            <p className="text-[11px] text-slate-400">{t('exam.heatmapHint')}</p>
          </CardHeader>
          <CardContent className="p-5 pt-0 overflow-x-auto">
            {report.years.length === 0 || report.topics.length === 0 ? (
              <p className="text-xs text-slate-400 py-6">{t('exam.noYearData')}</p>
            ) : (
              <table className="w-full text-[11px] border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-slate-400 px-1">{t('exam.topic')}</th>
                    {report.years.map((year) => (
                      <th key={year} className="font-mono font-medium text-slate-400 px-1">
                        {year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.topics.map((topic) => (
                    <tr key={topic.topic}>
                      <td className="text-slate-600 dark:text-slate-300 pr-2 max-w-[9rem] truncate" title={topic.topic}>
                        {shortLabel(topic.topic)}
                      </td>
                      {report.years.map((year) => {
                        const count = topic.yearCounts[String(year)] ?? 0;
                        const strength = count === 0 ? 0 : 0.18 + (0.7 * count) / maxYearCount;
                        return (
                          <td key={year} className="text-center">
                            <span
                              title={`${topic.topic} · ${year}: ${count}`}
                              className="inline-flex h-7 w-10 items-center justify-center rounded-md font-mono"
                              style={{
                                backgroundColor:
                                  count === 0 ? 'rgba(148,163,184,0.08)' : `rgba(139,92,246,${strength})`,
                                color: count === 0 ? '#94a3b8' : strength > 0.55 ? '#ffffff' : '#e2e8f0',
                              }}
                            >
                              {count || '·'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Topic cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t('exam.results')}
        </h3>

        {report.topics.map((topic) => {
          const isOpen = expanded === topic.topic;
          const cardsBusy = busyAction === `cards:${topic.topic}`;
          const quizBusy = busyAction === `quiz:${topic.topic}`;
          return (
            <Card key={topic.topic} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : topic.topic)}
                className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={cn(
                      'shrink-0 inline-flex h-9 w-12 items-center justify-center rounded-lg border font-mono text-xs font-bold',
                      likelihoodTone(topic.likelihood),
                    )}
                  >
                    {topic.likelihood.toFixed(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {topic.topic}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">{topic.unit}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                    <Repeat className="h-3 w-3" />
                    {topic.timesAsked}
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                    <CalendarClock className="h-3 w-3" />
                    {topic.yearsSinceLastAsked}y
                  </span>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: t('exam.timesAsked'), value: String(topic.timesAsked), icon: Repeat },
                      { label: t('exam.marksShare'), value: `${Math.round(topic.marksShare * 100)}%`, icon: Award },
                      { label: t('exam.lastAsked'), value: `${topic.yearsSinceLastAsked}y`, icon: CalendarClock },
                      {
                        label: t('exam.yearsAsked'),
                        value: topic.yearsAsked.join(', ') || '—',
                        icon: Flame,
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-2.5"
                      >
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          <stat.icon className="h-3 w-3" />
                          <span className="truncate">{stat.label}</span>
                        </div>
                        <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100 mt-1 truncate">
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Predictions */}
                  {topic.predictions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-500 dark:text-purple-400">
                        {t('exam.predictions')}
                      </p>
                      {topic.predictions.map((prediction, index) => (
                        <div
                          key={`${topic.topic}-${index}`}
                          className="rounded-lg border border-purple-500/20 bg-purple-500/[0.04] p-3 space-y-1.5"
                        >
                          <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                            <span className="font-mono text-[10px] text-purple-400 mr-1.5">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            {prediction.text}
                          </p>
                          <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
                            <Quote className="h-3 w-3 mt-0.5 shrink-0 text-purple-400" />
                            <span>
                              <span className="font-semibold text-slate-500 dark:text-slate-400">
                                {t('exam.why')}:{' '}
                              </span>
                              {prediction.why}
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Real past questions */}
                  {topic.questions.length > 0 && (
                    <details className="group">
                      <summary className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 cursor-pointer select-none">
                        {t('exam.pastQuestions')} ({topic.questions.length})
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {topic.questions.slice(0, 8).map((question, index) => (
                          <li
                            key={`${topic.topic}-q-${index}`}
                            className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2"
                          >
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">
                              {(question.years.length ? question.years : [question.year ?? '—']).join(', ')}
                            </span>
                            <span>{question.text}</span>
                            {question.marks ? (
                              <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-400">
                                {question.marks}m
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {/* Actions reuse the existing study features */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="subtle"
                      onClick={() => onMakeFlashcards(topic)}
                      disabled={cardsBusy}
                      className="text-xs h-8 flex items-center gap-1.5"
                    >
                      <Layers className="h-3 w-3 text-purple-400" />
                      <span>{t('exam.makeFlashcards')}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onQuizMe(topic)}
                      disabled={quizBusy}
                      className="text-xs h-8 flex items-center gap-1.5"
                    >
                      <HelpCircle className="h-3 w-3 text-amber-500" />
                      <span>{t('exam.quizMe')}</span>
                    </Button>
                    <span className="text-[10px] text-slate-400 ml-auto">
                      {t('exam.actionsHint')}
                    </span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
