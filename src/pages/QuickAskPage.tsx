import React from 'react';
import MorphOrb from '../components/ui/ai-thinking-orb-and-input';
import { api } from '../lib/api';
import { useSettingsStore } from '@/store/useSettingsStore';

export const QuickAskPage: React.FC = () => {
  const explanationLevel = useSettingsStore((s) => s.explanationLevel);
  const answerLanguage = useSettingsStore((s) => s.answerLanguage);

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] relative overflow-hidden bg-background flex flex-col justify-center items-center">
      <MorphOrb
        onSubmit={async (text, onToken) => {
          // Real mode streams SSE tokens via onToken; demo mode simulates them.
          return await api.quickAsk(text, {
            level: explanationLevel,
            language: answerLanguage,
            onToken,
          });
        }}
        placeholder="Ask anything for an instant synthesized answer (e.g. What is Two-Phase Locking?)..."
      />
    </div>
  );
};
