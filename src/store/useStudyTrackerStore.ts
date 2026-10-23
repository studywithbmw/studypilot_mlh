import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { USE_MOCK } from '../lib/env';

export type StudyActivityType = 'deep_work' | 'flashcards' | 'quiz' | 'docs_reading' | 'code_practice';

export interface StudySessionRecord {
  id: string;
  date: string; // ISO date YYYY-MM-DD
  timestamp: string; // ISO string
  durationMinutes: number;
  subject: string;
  activityType: StudyActivityType;
  notes?: string;
}

export interface DayContribution {
  date: string; // YYYY-MM-DD
  minutes: number;
  count: number;
  intensity: 0 | 1 | 2 | 3 | 4; // 0=none, 1=1-30m, 2=30-90m, 3=90-180m, 4=180m+
  details: {
    deepWorkMinutes: number;
    flashcardsCount: number;
    quizzesCount: number;
    docsCount: number;
  };
}

interface ActiveTimerState {
  isRunning: boolean;
  isPaused: boolean;
  mode: 'pomodoro' | 'stopwatch';
  targetMinutes: number;
  elapsedSeconds: number;
  subject: string;
  activityType: StudyActivityType;
  startTime: number | null;
}

interface StudyTrackerState {
  dailyGoalHours: number;
  sessions: StudySessionRecord[];
  activeTimer: ActiveTimerState;
  isAmbientFocusOpen: boolean;
  
  // Actions
  setDailyGoalHours: (hours: number) => void;
  setAmbientFocusOpen: (open: boolean) => void;
  toggleAmbientFocusOpen: () => void;
  
  // Timer Actions
  startTimer: (subject: string, mode?: 'pomodoro' | 'stopwatch', targetMinutes?: number, activityType?: StudyActivityType) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimerAndLog: (notes?: string) => StudySessionRecord | null;
  resetTimer: () => void;
  tickTimer: () => void;
  
  // Manual Logging
  logStudySession: (minutes: number, subject: string, activityType: StudyActivityType, notes?: string, customDate?: string) => void;
  deleteStudySession: (id: string) => void;
  
  // Computed helpers
  getTodayHours: () => number;
  getWeeklyHours: () => number;
  getTotalHours: () => number;
  getContributionsMap: () => Record<string, DayContribution>;
  getCurrentStreak: () => number;
  getLongestStreak: () => number;
}

// Helper to format date YYYY-MM-DD in local time
export const getLocalDateKey = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Seed 120 days of realistic study contributions for a senior student / dev
const generateInitialSessions = (): StudySessionRecord[] => {
  const list: StudySessionRecord[] = [];
  const subjects = [
    'Distributed Systems (Raft & Paxos)',
    'Database Internals (B+ Trees & LSM)',
    'Operating Systems & Paging',
    'System Design & Microservices',
    'Algorithms & Graph Theory',
    'Network Protocols (TCP/QUIC)'
  ];
  const types: StudyActivityType[] = ['deep_work', 'flashcards', 'quiz', 'docs_reading', 'code_practice'];

  const now = new Date();
  
  // Generate consistent study records for the last 112 days (16 weeks)
  for (let i = 112; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = getLocalDateKey(d);
    
    // Day of week: 0=Sun, 6=Sat
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const studyProb = isWeekend ? 0.75 : 0.88;
    
    // Simulate current 14-day streak intact
    const forceStreak = i <= 14;
    
    if (forceStreak || Math.random() < studyProb) {
      const numSessions = Math.floor(Math.random() * 3) + 1;
      for (let s = 0; s < numSessions; s++) {
        const duration = [25, 45, 50, 60, 90][Math.floor(Math.random() * 5)];
        const subject = subjects[(i + s) % subjects.length];
        const activityType = types[(i * 2 + s) % types.length];
        
        list.push({
          id: `seed_${i}_${s}`,
          date: dateKey,
          timestamp: new Date(d.getTime() + s * 3600000 + 36000000).toISOString(),
          durationMinutes: duration,
          subject,
          activityType,
          notes: s === 0 ? 'Deep recall and architectural synthesis' : undefined
        });
      }
    }
  }

  return list;
};

// Fake 16-week history + baseline streaks are demo-mode only. In real mode the
// tracker starts empty and only counts what the user actually studies.
const initialSessions = USE_MOCK ? generateInitialSessions() : [];
const BASELINE_STREAK = USE_MOCK ? 14 : 0;
const BASELINE_LONGEST_STREAK = USE_MOCK ? 38 : 0;

export const useStudyTrackerStore = create<StudyTrackerState>()(
  persist(
    (set, get) => ({
      dailyGoalHours: 4.0,
      sessions: initialSessions,
      isAmbientFocusOpen: false,
      activeTimer: {
        isRunning: false,
        isPaused: false,
        mode: 'pomodoro',
        targetMinutes: 25,
        elapsedSeconds: 0,
        subject: 'General study',
        activityType: 'deep_work',
        startTime: null,
      },

      setDailyGoalHours: (hours: number) => set({ dailyGoalHours: Math.max(0.5, Math.min(16, hours)) }),
      
      setAmbientFocusOpen: (open: boolean) => set({ isAmbientFocusOpen: open }),
      
      toggleAmbientFocusOpen: () => set((state) => ({ isAmbientFocusOpen: !state.isAmbientFocusOpen })),

      startTimer: (subject, mode = 'pomodoro', targetMinutes = 25, activityType = 'deep_work') => {
        set({
          activeTimer: {
            isRunning: true,
            isPaused: false,
            mode,
            targetMinutes,
            elapsedSeconds: 0,
            subject,
            activityType,
            startTime: Date.now(),
          },
        });
      },

      pauseTimer: () => {
        set((state) => ({
          activeTimer: { ...state.activeTimer, isPaused: true },
        }));
      },

      resumeTimer: () => {
        set((state) => ({
          activeTimer: { ...state.activeTimer, isPaused: false },
        }));
      },

      stopTimerAndLog: (notes) => {
        const { activeTimer } = get();
        if (activeTimer.elapsedSeconds < 30) {
          // Less than 30s, cancel without logging
          set({
            activeTimer: {
              ...activeTimer,
              isRunning: false,
              isPaused: false,
              elapsedSeconds: 0,
              startTime: null,
            },
          });
          return null;
        }

        const durationMinutes = Math.max(1, Math.round(activeTimer.elapsedSeconds / 60));
        const todayKey = getLocalDateKey();
        const newRecord: StudySessionRecord = {
          id: `session_${Date.now()}`,
          date: todayKey,
          timestamp: new Date().toISOString(),
          durationMinutes,
          subject: activeTimer.subject || 'Deep Study Session',
          activityType: activeTimer.activityType,
          notes: notes || `${activeTimer.mode === 'pomodoro' ? 'Pomodoro Focus' : 'Open Stopwatch'} completed`,
        };

        set((state) => ({
          sessions: [newRecord, ...state.sessions],
          activeTimer: {
            ...state.activeTimer,
            isRunning: false,
            isPaused: false,
            elapsedSeconds: 0,
            startTime: null,
          },
        }));

        return newRecord;
      },

      resetTimer: () => {
        set((state) => ({
          activeTimer: {
            ...state.activeTimer,
            isRunning: false,
            isPaused: false,
            elapsedSeconds: 0,
            startTime: null,
          },
        }));
      },

      tickTimer: () => {
        const { activeTimer } = get();
        if (!activeTimer.isRunning || activeTimer.isPaused) return;

        set((state) => ({
          activeTimer: {
            ...state.activeTimer,
            elapsedSeconds: state.activeTimer.elapsedSeconds + 1,
          },
        }));
      },

      logStudySession: (minutes, subject, activityType, notes, customDate) => {
        const dateKey = customDate || getLocalDateKey();
        const newRecord: StudySessionRecord = {
          id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          date: dateKey,
          timestamp: new Date().toISOString(),
          durationMinutes: Math.max(1, minutes),
          subject,
          activityType,
          notes,
        };

        set((state) => ({
          sessions: [newRecord, ...state.sessions],
        }));
      },

      deleteStudySession: (id) => {
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
        }));
      },

      getTodayHours: () => {
        const todayKey = getLocalDateKey();
        const { sessions } = get();
        const mins = sessions
          .filter((s) => s.date === todayKey)
          .reduce((sum, s) => sum + s.durationMinutes, 0);
        return Math.round((mins / 60) * 10) / 10;
      },

      getWeeklyHours: () => {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - 7);
        const { sessions } = get();
        const mins = sessions
          .filter((s) => new Date(s.timestamp) >= startOfWeek)
          .reduce((sum, s) => sum + s.durationMinutes, 0);
        return Math.round((mins / 60) * 10) / 10;
      },

      getTotalHours: () => {
        const { sessions } = get();
        const mins = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
        return Math.round((mins / 60) * 10) / 10;
      },

      getContributionsMap: () => {
        const { sessions } = get();
        const map: Record<string, DayContribution> = {};

        for (const s of sessions) {
          if (!map[s.date]) {
            map[s.date] = {
              date: s.date,
              minutes: 0,
              count: 0,
              intensity: 0,
              details: {
                deepWorkMinutes: 0,
                flashcardsCount: 0,
                quizzesCount: 0,
                docsCount: 0,
              },
            };
          }
          const item = map[s.date];
          item.minutes += s.durationMinutes;
          item.count += 1;

          if (s.activityType === 'deep_work') item.details.deepWorkMinutes += s.durationMinutes;
          if (s.activityType === 'flashcards') item.details.flashcardsCount += 1;
          if (s.activityType === 'quiz') item.details.quizzesCount += 1;
          if (s.activityType === 'docs_reading') item.details.docsCount += 1;
        }

        // Assign intensity scale
        for (const key of Object.keys(map)) {
          const m = map[key].minutes;
          if (m === 0) map[key].intensity = 0;
          else if (m < 30) map[key].intensity = 1;
          else if (m < 75) map[key].intensity = 2;
          else if (m < 150) map[key].intensity = 3;
          else map[key].intensity = 4;
        }

        return map;
      },

      getCurrentStreak: () => {
        const map = get().getContributionsMap();
        const today = new Date();
        let streak = 0;

        // Check if studied today
        const todayKey = getLocalDateKey(today);
        let checkDate = new Date(today);

        if (!map[todayKey] || map[todayKey].minutes === 0) {
          // Check if studied yesterday before breaking
          checkDate.setDate(checkDate.getDate() - 1);
        }

        while (true) {
          const key = getLocalDateKey(checkDate);
          if (map[key] && map[key].minutes > 0) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }

        return Math.max(streak, BASELINE_STREAK);
      },

      getLongestStreak: () => {
        const map = get().getContributionsMap();
        const sortedDates = Object.keys(map).sort();
        if (sortedDates.length === 0) return BASELINE_STREAK;

        let maxStreak = BASELINE_STREAK;
        let current = 0;
        let prevDate: Date | null = null;

        for (const dateStr of sortedDates) {
          if (map[dateStr].minutes > 0) {
            const curDate = new Date(dateStr);
            if (prevDate) {
              const diffDays = Math.round((curDate.getTime() - prevDate.getTime()) / (1000 * 3600 * 24));
              if (diffDays === 1) {
                current++;
              } else {
                current = 1;
              }
            } else {
              current = 1;
            }
            prevDate = curDate;
            if (current > maxStreak) maxStreak = current;
          }
        }

        return Math.max(maxStreak, BASELINE_LONGEST_STREAK);
      },
    }),
    {
      name: 'studypilot_study_tracker_storage',
      // Browsers that ran demo mode earlier still hold the fake seeded
      // sessions in localStorage; drop them once when running against the
      // real backend.
      version: 1,
      migrate: (persisted) => {
        const state = persisted as { sessions?: StudySessionRecord[] } | undefined;
        if (!USE_MOCK && state?.sessions) {
          return {
            ...state,
            sessions: state.sessions.filter((x) => !x.id.startsWith('seed_')),
          } as unknown as StudyTrackerState;
        }
        return state as unknown as StudyTrackerState;
      },
    }
  )
);
