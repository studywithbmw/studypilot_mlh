import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Flame,
  Layers,
  HelpCircle,
  Award,
  ArrowRight,
  BookOpen,
  FileText,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from 'recharts';
import { useAuthStore } from '@/store/useAuthStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { api } from '@/lib/api';
import type { DashboardData } from '@/lib/api/apiClient';
import { DocumentItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DailyStudyTracker } from '@/components/study/DailyStudyTracker';

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { activeWorkspaceId, getActiveWorkspace } = useWorkspaceStore();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setIsLoading(true);
      try {
        const [docs, data] = await Promise.all([
          api.getDocuments(activeWorkspaceId),
          api.getDashboard(activeWorkspaceId),
        ]);
        if (cancelled) return;
        setDocuments(docs);
        setDash(data);
      } catch {
        if (!cancelled) setDash(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  const activeWs = getActiveWorkspace();

  // Real data only: chart points come from quizzes the student actually completed.
  const quizScoresData = (dash?.quizScores ?? []).map((q, i) => ({ session: `Quiz ${i + 1}`, title: q.label, score: q.score }));
  const radarData = (dash?.topicMastery ?? []).map((m) => ({
    topic: m.topic.length > 18 ? `${m.topic.slice(0, 16)}…` : m.topic,
    score: m.accuracy,
  }));
  const weakTopics = dash?.weakTopics ?? [];
  const dueTodayCards = dash?.dueFlashcards ?? 0;
  const todaysTasks = dash?.todaysTasks ?? [];

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Top Banner Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Welcome back, {user?.name?.split(' ')[0] || 'there'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Workspace: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{activeWs?.name}</span>{user?.goal ? ` · Goal: ${user.goal}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/app/chat">
            <Button size="sm" className="text-xs flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Resume Chat with Docs</span>
            </Button>
          </Link>
          <Link to="/app/flashcards">
            <Button variant="outline" size="sm" className="text-xs">
              Review Due Cards ({dueTodayCards})
            </Button>
          </Link>
        </div>
      </div>

      {/* Daily Study Hours & Contributions Engine */}
      <DailyStudyTracker />

      {/* Two-Column Analytics: Quiz Retention Curve + Topic Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Retention / Quiz Score Curve */}
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm">Retention & Quiz Score Trajectory</CardTitle>
            <p className="text-xs text-slate-400">Score progress across consecutive quiz sessions</p>
          </CardHeader>
          <CardContent className="p-5 pt-0 h-60">
            {quizScoresData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-xs text-slate-400 px-6">
                {isLoading ? 'Loading…' : 'Finish a quiz and your scores will be charted here.'}
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={quizScoresData}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="session" stroke="#64748b" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorScore)"
                />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Topic Mastery Radar */}
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm">Topic Mastery Balance</CardTitle>
            <p className="text-xs text-slate-400">Current retention scores by subject area</p>
          </CardHeader>
          <CardContent className="p-5 pt-0 h-60 flex items-center justify-center">
            {radarData.length < 3 ? (
              <div className="text-center text-xs text-slate-400 px-6 space-y-2">
                <p>{radarData.length === 0 ? 'No topic data yet.' : 'Quiz on at least 3 different topics to see the balance chart.'}</p>
                {radarData.map((r) => (
                  <p key={r.topic} className="font-mono">
                    {r.topic}: {r.score}%
                  </p>
                ))}
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" opacity={0.3} />
                <PolarAngleAxis dataKey="topic" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Radar name="Mastery" dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Weak Topics Diagnostic Banner */}
      <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/15">
        <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-500">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm">Weak Topics Requiring Review</CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                Topics where your quiz accuracy is below 75%
              </p>
            </div>
          </div>
          <Link to="/app/weak-topics" className="text-xs font-medium text-amber-500 hover:underline">
            View All Diagnostic Details →
          </Link>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-3">
          {weakTopics.length === 0 && (
            <p className="text-xs text-slate-400">Nothing flagged yet. Topics you miss in quizzes will appear here.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {weakTopics.slice(0, 3).map((wt) => (
              <div
                key={wt.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                      {wt.name}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-amber-500">
                      {wt.accuracyPercent}%
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">{wt.category}</span>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Trend: {wt.trend}</span>
                  <Link
                    to={`/app/quizzes?topic=${encodeURIComponent(wt.name)}`}
                    className="text-[11px] font-semibold text-emerald-500 hover:underline flex items-center gap-1"
                  >
                    <span>Practice now</span>
                    <Play className="h-2.5 w-2.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Documents & Upcoming Study Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents Vault */}
        <Card>
          <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Recent Documents in Workspace</CardTitle>
            <Link to="/app/documents" className="text-xs font-medium text-emerald-500 hover:underline">
              View All Vault ({documents.length}) →
            </Link>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-2">
            {documents.length === 0 && (
              <p className="text-xs text-slate-400">
                No documents yet. <Link to="/app/documents" className="text-emerald-500 hover:underline">Upload your first one</Link>.
              </p>
            )}
            {documents.slice(0, 3).map((doc) => (
              <div
                key={doc.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {doc.name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {doc.pageCount ? `${doc.pageCount} pages` : doc.type.toUpperCase()} · {doc.chunkCount} chunks
                    </span>
                  </div>
                </div>
                <Link
                  to="/app/chat"
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium shrink-0 ml-2"
                >
                  Chat
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming Tasks */}
        <Card>
          <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Today's Study Plan Tasks</CardTitle>
            <Link to="/app/planner" className="text-xs font-medium text-emerald-500 hover:underline">
              Open Timeline →
            </Link>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-2">
            {todaysTasks.length === 0 && (
              <p className="text-xs text-slate-400">
                Nothing scheduled for today. <Link to="/app/planner" className="text-emerald-500 hover:underline">Create a study plan</Link>.
              </p>
            )}
            {todaysTasks.slice(0, 3).map((task) => (
              <div
                key={task.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`p-1.5 rounded-md shrink-0 ${task.isCompleted ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className={`font-medium truncate ${task.isCompleted ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                      {task.title}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {task.durationMinutes} mins · {task.topic}
                    </span>
                  </div>
                </div>
                <span className="font-mono text-[10px] text-slate-400 uppercase shrink-0">
                  {task.type}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
