import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Square,
  Sparkles,
  Plus,
  Search,
  Pin,
  Trash2,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RotateCw,
  FileText,
  SlidersHorizontal,
  ChevronRight,
  Brain,
  Download,
  Filter,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api/http';
import { applyStreamEvent, findCitationDocument } from '@/lib/api/chat';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Conversation,
  ChatMessage,
  Citation,
  DocumentItem,
  MemoryFact,
} from '@/types';
import { CitationChip } from '@/components/ai/CitationChip';
import { DocumentViewer } from '@/components/ai/DocumentViewer';
import { AgentTrace } from '@/components/ai/AgentTrace';
import { RetrievalInspector } from '@/components/ai/RetrievalInspector';
import { ConfidenceBadge } from '@/components/ai/ConfidenceBadge';
import { NotFoundState } from '@/components/ai/NotFoundState';
import { MemoryPanel } from '@/components/ai/MemoryPanel';
import { ExplainLevelToggle } from '@/components/ai/ExplainLevelToggle';
import { ModelSelector } from '@/components/ai/ModelSelector';
import { DocumentScopeSelector } from '@/components/ai/DocumentScopeSelector';
import { ConfirmDeleteDialog } from '@/components/common/ConfirmDeleteDialog';
import { VoiceButton } from '@/components/ai/VoiceButton';
import { ExportDialog } from '@/components/share/ExportDialog';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

/** Some models emit 【1†L1–L4】 style markers; show them as plain [1] citations. */
const normalizeCitations = (text: string) => text.replace(/【\s*(\d{1,2})[^】]*】/g, '[$1]');

export const ChatPage: React.FC = () => {
  const { activeWorkspaceId } = useWorkspaceStore();
  const navigate = useNavigate();
  const {
    explanationLevel,
    setExplanationLevel,
    answerLanguage,
    setAnswerLanguage,
    model,
    setModel,
    memoryEnabled,
  } = useSettingsStore();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeDocForViewer, setActiveDocForViewer] = useState<DocumentItem | null>(null);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [showRightViewer, setShowRightViewer] = useState<boolean>(false);
  const [chatToDelete, setChatToDelete] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
  const [memoryDialogOpen, setMemoryDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Chat input and streaming state
  const [inputMessage, setInputMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  // Real abort: cancelling this controller closes the SSE request, which makes
  // the server drop its upstream LLM call (not just hide the tokens).
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice recording hook
  const {
    isListening,
    transcript,
    duration,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceInput();

  // Deep link from other pages (e.g. Mind Map): /app/chat?ask=... fills the input, never auto-sends.
  useEffect(() => {
    const ask = searchParams.get('ask');
    if (ask) {
      setInputMessage(ask);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (transcript) {
      setInputMessage(transcript);
    }
  }, [transcript]);

  // Load initial data
  useEffect(() => {
    async function loadChatData() {
      if (!activeWorkspaceId) return;
      try {
        const [convs, docs, facts] = await Promise.all([
          api.getConversations(activeWorkspaceId),
          api.getDocuments(activeWorkspaceId),
          api.getMemoryFacts(activeWorkspaceId),
        ]);
        setConversations(convs);
        setActiveConvId(convs.length > 0 ? convs[0].id : '');
        setDocuments(docs);
        if (docs.length > 0) {
          setActiveDocForViewer(docs[0]);
        }
        setMemoryFacts(facts);
      } catch (error) {
        toast.error(
          error instanceof ApiError ? error.message : 'Could not load your chats. Please refresh.',
        );
      }
    }
    loadChatData();
  }, [activeWorkspaceId]);

  const activeConversation =
    conversations.find((c) => c.id === activeConvId) || conversations[0];

  // 'all' or the ids of the documents the user ticked (stale ids are ignored).
  const readyDocs = documents.filter((d) => d.status === 'ready');
  const scopeValue: 'all' | string[] = Array.isArray(activeConversation?.documentScope)
    ? (activeConversation!.documentScope as string[]).filter((id) =>
        readyDocs.some((d) => d.id === id),
      )
    : 'all';
  const scopeIds = scopeValue === 'all' ? [] : scopeValue;
  const scopeLabel =
    scopeIds.length === 0
      ? 'All Workspace Docs'
      : scopeIds.length === 1
        ? readyDocs.find((d) => d.id === scopeIds[0])?.name ?? '1 document'
        : `${scopeIds.length} selected docs`;

  const handleScopeChange = async (scope: 'all' | string[]) => {
    if (!activeWorkspaceId) return;
    let convId = activeConvId;
    try {
      if (!convId) {
        const created = await api.createConversation(activeWorkspaceId, 'New Chat');
        setConversations((prev) => [created, ...prev]);
        setActiveConvId(created.id);
        convId = created.id;
      }
      const previous = conversations.find((c) => c.id === convId)?.documentScope ?? 'all';
      // Optimistic: the dropdown updates instantly, rolled back if the server refuses.
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, documentScope: scope } : c)),
      );
      try {
        await api.setConversationScope(convId, scope);
      } catch (error) {
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, documentScope: previous } : c)),
        );
        throw error;
      }
      // Show the first picked document in the source panel.
      if (scope !== 'all') {
        const first = documents.find((d) => d.id === scope[0]);
        if (first) setActiveDocForViewer(first);
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not change the document selection.',
      );
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  const handleCreateNewChat = async () => {
    const newChat = await api.createConversation(activeWorkspaceId, 'New Chat Exploration');
    setConversations([newChat, ...conversations]);
    setActiveConvId(newChat.id);
  };

  const handleDeleteChat = async () => {
    if (!chatToDelete) return;
    const id = chatToDelete.id;
    try {
      await api.deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (id === activeConvId) setActiveConvId(remaining[0]?.id ?? '');
      toast.success('Chat deleted. Your summaries, mind maps and notes are untouched.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete the chat.');
      throw error;
    }
  };

  const handleCitationClick = (citation: Citation) => {
    // Citations always name their document; an unknown id keeps the open one.
    const matchedDoc = findCitationDocument(documents, citation) || activeDocForViewer || documents[0];
    if (matchedDoc) setActiveDocForViewer(matchedDoc);
    setActiveCitation(citation);
    setShowRightViewer(true);
  };

  const handleSendMessage = async (
    customQuery?: string,
    options: { generalKnowledge?: boolean } = {},
  ) => {
    const query = customQuery || inputMessage.trim();
    if (!query || isGenerating) return;
    if (!activeWorkspaceId) {
      toast.error('Select a workspace first.');
      return;
    }

    // No conversation yet (first message): create one, otherwise the server
    // rejects an empty conversationId with a validation error.
    let convId = activeConvId;
    if (!convId) {
      try {
        const created = await api.createConversation(activeWorkspaceId, query.slice(0, 60));
        setConversations((prev) => [created, ...prev]);
        setActiveConvId(created.id);
        convId = created.id;
      } catch (error) {
        toast.error(
          error instanceof ApiError ? error.message : 'Could not start a new chat. Please retry.',
        );
        return;
      }
    }

    setInputMessage('');
    resetTranscript();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);

    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      conversationId: convId,
      role: 'user',
      content: query,
      createdAt: new Date().toISOString(),
    };

    const assistantMsgPlaceholder: ChatMessage = {
      id: `msg_a_${Date.now()}`,
      conversationId: convId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      explanationLevel,
      citations: [],
      reasoningTrace: [],
      retrievalInspection: [],
    };

    // Optimistically update conversation
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === convId) {
          return {
            ...c,
            title: c.messages.length === 0 ? query.slice(0, 32) : c.title,
            messages: [...c.messages, userMsg, assistantMsgPlaceholder],
          };
        }
        return c;
      })
    );

    try {
      const stream = api.streamChatMessage({
        conversationId: convId,
        query,
        workspaceId: activeWorkspaceId,
        level: explanationLevel,
        language: answerLanguage,
        model,
        generalKnowledge: options.generalKnowledge,
        signal: controller.signal,
      });

      for await (const event of stream) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            const updatedMessages = [...c.messages];
            const last = updatedMessages[updatedMessages.length - 1];
            if (last && last.role === 'assistant') {
              updatedMessages[updatedMessages.length - 1] = applyStreamEvent(last, event);
            }
            return { ...c, messages: updatedMessages };
          })
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        // The partial answer stays in the thread; the server marks it interrupted.
        toast.info('Stopped. The partial answer was kept.');
      } else if (error instanceof ApiError && error.status === 429) {
        toast.error(error.message || "You've reached today's AI limit. It resets at midnight UTC.");
      } else if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error('Streaming response failed. Please retry.');
      }
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setIsGenerating(false);
    }
  };

  /** Ask the same question again with a fresh retrieval + answer. */
  const handleRegenerate = async () => {
    const conversation = conversations.find((c) => c.id === activeConvId);
    if (!conversation || isGenerating) return;
    const lastUserMessage = [...conversation.messages]
      .reverse()
      .find((m) => m.role === 'user');
    if (!lastUserMessage) return;

    // Drop the answer being replaced, then ask again.
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConvId) return c;
        const messages = [...c.messages];
        while (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
          messages.pop();
        }
        return { ...c, messages };
      })
    );
    await handleSendMessage(lastUserMessage.content);
  };

  /** "Answer from general knowledge": same question, explicitly labelled. */
  const handleAnswerFromGeneralKnowledge = () => {
    const conversation = conversations.find((c) => c.id === activeConvId);
    const lastUserMessage = conversation
      ? [...conversation.messages].reverse().find((m) => m.role === 'user')
      : undefined;
    if (!lastUserMessage) return;
    void handleSendMessage(lastUserMessage.content, { generalKnowledge: true });
  };

  const handleStopGenerating = () => {
    // Cancelling the fetch closes the stream and tells the server to drop the
    // provider call; the partial answer is already rendered (and persisted).
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsGenerating(false);
    toast.info('Response generation stopped');
  };

  return (
    <div className="flex-1 flex overflow-hidden h-[calc(100vh-3.5rem)] bg-background">
      {/* PANE 1: Conversations History Sidebar (resizable / hideable on mobile) */}
      <div className="hidden lg:flex w-64 border-r border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 flex-col shrink-0">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <Button
            size="sm"
            onClick={handleCreateNewChat}
            className="w-full text-xs flex items-center justify-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Chat</span>
          </Button>
        </div>

        {/* Search Chats */}
        <div className="p-2 border-b border-slate-200/60 dark:border-slate-800/60">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Conversations List Grouped by Date */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
            Recent Conversations
          </div>

          {conversations
            .filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveConvId(c.id)}
                onKeyDown={(e) => e.key === 'Enter' && setActiveConvId(c.id)}
                className={`group w-full text-left p-2.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                  c.id === activeConvId
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <span className="truncate pr-2">{c.title}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono text-slate-400 group-hover:hidden">
                    {c.messages.length} msgs
                  </span>
                  <button
                    type="button"
                    title="Delete chat"
                    aria-label={`Delete chat ${c.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setChatToDelete(c);
                    }}
                    className="hidden group-hover:inline-flex focus:inline-flex p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            ))}
        </div>

        {/* Bottom Scope Filter */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1 font-medium">
            <Filter className="h-3 w-3 text-emerald-500" />
            <span className="truncate max-w-[150px]">Scope: {scopeLabel}</span>
          </span>
          <span className="font-mono text-[10px]">{documents.length} docs</span>
        </div>
      </div>

      {/* PANE 2: Center Chat Stream */}
      <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
        {/* Chat Control Toolbar */}
        <div className="h-12 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between gap-3 shrink-0 bg-white/40 dark:bg-slate-900/40">
          <div className="flex items-center gap-2">
            <ExplainLevelToggle
              value={explanationLevel}
              onChange={setExplanationLevel}
              size="sm"
            />
            <ModelSelector value={model} onChange={setModel} />
            <DocumentScopeSelector
              documents={documents}
              value={scopeValue}
              onChange={handleScopeChange}
              disabled={isGenerating}
            />
          </div>

          <div className="flex items-center gap-2">
            {memoryEnabled && (
              <button
                onClick={() => setMemoryDialogOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[11px] font-medium border border-purple-500/20 transition-colors cursor-pointer"
                title="View persistent memory"
              >
                <Brain className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Memory Active</span>
              </button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportDialogOpen(true)}
              className="text-xs h-8"
              title="Export Conversation"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              <span className="hidden sm:inline">Export</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRightViewer(!showRightViewer)}
              className="text-xs h-8"
              title={showRightViewer ? 'Hide source inspector' : 'Show source inspector'}
            >
              <FileText className="h-3.5 w-3.5 mr-1 text-emerald-500" />
              <span className="hidden sm:inline">{showRightViewer ? 'Hide Source' : 'View Source'}</span>
            </Button>
          </div>
        </div>

        {/* Messages Stream Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {documents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 max-w-md mx-auto">
              <div className="p-4 rounded-2xl bg-slate-500/10 text-slate-500 border border-slate-500/20">
                <FileText className="h-8 w-8" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                No documents in this workspace yet
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Chat answers are grounded in your own materials. Upload a PDF, notes or a link
                first, and every claim will come with a citation you can open.
              </p>
              <Button size="sm" className="text-xs h-8" onClick={() => navigate('/app/documents')}>
                Add documents
              </Button>
            </div>
          ) : activeConversation?.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 max-w-md mx-auto">
              <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <Sparkles className="h-8 w-8" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Ask Questions Grounded in Your Documents
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                StudyPilot synthesizes answers using BM25 and Dense Vector search with cross-encoder reranking. Every claim includes verifiable citation links [1].
              </p>
              <div className="w-full space-y-2 pt-2">
                {[
                  'What is the key difference between Strict 2PL and 2PC?',
                  'How does Raft leader election prevent split votes?',
                  'Explain Belady\'s Anomaly in operating systems paging',
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(prompt)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 bg-white dark:bg-slate-900 text-left text-xs text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    → {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            activeConversation?.messages.map((msg, index, all) => {
              // Regenerate is only offered on the newest answer.
              const isLastAssistantMessage =
                msg.role === 'assistant' &&
                all.slice(index + 1).every((m) => m.role !== 'assistant');
              return (
              <div
                key={msg.id}
                className={`flex flex-col space-y-2 ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                {/* Role header & badges */}
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {msg.role === 'user' ? 'You' : 'StudyPilot Engine'}
                  </span>
                  {msg.role === 'assistant' && msg.explanationLevel && (
                    <span className="bg-emerald-500/10 text-emerald-500 px-1.5 py-0.2 rounded font-medium uppercase">
                      {msg.explanationLevel}
                    </span>
                  )}
                  {msg.role === 'assistant' && msg.confidenceScore && (
                    <ConfidenceBadge score={msg.confidenceScore} tier={msg.confidenceTier} />
                  )}
                </div>

                {/* Message Bubble */}
                <div
                  className={`rounded-2xl p-4 sm:p-5 max-w-3xl text-xs sm:text-sm leading-relaxed shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-xs'
                      : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-bl-xs'
                  }`}
                >
                  {/* Markdown or plain text */}
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none space-y-3">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {normalizeCitations(msg.content)}
                      </ReactMarkdown>

                      {/* Inline Citations Chips Bar */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-[11px] font-medium text-slate-400">Grounded in:</span>
                          {msg.citations.map((c, idx) => (
                            <CitationChip
                              key={c.id}
                              citation={c}
                              index={idx + 1}
                              onClick={() => handleCitationClick(c)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Not found state fallback */}
                      {msg.isNotFound && (
                        <NotFoundState
                          query={activeConversation.title}
                          onAnswerGeneral={handleAnswerFromGeneralKnowledge}
                        />
                      )}
                    </div>
                  ) : (
                    <div>{msg.content}</div>
                  )}
                </div>

                {/* Agent Trace & Retrieval Inspector (under assistant messages) */}
                {msg.role === 'assistant' && (
                  <div className="w-full max-w-3xl space-y-1">
                    <AgentTrace steps={msg.reasoningTrace} />
                    <RetrievalInspector items={msg.retrievalInspection} />

                    {/* Action buttons (Copy, Thumbs, Regenerate) */}
                    <div className="flex items-center gap-1.5 pt-1 text-slate-400">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          toast.success('Response copied to clipboard');
                        }}
                        className="p-1 hover:text-slate-200 rounded cursor-pointer"
                        title="Copy answer"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {isLastAssistantMessage && (
                        <button
                          onClick={handleRegenerate}
                          disabled={isGenerating}
                          className="p-1 hover:text-emerald-400 disabled:opacity-40 rounded cursor-pointer"
                          title="Regenerate answer"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Composer */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 max-w-4xl mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-2 shadow-lg focus-within:border-emerald-500/80 focus-within:ring-2 focus-within:ring-emerald-500/20"
          >
            {/* Voice input mic */}
            <VoiceButton
              isListening={isListening}
              duration={duration}
              onToggle={() => (isListening ? stopListening() : startListening())}
            />

            <input
              type="text"
              placeholder={
                isListening
                  ? 'Listening to speech...'
                  : scopeIds.length > 0
                    ? `Ask about ${scopeLabel}...`
                    : 'Ask anything from your documents...'
              }
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={isGenerating}
              className="flex-1 bg-transparent px-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
            />

            {isGenerating ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleStopGenerating}
                className="h-8 px-3 text-xs flex items-center gap-1"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!inputMessage.trim()}
                size="sm"
                className="h-8 px-3 text-xs flex items-center gap-1"
              >
                <span>Send</span>
                <Send className="h-3 w-3" />
              </Button>
            )}
          </form>
        </div>
      </div>

      {/* PANE 3: Source Document Viewer Pane (Resizable / dismissible) */}
      {showRightViewer && (
        <div className="w-80 lg:w-96 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex flex-col h-full shadow-lg">
          <DocumentViewer
            document={activeDocForViewer}
            activeCitation={activeCitation}
            onClose={() => setShowRightViewer(false)}
          />
        </div>
      )}

      {/* Memory Panel Dialog */}
      <Dialog open={memoryDialogOpen} onOpenChange={setMemoryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Personal Conversation Memory</DialogTitle>
          </DialogHeader>
          <MemoryPanel
            facts={memoryFacts}
            onAddFact={async (fact) => {
              const created = await api.addMemoryFact(activeWorkspaceId, fact);
              setMemoryFacts([...memoryFacts, created]);
            }}
            onDeleteFact={async (id) => {
              await api.deleteMemoryFact(id);
              setMemoryFacts(memoryFacts.filter((m) => m.id !== id));
            }}
            onTogglePin={async (id) => {
              await api.togglePinMemoryFact(id);
              setMemoryFacts(
                memoryFacts.map((m) => (m.id === id ? { ...m, isPinned: !m.isPinned } : m))
              );
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title={activeConversation?.title || 'StudyPilot Conversation'}
        content={
          activeConversation?.messages
            .map((m) => `**${m.role.toUpperCase()}**:\n${m.content}`)
            .join('\n\n') || ''
        }
        citations={
          activeConversation?.messages.flatMap(
            (m) =>
              m.citations?.map((c) => ({
                snippet: c.snippet,
                docName: c.documentName,
              })) || []
          ) || []
        }
      />

      <ConfirmDeleteDialog
        open={chatToDelete !== null}
        onOpenChange={(o) => !o && setChatToDelete(null)}
        itemName={chatToDelete?.title ?? ''}
        description={`This chat and its ${chatToDelete?.messages.length ?? 0} messages will be deleted. Your documents, summaries, mind maps, quizzes and flashcards are kept.`}
        onConfirm={handleDeleteChat}
      />
    </div>
  );
};