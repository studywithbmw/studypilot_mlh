import React, { useState, useEffect } from 'react';
import {
  Clock,
  Flame,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Plus,
  Calendar,
  Layers,
  HelpCircle,
  BookOpen,
  Filter,
  BarChart3,
  Award,
  ChevronRight,
  Trash2,
  Sliders,
} from 'lucide-react';
import {
  useStudyTrackerStore,
  StudyActivityType,
  getLocalDateKey,
} from '@/store/useStudyTrackerStore';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

const PRESET_SUBJECTS = [
  'Reading & notes',
  'Practice problems',
  'Revision',
  'Exam preparation',
  'Project work',
  'Language practice',
];

export const DailyStudyTracker: React.FC = () => {
  const {
    dailyGoalHours,
    setDailyGoalHours,
    sessions,
    activeTimer,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimerAndLog,
    resetTimer,
    tickTimer,
    logStudySession,
    deleteStudySession,
    getTodayHours,
    getWeeklyHours,
    getTotalHours,
    getContributionsMap,
    getCurrentStreak,
    getLongestStreak,
    setAmbientFocusOpen,
  } = useStudyTrackerStore();

  const [selectedSubject, setSelectedSubject] = useState(PRESET_SUBJECTS[0]);
  const [selectedActivity, setSelectedActivity] = useState<StudyActivityType>('deep_work');
  const [filterType, setFilterType] = useState<'all' | StudyActivityType>('all');
  const [showLogModal, setShowLogModal] = useState(false);
  const [manualMinutes, setManualMinutes] = useState('45');
  const [manualSubject, setManualSubject] = useState(PRESET_SUBJECTS[0]);
  const [manualNotes, setManualNotes] = useState('');
  const [heatmapRange, setHeatmapRange] = useState<'16w' | '52w'>('16w');
  const [hoveredDay, setHoveredDay] = useState<{
    date: string;
    minutes: number;
    count: number;
    deepWork: number;
    cards: number;
    quizzes: number;
  } | null>(null);

  // Interval timer tick
  useEffect(() => {
    if (!activeTimer.isRunning || activeTimer.isPaused) return;
    const interval = setInterval(() => {
      tickTimer();
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimer.isRunning, activeTimer.isPaused, tickTimer]);

  const todayHours = getTodayHours();
  const weeklyHours = getWeeklyHours();
  const totalHours = getTotalHours();
  const streak = getCurrentStreak();
  const longestStreak = getLongestStreak();
  const contributionsMap = getContributionsMap();

  // Progress towards today's goal
  const goalPercent = Math.min(100, Math.round((todayHours / dailyGoalHours) * 100));

  // Timer format display
  const formatTimerDigits = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleStartTimer = (presetMinutes: number = 25) => {
    startTimer(selectedSubject, 'pomodoro', presetMinutes, selectedActivity);
    toast.success(`Pomodoro session started (${presetMinutes}m)`, {
      description: `Focus on ${selectedSubject}`,
    });
  };

  const handleStartStopwatch = () => {
    startTimer(selectedSubject, 'stopwatch', 0, selectedActivity);
    toast.success('Continuous stopwatch flow started');
  };

  const handleCompleteActiveTimer = () => {
    const record = stopTimerAndLog('Completed focused study sprint');
    if (record) {
      toast.success(`Great work! Logged ${record.durationMinutes} minutes.`);
    } else {
      toast.info('Session ended (under 30s threshold).');
    }
  };

  const handleQuickAdd = (minutes: number) => {
    logStudySession(minutes, selectedSubject, selectedActivity, 'Quick offline study entry');
    toast.success(`Added +${minutes} minutes to today's study log!`);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = parseInt(manualMinutes, 10);
    if (isNaN(mins) || mins <= 0) {
      toast.error('Please enter a valid number of minutes');
      return;
    }
    logStudySession(mins, manualSubject, selectedActivity, manualNotes || undefined);
    setShowLogModal(false);
    setManualNotes('');
    toast.success(`Successfully logged ${mins} minutes of study.`);
  };

  // Generate 16 or 52 weeks of dates for the contribution heatmap
  const totalWeeks = heatmapRange === '16w' ? 16 : 32;
  const now = new Date();
  const daysTotal = totalWeeks * 7;
  
  // Calculate grid starting from Sunday `totalWeeks` ago
  const gridWeeks: Array<Array<{ dateStr: string; dateObj: Date; minutes: number; intensity: number; count: number; deepWork: number; cards: number; quizzes: number }>> = [];
  
  // Find current day of week (0=Sun..6=Sat)
  const currentDayOfWeek = now.getDay();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - currentDayOfWeek - (totalWeeks - 1) * 7);

  for (let w = 0; w < totalWeeks; w++) {
    const weekDays = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(startDate);
      cur.setDate(startDate.getDate() + w * 7 + d);
      const dateStr = getLocalDateKey(cur);
      const entry = contributionsMap[dateStr];
      const minutes = entry?.minutes || 0;
      const count = entry?.count || 0;
      const deepWork = entry?.details.deepWorkMinutes || 0;
      const cards = entry?.details.flashcardsCount || 0;
      const quizzes = entry?.details.quizzesCount || 0;
      
      let intensity = 0;
      if (minutes > 0) {
        if (minutes < 30) intensity = 1;
        else if (minutes < 75) intensity = 2;
        else if (minutes < 150) intensity = 3;
        else intensity = 4;
      }

      weekDays.push({
        dateStr,
        dateObj: cur,
        minutes,
        intensity,
        count,
        deepWork,
        cards,
        quizzes,
      });
    }
    gridWeeks.push(weekDays);
  }

  // Filter recent sessions
  const filteredSessions = sessions.filter((s) => {
    if (filterType === 'all') return true;
    return s.activityType === filterType;
  });

  return (
    <div className="space-y-6">
      {/* 4 Core Hero Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Hours Card with Visual Progress */}
        <Card className="relative overflow-hidden border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Today's Study Hours</span>
            <Clock className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                {todayHours}h
              </span>
              <span className="text-xs font-mono text-slate-400">/ {dailyGoalHours}h goal</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${goalPercent}%` }}
              />
            </div>
            <div className="flex justify-between items-center mt-1.5 text-[11px]">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{goalPercent}% completed</span>
              <span className="text-slate-400">{Math.max(0, Math.round((dailyGoalHours - todayHours) * 10) / 10)}h left</span>
            </div>
          </CardContent>
        </Card>

        {/* Current Study Streak */}
        <Card className="border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Daily Study Streak</span>
            <Flame className="h-4 w-4 text-amber-500 fill-amber-500 animate-pulse" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="font-mono text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              {streak} <span className="text-xs font-normal text-slate-400">days</span>
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-2">
              🔥 Best streak: {longestStreak} days
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Studied consistently this term</p>
          </CardContent>
        </Card>

        {/* Past 7 Days Total */}
        <Card className="border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Weekly Hours (7d)</span>
            <BarChart3 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="font-mono text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              {weeklyHours}h
            </div>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium mt-2">
              Avg {Math.round((weeklyHours / 7) * 10) / 10}h / day
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">High velocity learning cycle</p>
          </CardContent>
        </Card>

        {/* Lifetime Study Hours */}
        <Card className="border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Hours Logged</span>
            <Award className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="font-mono text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              {totalHours}h
            </div>
            <p className="text-[11px] text-purple-600 dark:text-purple-400 font-medium mt-2">
              Across {sessions.length} study sessions
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">SuperMemo SM-2 & Active Recall</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Study Control Panel: Live Timer & Quick Log Toolbar */}
      <Card className="border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm">
        <CardHeader className="p-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <span>Focus Session & Daily Study Engine</span>
              </CardTitle>
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                Live Engine
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Accumulate active recall hours, log practice sprints, or enter ambient flow state
            </p>
          </div>

          {/* Quick Ambient Zen Mode Launcher using WebGL Shader */}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setAmbientFocusOpen(true)}
              className="text-xs bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white font-semibold shadow-md shadow-purple-950/20 gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Launch Zen Shader Mode</span>
            </Button>

            {/* Manual log dialog trigger */}
            <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Manual Log</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold">Log Offline Study Hours</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleManualSubmit} className="space-y-4 pt-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                      Duration (Minutes)
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="720"
                        value={manualMinutes}
                        onChange={(e) => setManualMinutes(e.target.value)}
                        className="font-mono text-sm"
                        required
                      />
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => setManualMinutes('30')}>30m</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setManualMinutes('60')}>1h</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setManualMinutes('90')}>1.5h</Button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                      Subject
                    </label>
                    <select
                      value={manualSubject}
                      onChange={(e) => setManualSubject(e.target.value)}
                      className="w-full text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {PRESET_SUBJECTS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                      Activity Type
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        { id: 'deep_work', label: 'Deep Work' },
                        { id: 'flashcards', label: 'Flashcards SM-2' },
                        { id: 'quiz', label: 'Quiz Practice' },
                        { id: 'docs_reading', label: 'Document Reading' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedActivity(item.id as StudyActivityType)}
                          className={`p-2 rounded-lg border text-left transition-all ${
                            selectedActivity === item.id
                              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                      Notes (Optional)
                    </label>
                    <Input
                      placeholder="e.g. Chapter 4 Raft Consensus Leader Election"
                      value={manualNotes}
                      onChange={(e) => setManualNotes(e.target.value)}
                      className="text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowLogModal(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                      Save Study Hours
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-5">
          {/* Active Session Status / Timer Strip */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            {/* Subject Selector & Timer details */}
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Active Focus Subject:</span>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="text-xs font-semibold text-slate-900 dark:text-slate-100 bg-transparent border-b border-dashed border-slate-400 focus:outline-none cursor-pointer truncate max-w-xs sm:max-w-md"
                >
                  {PRESET_SUBJECTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {activeTimer.isRunning ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {activeTimer.isPaused ? 'Session Paused' : 'Timer In Progress'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    Mode: {activeTimer.mode === 'pomodoro' ? `${activeTimer.targetMinutes}m Pomodoro` : 'Flow Stopwatch'}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-slate-400">
                  Select a duration preset or start a flow stopwatch to accumulate real-time study hours.
                </div>
              )}
            </div>

            {/* Timer Counter + Primary Controls */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Digital Time Ticker */}
              <div className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-950 text-white font-mono text-2xl font-black tracking-tight tabular-nums shadow-inner border border-slate-700/50">
                {activeTimer.isRunning
                  ? formatTimerDigits(
                      activeTimer.mode === 'pomodoro'
                        ? Math.max(0, activeTimer.targetMinutes * 60 - activeTimer.elapsedSeconds)
                        : activeTimer.elapsedSeconds
                    )
                  : '25:00'}
              </div>

              {/* Action Buttons */}
              {!activeTimer.isRunning ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => handleStartTimer(25)}
                    className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>25m Sprint</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStartTimer(50)}
                    className="text-xs"
                  >
                    50m Deep
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleStartStopwatch}
                    className="text-xs"
                  >
                    Stopwatch
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  {activeTimer.isPaused ? (
                    <Button
                      size="sm"
                      onClick={resumeTimer}
                      className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Resume</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={pauseTimer}
                      className="text-xs gap-1"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleCompleteActiveTimer}
                    className="text-xs bg-slate-900 hover:bg-slate-800 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Finish & Log</span>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={resetTimer}
                    className="h-8 w-8 text-slate-400 hover:text-red-500"
                    title="Cancel session"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Increment Shortcuts */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="font-medium">Quick Log Offline Study:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs font-mono"
                onClick={() => handleQuickAdd(15)}
              >
                +15m
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs font-mono"
                onClick={() => handleQuickAdd(30)}
              >
                +30m
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs font-mono"
                onClick={() => handleQuickAdd(60)}
              >
                +1h
              </Button>
            </div>

            {/* Daily Goal Adjuster */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Daily Target:</span>
              <div className="flex items-center gap-1">
                {[2, 4, 6, 8].map((hrs) => (
                  <button
                    key={hrs}
                    onClick={() => {
                      setDailyGoalHours(hrs);
                      toast.info(`Daily study target updated to ${hrs} hours.`);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                      dailyGoalHours === hrs
                        ? 'bg-emerald-500 text-white font-bold'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {hrs}h
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* GitHub-style Study Contribution Heatmap */}
      <Card className="border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm">
        <CardHeader className="p-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold">Daily Study Contributions & Heatmap</CardTitle>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {heatmapRange === '16w' ? '112 Days' : '224 Days'}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live tracking of hours studied, SM-2 cards reviewed, and quiz practices
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Range Toggle */}
            <div className="flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-medium">
              <button
                onClick={() => setHeatmapRange('16w')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  heatmapRange === '16w'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                16 Weeks
              </button>
              <button
                onClick={() => setHeatmapRange('52w')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  heatmapRange === '52w'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                32 Weeks
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {/* Heatmap Grid */}
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-1.5 min-w-[700px]">
              {/* Day of Week Labels */}
              <div className="flex flex-col gap-1.5 justify-between pr-2 text-[10px] text-slate-400 font-mono select-none pt-0.5">
                <span>Sun</span>
                <span>Tue</span>
                <span>Thu</span>
                <span>Sat</span>
              </div>

              {/* Weekly Columns */}
              {gridWeeks.map((week, wIdx) => (
                <div key={wIdx} className="flex flex-col gap-1.5">
                  {week.map((day, dIdx) => {
                    let bg = 'bg-slate-100 dark:bg-slate-800/80';
                    if (day.intensity === 1) bg = 'bg-emerald-500/30';
                    if (day.intensity === 2) bg = 'bg-emerald-500/55';
                    if (day.intensity === 3) bg = 'bg-emerald-500/80';
                    if (day.intensity === 4) bg = 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]';

                    const isToday = day.dateStr === getLocalDateKey();

                    return (
                      <div
                        key={dIdx}
                        onMouseEnter={() =>
                          setHoveredDay({
                            date: day.dateStr,
                            minutes: day.minutes,
                            count: day.count,
                            deepWork: day.deepWork,
                            cards: day.cards,
                            quizzes: day.quizzes,
                          })
                        }
                        onMouseLeave={() => setHoveredDay(null)}
                        className={`w-3.5 h-3.5 rounded-xs ${bg} ${
                          isToday ? 'ring-1.5 ring-emerald-500 ring-offset-1 dark:ring-offset-slate-900' : ''
                        } transition-transform hover:scale-125 cursor-pointer relative`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Dynamic Hover Tooltip Bar */}
          <div className="mt-4 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs min-h-[42px]">
            {hoveredDay ? (
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {hoveredDay.date}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                  {Math.round((hoveredDay.minutes / 60) * 10) / 10} hours
                </span>
                <span className="text-slate-400">
                  ({hoveredDay.count} sessions: {hoveredDay.deepWork}m deep work, {hoveredDay.cards} cards, {hoveredDay.quizzes} quizzes)
                </span>
              </div>
            ) : (
              <span className="text-slate-400 italic">
                Hover over any date square to inspect study hours and session breakdown
              </span>
            )}

            {/* Heatmap Legend */}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono shrink-0">
              <span>Less</span>
              <div className="w-2.5 h-2.5 rounded-xs bg-slate-100 dark:bg-slate-800" />
              <div className="w-2.5 h-2.5 rounded-xs bg-emerald-500/30" />
              <div className="w-2.5 h-2.5 rounded-xs bg-emerald-500/55" />
              <div className="w-2.5 h-2.5 rounded-xs bg-emerald-500/80" />
              <div className="w-2.5 h-2.5 rounded-xs bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
              <span>More</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Study Session History & Filter */}
      <Card className="border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm">
        <CardHeader className="p-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80">
          <div>
            <CardTitle className="text-sm font-bold">Recent Study Logs & Recall Sessions</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">
              Auditable activity timeline for proof of work and habit adherence
            </p>
          </div>

          {/* Activity Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'all', label: 'All Activities' },
              { id: 'deep_work', label: 'Deep Work' },
              { id: 'flashcards', label: 'Flashcards' },
              { id: 'quiz', label: 'Quizzes' },
              { id: 'docs_reading', label: 'Docs' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id as any)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  filterType === tab.id
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredSessions.slice(0, 8).map((session) => (
              <div
                key={session.id}
                className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    {session.activityType === 'deep_work' && <Clock className="w-4 h-4" />}
                    {session.activityType === 'flashcards' && <Layers className="w-4 h-4" />}
                    {session.activityType === 'quiz' && <HelpCircle className="w-4 h-4" />}
                    {session.activityType === 'docs_reading' && <BookOpen className="w-4 h-4" />}
                    {session.activityType === 'code_practice' && <Sparkles className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {session.subject}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{session.date}</span>
                      <span>·</span>
                      <span className="capitalize">{session.activityType.replace('_', ' ')}</span>
                      {session.notes && (
                        <>
                          <span>·</span>
                          <span className="italic truncate max-w-xs">{session.notes}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md">
                    +{session.durationMinutes} min
                  </span>
                  <button
                    onClick={() => {
                      deleteStudySession(session.id);
                      toast.info('Study session removed');
                    }}
                    className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                    title="Remove session"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
