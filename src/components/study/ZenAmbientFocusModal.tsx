import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  X,
  Sparkles,
  Flame,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Clock,
  BookOpen,
} from 'lucide-react';
import { useStudyTrackerStore } from '@/store/useStudyTrackerStore';
import { ShaderBackground } from '@/components/ui/shader-background';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export const ZenAmbientFocusModal: React.FC = () => {
  const {
    isAmbientFocusOpen,
    setAmbientFocusOpen,
    activeTimer,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimerAndLog,
    resetTimer,
    tickTimer,
    getTodayHours,
    dailyGoalHours,
    getCurrentStreak,
  } = useStudyTrackerStore();

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [sessionNotes, setSessionNotes] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Interval timer tick
  useEffect(() => {
    if (!activeTimer.isRunning || activeTimer.isPaused) return;
    const interval = setInterval(() => {
      tickTimer();
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimer.isRunning, activeTimer.isPaused, tickTimer]);

  // Keyboard shortcut: Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAmbientFocusOpen) {
        setAmbientFocusOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAmbientFocusOpen, setAmbientFocusOpen]);

  if (!isAmbientFocusOpen) return null;

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const isPomodoro = activeTimer.mode === 'pomodoro';
  const targetSeconds = (activeTimer.targetMinutes || 25) * 60;
  const remainingSeconds = Math.max(0, targetSeconds - activeTimer.elapsedSeconds);
  const displayTime = isPomodoro ? formatTime(remainingSeconds) : formatTime(activeTimer.elapsedSeconds);
  const progressPercent = isPomodoro
    ? Math.min(100, Math.round((activeTimer.elapsedSeconds / targetSeconds) * 100))
    : Math.min(100, Math.round((activeTimer.elapsedSeconds / 3600) * 100));

  const handleFinishAndLog = () => {
    const record = stopTimerAndLog(sessionNotes || 'Deep Work in Zen Ambient Mode');
    if (record) {
      toast.success(`Session logged! +${record.durationMinutes} min added to daily study hours.`, {
        description: `Subject: ${record.subject}`,
      });
    } else {
      toast.info('Session ended without logging (under 30s threshold).');
    }
    setAmbientFocusOpen(false);
  };

  const todayHours = getTodayHours();
  const streak = getCurrentStreak();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden select-none">
      {/* Real-time WebGL Plasma Shader Background */}
      <ShaderBackground className="fixed inset-0 w-full h-full -z-20" />

      {/* Cybernetic Dark Ambient Overlay for deep contrast & focus */}
      <div className="fixed inset-0 -z-10 bg-slate-950/75 backdrop-blur-[6px] transition-all" />

      {/* Floating Header Bar */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between text-white/90 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-xs uppercase font-mono tracking-wider text-emerald-400 font-semibold">
              Zen Ambient Flow State
            </div>
            <div className="text-sm font-semibold text-white/90 truncate max-w-xs sm:max-w-md">
              {activeTimer.subject || 'Deep Distributed Systems Focus'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Streak pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-mono font-medium backdrop-blur-md">
            <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{streak}d streak</span>
          </div>

          {/* Sound toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/80 transition-all cursor-pointer backdrop-blur-md"
            title={soundEnabled ? 'Mute ambient sound' : 'Unmute ambient focus chime'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-white/60" />}
          </button>

          {/* Close Zen Mode */}
          <button
            onClick={() => setAmbientFocusOpen(false)}
            className="p-2 rounded-xl bg-white/10 hover:bg-red-500/30 hover:border-red-500/50 border border-white/15 text-white/80 transition-all cursor-pointer backdrop-blur-md"
            title="Exit Zen Mode (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Central Glassmorphic Focus HUD */}
      <div className="w-full max-w-lg bg-slate-900/60 backdrop-blur-2xl border border-white/15 rounded-3xl p-8 sm:p-10 shadow-2xl shadow-black/80 flex flex-col items-center text-center relative z-10 transition-all">
        {/* Glow halo */}
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500/20 via-purple-500/20 to-blue-500/20 blur-xl opacity-75 pointer-events-none -z-10" />

        {/* Activity Tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-mono text-emerald-300 mb-6">
          <Clock className="w-3.5 h-3.5" />
          <span>{isPomodoro ? `${activeTimer.targetMinutes}m Pomodoro Sprint` : 'Continuous Flow Stopwatch'}</span>
        </div>

        {/* Big Digital Monospace Display */}
        <div className="font-mono text-7xl sm:text-8xl font-black tracking-tight text-white drop-shadow-[0_4px_30px_rgba(16,185,129,0.35)] tabular-nums mb-3">
          {displayTime}
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-xs bg-white/10 rounded-full h-2 mb-6 overflow-hidden border border-white/10">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 transition-all duration-500 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Motivational Philosophy */}
        <p className="text-xs sm:text-sm text-slate-300/90 font-medium italic mb-8 max-w-sm">
          "One hour of deep undistracted synthesis outperforms eight hours of fragmented shallow work."
        </p>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-6">
          {!activeTimer.isRunning ? (
            <Button
              size="lg"
              onClick={() => startTimer(activeTimer.subject, activeTimer.mode, activeTimer.targetMinutes)}
              className="h-14 px-8 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base shadow-lg shadow-emerald-500/30 active:scale-95 transition-all gap-2"
            >
              <Play className="w-5 h-5 fill-slate-950" />
              <span>Begin Session</span>
            </Button>
          ) : activeTimer.isPaused ? (
            <Button
              size="lg"
              onClick={resumeTimer}
              className="h-14 px-8 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base shadow-lg shadow-emerald-500/30 active:scale-95 transition-all gap-2"
            >
              <Play className="w-5 h-5 fill-slate-950" />
              <span>Resume Flow</span>
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={pauseTimer}
              className="h-14 px-8 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-base shadow-lg shadow-amber-500/30 active:scale-95 transition-all gap-2"
            >
              <Pause className="w-5 h-5 fill-slate-950" />
              <span>Pause Focus</span>
            </Button>
          )}

          {activeTimer.isRunning && (
            <Button
              variant="outline"
              size="lg"
              onClick={handleFinishAndLog}
              className="h-14 px-6 rounded-2xl bg-white/10 hover:bg-white/20 border-white/20 text-white font-semibold text-sm backdrop-blur-md active:scale-95 transition-all gap-2"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Log & Finish</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={resetTimer}
            className="h-12 w-12 rounded-2xl text-white/70 hover:text-white hover:bg-white/10"
            title="Reset timer"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        {/* Live Today's Hours Ticker */}
        <div className="pt-4 border-t border-white/10 w-full flex items-center justify-between text-xs text-slate-300 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-white/60">Today's Total:</span>
            <span className="font-bold text-emerald-400">{todayHours} hrs</span>
            <span className="text-white/40">/ {dailyGoalHours}h goal</span>
          </div>
          <div className="text-emerald-400 font-semibold">
            {Math.round((todayHours / dailyGoalHours) * 100)}% Complete
          </div>
        </div>
      </div>

      {/* Bottom Hint */}
      <div className="absolute bottom-6 text-center text-xs text-white/50 font-mono">
        Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-white/80">ESC</kbd> to return to workspace · WebGL Plasma Canvas running at 60 FPS
      </div>
    </div>
  );
};
