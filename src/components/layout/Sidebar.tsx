import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Sparkles,
  MessageSquare,
  FileText,
  BookOpen,
  HelpCircle,
  Layers,
  Network,
  Calendar,
  AlertTriangle,
  Target,
  Briefcase,
  Settings,
  Share2,
  ChevronLeft,
  ChevronRight,
  Flame,
  UsersRound,
} from 'lucide-react';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../../lib/constants';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/useAuthStore';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const navGroups = [
    {
      group: 'Core',
      items: [
        { to: '/app', icon: LayoutDashboard, label: t('nav.dashboard') },
        { to: '/app/ask', icon: Sparkles, label: t('nav.quickAsk') },
        { to: '/app/chat', icon: MessageSquare, label: t('nav.chat') },
        { to: '/app/documents', icon: FileText, label: t('nav.documents') },
        { to: '/app/rooms', icon: UsersRound, label: t('nav.rooms') },
      ],
    },
    {
      group: 'Study Mastery',
      items: [
        { to: '/app/summaries', icon: BookOpen, label: t('nav.summaries') },
        { to: '/app/quizzes', icon: HelpCircle, label: t('nav.quizzes') },
        { to: '/app/flashcards', icon: Layers, label: t('nav.flashcards') },
        { to: '/app/mindmap', icon: Network, label: t('nav.mindmap') },
        { to: '/app/planner', icon: Calendar, label: t('nav.planner') },
        { to: '/app/weak-topics', icon: AlertTriangle, label: t('nav.weakTopics') },
        { to: '/app/exam-predictor', icon: Target, label: t('nav.examPredictor') },
      ],
    },
    {
      group: 'Career & Systems',
      items: [
        { to: '/app/career', icon: Briefcase, label: t('nav.career') },
      ],
    },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed md:static inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/95 transition-all duration-300 ease-in-out',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="h-14 flex items-center justify-between px-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <Link to="/app" className="flex items-center gap-2.5 min-w-0" onClick={onCloseMobile}>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 19h20L12 2zm0 4l6.5 11h-13L12 6z" />
              </svg>
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 tracking-tight leading-none">
                  {PRODUCT_NAME}
                </span>
                <span className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                  {PRODUCT_TAGLINE}
                </span>
              </div>
            )}
          </Link>

          {/* Desktop collapse toggle */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden md:flex p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Workspace Switcher */}
        {!collapsed && (
          <div className="p-3 border-b border-slate-200/60 dark:border-slate-800/60">
            <WorkspaceSwitcher />
          </div>
        )}

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {navGroups.map((group) => (
            <div key={group.group} className="space-y-1">
              {!collapsed && (
                <div className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                  {group.group}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/app'}
                    onClick={onCloseMobile}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors select-none',
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      )
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1 shrink-0">
          <NavLink
            to="/app/settings"
            onClick={onCloseMobile}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                isActive
                  ? 'bg-emerald-500/10 text-emerald-500 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              )
            }
            title={collapsed ? t('nav.settings') : undefined}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{t('nav.settings')}</span>}
          </NavLink>

          {!collapsed && (
            <div className="px-2 pt-2 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Press <kbd className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">?</kbd> for help</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
