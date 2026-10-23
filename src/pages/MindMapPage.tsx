import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Panel,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Network, Sparkles, MessageSquare, Layers, Loader2, Trash2 } from 'lucide-react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { api } from '@/lib/api';
import type { MindMapBranch, MindMapTree } from '@/lib/api/apiClient';
import { ApiError } from '@/lib/api/http';
import type { DocumentItem } from '@/types';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/common/ConfirmDeleteDialog';
import { toast } from 'sonner';

const ROOT_STYLE = {
  background: '#10b981',
  color: '#ffffff',
  border: '2px solid #059669',
  borderRadius: '12px',
  padding: '12px 18px',
  fontWeight: 'bold',
  fontSize: '13px',
  maxWidth: 220,
} as const;
const BRANCH_STYLE = {
  background: '#0f172a',
  color: '#f8fafc',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '10px 14px',
  fontSize: '12px',
  maxWidth: 200,
} as const;
const LEAF_STYLE = { ...BRANCH_STYLE, background: '#111827', fontSize: '11px', border: '1px solid #1f2937' } as const;

/** Tidy tree layout: leaves get a column each, parents are centred over their children. */
function layoutTree(root: MindMapBranch): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const COL = 190;
  const ROW = 120;
  let nextLeaf = 0;
  let counter = 0;

  const place = (branch: MindMapBranch, depth: number, parentId: string | null): number => {
    const id = `n${counter++}`;
    let x: number;
    const childXs: number[] = [];
    const childIds: Array<{ b: MindMapBranch }> = branch.children.map((b) => ({ b }));
    // Reserve the node first so ids stay in reading order.
    const index = nodes.length;
    nodes.push({ id, position: { x: 0, y: depth * ROW }, data: { label: branch.label, summary: branch.summary }, style: depth === 0 ? ROOT_STYLE : depth === 1 ? BRANCH_STYLE : LEAF_STYLE });
    if (parentId) edges.push({ id: `e_${parentId}_${id}`, source: parentId, target: id, animated: depth === 1 });
    if (childIds.length === 0) {
      x = nextLeaf * COL;
      nextLeaf += 1;
    } else {
      for (const c of childIds) childXs.push(place(c.b, depth + 1, id));
      x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    }
    nodes[index] = { ...nodes[index], position: { x, y: depth * ROW } };
    return x;
  };
  place(root, 0, null);
  return { nodes, edges };
}

export const MindMapPage: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspaceStore();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [docId, setDocId] = useState('');
  const [busy, setBusy] = useState(false);
  const [docName, setDocName] = useState('');
  const [savedMaps, setSavedMaps] = useState<MindMapTree[]>([]);
  const [mapToDelete, setMapToDelete] = useState<MindMapTree | null>(null);
  const currentMap = savedMaps.find((m) => m.documentId === docId) ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [allDocs, saved] = await Promise.all([
          api.getDocuments(activeWorkspaceId),
          api.getSavedMindMaps(activeWorkspaceId).catch(() => [] as MindMapTree[]),
        ]);
        const list = allDocs.filter((d) => d.status === 'ready');
        if (cancelled) return;
        setDocs(list);
        setSavedMaps(saved);
        setDocId((cur) => (list.some((d) => d.id === cur) ? cur : list[0]?.id ?? ''));
      } catch {
        if (!cancelled) setDocs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  // Show the saved map for the chosen document (no AI call); clear when there is none.
  useEffect(() => {
    setSelectedNode(null);
    if (currentMap) {
      const laid = layoutTree(currentMap.root);
      setNodes(laid.nodes);
      setEdges(laid.edges);
      setDocName(currentMap.documentName);
    } else {
      setNodes([]);
      setEdges([]);
      setDocName('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMap?.id, docId]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNode(node), []);

  const handleGenerate = async () => {
    if (!docId) return;
    setBusy(true);
    setSelectedNode(null);
    try {
      const tree = await api.generateMindMap(docId);
      // Saved on the server; replaces the previous map of this document.
      setSavedMaps((prev) => [tree, ...prev.filter((m) => m.documentId !== tree.documentId)]);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not build the mind map.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteMap = async () => {
    if (!mapToDelete?.id) return;
    try {
      await api.deleteSavedNote(mapToDelete.id);
      setSavedMaps((prev) => prev.filter((m) => m.id !== mapToDelete.id));
      toast.success('Mind map deleted.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not delete the mind map.');
      throw e;
    }
  };

  const handleAskChat = () => {
    if (!selectedNode) return;
    navigate(`/app/chat?ask=${encodeURIComponent(`Explain "${String(selectedNode.data.label)}" from my documents`)}`);
  };

  const handleMakeCards = async () => {
    if (!selectedNode) return;
    try {
      const deck = await api.generateDeckFromDocument(docId, String(selectedNode.data.label), activeWorkspaceId);
      toast.success(`Created deck "${deck.title}" with ${deck.cardCount} cards.`);
      navigate('/app/flashcards');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not create flashcards.');
    }
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background">
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between shrink-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-lg bg-teal-500/10 text-teal-500">
            <Network className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Mind Map</h2>
            <p className="text-[10px] text-slate-500 truncate">{docName ? `Built from ${docName}` : 'Turn a document into a concept map'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            disabled={docs.length === 0}
            className="h-8 max-w-[220px] px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs outline-none"
          >
            {docs.length === 0 && <option value="">No ready documents</option>}
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {savedMaps.some((m) => m.documentId === d.id) ? '  ✓ saved' : ''}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={handleGenerate} disabled={!docId || busy} className="text-xs h-8 flex items-center gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span>{nodes.length ? 'Regenerate' : 'Generate'}</span>
          </Button>
          {currentMap?.id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMapToDelete(currentMap)}
              disabled={busy}
              className="text-xs h-8 flex items-center gap-1.5 text-red-500 hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 relative w-full h-full bg-slate-950">
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-xs text-slate-400 px-6 z-10 pointer-events-none">
            {docs.length === 0
              ? 'Upload a document in the Documents page first. Once it is processed you can map it here.'
              : busy
                ? 'Reading your document and drawing the map…'
                : 'Choose a document and press Generate.'}
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          key={nodes.length}
        >
          <Background color="#334155" gap={20} size={1} />
          <Controls className="bg-slate-900 border border-slate-800 text-white rounded-lg" />
          <MiniMap nodeColor="#10b981" maskColor="rgba(15, 23, 42, 0.7)" className="border border-slate-800 rounded-lg bg-slate-900" />
          {selectedNode && (
            <Panel position="top-right" className="m-4">
              <div className="w-72 p-4 rounded-xl border border-slate-800 bg-slate-900/95 shadow-2xl backdrop-blur-md space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-semibold text-slate-100 truncate">{String(selectedNode.data.label)}</span>
                  <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-slate-100">
                    ×
                  </button>
                </div>
                {selectedNode.data.summary ? (
                  <p className="text-[11px] text-slate-300 leading-relaxed">{String(selectedNode.data.summary)}</p>
                ) : null}
                <div className="pt-1 flex flex-col gap-1.5">
                  <Button size="sm" onClick={handleAskChat} className="text-xs h-8 justify-start">
                    <MessageSquare className="h-3.5 w-3.5 mr-2" />
                    <span>Ask Chat About This</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleMakeCards} className="text-xs h-8 justify-start">
                    <Layers className="h-3.5 w-3.5 mr-2 text-purple-400" />
                    <span>Make Flashcards from This</span>
                  </Button>
                </div>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      <ConfirmDeleteDialog
        open={mapToDelete !== null}
        onOpenChange={(o) => !o && setMapToDelete(null)}
        itemName={mapToDelete ? `${mapToDelete.documentName} — mind map` : ''}
        description="This saved mind map will be deleted. Your document and chats are not affected."
        onConfirm={handleDeleteMap}
      />
    </div>
  );
};