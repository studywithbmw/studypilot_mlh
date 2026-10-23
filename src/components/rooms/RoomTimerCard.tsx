import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Play, Square, TimerReset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatClock, remainingSeconds } from '@/lib/rooms';
import type { RoomCredit, RoomTimer } from '@/types';

interface RoomTimerCardProps {
  timer: RoomTimer | null;
  isHost: boolean;
  recentCredits: RoomCredit[];
  onStart: (durationS: number, label: string) => void;
  onEnd: () => void;
  disabled?: boolean;
}

const PRESETS = [5, 15, 25, 50];

export const RoomTimerCard: React.FC<RoomTimerCardProps> = ({
  timer,
  isHost,
  recentCredits,
  onStart,
  onEnd,
  disabled,
}) => {
  const { t } = useTranslation();
  const [minutes, setMinutes] = useState(25);
  const [label, setLabel] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timer) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timer?.startedAt, timer?.durationS]);

  const left = timer ? remainingSeconds(timer.startedAt, timer.durationS, now) : 0;
  const progress = timer && timer.durationS > 0 ? 1 - left / timer.durationS : 0;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TimerReset className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t('rooms.focusTimer')}
        </h3>
      </div>

      {timer ? (
        <div className="space-y-3">
          <div className="text-center">
            <p className="font-mono text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {formatClock(left)}
            </p>
            <p className="mt-1 text-xs text-slate-500 truncate">
              {timer.label || t('rooms.focusSession')}
            </p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
          {isHost ? (
            <Button variant="outline" size="sm" className="w-full" onClick={onEnd} disabled={disabled}>
              <Square className="mr-1.5 h-3.5 w-3.5" />
              {t('rooms.endTimer')}
            </Button>
          ) : (
            <p className="text-center text-[11px] text-slate-500">{t('rooms.timerHostOnly')}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            {t('rooms.noTimer')}
          </p>
          {isHost ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMinutes(preset)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      minutes === preset
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t('rooms.minutesShort', { n: preset })}
                  </button>
                ))}
              </div>
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t('rooms.timerLabelPlaceholder')}
                maxLength={80}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  onStart(Math.max(1, Math.min(4 * 60, minutes)) * 60, label.trim());
                  setLabel('');
                }}
                disabled={disabled}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {t('rooms.startTimer')}
              </Button>
            </>
          ) : (
            <p className="text-[11px] text-slate-500">{t('rooms.waitingForHost')}</p>
          )}
        </div>
      )}

      {recentCredits.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">
            {t('rooms.yourRoomMinutes')}
          </p>
          {recentCredits.slice(0, 3).map((credit) => (
            <p key={`${credit.startedAt}-${credit.minutes}`} className="text-[11px] text-slate-500">
              {t('rooms.creditedLine', { n: credit.minutes })}
            </p>
          ))}
        </div>
      )}
    </section>
  );
};
