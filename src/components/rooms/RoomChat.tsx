import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RoomMessage } from '@/types';

interface RoomChatProps {
  messages: RoomMessage[];
  currentUserId: string;
  onSend: (text: string) => void;
  disabled?: boolean;
}

const MAX_CHARS = 500;

function clock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export const RoomChat: React.FC<RoomChatProps> = ({ messages, currentUserId, onSend, disabled }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value.slice(0, MAX_CHARS));
    setText('');
  };

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm">
      <header className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t('rooms.chatTitle')}
        </h3>
      </header>

      <div className="flex-1 min-h-[16rem] overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && (
          <p className="py-10 text-center text-xs text-slate-400">{t('rooms.chatEmpty')}</p>
        )}
        {messages.map((message) => {
          const mine = message.userId === currentUserId && !message.isAi;
          return (
            <div key={message.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
              <div className="mb-0.5 flex items-center gap-1.5 px-1 text-[10px] text-slate-400">
                {message.isAi && <Bot className="h-3 w-3 text-emerald-500" />}
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  {message.displayName}
                </span>
                <span>{clock(message.createdAt)}</span>
              </div>
              <p
                className={cn(
                  'max-w-[92%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-xs leading-relaxed',
                  message.isAi
                    ? 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
                    : mine
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
                )}
              >
                {message.text}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800 p-2.5 space-y-1">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, MAX_CHARS))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={MAX_CHARS}
            disabled={disabled}
            placeholder={disabled ? t('rooms.chatClosed') : t('rooms.messagePlaceholder')}
            className="flex-1 resize-none rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
          />
          <Button size="icon" onClick={submit} disabled={disabled || !text.trim()} title={t('rooms.send')}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="px-1 text-right text-[10px] text-slate-400">
          {text.length}/{MAX_CHARS}
        </p>
      </div>
    </section>
  );
};
