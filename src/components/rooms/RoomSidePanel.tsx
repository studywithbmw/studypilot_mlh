import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Medal, Sparkles, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoomDocument, RoomLeaderboardEntry } from '@/types';

type Tab = 'docs' | 'quiz' | 'leaderboard';

interface RoomSidePanelProps {
  documents: RoomDocument[];
  leaderboard: RoomLeaderboardEntry[];
  currentUserId: string;
}

export const RoomSidePanel: React.FC<RoomSidePanelProps> = ({
  documents,
  leaderboard,
  currentUserId,
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('docs');

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: 'docs', label: t('rooms.docs'), icon: FileText },
    { id: 'quiz', label: t('rooms.quiz'), icon: Sparkles },
    { id: 'leaderboard', label: t('rooms.leaderboard'), icon: Trophy },
  ];

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm">
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-[11px] font-medium transition-colors cursor-pointer',
              tab === id
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="p-3">
        {tab === 'docs' && (
          <div className="space-y-2">
            {documents.length === 0 ? (
              <div className="space-y-1 py-6 text-center">
                <FileText className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-500">{t('rooms.noDocs')}</p>
                <p className="text-[10px] text-slate-400">{t('rooms.docsPhaseTwo')}</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {documents.map((doc) => (
                  <li
                    key={doc.docId}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{doc.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'quiz' && (
          <div className="space-y-2 py-6 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-emerald-500" />
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
              {t('rooms.quizBattle')}
            </p>
            <p className="text-[10px] text-slate-400">{t('rooms.quizPhaseTwo')}</p>
          </div>
        )}

        {tab === 'leaderboard' && (
          <div className="space-y-1">
            {leaderboard.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-400">{t('rooms.noMinutes')}</p>
            )}
            {leaderboard.map((entry, index) => (
              <div
                key={entry.userId}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5',
                  entry.userId === currentUserId && 'bg-emerald-500/10',
                )}
              >
                <span className="w-5 shrink-0 text-center">
                  {index < 3 ? (
                    <Medal
                      className={cn(
                        'mx-auto h-3.5 w-3.5',
                        index === 0
                          ? 'text-amber-500'
                          : index === 1
                            ? 'text-slate-400'
                            : 'text-amber-700',
                      )}
                    />
                  ) : (
                    <span className="text-[10px] text-slate-400">{index + 1}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-800 dark:text-slate-100">
                  {entry.displayName}
                </span>
                <span className="shrink-0 text-[11px] font-medium text-slate-500">
                  {t('rooms.minutesShort', { n: entry.minutes })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
