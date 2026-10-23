import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Minus,
  Play,
  Layers,
  MessageSquare,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { api } from '@/lib/api';
import { WeakTopic } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/http';

export const WeakTopicsPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspaceStore();
  const [topics, setTopics] = useState<WeakTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadWeakTopics = async () => {
    setIsLoading(true);
    try {
      setTopics(await api.getWeakTopics(activeWorkspaceId));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not load weak topics.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWeakTopics();
  }, [activeWorkspaceId]);

  const radarData = topics.map((t) => ({
    name: t.name.length > 20 ? t.name.slice(0, 18) + '...' : t.name,
    accuracy: t.accuracyPercent,
  }));

  const getTrendIcon = (trend: WeakTopic['trend']) => {
    switch (trend) {
      case 'declining':
        return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
      case 'improving':
        return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
      case 'stagnant':
        return <Minus className="h-3.5 w-3.5 text-amber-500" />;
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Weak-Topic Diagnostic & Targeted Revision
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Topics where your quiz answers show the lowest accuracy
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadWeakTopics}
          disabled={isLoading}
          className="text-xs flex items-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Diagnostic</span>
        </Button>
      </div>

      {/* Overview Radar & Accuracy Spectrum */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Radar Map */}
        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm">Knowledge Deficit Radar</CardTitle>
            <p className="text-xs text-slate-400">Current retention percentage per weak topic</p>
          </CardHeader>
          <CardContent className="p-5 pt-0 h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" opacity={0.3} />
                <PolarAngleAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Radar name="Accuracy" dataKey="accuracy" stroke="#ef4444" fill="#ef4444" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Diagnostic Explanation Banner */}
        <div className="p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-amber-500 font-semibold text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Retention Recovery Priority</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Topics below 75% accuracy in your completed quizzes are listed here. Short, focused practice on them is the
              quickest way to raise your next score.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium">
            {topics.length > 0 ? (
              <>
                💡 Start with <strong>{topics[0].name}</strong> ({topics[0].accuracyPercent}% accuracy): take a short practice quiz on it.
              </>
            ) : (
              <>Take a quiz on your documents to see where you stand. Topics you miss will appear here.</>
            )}
          </div>
        </div>
      </div>

      {/* Recommended Targeted Revision Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Individual Topic Recovery Plans
        </h3>

        <div className="space-y-3">
          {!isLoading && topics.length === 0 && (
            <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
              No weak topics yet. Complete a quiz and the topics you get wrong will show up here with a recovery plan.
            </div>
          )}
          {topics.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {t.name}
                    </h4>
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      {t.category}
                    </span>
                  </div>

                  {/* Accuracy Bar */}
                  <div className="flex items-center gap-3">
                    <div className="w-48 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${t.accuracyPercent}%` }}
                        className={`h-full ${
                          t.accuracyPercent < 60 ? 'bg-red-500' : 'bg-amber-500'
                        }`}
                      />
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                      {t.accuracyPercent}%
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      {getTrendIcon(t.trend)}
                      <span className="capitalize">{t.trend}</span>
                    </span>
                  </div>
                </div>

                {/* 4 One-Click Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => navigate('/app/quizzes?topic=' + encodeURIComponent(t.name))}
                    className="text-xs h-8 flex items-center gap-1.5"
                  >
                    <Play className="h-3 w-3" />
                    <span>Practice Quiz</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/app/flashcards')}
                    className="text-xs h-8 flex items-center gap-1.5"
                  >
                    <Layers className="h-3 w-3 text-purple-400" />
                    <span>Review Cards</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate('/app/chat?ask=' + encodeURIComponent(`Explain ${t.name} from my documents`))}
                    className="text-xs h-8 flex items-center gap-1.5"
                  >
                    <MessageSquare className="h-3 w-3 text-emerald-500" />
                    <span>Explain in Chat</span>
                  </Button>

                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
