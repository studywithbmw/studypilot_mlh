import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Play,
  RotateCcw,
  Sparkles,
  Download,
  Clock,
  ArrowRight,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { api } from '@/lib/api';
import { FlashcardDeck, DocumentItem } from '@/types';
import { ApiError } from '@/lib/api/http';
import { FlipCard } from '@/components/study/FlipCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ExportDialog } from '@/components/share/ExportDialog';
import { ConfirmDeleteDialog } from '@/components/common/ConfirmDeleteDialog';
import { SM2Rating } from '@/lib/sm2';
import { toast } from 'sonner';

export const FlashcardsPage: React.FC = () => {
  const { activeWorkspaceId } = useWorkspaceStore();
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [deckToDelete, setDeckToDelete] = useState<FlashcardDeck | null>(null);
  const [activeDeck, setActiveDeck] = useState<FlashcardDeck | null>(null);
  const [mode, setMode] = useState<'grid' | 'review' | 'summary'>('grid');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);

  // Dialog states
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [addCardDialogOpen, setAddCardDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Form states
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [genTopic, setGenTopic] = useState('');
  const [genDocId, setGenDocId] = useState('');
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const fail = (e: unknown, fallback: string) => toast.error(e instanceof ApiError ? e.message : fallback);

  useEffect(() => {
    loadDecks();
    api
      .getDocuments(activeWorkspaceId)
      .then((list) => setDocs(list.filter((d) => d.status === 'ready')))
      .catch(() => setDocs([]));
  }, [activeWorkspaceId]);

  async function loadDecks() {
    try {
      const list = await api.getDecks(activeWorkspaceId);
      setDecks(list);
      setActiveDeck((cur) => (cur ? list.find((d) => d.id === cur.id) ?? list[0] ?? null : list[0] ?? null));
    } catch (e) {
      fail(e, 'Could not load your flashcards.');
    }
  }

  // Review only the cards that are due (SM-2 schedules the rest for later).
  const handleStartReview = (deck: FlashcardDeck) => {
    const now = new Date().toISOString();
    const due = deck.cards.filter((c) => c.dueDate <= now);
    if (due.length === 0) {
      toast.info('Nothing is due in this deck right now. Come back later or add more cards.');
      return;
    }
    setActiveDeck({ ...deck, cards: due });
    setCurrentCardIndex(0);
    setReviewedCount(0);
    setMode('review');
  };

  const handleRate = async (rating: SM2Rating) => {
    if (!activeDeck) return;
    const currentCard = activeDeck.cards[currentCardIndex];
    try {
      await api.rateFlashcard(activeDeck.id, currentCard.id, rating);
    } catch (e) {
      fail(e, 'Could not save your rating.');
      return;
    }
    setReviewedCount((c) => c + 1);
    if (currentCardIndex + 1 < activeDeck.cards.length) {
      setCurrentCardIndex((i) => i + 1);
    } else {
      setMode('summary');
      await loadDecks();
    }
  };

  const handleGenerateCards = async () => {
    setIsGenerating(true);
    try {
      const newDeck = await api.generateDeckFromDocument(genDocId, genTopic.trim(), activeWorkspaceId);
      setDecks([newDeck, ...decks]);
      setActiveDeck(newDeck);
      setGenTopic('');
      setGenerateDialogOpen(false);
      toast.success(`Created "${newDeck.title}" with ${newDeck.cardCount} cards.`);
    } catch (e) {
      fail(e, 'Could not generate flashcards. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddCustomCard = async () => {
    if (!activeDeck || !newFront.trim() || !newBack.trim()) return;
    try {
      const updated = await api.addFlashcard(activeDeck.id, newFront.trim(), newBack.trim());
      setDecks((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setActiveDeck(updated);
      setNewFront('');
      setNewBack('');
      setAddCardDialogOpen(false);
      toast.success('Flashcard added to deck');
    } catch (e) {
      fail(e, 'Could not add the card.');
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            SM-2 Spaced Repetition Decks
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            SuperMemo SM-2 algorithm calculates exact review intervals based on difficulty feedback
          </p>
        </div>

        <div className="flex items-center gap-2">
          {mode !== 'grid' && (
            <Button variant="outline" size="sm" onClick={() => setMode('grid')} className="text-xs">
              Decks Grid
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportDialogOpen(true)}
            disabled={!activeDeck}
            className="text-xs flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export (Anki/PDF)</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setGenerateDialogOpen(true)}
            className="text-xs flex items-center gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Generate Cards with AI</span>
          </Button>
        </div>
      </div>

      {/* VIEW: REVIEW MODE */}
      {mode === 'review' && activeDeck && (
        <div className="space-y-6">
          <div className="flex items-center justify-between max-w-xl mx-auto px-1 text-xs">
            <span className="font-semibold text-slate-900 dark:text-slate-100">{activeDeck.title}</span>
            <span className="text-slate-400 font-mono">
              Shortcuts: [Space] flip, [1-4] grade
            </span>
          </div>

          <FlipCard
            card={activeDeck.cards[currentCardIndex]}
            currentIndex={currentCardIndex}
            totalCards={activeDeck.cards.length}
            onRate={handleRate}
          />
        </div>
      )}

      {/* VIEW: SESSION SUMMARY */}
      {mode === 'summary' && activeDeck && (
        <div className="max-w-md mx-auto text-center p-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 mx-auto flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Review Session Complete!
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            You reviewed <span className="font-bold text-emerald-500">{reviewedCount}</span> cards in {activeDeck.title}. All intervals and ease factors updated according to the SM-2 algorithm.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setMode('grid')}>
              Back to Decks
            </Button>
            <Button size="sm" onClick={() => handleStartReview(activeDeck)}>
              Review Again
            </Button>
          </div>
        </div>
      )}

      {/* VIEW: DECKS GRID */}
      {mode === 'grid' && decks.length === 0 && (
        <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
          No flashcard decks yet. Press <b>Generate Cards with AI</b> to build one from your documents, or finish a quiz and
          turn your mistakes into cards.
        </div>
      )}
      {mode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between hover:border-emerald-500/40 transition-all shadow-xs space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                    <Layers className="h-5 w-5" />
                  </div>
                  {deck.dueCount > 0 ? (
                    <span className="font-mono text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                      {deck.dueCount} DUE TODAY
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      COMPLETED
                    </span>
                  )}
                </div>

                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  {deck.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {deck.description}
                </p>

                <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-slate-400">
                  <span>{deck.cardCount} total cards</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <Button
                  size="sm"
                  onClick={() => handleStartReview(deck)}
                  className="text-xs h-8 flex items-center gap-1.5"
                >
                  <Play className="h-3 w-3" />
                  <span>Start Review</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveDeck(deck);
                    setAddCardDialogOpen(true);
                  }}
                  className="text-xs h-8"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  <span>Add Card</span>
                </Button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Delete deck"
                  aria-label={`Delete deck ${deck.title}`}
                  onClick={() => setDeckToDelete(deck)}
                  className="text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDeleteDialog
        open={deckToDelete !== null}
        onOpenChange={(o) => !o && setDeckToDelete(null)}
        itemName={deckToDelete?.title ?? ''}
        description={`This deck and its ${deckToDelete?.cardCount ?? 0} cards will be deleted, including your review progress.`}
        onConfirm={async () => {
          if (!deckToDelete) return;
          try {
            await api.deleteDeck(deckToDelete.id);
            setDecks((prev) => prev.filter((d) => d.id !== deckToDelete.id));
            toast.success('Deck deleted.');
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : 'Could not delete the deck.');
            throw e;
          }
        }}
      />

      {/* AI Generate Cards Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Flashcards from Topic or Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 text-xs">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                Source document
              </label>
              <select
                value={genDocId}
                onChange={(e) => setGenDocId(e.target.value)}
                className="w-full h-9 px-3 mb-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs outline-none"
              >
                <option value="">All documents in this workspace</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                Focus topic (optional)
              </label>
              <Input
                placeholder="e.g. Strict 2PL"
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                className="text-xs"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Cards are written from your own documents and scheduled with spaced repetition (SM-2).
            </p>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="ghost" size="sm" onClick={() => setGenerateDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={isGenerating || docs.length === 0} onClick={handleGenerateCards}>
              {isGenerating ? 'Writing cards…' : docs.length === 0 ? 'Upload a document first' : 'Generate Cards'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Card Dialog */}
      <Dialog open={addCardDialogOpen} onOpenChange={setAddCardDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Flashcard to {activeDeck?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2 text-xs">
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                Front (Question / Prompt)
              </label>
              <Textarea
                placeholder="What is Belady's Anomaly?"
                value={newFront}
                onChange={(e) => setNewFront(e.target.value)}
                className="text-xs min-h-[60px]"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                Back (Answer & Explanation)
              </label>
              <Textarea
                placeholder="A phenomenon where increasing page frames leads to more page faults in FIFO."
                value={newBack}
                onChange={(e) => setNewBack(e.target.value)}
                className="text-xs min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="ghost" size="sm" onClick={() => setAddCardDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!newFront.trim() || !newBack.trim()} onClick={handleAddCustomCard}>
              Add Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      {activeDeck && (
        <ExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          title={activeDeck.title}
          content={activeDeck.cards.map((c) => `Q: ${c.front}\nA: ${c.back}`).join('\n\n')}
          flashcards={activeDeck.cards.map((c) => ({
            front: c.front,
            back: c.back,
          }))}
        />
      )}
    </div>
  );
};