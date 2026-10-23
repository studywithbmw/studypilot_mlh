import React from 'react';
import { Moon, Sun, Laptop } from 'lucide-react';
import { useSettingsStore, ThemeMode } from '../../store/useSettingsStore';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useSettingsStore();

  const getIcon = () => {
    if (theme === 'light') return <Sun className="h-4 w-4 text-amber-500" />;
    if (theme === 'dark') return <Moon className="h-4 w-4 text-emerald-400" />;
    return <Laptop className="h-4 w-4 text-slate-400" />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="p-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer select-none"
          title="Toggle theme"
        >
          {getIcon()}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onClick={() => setTheme('light')} className="flex items-center gap-2">
          <Sun className="h-3.5 w-3.5 text-amber-500" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="flex items-center gap-2">
          <Moon className="h-3.5 w-3.5 text-emerald-400" />
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="flex items-center gap-2">
          <Laptop className="h-3.5 w-3.5 text-slate-400" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
