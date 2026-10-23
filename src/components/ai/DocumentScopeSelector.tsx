import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, FileText, Layers, Search, Video, Globe } from 'lucide-react';
import type { DocumentItem } from '@/types';

interface DocumentScopeSelectorProps {
  documents: DocumentItem[];
  /** 'all' = every ready document, otherwise the selected document ids. */
  value: 'all' | string[];
  onChange: (scope: 'all' | string[]) => void;
  disabled?: boolean;
}

const typeIcon = (type: DocumentItem['type']) => {
  if (type === 'youtube') return <Video className="h-3.5 w-3.5 text-red-400 shrink-0" />;
  if (type === 'web') return <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
  return <FileText className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
};

export const DocumentScopeSelector: React.FC<DocumentScopeSelectorProps> = ({
  documents,
  value,
  onChange,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const ready = useMemo(() => documents.filter((d) => d.status === 'ready'), [documents]);
  const selected = useMemo(
    () => (value === 'all' ? [] : value.filter((id) => ready.some((d) => d.id === id))),
    [value, ready],
  );
  const isAll = value === 'all' || selected.length === 0;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = ready.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()));

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    // Nothing ticked means "all documents" again.
    onChange(next.length === 0 || next.length === ready.length ? 'all' : next);
  };

  const label = isAll
    ? `All documents (${ready.length})`
    : selected.length === 1
      ? ready.find((d) => d.id === selected[0])?.name ?? '1 document'
      : `${selected.length} documents`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="Choose which documents the answer is searched in"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer select-none max-w-[220px] disabled:opacity-50"
      >
        <Layers className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents..."
                className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => {
                onChange('all');
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="flex-1 font-medium text-slate-800 dark:text-slate-200">
                All documents
              </span>
              {isAll && <Check className="h-3.5 w-3.5 text-emerald-500" />}
            </button>

            <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />

            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                {ready.length === 0 ? 'No ready documents yet.' : 'No document matches your search.'}
              </div>
            ) : (
              filtered.map((d) => {
                const checked = selected.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggle(d.id)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span
                      className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                        checked
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    {typeIcon(d.type)}
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-300" title={d.name}>
                      {d.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {d.chunkCount}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400">
            Tick one or more. Answers and citations come only from the chosen documents.
          </div>
        </div>
      )}
    </div>
  );
};
