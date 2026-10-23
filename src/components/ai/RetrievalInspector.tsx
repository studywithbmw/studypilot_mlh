import React, { useState } from 'react';
import { RetrievalInspectionItem } from '../../types';
import { Database, ArrowUpDown, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RetrievalInspectorProps {
  items?: RetrievalInspectionItem[];
}

export const RetrievalInspector: React.FC<RetrievalInspectorProps> = ({ items }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!items || items.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 overflow-hidden text-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Layers className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-medium text-[11px]">Retrieval Inspector (BM25 + Dense Vector + Cross-Encoder)</span>
        </div>
        <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">
          Fused & Reranked
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-200/60 dark:border-slate-800/60 p-3 space-y-2.5 bg-white/40 dark:bg-slate-950/20"
          >
            <div className="text-[11px] text-slate-500 flex items-center justify-between">
              <span>Candidate Chunks scored and fused via Reciprocal Rank Fusion (RRF):</span>
              <span className="font-mono text-[10px]">Top-K = {items.length}</span>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.docName} ({item.pageOrTime})
                    </span>
                    <div className="flex items-center gap-1 font-mono text-[10px]">
                      <span className="text-slate-400 line-through">Rank #{item.initialRank}</span>
                      <ArrowUpDown className="h-2.5 w-2.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        Final #{item.finalRank}
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-600 dark:text-slate-400 italic line-clamp-2">
                    "{item.snippet}"
                  </p>

                  <div className="pt-1 flex flex-wrap items-center gap-2 font-mono text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      BM25: {item.bm25Score.toFixed(2)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      Vector Cosine: {item.vectorScore.toFixed(2)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
                      Reranker: {(item.rerankerScore * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
