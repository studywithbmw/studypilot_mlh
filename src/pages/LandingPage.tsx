import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  ArrowRight,
  BookOpen,
  MessageSquare,
  HelpCircle,
  Layers,
  Network,
  Briefcase,
  BarChart2,
  CheckCircle2,
  Star,
  ChevronDown,
  FileText,
  ShieldCheck,
  Zap,
  Clock,
  Shield,
  Database,
  Cpu,
  Lock,
  ChevronRight,
  Compass,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../lib/constants';
import MorphOrb from '../components/ui/ai-thinking-orb-and-input';
import { ShaderBackground } from '../components/ui/shader-background';
import { api } from '../lib/api';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';
import { ThemeToggle } from '../components/layout/ThemeToggle';
import { CitationChip } from '../components/ai/CitationChip';
import { SentinelMissionGame } from '../components/study/SentinelMissionGame';

// High-fidelity image assets generated matching user reference images
import heroLandscapeImg from '../assets/images/cyera_hero_landscape_1791633905520.jpg';
import dataCubeImg from '../assets/images/data_cube_crystal_1791633920105.jpg';
import aiGuardImg from '../assets/images/ai_guard_agent_1791633931869.jpg';

export const LandingPage: React.FC = () => {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [shaderActive, setShaderActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'platform' | 'security' | 'intelligence'>('platform');

  const stats = [
    { label: 'Cloud Data Classified', value: '450+ PB', suffix: 'Enterprise Scope' },
    { label: 'Threat Surface Reduction', value: '92%', suffix: 'Post-Scan' },
    { label: 'Grounded RAG Accuracy', value: '99.4%', suffix: 'Zero Hallucination' },
    { label: 'Daily Study & Work Sprint', value: '38,000+', suffix: 'Global Engineers' },
  ];

  const pillarCards = [
    {
      title: 'Know Your Data',
      subtitle: 'Continuous Discovery & Classification',
      desc: 'Discover structured and unstructured data across AWS, Azure, GCP, Snowflake, and local study environments with zero impact on operational workloads.',
      icon: Database,
      image: heroLandscapeImg,
      badge: 'Data Discovery',
      metric: 'Over 450 PB Scanned',
    },
    {
      title: 'Control Your AI',
      subtitle: 'Safe LLM & Agent Ingestion',
      desc: 'Govern data flows entering AI models, Vector Databases, and LLM fine-tuning pipelines. Prevent sensitive PII and confidential IP leaks before inference.',
      icon: Cpu,
      image: aiGuardImg,
      badge: 'AI Security Posture',
      metric: 'Sub-millisecond Guardrails',
    },
    {
      title: 'Secure the Unknown',
      subtitle: 'Post-Quantum Vault Encryption',
      desc: 'Transform scattered credentials, shadow backups, and orphaned buckets into an impenetrable cryptographic crystal sanctuary.',
      icon: Shield,
      image: dataCubeImg,
      badge: 'Identity & Access',
      metric: '100% Zero-Trust Perimeter',
    },
  ];

  const bentoFeatures = [
    {
      title: 'Citation-Backed RAG Engine',
      desc: 'Never guess where an answer originated. Inspect inline cryptographic citation proofs [1][2] tied directly to textbook passages, slides, and transcripts.',
      icon: MessageSquare,
      colSpan: 'col-span-1 md:col-span-2',
      badge: 'Core Verification',
    },
    {
      title: 'SM-2 Spaced Repetition',
      desc: 'Algorithmically scheduled flashcard intervals calculate biological decay curves so you review facts at peak memory efficiency.',
      icon: Layers,
      colSpan: 'col-span-1',
      badge: 'Cognitive Science',
    },
    {
      title: 'Interactive Mind Map Topology',
      desc: 'Transform complex technical syllabi into visual node graphs resembling high-tech network nodes. Collapse and expand branches dynamically.',
      icon: Network,
      colSpan: 'col-span-1',
      badge: 'Visual Synthesis',
    },
    {
      title: 'JD vs Resume Gap Analysis',
      desc: 'Scan job postings and resumes for deep keyword deficits, ATS compatibility scores, and step-by-step technical interview preparation plans.',
      icon: Briefcase,
      colSpan: 'col-span-1 md:col-span-2',
      badge: 'Career Hub',
    },
    {
      title: 'Daily Study Hours & Heatmap',
      desc: 'Log stopwatch and Pomodoro sprint hours with GitHub-grade contribution grids, streak counters, and weekly productivity velocity.',
      icon: Clock,
      colSpan: 'col-span-1 md:col-span-2',
      badge: 'Habit Engine',
    },
    {
      title: 'WebGL Plasma Grid Flow State',
      desc: 'Activate a high-performance 60 FPS WebGL shader canvas for distraction-free ambient immersion during long focus sessions.',
      icon: Sparkles,
      colSpan: 'col-span-1',
      badge: 'Flow State',
    },
  ];

  const faqs = [
    {
      q: 'How does the platform secure study notes and enterprise data?',
      a: 'We combine agentic sentence-level citation verification with client-side isolation. Data ingested into your private workspace is indexed into local vector indices and encrypted with dedicated workspace keys.',
    },
    {
      q: 'How does the "Sentinel" AI security simulation work?',
      a: 'The interactive simulation lets you inspect simulated data lakes, processing pods, and vault nodes to visualize how modern zero-trust DSPM (Data Security Posture Management) identifies and remediates shadow risks in real time.',
    },
    {
      q: 'Can I track both my study hours and technical interview prep?',
      a: 'Yes. The built-in Study Hours Tracker records focused Pomodoro sessions, generates GitHub-style heatmaps, and tracks mastery across flashcards, quizzes, and mock interview speech drills.',
    },
    {
      q: 'Is there multi-language support for international students?',
      a: 'Yes. StudyPilot offers native multi-lingual interfaces and cross-lingual RAG synthesis in English, Tamil (தமிழ்), and Hindi (हिन्दी).',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-teal-500/20 selection:text-teal-300 relative font-sans overflow-x-hidden">
      {/* Optional WebGL Shader Canvas Backdrop */}
      {shaderActive && (
        <>
          <ShaderBackground className="fixed inset-0 w-full h-full -z-30 pointer-events-none" />
          <div className="fixed inset-0 -z-20 bg-slate-950/80 backdrop-blur-[2px] pointer-events-none" />
        </>
      )}

      {/* Cyber Teal Ambient Glow in background */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[550px] bg-teal-500/10 blur-[160px] rounded-full pointer-events-none -z-10" />

      {/* Top Navigation Bar: Single-line 3-zone nav */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/85 border-b border-teal-500/20 px-6 sm:px-12 h-18 flex items-center justify-between gap-8">
        {/* Zone 1: Wordmark Logo */}
        <Link to="/" className="flex items-center gap-3 whitespace-nowrap shrink-0 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 p-0.5 shadow-lg shadow-teal-500/20 group-hover:scale-105 transition-transform">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <svg className="w-5 h-5 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
          <span className="font-extrabold text-xl tracking-tight text-white uppercase font-sans">
            StudyPilot
          </span>
        </Link>

        {/* Zone 2: Clean 4-5 Navigation Links with subtle hover underlines */}
        <nav className="hidden lg:flex items-center gap-8 text-xs font-semibold tracking-wide text-slate-300">
          <a href="#platform" className="hover:text-teal-300 transition-colors whitespace-nowrap shrink-0">
            Platform
          </a>
          <a href="#solutions" className="hover:text-teal-300 transition-colors whitespace-nowrap shrink-0">
            Solutions
          </a>
          <a href="#interactive-mission" className="hover:text-teal-300 transition-colors whitespace-nowrap shrink-0 text-teal-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
            <span>Interactive Mission</span>
          </a>
          <a href="#study-engine" className="hover:text-teal-300 transition-colors whitespace-nowrap shrink-0">
            Study & Copilot
          </a>
          <a href="#faq" className="hover:text-teal-300 transition-colors whitespace-nowrap shrink-0">
            FAQ
          </a>
        </nav>

        {/* Zone 3: CTA Button + Preferences */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShaderActive(!shaderActive)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-500/30 bg-slate-900/80 hover:bg-slate-800 text-xs font-medium text-teal-300 transition-all cursor-pointer"
            title="Toggle WebGL plasma shader background"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{shaderActive ? 'Shader On' : 'Shader Off'}</span>
          </button>

          <LanguageSwitcher />
          <ThemeToggle />

          {/* High-impact Pulsing CTA */}
          <div className="relative group">
            <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-400 opacity-70 blur-sm group-hover:opacity-100 transition duration-500 animate-pulse pointer-events-none" />
            <Link
              to="/app"
              className="relative h-10 px-5 rounded-lg bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-teal-950/40 whitespace-nowrap shrink-0"
            >
              <span>Begin Your Mission</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 px-6 sm:px-12 max-w-7xl mx-auto flex flex-col items-center text-center">
        {/* Subtle pill kicker */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-teal-500/30 bg-teal-950/60 text-teal-300 text-xs font-semibold mb-8 backdrop-blur-md">
          <Shield className="h-3.5 w-3.5 text-teal-400" />
          <span>AI STUDY & CAREER COPILOT</span>
        </div>

        {/* Triple Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl text-balance leading-[1.1]">
          Know Your Data.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-teal-200 to-emerald-400">
            Control Your AI.
          </span>{' '}
          Secure the Unknown.
        </h1>

        <p className="mt-7 text-base sm:text-xl text-slate-300 max-w-3xl leading-relaxed">
          The next-generation data security platform and AI study copilot. Continuously discover sensitive data, govern LLM workloads with mathematical grounding, and accelerate engineering mastery.
        </p>

        {/* Primary Action Row with Pulsing Buttons */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <div className="relative group">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 opacity-80 blur-md group-hover:opacity-100 transition duration-500 animate-pulse pointer-events-none" />
            <Link
              to="/app"
              className="relative h-13 px-8 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-extrabold text-sm sm:text-base flex items-center gap-3 active:scale-95 transition-all shadow-2xl shadow-teal-950/60 cursor-pointer"
            >
              <span>Begin Your Mission</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <a
            href="#interactive-mission"
            className="h-13 px-6 rounded-xl border border-teal-500/30 bg-slate-900/80 hover:bg-slate-800/90 text-teal-200 font-semibold text-sm flex items-center gap-2.5 transition-all cursor-pointer backdrop-blur-sm"
          >
            <Compass className="h-4 w-4 text-teal-400" />
            <span>Explore Tactical Sandbox</span>
          </a>

          <a
            href="#quick-ask"
            className="h-13 px-6 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 font-semibold text-sm flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>Ask MorphOrb AI</span>
          </a>
        </div>

        {/* Cinematic Hero Visual Showcase matching Reference Image */}
        <div className="mt-16 w-full rounded-3xl border border-teal-500/30 bg-slate-900/60 p-2 sm:p-3 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
          <div className="relative rounded-2xl overflow-hidden aspect-16/9 sm:aspect-21/9 max-h-[520px]">
            <img
              src={heroLandscapeImg}
              alt="Futuristic data sanctuary landscape with pods and turquoise mineral waters"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transform group-hover:scale-[1.02] transition-transform duration-700"
            />
            {/* Scrim Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent pointer-events-none" />

            {/* Floating Hero Holographic Badges */}
            <div className="absolute bottom-6 left-6 right-6 flex flex-wrap items-end justify-between gap-4 pointer-events-none">
              <div className="bg-slate-950/85 backdrop-blur-md p-4 rounded-xl border border-teal-500/30 max-w-md text-left">
                <span className="text-[10px] font-mono uppercase tracking-wider text-teal-400 block mb-1">
                  TACTICAL VISUAL OVERVIEW
                </span>
                <h3 className="text-sm font-bold text-white">
                  Distributed Sanctuary Pods & Crystalline Security Fabric
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  Multi-cloud telemetry dynamically orchestrated with real-time zero-trust policy enforcement.
                </p>
              </div>

              <div className="flex items-center gap-2 pointer-events-auto">
                <Link
                  to="/app"
                  className="px-4 py-2 rounded-lg bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg"
                >
                  <span>Launch Copilot Console</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quantitative Rigor Stats Strip */}
      <section className="border-y border-teal-500/20 bg-slate-900/40 py-12 px-6 sm:px-12 backdrop-blur-md">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((stat, i) => (
            <div key={i} className="flex flex-col items-center">
              <span className="font-mono text-3xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-emerald-400 tracking-tight">
                {stat.value}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-200 mt-2">
                {stat.label}
              </span>
              <span className="text-[11px] font-mono text-teal-400/80 mt-0.5">{stat.suffix}</span>
            </div>
          ))}
        </div>
      </section>

      {/* The 3 Core Pillars Section matching the 3 Images */}
      <section id="solutions" className="py-24 px-6 sm:px-12 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-mono font-semibold uppercase tracking-widest text-teal-400">
            THE STUDYPILOT TRIFECTA
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mt-2">
            Complete Control Across Data, AI, and Identity
          </h2>
          <p className="text-sm sm:text-base text-slate-400 mt-3">
            Architected to eliminate blind spots, safeguard LLM pipelines, and protect enterprise secrets.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pillarCards.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-teal-500/25 bg-slate-900/60 overflow-hidden flex flex-col justify-between hover:border-teal-400/60 transition-all shadow-xl group backdrop-blur-md"
              >
                {/* Visual Asset Container */}
                <div className="relative aspect-4/3 overflow-hidden bg-slate-950">
                  <img
                    src={pillar.image}
                    alt={pillar.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                  <div className="absolute top-4 left-4">
                    <span className="px-2.5 py-1 rounded-md bg-slate-950/80 border border-teal-500/40 text-[10px] font-mono text-teal-300 backdrop-blur-md">
                      {pillar.badge}
                    </span>
                  </div>
                </div>

                {/* Content Details */}
                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 mb-4">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-bold text-white group-hover:text-teal-300 transition-colors">
                      {pillar.title}
                    </h3>
                    <h4 className="text-xs font-mono text-teal-400 mt-0.5 mb-2">
                      {pillar.subtitle}
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {pillar.desc}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-teal-500/15 flex items-center justify-between text-xs font-mono text-teal-300">
                    <span>{pillar.metric}</span>
                    <Link
                      to="/app"
                      className="hover:underline flex items-center gap-1 font-sans font-semibold text-white"
                    >
                      <span>Explore</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Interactive Simulation Game: 'Begin Your Mission' */}
      <section id="interactive-mission" className="py-20 px-6 sm:px-12 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-teal-500/30 bg-teal-950/60 text-teal-300 text-xs font-mono mb-3">
            <span>MISSION BRIEFING</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Interactive Sanctuary Radar
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Experience real-time telemetry inspection across geothermal data lakes, satellite pods, and the obsidian crystal vault.
          </p>
        </div>

        <SentinelMissionGame />
      </section>

      {/* Bento Grid: Copilot & Study Mastery Capabilities */}
      <section id="study-engine" className="py-20 px-6 sm:px-12 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-teal-400">
            ENGINEERED LEARNING COGNITION
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mt-1">
            Every Tool Needed to Master Any Subject
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Combining enterprise data grounding with spaced repetition, heatmaps, and career coaching.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {bentoFeatures.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <div
                key={i}
                className={`rounded-2xl border border-teal-500/20 bg-slate-900/60 p-6 flex flex-col justify-between hover:border-teal-400/50 transition-all shadow-md backdrop-blur-sm ${feat.colSpan}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-mono text-teal-300 uppercase tracking-wider bg-slate-950 px-2 py-0.5 rounded border border-teal-500/30">
                      {feat.badge}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">
                    {feat.title}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {feat.desc}
                  </p>
                </div>
                <div className="mt-6 pt-3 border-t border-teal-500/15 flex items-center justify-between text-xs text-teal-400 font-medium">
                  <Link to="/app" className="hover:underline flex items-center gap-1.5">
                    <span>Open in Workspace</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* MorphOrb Quick Ask Section */}
      <section id="quick-ask" className="py-20 border-t border-teal-500/20 bg-slate-950 text-white relative overflow-hidden">
        <div className="text-center max-w-xl mx-auto px-6 mb-4">
          <span className="text-xs font-mono font-semibold text-teal-400 uppercase tracking-wider">
            SYNTHESIS ENGINE
          </span>
          <h2 className="text-3xl font-bold tracking-tight text-white mt-1">
            MorphOrb Quick Neural Ask
          </h2>
          <p className="text-xs text-slate-400 mt-2">
            Inquire about computer science, distributed algorithms, or data security policies.
          </p>
        </div>

        <MorphOrb onSubmit={(text) => api.quickAsk(text)} />
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 border-t border-teal-500/20 px-6 sm:px-12 max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <span className="text-xs font-mono text-teal-400 uppercase tracking-wider block mb-1">
            KNOWLEDGE BASE
          </span>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="border border-teal-500/25 rounded-xl overflow-hidden bg-slate-900/60 backdrop-blur-md"
            >
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full p-4 flex items-center justify-between text-left text-sm font-medium text-slate-100 hover:bg-slate-800/40 cursor-pointer"
              >
                <span>{faq.q}</span>
                <ChevronDown className={`h-4 w-4 text-teal-400 transition-transform ${openFaq === idx ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === idx && (
                <div className="px-4 pb-4 text-xs text-slate-300 leading-relaxed border-t border-teal-500/15 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Final Call-to-Action Banner */}
      <section className="py-20 px-6 sm:px-12 max-w-5xl mx-auto text-center">
        <div className="rounded-3xl border border-teal-400/40 bg-gradient-to-b from-teal-500/15 via-slate-900/80 to-slate-950 p-10 sm:p-14 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-teal-400/20 blur-3xl pointer-events-none" />

          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Ready to Begin Your Mission?
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
            Join elite engineers and students securing knowledge, governing AI agents, and mastering engineering interviews.
          </p>

          <div className="pt-2 flex justify-center">
            <div className="relative group">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-teal-400 to-emerald-400 opacity-80 blur-md group-hover:opacity-100 transition duration-500 animate-pulse pointer-events-none" />
              <Link
                to="/app"
                className="relative h-13 px-9 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 font-extrabold text-sm sm:text-base inline-flex items-center gap-2.5 shadow-xl transition-all active:scale-95"
              >
                <span>Launch StudyPilot</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer adhering to universal guidelines */}
      <footer className="border-t border-teal-500/20 py-12 px-6 sm:px-12 text-xs text-slate-400 bg-slate-950">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-white text-base tracking-wider uppercase font-sans">
              StudyPilot
            </span>
            <span className="text-teal-500">·</span>
            <span className="text-slate-300 font-medium">Data Security Platform & AI Copilot</span>
          </div>

          <div className="flex items-center gap-6 font-medium text-slate-300">
            <Link to="/app" className="hover:text-teal-300">Mission Dashboard</Link>
            <Link to="/app/chat" className="hover:text-teal-300">Citation Chat</Link>
            <Link to="/app/planner" className="hover:text-teal-300">Daily Study Tracker</Link>
            <Link to="/app/career" className="hover:text-teal-300">Career Hub</Link>
            <Link to="/design" className="hover:text-teal-300">Design System</Link>
          </div>

          <div className="font-mono text-[11px] text-slate-400">
            © 2026 StudyPilot. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};
