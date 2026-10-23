import React, { useState } from 'react';
import {
  Settings,
  User,
  Sliders,
  Brain,
  Database,
  Shield,
  Activity,
  Trash2,
  Download,
  Check,
} from 'lucide-react';
import { useSettingsStore, ThemeMode } from '@/store/useSettingsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { SUPPORTED_LANGUAGES, AI_MODELS, EXPLANATION_LEVELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { USE_MOCK } from '@/lib/env';
import { AIStatus, AIProviderStatus } from '@/types';
import { useNavigate } from 'react-router-dom';

const PROVIDER_LABELS: Record<string, string> = {
  groq: 'Groq Cloud',
  gemini: 'Google Gemini',
  local: 'Local embeddings',
};

const HEALTH_LABELS: Record<string, string> = {
  ok: 'Operational',
  degraded: 'Degraded',
  error: 'Unavailable',
  not_configured: 'Not configured',
};

const HEALTH_STYLES: Record<string, string> = {
  ok: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  degraded: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  error: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  not_configured: 'bg-slate-500/15 text-slate-500 dark:text-slate-400',
};

function formatTimestamp(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function ProviderRow({ provider }: { provider: AIProviderStatus }) {
  return (
    <div className="p-3 rounded-xl border border-slate-500/20 bg-slate-500/5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
          {PROVIDER_LABELS[provider.provider] ?? provider.provider}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-bold ${HEALTH_STYLES[provider.status] ?? HEALTH_STYLES.not_configured}`}
        >
          {HEALTH_LABELS[provider.status] ?? provider.status}
        </span>
      </div>
      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 space-y-0.5">
        <div>model: {provider.model ?? '—'}</div>
        <div>breaker: {provider.breakerState}</div>
        <div>last success: {formatTimestamp(provider.lastSuccessAt)}</div>
        <div>last failure: {formatTimestamp(provider.lastFailureAt)}</div>
        {provider.lastErrorCode && <div>last error: {provider.lastErrorCode}</div>}
      </div>
    </div>
  );
}

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateUserPreferences, deleteAccount } = useAuthStore();
  const {
    theme,
    setTheme,
    explanationLevel,
    setExplanationLevel,
    answerLanguage,
    setAnswerLanguage,
    model,
    setModel,
    hybridSearch,
    setHybridSearch,
    reranker,
    setReranker,
    topK,
    setTopK,
    memoryEnabled,
    setMemoryEnabled,
  } = useSettingsStore();

  const [userName, setUserName] = useState(user?.name ?? '');
  const [userEmail, setUserEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiStatusError, setAiStatusError] = useState<string | null>(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(false);

  const loadProviderStatus = React.useCallback(async () => {
    setAiStatusLoading(true);
    setAiStatusError(null);
    try {
      setAiStatus(await api.getAIStatus());
    } catch (err) {
      setAiStatusError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not load provider status. Please try again.'
      );
    } finally {
      setAiStatusLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!USE_MOCK) void loadProviderStatus();
  }, [loadProviderStatus]);

  const handleSaveProfile = async () => {
    const name = userName.trim();
    if (!name) {
      toast.error('Name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      // Real mode: the email belongs to the login account and can't be edited here.
      await updateUserPreferences(USE_MOCK ? { name, email: userEmail } : { name });
      toast.success('Profile details saved successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  const handleExportAllData = async () => {
    setExporting(true);
    try {
      const blob = await api.exportMyData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studypilot_export_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Your data was exported');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      setDeleteOpen(false);
      toast.success('Your account and data were deleted');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the account');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-4xl mx-auto w-full">
      {/* Page Header */}
      <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Settings & Model Hyperparameters
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Configure profile details, LLM inference engine, retrieval hyperparameters, and privacy controls
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Card */}
        <Card className="p-6 space-y-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-emerald-500" />
            <span>Profile & Learner Identity</span>
          </CardTitle>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Full Name
              </label>
              <Input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Academic / Work Email
              </label>
              <Input
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                readOnly={!USE_MOCK}
                aria-readonly={!USE_MOCK}
                title={USE_MOCK ? undefined : 'Your login email is managed by your account'}
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={handleSaveProfile} disabled={saving} className="text-xs">
              {saving ? 'Saving…' : 'Save Profile'}
            </Button>
          </div>
        </Card>

        {/* Inference & AI Preferences */}
        <Card className="p-6 space-y-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sliders className="h-4 w-4 text-blue-500" />
            <span>AI Reasoning & Explanation Defaults</span>
          </CardTitle>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Preferred Model */}
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Default LLM Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as any)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 outline-none"
              >
                {AI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Explanation Level */}
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Default Explanation Level
              </label>
              <select
                value={explanationLevel}
                onChange={(e) => setExplanationLevel(e.target.value as any)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 outline-none"
              >
                {EXPLANATION_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label} ({l.description.slice(0, 24)}...)
                  </option>
                ))}
              </select>
            </div>

            {/* Interface Language */}
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                UI & Synthesis Language
              </label>
              <select
                value={answerLanguage}
                onChange={(e) => setAnswerLanguage(e.target.value as any)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 outline-none"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.native} ({lang.label})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* RAG Retrieval Parameters */}
        <Card className="p-6 space-y-5">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-500" />
            <span>RAG Retrieval Hyperparameters</span>
          </CardTitle>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 block">
                  Hybrid Search (BM25 + Dense Embeddings)
                </span>
                <span className="text-[11px] text-slate-500">
                  Fuses exact keyword matching with semantic vector cosine similarity
                </span>
              </div>
              <Switch checked={hybridSearch} onCheckedChange={setHybridSearch} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 block">
                  Cross-Encoder Reranker
                </span>
                <span className="text-[11px] text-slate-500">
                  Re-scores candidate chunks with fine-grained cross-attention to eliminate noise
                </span>
              </div>
              <Switch checked={reranker} onCheckedChange={setReranker} />
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                <span>Top-K Passage Retrieval Cutoff</span>
                <span className="font-mono text-emerald-500">{topK} chunks</span>
              </div>
              <Slider
                value={[topK]}
                onValueChange={(v) => setTopK(v[0])}
                min={3}
                max={15}
                step={1}
              />
            </div>
          </div>
        </Card>

        {/* Provider status: demo numbers are labelled as such; real mode shows no fake data */}
        <Card className="p-6 space-y-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-teal-500" />
            <span>Inference Provider Status</span>
            {USE_MOCK && (
              <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-mono text-amber-600 dark:text-amber-400">
                DEMO DATA
              </span>
            )}
          </CardTitle>

          {USE_MOCK ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-slate-500/20 bg-slate-500/5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">Groq Cloud</span>
                  <span className="text-[10px] font-mono text-slate-400">Simulated figures</span>
                </div>
                <span className="font-mono text-[10px] text-slate-400 font-bold">SIMULATED</span>
              </div>
              <div className="p-3 rounded-xl border border-slate-500/20 bg-slate-500/5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">Google Gemini</span>
                  <span className="text-[10px] font-mono text-slate-400">Simulated figures</span>
                </div>
                <span className="font-mono text-[10px] text-slate-400 font-bold">SIMULATED</span>
              </div>
            </div>
          ) : aiStatusLoading ? (
            <p className="text-xs text-slate-500">Loading live provider status…</p>
          ) : aiStatusError ? (
            <div className="space-y-2">
              <p className="text-xs text-rose-500" role="alert">
                {aiStatusError}
              </p>
              <Button variant="outline" size="sm" className="text-xs" onClick={loadProviderStatus}>
                Retry
              </Button>
            </div>
          ) : aiStatus ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {aiStatus.providers.map((provider) => (
                  <ProviderRow key={provider.provider} provider={provider} />
                ))}
              </div>
              <div className="p-3 rounded-xl border border-slate-500/20 bg-slate-500/5">
                <div className="flex items-center justify-between text-[11px] mb-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Your AI requests today
                  </span>
                  <span className="font-mono text-slate-500">
                    {aiStatus.quota.used} / {aiStatus.quota.limit}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-500/20 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{
                      width: `${Math.min(100, Math.round((aiStatus.quota.used / Math.max(1, aiStatus.quota.limit)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {aiStatus.quota.remaining} remaining · resets at midnight UTC ({aiStatus.quota.day})
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">No provider status available.</p>
          )}
        </Card>

        {/* Data & Privacy */}
        <Card className="p-6 space-y-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-purple-500" />
            <span>Data Export & Account Actions</span>
          </CardTitle>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportAllData}
              disabled={exporting}
              className="text-xs flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{exporting ? 'Preparing export…' : 'Export My Data (JSON)'}</span>
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteConfirm('');
                setDeleteOpen(true);
              }}
              className="text-xs"
            >
              Delete Account
            </Button>
          </div>
        </Card>

        <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                This permanently deletes your profile, workspaces, documents and study data. It cannot be undone.
                Type <strong>DELETE</strong> to confirm.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              aria-label="Type DELETE to confirm"
              className="text-xs"
            />
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteConfirm !== 'DELETE' || deleting}
                onClick={handleDeleteAccount}
              >
                {deleting ? 'Deleting…' : 'Delete my account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
