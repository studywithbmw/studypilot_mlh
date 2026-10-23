import React from 'react';
import { Languages, ChevronDown } from 'lucide-react';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from '../../lib/constants';
import { useSettingsStore } from '../../store/useSettingsStore';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';

export const LanguageSwitcher: React.FC = () => {
  const { answerLanguage, setAnswerLanguage } = useSettingsStore();

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === answerLanguage) || SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer select-none border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
          title="Switch UI Language"
        >
          <Languages className="h-3.5 w-3.5 text-emerald-500" />
          <span className="hidden sm:inline">{current.native}</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setAnswerLanguage(lang.code as SupportedLanguage)}
            className={`flex items-center justify-between py-1.5 ${
              answerLanguage === lang.code ? 'font-semibold text-emerald-600 dark:text-emerald-400' : ''
            }`}
          >
            <span>{lang.native}</span>
            <span className="text-[10px] text-slate-400 uppercase font-mono">{lang.code}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
