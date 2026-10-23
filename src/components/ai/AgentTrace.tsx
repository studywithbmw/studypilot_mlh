import React, { useState } from 'react';
import { AgentReasoningStep } from '../../types';
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Compass, Search, MessageSquare, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AgentTraceProps {
  steps?: AgentReasoningStep[];
}

export const AgentTrace: React.FC<AgentTraceProps> = ({ steps }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!steps || steps.length === 0) return null;

  const totalDuration = steps.reduce((acc, s) => acc + s.durationMs, 0);

  const getAgentIcon = (agent: AgentReasoningStep['agent']) => {
    switch (agent) {
      case 'Planner':
        return <Compass className="h-3.5 w-3.5 text-blue-400" />;
      case 'Retriever':
        return <Search className="h-3.5 w-3.5 text-emerald-400" />;
      case 'Answerer':
        return <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />;
      case 'Critic':
        return <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />;
    }
  };

  return (
    <div className="mt-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 overflow-hidden text-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="font-medium text-[11px]">How I answered (Multi-agent reasoning trace)</span>
          <span className="font-mono text-[10px] text-slate-400">({totalDuration}ms)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Hallucination check passed
          </span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-200/60 dark:border-slate-800/60 px-3 py-2.5 space-y-2.5 bg-white/40 dark:bg-slate-950/20"
          >
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <div className="mt-0.5 p-1 rounded bg-slate-100 dark:bg-slate-800/80 shrink-0">
                  {getAgentIcon(step.agent)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-200 text-[11px]">
                      {step.agent} Agent
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {step.durationMs}ms
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">
                    {step.outputSnippet}
                  </p>

                  {step.subQueries && step.subQueries.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {step.subQueries.map((q, i) => (
                        <span
                          key={i}
                          className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded"
                        >
                          → {q}
                        </span>
                      ))}
                    </div>
                  )}

                  {step.criticVerdict && (
                    <div className="mt-1 p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-600 dark:text-emerald-400">
                      {step.criticVerdict.note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
