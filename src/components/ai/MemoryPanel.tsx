import React, { useState } from 'react';
import { MemoryFact } from '../../types';
import { Brain, Pin, Trash2, Plus, Check } from 'lucide-react';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useSettingsStore } from '../../store/useSettingsStore';

interface MemoryPanelProps {
  facts: MemoryFact[];
  onAddFact: (fact: string) => void;
  onDeleteFact: (id: string) => void;
  onTogglePin: (id: string) => void;
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({
  facts,
  onAddFact,
  onDeleteFact,
  onTogglePin,
}) => {
  const { memoryEnabled, setMemoryEnabled } = useSettingsStore();
  const [newFactText, setNewFactText] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFactText.trim()) return;
    onAddFact(newFactText.trim());
    setNewFactText('');
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Header and Toggle */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
              Persistent Conversation Memory
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Personalized context preserved across sessions and workspaces
            </div>
          </div>
        </div>
        <Switch checked={memoryEnabled} onCheckedChange={setMemoryEnabled} />
      </div>

      {/* Facts List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium px-1">
          <span>Remembered Facts ({facts.length})</span>
          <span>{memoryEnabled ? 'Active' : 'Paused'}</span>
        </div>

        {facts.length === 0 ? (
          <div className="p-6 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            No memories stored yet. Add study deadlines, role preferences, or habits below.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {facts.map((fact) => (
              <div
                key={fact.id}
                className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                  fact.isPinned
                    ? 'bg-emerald-500/5 border-emerald-500/30 text-slate-900 dark:text-slate-100'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                  <button
                    onClick={() => onTogglePin(fact.id)}
                    className={`cursor-pointer ${fact.isPinned ? 'text-emerald-500' : 'text-slate-400 hover:text-slate-200'}`}
                    title={fact.isPinned ? 'Unpin fact' : 'Pin fact'}
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>
                  <span className="truncate text-xs">{fact.fact}</span>
                </div>
                <button
                  onClick={() => onDeleteFact(fact.id)}
                  className="text-slate-400 hover:text-red-500 p-1 rounded cursor-pointer transition-colors"
                  title="Delete memory"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Fact Form */}
      <form onSubmit={handleAdd} className="flex items-center gap-2 pt-2">
        <Input
          placeholder="e.g. Taking Distributed Systems final on Nov 20..."
          value={newFactText}
          onChange={(e) => setNewFactText(e.target.value)}
          className="text-xs h-9"
        />
        <Button type="submit" size="sm" disabled={!newFactText.trim()} className="h-9 px-3 shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </form>
    </div>
  );
};
