import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Flame, Bell, User, LogOut, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { PWAInstallButton } from './PWAInstallButton';
import { useAuthStore } from '../../store/useAuthStore';
import { useStudyTrackerStore } from '../../store/useStudyTrackerStore';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../ui/dropdown-menu';

interface TopbarProps {
  onOpenCommand: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onOpenCommand }) => {
  const location = useLocation();
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const { toggleAmbientFocusOpen, activeTimer, getTodayHours, getCurrentStreak } = useStudyTrackerStore();
  const streak = getCurrentStreak();
  const todayHours = getTodayHours();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/app') return t('nav.dashboard');
    if (path === '/app/ask') return t('nav.quickAsk');
    if (path.startsWith('/app/chat')) return t('nav.chat');
    if (path.startsWith('/app/documents')) return t('nav.documents');
    if (path.startsWith('/app/summaries')) return t('nav.summaries');
    if (path.startsWith('/app/quizzes')) return t('nav.quizzes');
    if (path.startsWith('/app/flashcards')) return t('nav.flashcards');
    if (path.startsWith('/app/mindmap')) return t('nav.mindmap');
    if (path.startsWith('/app/planner')) return t('nav.planner');
    if (path.startsWith('/app/weak-topics')) return t('nav.weakTopics');
    if (path.startsWith('/app/career')) return t('nav.career');
    if (path.startsWith('/app/eval')) return t('nav.eval');
    if (path.startsWith('/app/settings')) return t('nav.settings');
    if (path.startsWith('/design')) return 'Design System';
    return t('brand.name');
  };

  return (
    <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Left zone: contextual breadcrumbs */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-slate-400 hidden sm:inline">Workspace</span>
        <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
        <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
          {getPageTitle()}
        </h1>
      </div>

      {/* Right zone: actions, search, preferences, profile */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Cmd+K trigger */}
        <button
          type="button"
          onClick={onOpenCommand}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 border border-slate-200/50 dark:border-slate-700/50 transition-colors cursor-pointer select-none"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Jump anywhere</span>
          <kbd className="hidden sm:inline-block font-mono text-[10px] bg-white dark:bg-slate-900 px-1 rounded border border-slate-200 dark:border-slate-700">
            ⌘K
          </kbd>
        </button>

        {/* Ambient Zen Focus Button (powered by WebGL ShaderBackground) */}
        <button
          type="button"
          onClick={toggleAmbientFocusOpen}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
            activeTimer.isRunning
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 animate-pulse'
              : 'bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-600 dark:text-purple-400'
          }`}
          title="Launch Zen Ambient Focus Mode (WebGL Shader)"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {activeTimer.isRunning ? (activeTimer.isPaused ? 'Paused' : 'Focusing...') : 'Zen Focus'}
          </span>
        </button>

        {/* Today's Study Hours pill */}
        <div className="hidden xl:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold font-mono">
          <span>{todayHours}h today</span>
        </div>

        {/* Streak Counter */}
        <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold font-mono">
          <Flame className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
          <span>{streak}d streak</span>
        </div>

        {/* PWA Install Button */}
        <PWAInstallButton />

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Profile Avatar / Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold text-xs flex items-center justify-center border border-emerald-500/30 cursor-pointer select-none hover:ring-2 hover:ring-emerald-500/20 transition-all"
            >
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'SP'}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-1.5">
            <DropdownMenuLabel className="p-2">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {user?.name || 'Learner'}
              </div>
              <div className="text-[11px] text-slate-400 font-normal truncate">
                {user?.email || ''}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/app/settings" className="flex items-center gap-2 py-2 cursor-pointer">
                <SettingsIcon className="h-3.5 w-3.5 text-slate-400" />
                <span>Account & Preferences</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void logout()}
              className="flex items-center gap-2 text-red-600 dark:text-red-400 py-2 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
