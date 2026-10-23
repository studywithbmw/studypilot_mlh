import React, { useState } from 'react';
import { Play, Sparkles, Shield, Cpu, Database, CheckCircle2, ChevronRight, RefreshCw, Volume2, VolumeX } from 'lucide-react';

interface GameNode {
  id: string;
  name: string;
  category: 'lake' | 'pod' | 'cube';
  status: 'safe' | 'scanning' | 'classified' | 'critical';
  confidence: number;
  dataCount: string;
  description: string;
  coordinates: { x: number; y: number };
}

const initialNodes: GameNode[] = [
  {
    id: 'node-lake-1',
    name: 'Geothermal Hydrology Data Lake',
    category: 'lake',
    status: 'safe',
    confidence: 99.8,
    dataCount: '4.8 PB',
    description: 'Telemetry from 2,400 distributed sensors in cold storage.',
    coordinates: { x: 28, y: 35 },
  },
  {
    id: 'node-pod-alpha',
    name: 'Central AI Processing Sanctuary Alpha',
    category: 'pod',
    status: 'safe',
    confidence: 98.4,
    dataCount: '12.2 PB',
    description: 'Neural weight clusters & live inference stream caches.',
    coordinates: { x: 56, y: 52 },
  },
  {
    id: 'node-pod-beta',
    name: 'Satellite Sanctuary Pod Beta',
    category: 'pod',
    status: 'scanning',
    confidence: 94.1,
    dataCount: '3.1 PB',
    description: 'Cross-cloud synchronization pipeline & client API ingress.',
    coordinates: { x: 74, y: 32 },
  },
  {
    id: 'node-cube-canyon',
    name: 'Crystalline Obsidian Vault Omega',
    category: 'cube',
    status: 'critical',
    confidence: 86.5,
    dataCount: '890 TB',
    description: 'High-privilege confidential training vectors & PII tokens.',
    coordinates: { x: 22, y: 72 },
  },
  {
    id: 'node-lake-south',
    name: 'Southern Hydro Reservoir Node',
    category: 'lake',
    status: 'safe',
    confidence: 99.1,
    dataCount: '2.5 PB',
    description: 'Immutable historical ledger with post-quantum encryption.',
    coordinates: { x: 42, y: 84 },
  },
];

export const SentinelMissionGame: React.FC = () => {
  const [nodes, setNodes] = useState<GameNode[]>(initialNodes);
  const [selectedNode, setSelectedNode] = useState<GameNode>(initialNodes[3]); // Start with critical node
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scanPulse, setScanPulse] = useState(false);
  const [securedScore, setSecuredScore] = useState(89);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    'STUDYPILOT NEURAL SCANNER: Initialized v4.8 across all sanctuary pods.',
    'ALERT: High entropy detected in Crystalline Obsidian Vault Omega.',
    'READY: Select a node or trigger Full Sentinel Sweep.',
  ]);

  const handleSweep = () => {
    setScanPulse(true);
    setTerminalLogs(prev => [
      `[${new Date().toLocaleTimeString()}] SENTINEL SWEEP: Scanning 5 architectural zones...`,
      ...prev.slice(0, 5),
    ]);

    setTimeout(() => {
      setNodes(prev =>
        prev.map(n => ({
          ...n,
          status: 'safe',
          confidence: Math.min(99.9, Number((n.confidence + 1.2).toFixed(1))),
        }))
      );
      setSecuredScore(99);
      setScanPulse(false);
      setTerminalLogs(prev => [
        `[${new Date().toLocaleTimeString()}] ALL SANCTUARY NODES SECURED: 0 shadow exposures found.`,
        ...prev.slice(0, 5),
      ]);
    }, 1200);
  };

  const handleRemediate = (id: string) => {
    setNodes(prev =>
      prev.map(n => (n.id === id ? { ...n, status: 'safe', confidence: 99.9 } : n))
    );
    setSelectedNode(prev => (prev.id === id ? { ...prev, status: 'safe', confidence: 99.9 } : prev));
    setSecuredScore(prev => Math.min(100, prev + 5));
    setTerminalLogs(prev => [
      `[${new Date().toLocaleTimeString()}] SECURED ${selectedNode.name}: Enforced zero-trust micro-perimeter.`,
      ...prev.slice(0, 5),
    ]);
  };

  return (
    <div className="relative rounded-2xl border border-teal-500/25 bg-slate-950 text-slate-100 shadow-2xl overflow-hidden backdrop-blur-xl">
      {/* HUD Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-teal-500/20 bg-slate-900/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white">
                Sentinel Simulation
              </span>
              <span className="text-[11px] font-mono text-teal-300 bg-teal-950/80 border border-teal-500/40 px-2 py-0.5 rounded">
                LIVE INTERACTION
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Hover nodes to inspect security perimeter across data pods and crystal vaults
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Security Score Meter */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-teal-500/30">
            <span className="text-[11px] text-slate-400">Health Index</span>
            <span className="font-mono text-xs font-bold text-teal-300">{securedScore}%</span>
            <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${securedScore}%` }}
              />
            </div>
          </div>

          {/* Trigger Sweep Button */}
          <button
            type="button"
            onClick={handleSweep}
            disabled={scanPulse}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-950 bg-gradient-to-r from-teal-300 to-emerald-400 hover:from-teal-200 hover:to-emerald-300 active:scale-95 transition-all shadow-md shadow-teal-950/50 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanPulse ? 'animate-spin' : ''}`} />
            <span>{scanPulse ? 'Scanning Fabric...' : 'Trigger Sweep'}</span>
          </button>
        </div>
      </div>

      {/* Main Mission Grid: Left Canvas Area + Right Telemetry Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[460px]">
        {/* Interactive Tactical Map (7 cols) */}
        <div className="relative lg:col-span-7 bg-radial from-teal-950/20 via-slate-950 to-slate-950 p-6 flex flex-col justify-between overflow-hidden border-b lg:border-b-0 lg:border-r border-teal-500/20">
          {/* Grid lines & constellation */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#14b8a608_1px,transparent_1px),linear-gradient(to_bottom,#14b8a608_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

          {/* Holographic Radar Rings */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full border border-teal-500/15 pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full border border-teal-500/20 pointer-events-none" />

          {/* Scan Pulse Overlay */}
          {scanPulse && (
            <div className="absolute inset-0 bg-teal-500/10 pointer-events-none animate-pulse transition-opacity" />
          )}

          {/* Interactive Topology Nodes */}
          <div className="relative w-full h-[360px] my-auto">
            {/* SVG Connecting laser lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <line x1="28%" y1="35%" x2="56%" y2="52%" stroke="rgba(20, 184, 166, 0.4)" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="56%" y1="52%" x2="74%" y2="32%" stroke="rgba(20, 184, 166, 0.4)" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="28%" y1="35%" x2="22%" y2="72%" stroke="rgba(20, 184, 166, 0.4)" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="56%" y1="52%" x2="42%" y2="84%" stroke="rgba(20, 184, 166, 0.4)" strokeWidth="1.5" strokeDasharray="3 3" />
            </svg>

            {nodes.map(node => {
              const isSelected = selectedNode.id === node.id;
              const isCritical = node.status === 'critical';
              const isScanning = node.status === 'scanning';

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedNode(node)}
                  style={{ left: `${node.coordinates.x}%`, top: `${node.coordinates.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer transition-transform duration-200 focus:outline-none ${
                    isSelected ? 'scale-125 z-20' : 'hover:scale-110 z-10'
                  }`}
                  aria-label={`Inspect ${node.name}`}
                >
                  {/* Outer pulsing ring */}
                  <span
                    className={`absolute -inset-2 rounded-full opacity-60 transition-all ${
                      isCritical
                        ? 'bg-amber-500 animate-ping'
                        : isScanning
                        ? 'bg-teal-400 animate-pulse'
                        : 'bg-teal-500/30'
                    }`}
                  />
                  {/* Core Node Marker */}
                  <div
                    className={`relative w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                      isSelected
                        ? 'border-white bg-teal-400 text-slate-950 shadow-lg shadow-teal-400/50'
                        : isCritical
                        ? 'border-amber-400 bg-amber-950 text-amber-200'
                        : 'border-teal-400/80 bg-slate-900 text-teal-300'
                    }`}
                  >
                    {node.category === 'lake' && <Database className="w-3.5 h-3.5" />}
                    {node.category === 'pod' && <Cpu className="w-3.5 h-3.5" />}
                    {node.category === 'cube' && <Shield className="w-3.5 h-3.5" />}
                  </div>

                  {/* Micro label */}
                  <span className="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900/90 border border-teal-500/30 text-teal-200 pointer-events-none group-hover:bg-slate-900">
                    {node.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tactical Bottom Footnote */}
          <div className="relative flex items-center justify-between text-[11px] text-slate-400 font-mono pt-3 border-t border-teal-500/10">
            <span>GRID: LAT 64.128°N / LONG 21.827°W</span>
            <span>TOPOLOGY: MESH 2.4</span>
          </div>
        </div>

        {/* Real-time Telemetry & Node Inspector (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/50 p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-teal-500/20">
              <span className="text-xs font-mono uppercase tracking-wider text-teal-400">
                Node Diagnostics
              </span>
              <span
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                  selectedNode.status === 'safe'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                    : selectedNode.status === 'critical'
                    ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                    : 'bg-teal-950 text-teal-300 border border-teal-500/40'
                }`}
              >
                {selectedNode.status}
              </span>
            </div>

            <div>
              <h4 className="text-base font-bold text-white leading-tight">
                {selectedNode.name}
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {selectedNode.description}
              </p>
            </div>

            {/* Diagnostic Metrics Matrix */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-teal-500/20">
                <span className="text-[10px] font-mono text-slate-400 block">ENCRYPTION LEVEL</span>
                <span className="text-sm font-bold font-mono text-teal-300">AES-256-GCM + PQ</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-teal-500/20">
                <span className="text-[10px] font-mono text-slate-400 block">DATA VOLUME</span>
                <span className="text-sm font-bold font-mono text-white">{selectedNode.dataCount}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-teal-500/20">
                <span className="text-[10px] font-mono text-slate-400 block">CONFIDENCE SCORE</span>
                <span className="text-sm font-bold font-mono text-emerald-400">{selectedNode.confidence}%</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-teal-500/20">
                <span className="text-[10px] font-mono text-slate-400 block">AI GOVERNANCE</span>
                <span className="text-sm font-bold font-mono text-teal-300">ACTIVE AUDIT</span>
              </div>
            </div>

            {/* Action button if critical or scanning */}
            {selectedNode.status !== 'safe' ? (
              <button
                type="button"
                onClick={() => handleRemediate(selectedNode.id)}
                className="w-full h-10 px-4 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-teal-950/40"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Apply Perimeter Containment</span>
              </button>
            ) : (
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Zero policy violations detected. Perimeter secure.</span>
              </div>
            )}
          </div>

          {/* Terminal Console Feed */}
          <div className="rounded-xl bg-slate-950 p-3 border border-teal-500/20 space-y-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between text-[10px] text-teal-400 pb-1 border-b border-teal-500/20">
              <span>SENTINEL CONSOLE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            </div>
            <div className="space-y-1 text-slate-400 max-h-24 overflow-y-auto">
              {terminalLogs.map((log, idx) => (
                <div key={idx} className="leading-snug truncate">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
