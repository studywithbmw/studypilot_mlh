import React, { useRef, useState } from 'react';
import { Sparkles, ArrowRight, CornerDownLeft, RefreshCw, X, AlertTriangle, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

export interface MorphOrbProps {
  /**
   * Submit the question. `onToken` (when provided) receives streamed deltas so
   * the answer can render progressively. Reject to show the error state.
   */
  onSubmit?: (text: string, onToken?: (token: string) => void) => Promise<string> | string;
  minThinkMs?: number;
  speed?: number;
  placeholder?: string;
  className?: string;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException ? err.name === 'AbortError' : false;
}

export default function MorphOrb({
  onSubmit,
  minThinkMs = 1200,
  placeholder = 'Ask anything for a rapid answer (e.g. What is ACID?)...',
  className,
}: MorphOrbProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'idle' | 'thinking' | 'answered'>('idle');
  const [answer, setAnswer] = useState('');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || status === 'thinking') return;

    setStatus('thinking');
    setError(null);
    setPartial('');
    const controller = new AbortController();
    abortRef.current = controller;
    const startTime = Date.now();

    try {
      let result = '';
      if (onSubmit) {
        result = await onSubmit(query, (token) => {
          result += token;
          setPartial(result);
        });
      } else {
        result = `Direct Answer: "${query}" is a foundational concept. It ensures partition tolerance, state replication, and reliable recovery in distributed environments.`;
      }

      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, minThinkMs - elapsed);
      setTimeout(() => {
        setAnswer(result);
        setPartial('');
        setStatus('answered');
      }, remainingTime);
    } catch (err) {
      abortRef.current = null;
      setPartial('');
      if (isAbort(err)) {
        // Deliberate stop: back to the input, no error shown.
        setStatus('idle');
        return;
      }
      setError(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.');
      setStatus('idle');
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPartial('');
    setStatus('idle');
  };

  const handleReset = () => {
    setStatus('idle');
    setAnswer('');
    setQuery('');
    setError(null);
    setPartial('');
  };

  const isStreaming = status === 'thinking' && partial.length > 0;

  return (
    <div className={cn('mo-stage w-full min-h-[500px] flex flex-col items-center justify-center p-6 text-center select-none relative', className)}>
      {/* Background ambient mesh */}
      <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.15)_0%,transparent_60%)]" />

      {/* Morphing Thinking Orb */}
      <div className="mo-orb-wrapper my-8 relative flex items-center justify-center">
        <div className="mo-orb-glow" />
        <div
          className={cn(
            'mo-orb transition-all duration-700',
            status === 'thinking' && 'scale-115 filter blur-[1px] brightness-125',
            status === 'answered' && 'scale-90 opacity-70'
          )}
        />
        <div className="mo-orb-core" />
        {status === 'thinking' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute z-10 text-[10px] tracking-widest font-mono text-emerald-200 uppercase bg-slate-950/70 px-2 py-0.5 rounded-full border border-emerald-500/30"
          >
            {isStreaming ? 'Streaming' : 'Synthesizing'}
          </motion.div>
        )}
      </div>

      {/* Input / Response Box */}
      <div className="w-full max-w-lg z-10">
        <AnimatePresence mode="wait">
          {status === 'answered' ? (
            <motion.div
              key="answer-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 shadow-2xl text-left relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-500">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Quick Synthesis</span>
                </div>
                <button
                  onClick={handleReset}
                  className="text-slate-400 hover:text-slate-200 p-1 rounded-md hover:bg-slate-800/50 cursor-pointer"
                  title="Ask another question"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="py-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {answer}
              </div>

              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>For cited passage proofs, use Chat & RAG</span>
                <button
                  onClick={handleReset}
                  className="text-emerald-500 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  Ask another
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          ) : isStreaming ? (
            <motion.div
              key="streaming-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white dark:bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 shadow-2xl text-left relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-500">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                  <span>Answering…</span>
                </div>
                <button
                  onClick={handleStop}
                  className="text-[11px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                  title="Stop generating"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  Stop
                </button>
              </div>

              <div className="py-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {partial}
                <span className="inline-block w-[2px] h-3 ml-0.5 align-middle bg-emerald-500 animate-pulse" />
              </div>
            </motion.div>
          ) : (
            <motion.form
              key="input-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onSubmit={handleSubmit}
              className="relative flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-2 transition-all focus-within:border-emerald-500/80 focus-within:ring-2 focus-within:ring-emerald-500/20"
            >
              <Sparkles className="h-4 w-4 ml-3 text-emerald-500 shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={status === 'thinking'}
                placeholder={status === 'thinking' ? 'Reasoning through your notes...' : placeholder}
                className="w-full bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
              />
              <button
                type="submit"
                disabled={!query.trim() || status === 'thinking'}
                className="h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium flex items-center gap-1 transition-all shrink-0 cursor-pointer"
              >
                {status === 'thinking' ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <span>Ask</span>
                    <CornerDownLeft className="h-3 w-3" />
                  </>
                )}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Error / quota state */}
        {error && status !== 'answered' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-left"
            role="alert"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-[11px] text-rose-600 dark:text-rose-400 leading-relaxed">
              {error}
            </div>
            <button
              onClick={() => setError(null)}
              className="text-rose-500 hover:text-rose-400 cursor-pointer"
              title="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )}

        {/* Suggested Quick Questions */}
        {status === 'idle' && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            {['Explain photosynthesis simply', 'Difference between mitosis and meiosis', 'How do I solve quadratic equations?'].map((sample) => (
              <button
                key={sample}
                onClick={() => {
                  setQuery(sample);
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors border border-slate-200/50 dark:border-slate-800 cursor-pointer"
              >
                {sample}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
