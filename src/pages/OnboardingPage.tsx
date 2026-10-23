import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { SUPPORTED_LANGUAGES, SupportedLanguage, PRODUCT_NAME } from '../lib/constants';
import { GraduationCap, Briefcase, Award, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { USE_MOCK } from '../lib/env';
import { toast } from 'sonner';

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { completeOnboarding } = useAuthStore();

  const [step, setStep] = useState(1);
  const [selectedGoal, setSelectedGoal] = useState('academic');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([
    'Database Systems (DBMS)',
    'Distributed Systems',
  ]);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('en');
  const [finishing, setFinishing] = useState(false);

  const goals = [
    {
      id: 'academic',
      title: 'College / University Exams',
      desc: 'Master coursework, finals, and midterms with citation-backed notes.',
      icon: GraduationCap,
    },
    {
      id: 'jobprep',
      title: 'Tech Job & Interview Prep',
      desc: 'Bridge JD skill gaps, rewrite resume bullets, and mock interview with voice.',
      icon: Briefcase,
    },
    {
      id: 'cert',
      title: 'Professional Certifications',
      desc: 'Systematic SM-2 spaced repetition for deep technical retention.',
      icon: Award,
    },
  ];

  const subjectOptions = [
    'Database Systems (DBMS)',
    'Operating Systems & Kernel',
    'Distributed Systems & Consensus',
    'Computer Networks',
    'System Design & Scalability',
    'Backend Engineering (Go/Python)',
  ];

  const toggleSubject = (s: string) => {
    if (selectedSubjects.includes(s)) {
      setSelectedSubjects(selectedSubjects.filter((x) => x !== s));
    } else {
      setSelectedSubjects([...selectedSubjects, s]);
    }
  };

  const handleFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const goalTitle = goals.find((g) => g.id === selectedGoal)?.title ?? selectedGoal;
      // Real accounts start with no workspaces: make the first one BEFORE
      // flagging onboarding done, so a failure here leaves the user on this
      // page to retry (and a retry never creates a duplicate).
      if (!USE_MOCK) {
        const { loadWorkspaces, createWorkspace } = useWorkspaceStore.getState();
        await loadWorkspaces();
        if (useWorkspaceStore.getState().workspaces.length === 0) {
          await createWorkspace('My Study Space', '#10B981', '📚');
        }
      }
      await completeOnboarding(goalTitle, selectedSubjects, selectedLanguage);
      navigate('/app', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your preferences. Please try again.');
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-6 sm:p-12 max-w-3xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 19h20L12 2zm0 4l6.5 11h-13L12 6z" />
            </svg>
          </div>
          <span className="font-bold text-sm tracking-tight">{PRODUCT_NAME} Setup</span>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-400">
          <span>Step {step} of 3</span>
        </div>
      </div>

      {/* Center Wizard Content */}
      <div className="my-10 space-y-6">
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in-50 duration-300">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {t('onboarding.step1Title')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('onboarding.step1Desc')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {goals.map((g) => {
                const Icon = g.icon;
                const isSelected = selectedGoal === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGoal(g.id)}
                    className={`p-5 rounded-2xl border flex flex-col items-start justify-between text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 mb-3">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                        {g.title}
                      </div>
                      <div className="text-[11px] text-slate-500 leading-normal">
                        {g.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-in fade-in-50 duration-300">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {t('onboarding.step2Title')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('onboarding.step2Desc')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {subjectOptions.map((subj) => {
                const isSelected = selectedSubjects.includes(subj);
                return (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => toggleSubject(subj)}
                    className={`p-3.5 rounded-xl border flex items-center justify-between text-left text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850'
                    }`}
                  >
                    <span>{subj}</span>
                    {isSelected && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-in fade-in-50 duration-300">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {t('onboarding.step3Title')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('onboarding.step3Desc')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = selectedLanguage === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setSelectedLanguage(lang.code as SupportedLanguage)}
                    className={`p-5 rounded-2xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850'
                    }`}
                  >
                    <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                      {lang.native}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {lang.label} ({lang.code.toUpperCase()})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Footer */}
      <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4">
        {step > 1 ? (
          <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Previous
          </Button>
        ) : (
          <div />
        )}

        {step < 3 ? (
          <Button size="sm" onClick={() => setStep(step + 1)}>
            Continue
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        ) : (
          <Button size="sm" onClick={handleFinish} disabled={finishing}>
            {t('onboarding.getStarted')}
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
};
