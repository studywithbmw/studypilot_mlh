import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  MessageSquare,
  FileText,
  BookOpen,
  HelpCircle,
  Layers,
  Network,
  Calendar,
  AlertTriangle,
  Briefcase,
  Settings,
  Sparkles,
  Sun,
  Moon,
  Globe,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '../ui/command';
import { useSettingsStore } from '../../store/useSettingsStore';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onOpenChange }) => {
  const navigate = useNavigate();
  const { setTheme, theme, setAnswerLanguage } = useSettingsStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '?') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  const handleSelect = (callback: () => void) => {
    onOpenChange(false);
    callback();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or jump to page..." />
      <CommandList>
        <CommandEmpty>No matching tools or pages found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => handleSelect(() => navigate('/app'))}>
            <LayoutDashboard className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Dashboard Overview</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/ask'))}>
            <Sparkles className="mr-2 h-4 w-4 text-emerald-400" />
            <span>Quick Ask (MorphOrb)</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/chat'))}>
            <MessageSquare className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Chat & Citation RAG</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/documents'))}>
            <FileText className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Documents Vault</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/summaries'))}>
            <BookOpen className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Summaries & Notes</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/quizzes'))}>
            <HelpCircle className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Practice Quizzes</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/flashcards'))}>
            <Layers className="mr-2 h-4 w-4 text-emerald-500" />
            <span>SM-2 Spaced Flashcards</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/mindmap'))}>
            <Network className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Mind Map Graph</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/planner'))}>
            <Calendar className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Study Planner & Timeline</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/weak-topics'))}>
            <AlertTriangle className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Weak Topics Diagnostic</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/career'))}>
            <Briefcase className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Career Hub & Mock Interview</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/settings'))}>
            <Settings className="mr-2 h-4 w-4 text-slate-400" />
            <span>Settings & Preferences</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions & Tools">
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/quizzes?new=true'))}>
            <HelpCircle className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Generate New Quiz</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/documents?upload=true'))}>
            <FileText className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Upload Document</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => navigate('/app/career?tab=interview'))}>
            <Briefcase className="mr-2 h-4 w-4 text-emerald-500" />
            <span>Start Voice Mock Interview</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Preferences">
          <CommandItem onSelect={() => handleSelect(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? <Sun className="mr-2 h-4 w-4 text-amber-500" /> : <Moon className="mr-2 h-4 w-4 text-emerald-500" />}
            <span>Toggle Theme ({theme === 'dark' ? 'Light' : 'Dark'})</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => setAnswerLanguage('ta'))}>
            <Globe className="mr-2 h-4 w-4 text-indigo-400" />
            <span>Switch Language to Tamil (தமிழ்)</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => setAnswerLanguage('hi'))}>
            <Globe className="mr-2 h-4 w-4 text-indigo-400" />
            <span>Switch Language to Hindi (हिन्दी)</span>
          </CommandItem>
          <CommandItem onSelect={() => handleSelect(() => setAnswerLanguage('en'))}>
            <Globe className="mr-2 h-4 w-4 text-indigo-400" />
            <span>Switch Language to English</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
