/**
 * Study Rooms WebSocket client.
 *
 * The browser cannot attach an Authorization header to a WebSocket, so the
 * first frame is `{type:"auth", token}`. The server verifies it with the same
 * Supabase JWT logic as the REST API. Reconnects use exponential backoff and
 * always fetch a fresh token; kicked/closed rooms stop retrying.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthToken } from '@/lib/api/http';
import { roomSocketUrl } from '@/lib/rooms';
import type { Room, RoomMember, RoomMessage, RoomTimer } from '@/types';

export type RoomSocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface RoomTimerEndPayload {
  startedAt: string;
  durationS: number;
  label: string;
  credited: Record<string, number>;
}

export interface RoomSocketHandlers {
  onSnapshot: (room: Room) => void;
  onPresence: (members: RoomMember[], onlineCount: number) => void;
  onChat: (message: RoomMessage) => void;
  onTimerStart: (timer: RoomTimer) => void;
  onTimerEnd: (payload: RoomTimerEndPayload) => void;
  onRoom: (patch: { isLocked: boolean }) => void;
  onClosed: () => void;
  onKicked: () => void;
}

const CLOSE_AUTH = 4401;
const CLOSE_FORBIDDEN = 4403;
const CLOSE_NOT_FOUND = 4404;

interface EventPayload {
  type?: string;
  room?: Room;
  members?: RoomMember[];
  onlineCount?: number;
  /** A chat message, or a human-readable string on `{type:"error"}` frames. */
  message?: RoomMessage | string;
  timer?: RoomTimer;
  credited?: Record<string, number>;
  isLocked?: boolean;
  startTimestamp?: string;
  durationS?: number;
  label?: string;
  code?: string;
  messageText?: string;
}

export function useRoomSocket(roomId: string | null, handlers: RoomSocketHandlers) {
  const [status, setStatus] = useState<RoomSocketStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let disposed = false;
    let stopped = false;

    const retry = () => {
      if (disposed || stopped) return;
      const delay = Math.min(1000 * 2 ** retryRef.current, 10_000);
      retryRef.current += 1;
      setStatus('reconnecting');
      timerRef.current = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (disposed || stopped) return;
      setStatus((previous) => (previous === 'open' ? 'reconnecting' : previous));
      const token = await getAuthToken();
      if (disposed || stopped) return;
      if (!token) {
        setStatus('closed');
        setError('Your session has expired. Please sign in again.');
        return;
      }

      const socket = new WebSocket(roomSocketUrl(roomId));
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', token }));
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        let payload: EventPayload;
        try {
          payload = JSON.parse(event.data) as EventPayload;
        } catch {
          return;
        }
        const current = handlersRef.current;
        switch (payload.type) {
          case 'snapshot':
            if (payload.room) {
              retryRef.current = 0;
              setStatus('open');
              setError(null);
              current.onSnapshot(payload.room);
            }
            break;
          case 'presence':
            current.onPresence(payload.members ?? [], payload.onlineCount ?? 0);
            break;
          case 'chat':
            if (payload.message && typeof payload.message === 'object') {
              setError(null);
              current.onChat(payload.message);
            }
            break;
          case 'timer:start':
            if (payload.timer) current.onTimerStart(payload.timer);
            break;
          case 'timer:end':
            if (payload.timer) {
              current.onTimerEnd({
                startedAt: payload.timer.startedAt,
                durationS: payload.timer.durationS,
                label: payload.timer.label,
                credited: payload.credited ?? {},
              });
            }
            break;
          case 'room':
            if (typeof payload.isLocked === 'boolean') {
              current.onRoom({ isLocked: payload.isLocked });
            }
            break;
          case 'kicked':
            stopped = true;
            setStatus('closed');
            current.onKicked();
            break;
          case 'closed':
            stopped = true;
            setStatus('closed');
            current.onClosed();
            break;
          case 'error':
            setError(
              typeof payload.message === 'string' && payload.message
                ? payload.message
                : 'Something went wrong in this room.',
            );
            break;
          default:
            break;
        }
      };

      socket.onclose = (event: CloseEvent) => {
        socketRef.current = null;
        if (disposed || stopped) return;
        if (event.code === CLOSE_FORBIDDEN) {
          stopped = true;
          setStatus('closed');
          handlersRef.current.onKicked();
          return;
        }
        if (event.code === CLOSE_NOT_FOUND) {
          stopped = true;
          setStatus('closed');
          handlersRef.current.onClosed();
          return;
        }
        if (event.code === CLOSE_AUTH) {
          setError('Your session expired while connecting. Retrying…');
        }
        retry();
      };
    };

    setStatus('connecting');
    setError(null);
    void connect();

    return () => {
      disposed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [roomId]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  return {
    status,
    error,
    clearError: () => setError(null),
    sendChat: (text: string) => send({ type: 'chat', text }),
    startTimer: (durationS: number, label: string) => send({ type: 'timer:start', durationS, label }),
    endTimer: () => send({ type: 'timer:end' }),
  };
}
