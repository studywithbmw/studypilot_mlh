import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Copy,
  Loader2,
  LogIn,
  Plus,
  Sparkles,
  Users,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { USE_MOCK } from '@/lib/env';
import { roomErrorMessage } from '@/lib/rooms';
import type { RoomSummary } from '@/types';

export const RoomsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [maxMembers, setMaxMembers] = useState(8);
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [demoing, setDemoing] = useState(false);

  const loadRooms = useCallback(async () => {
    setLoadError(null);
    try {
      setRooms(await api.getRooms());
    } catch (error) {
      setLoadError(roomErrorMessage(error, t('rooms.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const createRoom = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const room = await api.createRoom(name.trim() || t('rooms.defaultName'), maxMembers);
      toast.success(t('rooms.createdToast', { name: room.name }));
      navigate(`/app/rooms/${room.id}`);
    } catch (error) {
      toast.error(roomErrorMessage(error, t('rooms.createFailed')));
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = async () => {
    const value = code.trim().toUpperCase();
    if (value.length !== 6) {
      toast.error(t('rooms.codeLength'));
      return;
    }
    setJoining(true);
    try {
      const room = await api.joinRoom(value);
      toast.success(t('rooms.joinedToast', { name: room.name }));
      navigate(`/app/rooms/${room.id}`);
    } catch (error) {
      toast.error(roomErrorMessage(error, t('rooms.joinFailed')));
    } finally {
      setJoining(false);
    }
  };

  const openDemo = async () => {
    if (demoing) return;
    setDemoing(true);
    try {
      const room = await api.createRoom(t('rooms.demoName'), 8);
      await api.seedRoomDemo(room.id);
      toast.success(t('rooms.demoReady'));
      navigate(`/app/rooms/${room.id}`);
    } catch (error) {
      toast.error(roomErrorMessage(error, t('rooms.createFailed')));
    } finally {
      setDemoing(false);
    }
  };

  const copyCode = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('rooms.codeCopied'));
    } catch {
      toast.error(t('rooms.copyFailed'));
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            <UsersRound className="h-6 w-6 text-emerald-500" />
            {t('rooms.title')}
          </h1>
          <p className="mt-1 max-w-xl text-xs text-slate-500">{t('rooms.subtitle')}</p>
        </div>
        <Button variant="subtle" size="sm" onClick={openDemo} disabled={demoing}>
          {demoing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          {t('rooms.demoRoom')}
        </Button>
      </div>

      {USE_MOCK && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          {t('rooms.mockHint')}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('rooms.createTitle')}
              </h2>
            </div>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('rooms.namePlaceholder')}
              maxLength={80}
            />
            <label className="flex items-center justify-between text-xs text-slate-500">
              <span>{t('rooms.maxMembers')}</span>
              <select
                value={maxMembers}
                onChange={(event) => setMaxMembers(Number(event.target.value))}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {[2, 4, 6, 8, 12, 20].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <Button className="w-full" size="sm" onClick={createRoom} disabled={creating}>
              {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
              {t('rooms.createRoom')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <LogIn className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t('rooms.joinTitle')}
              </h2>
            </div>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void joinRoom();
              }}
              placeholder={t('rooms.codePlaceholder')}
              className="text-center font-mono text-lg tracking-[0.4em]"
              maxLength={6}
              autoCapitalize="characters"
            />
            <p className="text-[11px] text-slate-400">{t('rooms.joinHint')}</p>
            <Button
              variant="outline"
              className="w-full"
              size="sm"
              onClick={joinRoom}
              disabled={joining || code.trim().length !== 6}
            >
              {joining ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <LogIn className="mr-1.5 h-3.5 w-3.5" />}
              {t('rooms.joinRoom')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t('rooms.yourRooms')}
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
          </div>
        ) : loadError ? (
          <div className="space-y-2 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-600 dark:text-red-400">
            <p>{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void loadRooms()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : rooms.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center dark:border-slate-700">
            <Users className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-xs text-slate-500">{t('rooms.noRooms')}</p>
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rooms.map((room) => (
              <li key={room.id}>
                <Card className="transition-colors hover:border-emerald-500/40">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/app/rooms/${room.id}`}
                        className="block truncate text-sm font-medium text-slate-900 hover:text-emerald-600 dark:text-slate-100 dark:hover:text-emerald-400"
                      >
                        {room.name}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {t('rooms.memberCount', { n: room.memberCount, max: room.maxMembers })} ·{' '}
                        {t('rooms.onlineCount', { n: room.onlineCount })}
                        {room.isLocked && ` · ${t('rooms.locked')}`}
                        {room.isHost && ` · ${t('rooms.host')}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyCode(room.code)}
                      className="rounded-md border border-slate-200 px-2 py-1 font-mono text-[11px] tracking-widest text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      title={t('rooms.copyCode')}
                    >
                      {room.code}
                      <Copy className="ml-1 inline h-3 w-3" />
                    </button>
                    <Link to={`/app/rooms/${room.id}`} className="shrink-0">
                      <Button variant="ghost" size="icon-sm" title={t('rooms.openRoom')}>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
