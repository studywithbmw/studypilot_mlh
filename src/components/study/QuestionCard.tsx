import React, { useState, useEffect } from 'react';
import { QuizQuestion } from '../../types';
import { CheckCircle2, XCircle, Flag, ArrowRight, CornerDownLeft, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { CitationChip } from '../ai/CitationChip';

interface QuestionCardProps {
  question: QuizQuestion;
  onAnswer: (answer: string | number) => void;
  onNext: () => void;
  currentIndex: number;
  totalQuestions: number;
  isFlagged: boolean;
  onToggleFlag: () => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  onAnswer,
  onNext,
  currentIndex,
  totalQuestions,
  isFlagged,
  onToggleFlag,
}) => {
  const [selectedAnswer, setSelectedAnswer] = useState<string | number | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Keyboard shortcuts (1-4 for options, Enter for submit/next)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Enter' && !isSubmitted && textAnswer.trim()) {
          handleSubmit(textAnswer.trim());
        }
        return;
      }

      if (!isSubmitted) {
        if (question.options) {
          const num = parseInt(e.key, 10);
          if (num >= 1 && num <= question.options.length) {
            handleSelect(num - 1);
          }
        }
      } else {
        if (e.key === 'Enter') {
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitted, selectedAnswer, textAnswer, question]);

  // Reset local state on new question
  useEffect(() => {
    setSelectedAnswer(null);
    setTextAnswer('');
    setIsSubmitted(false);
  }, [question.id]);

  const handleSelect = (idx: number) => {
    if (isSubmitted) return;
    setSelectedAnswer(idx);
    setIsSubmitted(true);
    onAnswer(idx);
  };

  const handleSubmit = (ans: string | number) => {
    if (isSubmitted) return;
    setSelectedAnswer(ans);
    setIsSubmitted(true);
    onAnswer(ans);
  };

  const handleNext = () => {
    onNext();
  };

  const isCorrect =
    isSubmitted &&
    selectedAnswer !== null &&
    String(selectedAnswer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();

  return (
    <div className="w-full max-w-2xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-lg space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
            Question {currentIndex + 1} / {totalQuestions}
          </span>
          <span className="text-xs text-slate-400">· {question.topic}</span>
        </div>

        <button
          type="button"
          onClick={onToggleFlag}
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
            isFlagged
              ? 'bg-amber-500/15 text-amber-500 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Flag question for later review"
        >
          <Flag className="h-3.5 w-3.5" />
          <span>{isFlagged ? 'Flagged' : 'Flag'}</span>
        </button>
      </div>

      {/* Question Prompt */}
      <div className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug">
        {question.prompt}
      </div>

      {/* Options / Answer Input */}
      {question.options && question.options.length > 0 ? (
        <div className="space-y-2.5">
          {question.options.map((option, idx) => {
            const isChosen = selectedAnswer === idx;
            const isCorrectOption = Number(question.correctAnswer) === idx;

            let optionStyle = 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200';

            if (isSubmitted) {
              if (isCorrectOption) {
                optionStyle = 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-semibold';
              } else if (isChosen && !isCorrectOption) {
                optionStyle = 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-300';
              } else {
                optionStyle = 'opacity-50 border-slate-200 dark:border-slate-800 text-slate-400';
              }
            }

            return (
              <button
                key={idx}
                type="button"
                disabled={isSubmitted}
                onClick={() => handleSelect(idx)}
                className={`w-full p-3.5 rounded-xl border flex items-center justify-between text-left text-xs sm:text-sm transition-all cursor-pointer ${optionStyle}`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-500 shrink-0">
                    {idx + 1}
                  </span>
                  <span>{option}</span>
                </div>
                {isSubmitted && isCorrectOption && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                {isSubmitted && isChosen && !isCorrectOption && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      ) : (
        /* Short Answer Input */
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Type your concise technical answer (e.g. TLB)..."
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              disabled={isSubmitted}
              className="text-sm"
              autoFocus
            />
            <Button
              disabled={!textAnswer.trim() || isSubmitted}
              onClick={() => handleSubmit(textAnswer.trim())}
              size="default"
            >
              Submit
            </Button>
          </div>
        </div>
      )}

      {/* Instant Explanation Breakdown on Submission */}
      {isSubmitted && (
        <div
          className={`p-4 rounded-xl border space-y-2 animate-in fade-in-50 duration-300 ${
            isCorrect
              ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-950 dark:text-emerald-100'
              : 'bg-red-500/5 border-red-500/30 text-red-950 dark:text-red-100'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold text-xs">
            {isCorrect ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">Correct! Excellent recall.</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-red-600 dark:text-red-400">Incorrect. Review concept below:</span>
              </>
            )}
          </div>

          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {question.explanation}
          </p>

          {question.citation && (
            <div className="pt-2 flex items-center gap-2 border-t border-slate-200/50 dark:border-slate-800/50 text-[11px]">
              <span className="text-slate-400">Source passage proof:</span>
              <CitationChip citation={question.citation} index={1} />
            </div>
          )}
        </div>
      )}

      {/* Footer & Next action */}
      <div className="flex items-center justify-between pt-2">
        <span className="text-[11px] text-slate-400 font-mono">
          {isSubmitted ? 'Press [Enter] for next' : 'Press [1-4] to answer'}
        </span>

        {isSubmitted && (
          <Button onClick={handleNext} className="flex items-center gap-1.5 text-xs">
            <span>{currentIndex + 1 < totalQuestions ? 'Next Question' : 'View Results'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};
