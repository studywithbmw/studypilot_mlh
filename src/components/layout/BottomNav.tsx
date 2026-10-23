import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, FileText, Layers, Briefcase, Menu } from 'lucide-react';
import { cn } from '../../lib/utils';

interface BottomNavProps {
  onOpenMenu: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onOpenMenu }) => {
  const items = [
    { to: '/app', icon: LayoutDashboard, label: 'Home' },
    { to: '/app/chat', icon: MessageSquare, label: 'Chat' },
    { to: '/app/documents', icon: FileText, label: 'Docs' },
    { to: '/app/flashcards', icon: Layers, label: 'Cards' },
    { to: '/app/career', icon: Briefcase, label: 'Career' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-2 py-1.5 safe-area-pb">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/app'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg text-[10px] font-medium transition-colors select-none',
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
      <button
        onClick={onOpenMenu}
        className="flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg text-[10px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
      >
        <Menu className="h-4 w-4" />
        <span>More</span>
      </button>
    </nav>
  );
};
