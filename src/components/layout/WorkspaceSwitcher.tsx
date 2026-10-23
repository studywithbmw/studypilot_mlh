import React, { useState } from 'react';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { ChevronDown, Plus, Check, FolderKanban, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const COLOR_PRESETS = ['#10B981', '#6366F1', '#3B82F6', '#EC4899', '#F59E0B', '#8B5CF6'];
const EMOJI_PRESETS = ['💾', '🚀', '📚', '⚡', '🧠', '🔬', '🎯'];

export const WorkspaceSwitcher: React.FC = () => {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace } = useWorkspaceStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_PRESETS[0]);
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJI_PRESETS[0]);

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await createWorkspace(newTitle.trim(), selectedColor, selectedEmoji);
    setNewTitle('');
    setIsDialogOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 transition-colors cursor-pointer select-none text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 border"
                style={{ backgroundColor: `${activeWs?.color || '#10B981'}15`, borderColor: `${activeWs?.color || '#10B981'}30` }}
              >
                {activeWs?.emoji || '📁'}
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {activeWs?.name || 'Workspace'}
                </span>
                <span className="text-[10px] text-slate-400 truncate">
                  {activeWs?.documentCount || 0} docs · {activeWs?.deckCount || 0} decks
                </span>
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 p-1.5">
          <DropdownMenuLabel className="text-[10px] font-semibold tracking-wider uppercase text-slate-400">
            Switch Workspace
          </DropdownMenuLabel>
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => setActiveWorkspaceId(ws.id)}
              className="flex items-center justify-between py-2 cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">{ws.emoji}</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                    {ws.name}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">
                    {ws.documentCount} docs
                  </span>
                </div>
              </div>
              {ws.id === activeWorkspaceId && <Check className="h-3.5 w-3.5 text-emerald-500" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium py-2 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Create New Workspace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Workspace Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Workspace</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Workspace Name
              </label>
              <Input
                placeholder="e.g. Distributed Systems Lab"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Choose Emoji
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                {EMOJI_PRESETS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedEmoji(emoji)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg border transition-all cursor-pointer ${
                      selectedEmoji === emoji
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Theme Color
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    style={{ backgroundColor: color }}
                    className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                      selectedColor === color ? 'scale-115 border-white dark:border-slate-900 shadow-md' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newTitle.trim()}>
                Create Workspace
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
