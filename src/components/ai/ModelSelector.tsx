import React from 'react';
import { AIModelId, AI_MODELS } from '../../lib/constants';
import { Zap, Cpu, Sparkles, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';

interface ModelSelectorProps {
  value: AIModelId;
  onChange: (model: AIModelId) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ value, onChange }) => {
  const current = AI_MODELS.find((m) => m.id === value) || AI_MODELS[0];

  const getIcon = (id: AIModelId) => {
    if (id === 'groq-llama') return <Zap className="h-3.5 w-3.5 text-amber-500" />;
    if (id === 'gemini-long') return <Cpu className="h-3.5 w-3.5 text-blue-500" />;
    return <Sparkles className="h-3.5 w-3.5 text-emerald-500" />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer select-none"
        >
          {getIcon(value)}
          <span className="truncate max-w-[140px]">{current.name}</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {AI_MODELS.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onChange(model.id)}
            className="flex items-center gap-2 py-2"
          >
            {getIcon(model.id)}
            <div className="flex flex-col">
              <span className="font-medium text-xs">{model.name}</span>
              <span className="text-[10px] text-slate-400">{model.provider} Inference Engine</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
