import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Copy,
  DoorOpen,
  Link2,
  Loader2,
  Lock,
  Sparkles,
  Unlock,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RoomChat } from '@/components/rooms/RoomChat';
import { RoomMembers } from '@/components/rooms/RoomMembers';
import { RoomSidePanel } from '@/components/rooms/RoomSidePanel';
import { RoomTimerCard } from '@/components/rooms/RoomTimerCard';
import { api } from '@/lib/api';
import { claimRoomCredit, roomErrorMessage, shareRoomUrl } from '@/lib/rooms';
import { useAuthStore } from '@/store/useAuthStore';
import { getLocalDateKey, useStudyTrackerStore } from '@/store/useStudyTrackerStore';
import { useRoomSocket, type RoomTimerEndPayload } from '@/hooks/useRoomSocket';
import type { Room, RoomMember, RoomMessage } from '@/types';

export const RoomPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code: param = '' } = useParams<{ code: string }>();
  const { user } = useAuthStore();
  const logStudySession = useStudyTrackerStore((state) => state.logStudySession);

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [openError, setOpenError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roomRef = useRef<Room | null>(null);
  roomRef.current = room;
  const currentUserId = user?.id ?? '';

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      setLoading(true);
      setOpenError(null);
      try {
        // A 6-character path is the share code; longer paths are room ids.
        const isCode = /^[A-Za-z0-9]{6}$/.test(param);
        const next = isCode ? await api.joinRoom(param) : await api.getRoom(param);
        if (cancelled) return;
        setRoom(next);
        setEnded(Boolean(next.endedAt));
      } catch (error) {
        if (!cancelled) setOpenError(roomErrorMessage(error, t('rooms.openFailed')));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void open();
    return () => {
      cancelled = true;
    };
  }, [param, t]);

  // Reconcile room credits on every snapshot: if a timer finished while this tab was
  // offline, its minutes still land in the dashboard's tracker exactly once.
  const recentCredits = room?.recentCredits;
  useEffect(() => {
    if (!room) return;
    for (const credit of recentCredits ?? []) {
      if (credit.minutes <= 0) continue;
      if (!claimRoomCredit(room.id, credit.startedAt)) continue;
      logStudySession(
        credit.minutes,
        `Study room: ${room.name}`,
        'deep_work',
        credit.label || 'Shared focus timer',
        getLocalDateKey(new Date(credit.startedAt)),
      );
    }
    // `recentCredits` only changes when the server reports new sessions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, recentCredits, logStudySession]);

  const refreshRoom = useCallback(async () => {
    const current = roomRef.current;
    if (!current) return;
    try {
      setRoom(await api.getRoom(current.id));
    } catch {
      // A refresh failure is not worth interrupting the session; the socket stays live.
    }
  }, []);

  const handleTimerEnd = useCallback(
    (payload: RoomTimerEndPayload) => {
      setRoom((previous) => (previous ? { ...previous, timer: null } : previous));
      const current = roomRef.current;
      const minutes = payload.credited[currentUserId] ?? 0;
      if (current && minutes > 0 && claimRoomCredit(current.id, payload.startedAt)) {
        logStudySession(
          minutes,
          `Study room: ${current.name}`,
          'deep_work',
          payload.label || 'Shared focus timer',
          getLocalDateKey(new Date(payload.startedAt)),
        );
      }
      if (minutes > 0) {
        toast.success(t('rooms.timerCredited', { n: minutes }));
      } else {
        toast.info(t('rooms.timerEnded'));
      }
      void refreshRoom();
    },
    [currentUserId, logStudySession, refreshRoom, t],
  );

  const onlineRef = useRef<Set<string> | null>(null);
  const handlePresence = useCallback(
    (members: RoomMember[], onlineCount: number) => {
      setRoom((previous) =>
        previous
          ? { ...previous, members, memberCount: members.length, onlineCount }
          : previous,
      );
      const online = new Set(members.filter((member) => member.online).map((member) => member.userId));
      const previousOnline = onlineRef.current;
      onlineRef.current = online;
      if (!previousOnline) return; // first presence is the baseline, not a join
      const names = new Map(members.map((member) => [member.userId, member.displayName]));
      for (const userId of online) {
        if (userId !== currentUserId && !previousOnline.has(userId)) {
          toast.info(t('rooms.memberJoinedToast', { name: names.get(userId) }));
        }
      }
      for (const userId of previousOnline) {
        if (userId !== currentUserId && !online.has(userId)) {
          toast.info(t('rooms.memberLeftToast', { name: names.get(userId) ?? t('rooms.member') }));
        }
      }
    },
    [currentUserId, t],
  );

  const handleChat = useCallback((message: RoomMessage) => {
    setRoom((previous) => {
      if (!previous) return previous;
      if (previous.messages.some((existing) => existing.id === message.id)) return previous;
      return { ...previous, messages: [...previous.messages, message].slice(-200) };
    });
  }, []);

  const { status, error: socketError, sendChat, startTimer, endTimer } = useRoomSocket(room?.id ?? null, {
    onSnapshot: (next) => {
      setRoom((previous) => ({
        ...next,
        messages: next.messages.length > 0 ? next.messages : (previous?.messages ?? []),
      }));
      setEnded(Boolean(next.endedAt));
    },
    onPresence: handlePresence,
    onChat: handleChat,
    onTimerStart: (timer) => {
      setRoom((previous) => (previous ? { ...previous, timer } : previous));
      toast.info(t('rooms.timerStartedToast', { n: Math.round(timer.durationS / 60) }));
    },
    onTimerEnd: handleTimerEnd,
    onRoom: (patch) => {
      setRoom((previous) => (previous ? { ...previous, isLocked: patch.isLocked } : previous));
      toast.info(patch.isLocked ? t('rooms.lockedToast') : t('rooms.unlockedToast'));
    },
    onClosed: () => {
      setEnded(true);
      toast.info(t('rooms.closedToast'));
    },
    onKicked: () => {
      toast.error(t('rooms.kickedToast'));
      navigate('/app/rooms');
    },
  });

  const copyText = async (text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(success);
    } catch {
      toast.error(t('rooms.copyFailed'));
    }
  };

  const share = async () => {
    if (!room) return;
    const url = shareRoomUrl(room.code);
    if (navigator.share) {
      try {
        await navigator.share({ title: room.name, url });
        return;
      } catch {
        return; // The user cancelled the share sheet.
      }
    }
    await copyText(url, t('rooms.linkCopied'));
  };

  const toggleLock = async () => {
    if (!room || busy) return;
    setBusy(true);
    try {
      setRoom(await api.setRoomLocked(room.id, !room.isLocked));
      toast.success(room.isLocked ? t('rooms.unlockedToast') : t('rooms.lockedToast'));
    } catch (error) {
      toast.error(roomErrorMessage(error, t('rooms.actionFailed')));
    } finally {
      setBusy(false);
    }
  };

  const kick = async (userId: string) => {
    if (!room) return;
    setKickingId(userId);
    try {
      setRoom(await api.kickRoomMember(room.id, userId));
      toast.success(t('rooms.kickedMember'));
    } catch (error) {
      toast.error(roomErrorMessage(error, t('rooms.actionFailed')));
    } finally {
      setKickingId(null);
    }
  };

  const endRoom = async () => {
    if (!room || busy) return;
    if (!window.confirm(t('rooms.endConfirm'))) return;
    setBusy(true);
    try {
      setRoom(await api.endRoom(room.id));
      setEnded(true);
      toast.success(t('rooms.endedToast'));
    } catch (error) {
      toast.error(roomErrorMessage(error, t('rooms.actionFailed')));
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = async () => {
    if (!room || busy) return;
    setBusy(true);
    try {
      setRoom(await api.seedRoomDemo(room.id));
      toast.success(t('rooms.demoFilled'));
    } catch (error) {
      toast.error(roomErrorMessage(error, t('rooms.actionFailed')));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('rooms.opening')}
      </div>
    );
  }

  if (openError || !room) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-6 text-center">
        <WifiOff className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t('rooms.openFailedTitle')}
        </h1>
        <p className="text-xs text-slate-500">{openError ?? t('rooms.openFailed')}</p>
        <Link to="/app/rooms">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            {t('rooms.backToRooms')}
          </Button>
        </Link>
      </div>
    );
  }

  const isClosed = ended || Boolean(room.endedAt);
  const reconnecting = status === 'reconnecting';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to="/app/rooms"
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-emerald-600"
            >
              <ArrowLeft className="h-3 w-3" />
              {t('rooms.backToRooms')}
            </Link>
            <h1 className="mt-1 truncate text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {room.name}
            </h1>
            <p className="text-[11px] text-slate-500">
              {t('rooms.hostedBy', { name: room.hostName })} ·{' '}
              {t('rooms.onlineCount', { n: room.onlineCount })}
              {room.isLocked && ` · ${t('rooms.locked')}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void copyText(room.code, t('rooms.codeCopied'))}
              className="rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs tracking-[0.3em] text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              title={t('rooms.copyCode')}
            >
              {room.code}
              <Copy className="ml-1 inline h-3 w-3" />
            </button>
            <Button variant="outline" size="icon-sm" onClick={share} title={t('rooms.share')}>
              <Link2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {room.isHost && !isClosed && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={toggleLock} disabled={busy}>
              {room.isLocked ? <Unlock className="mr-1 h-3.5 w-3.5" /> : <Lock className="mr-1 h-3.5 w-3.5" />}
              {room.isLocked ? t('rooms.unlock') : t('rooms.lock')}
            </Button>
            <Button variant="outline" size="sm" onClick={fillDemo} disabled={busy}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {t('rooms.demoFill')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={endRoom}
              disabled={busy}
              className="text-red-600 hover:bg-red-500/10 dark:text-red-400"
            >
              <DoorOpen className="mr-1 h-3.5 w-3.5" />
              {t('rooms.endRoom')}
            </Button>
          </div>
        )}
      </header>

      {reconnecting && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('rooms.reconnecting')}
        </div>
      )}

      {socketError && !reconnecting && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
          {socketError}
        </div>
      )}

      {isClosed && (
        <div className="rounded-lg border border-slate-300 bg-slate-100/70 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          {t('rooms.closedBanner')}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[260px_minmax(0,1fr)_280px]">
        <div className="order-2 space-y-4 lg:order-2 xl:order-1">
          <RoomMembers
            members={room.members}
            isHost={room.isHost}
            hostId={room.hostId}
            onKick={(userId) => void kick(userId)}
            kickingId={kickingId}
          />
          <RoomTimerCard
            timer={room.timer}
            isHost={room.isHost}
            recentCredits={room.recentCredits}
            onStart={(durationS, label) => {
              if (room.timer) return;
              startTimer(durationS, label);
            }}
            onEnd={endTimer}
            disabled={isClosed || reconnecting}
          />
        </div>

        <div className="order-1 h-[60vh] min-h-[22rem] lg:order-1 xl:order-2">
          <RoomChat
            messages={room.messages}
            currentUserId={currentUserId}
            onSend={sendChat}
            disabled={isClosed || reconnecting}
          />
        </div>

        <div className="order-3 lg:col-span-2 xl:col-span-1">
          <RoomSidePanel
            documents={room.documents}
            leaderboard={room.leaderboard}
            currentUserId={currentUserId}
          />
        </div>
      </div>
    </div>
  );
};
