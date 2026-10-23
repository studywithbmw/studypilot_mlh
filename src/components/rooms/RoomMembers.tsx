import React from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, UserMinus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoomMember } from '@/types';

interface RoomMembersProps {
  members: RoomMember[];
  isHost: boolean;
  hostId: string;
  onKick: (userId: string) => void;
  kickingId: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return (parts.map((p) => p[0]).join('') || '?').toUpperCase();
}

export const RoomMembers: React.FC<RoomMembersProps> = ({
  members,
  isHost,
  hostId,
  onKick,
  kickingId,
}) => {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <Users className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t('rooms.members')}
        </h3>
        <span className="ml-auto text-xs text-slate-500">{members.length}</span>
      </header>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800/70 max-h-72 overflow-y-auto">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center gap-2.5 px-4 py-2.5">
            <span className="relative shrink-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                {initials(member.displayName)}
              </span>
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900',
                  member.online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
                )}
                title={member.online ? t('rooms.online') : t('rooms.offline')}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                {member.displayName}
              </p>
              <p className="text-[10px] text-slate-500">
                {member.userId === hostId ? t('rooms.host') : t('rooms.member')}
                {!member.online && ` · ${t('rooms.offline')}`}
              </p>
            </div>
            {member.userId === hostId && (
              <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label={t('rooms.host')} />
            )}
            {isHost && member.userId !== hostId && (
              <button
                type="button"
                onClick={() => onKick(member.userId)}
                disabled={kickingId === member.userId}
                className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-500/10 disabled:opacity-50 cursor-pointer"
                title={t('rooms.kick')}
              >
                <UserMinus className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
