import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Slider } from '../components/ui/slider';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { CitationChip } from '../components/ai/CitationChip';
import { ConfidenceBadge } from '../components/ai/ConfidenceBadge';
import { PipelineStatusBadge } from '../components/upload/PipelineStatusBadge';
import { MatchGauge } from '../components/career/MatchGauge';
import { SkillChip } from '../components/career/SkillChip';
import { ThemeToggle } from '../components/layout/ThemeToggle';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';

export const DesignSystemPage: React.FC = () => {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-12 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            StudyPilot Design System & Token Showcase
          </h1>
          <p className="text-slate-500 mt-1">
            Dev-only route demonstrating semantic CSS variables, typographic hierarchy, and Radix primitives
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
          <Link to="/app">
            <Button size="sm" variant="outline">
              Back to App
            </Button>
          </Link>
        </div>
      </div>

      {/* 1. Color Palette Tokens */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Semantic Color Tokens
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {[
            { name: 'Primary (Emerald)', bg: 'bg-emerald-500', text: '#10B981' },
            { name: 'Secondary', bg: 'bg-slate-200 dark:bg-slate-800', text: '#1E293B' },
            { name: 'Destructive', bg: 'bg-red-500', text: '#EF4444' },
            { name: 'Warning (Amber)', bg: 'bg-amber-500', text: '#F59E0B' },
            { name: 'Chart-2 (Indigo)', bg: 'bg-indigo-500', text: '#6366F1' },
            { name: 'Canvas Dark', bg: 'bg-slate-950', text: '#090D16' },
          ].map((token) => (
            <div
              key={token.name}
              className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
            >
              <div className={`h-10 w-full rounded-lg ${token.bg}`} />
              <div>
                <span className="font-semibold block text-slate-900 dark:text-slate-100">
                  {token.name}
                </span>
                <span className="font-mono text-[10px] text-slate-400">{token.text}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Typography Scale */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Typographic Scale (Plus Jakarta Sans + JetBrains Mono)
        </h2>
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <div className="text-4xl font-extrabold tracking-tight">
            Display 4xl Headline (36px–48px)
          </div>
          <div className="text-2xl font-bold tracking-tight">
            Section 2xl Heading (24px)
          </div>
          <div className="text-base font-semibold">
            Subheading 16px font-semibold
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            Body 12px–14px prose: In database transaction management, strict serializability guarantees that concurrent transaction interleavings produce identical final states as some serial order.
          </div>
          <div className="font-mono text-xs text-emerald-500">
            Tabular Numerals: 2,450,192 requests · 14.8ms P99 · 98.4% Entailment
          </div>
        </div>
      </section>

      {/* 3. Button Component Variants */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Button Variants & Sizes
        </h2>
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center gap-3">
          <Button variant="default">Primary Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="subtle">Subtle Emerald</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="sm">Small (h-8)</Button>
          <Button size="lg">Large (h-11)</Button>
        </div>
      </section>

      {/* 4. Badges & Indicators */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Badges, Citations & Status Indicators
        </h2>
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center gap-3">
          <Badge variant="default">Emerald Badge</Badge>
          <Badge variant="secondary">Secondary Badge</Badge>
          <Badge variant="amber">Amber Warning</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <ConfidenceBadge score={98} tier="high" />
          <ConfidenceBadge score={72} tier="medium" />
          <PipelineStatusBadge status="chunking" progress={65} />
          <PipelineStatusBadge status="ready" />
          <CitationChip
            citation={{
              id: 'c_ds',
              documentId: 'd1',
              documentName: 'DBMS Notes.pdf',
              pageNumber: 14,
              snippet: 'Strict 2PL prevents cascading aborts by holding exclusive locks until commit.',
              confidence: 0.98,
            }}
            index={1}
          />
        </div>
      </section>

      {/* 5. Career & Data Visualizations */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Interactive Data Widgets
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-6 flex flex-col items-center justify-center">
            <MatchGauge score={88} />
          </Card>
          <Card className="p-6 flex flex-col justify-center gap-3 sm:col-span-2">
            <SkillChip name="Distributed Systems (Raft)" status="matched" subtitle="Implemented in coursework" />
            <SkillChip name="Kafka Consumer Groups" status="partial" subtitle="Needs offset handling practice" />
            <SkillChip name="Kubernetes Helm Deployments" status="missing" priority="high" />
          </Card>
        </div>
      </section>
    </div>
  );
};
