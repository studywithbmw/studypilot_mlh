import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  FileText,
  Sparkles,
  TrendingUp,
  Volume2,
  Mic,
  Square,
  CheckCircle2,
  AlertCircle,
  Copy,
  CheckCircle2 as CheckIcon,
  Compass,
  ArrowRight,
  Clock,
  Layers,
  Award,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { MatchGauge } from '../components/career/MatchGauge';
import { SkillChip } from '../components/career/SkillChip';
import { DiffView } from '../components/career/DiffView';
import { Waveform } from '../components/career/Waveform';
import { RubricRadar } from '../components/career/RubricRadar';
import { VoiceButton } from '../components/ai/VoiceButton';
import { api } from '../lib/api';
import {
  SkillGapAnalysis,
  BulletRewriteItem,
  RoadmapMilestone,
  MockInterviewQuestion,
  InterviewFeedback,
} from '../types';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { toast } from 'sonner';
import { ApiError } from '../lib/api/http';

export const CareerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'analyzer';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Skill gap analysis state
  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState('');
  const [analysis, setAnalysis] = useState<SkillGapAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Bullet rewriter state
  const [bulletInput, setBulletInput] = useState('');
  const [bullets, setBullets] = useState<BulletRewriteItem[]>([]);
  const [isRewriting, setIsRewriting] = useState(false);

  // Roadmap state
  const [milestones, setMilestones] = useState<RoadmapMilestone[]>([]);

  // Mock interview state
  const [questions, setQuestions] = useState<MockInterviewQuestion[]>([]);
  const [activeQIndex, setActiveQIndex] = useState(0);
  const [interviewFeedback, setInterviewFeedback] = useState<InterviewFeedback | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Voice recording & synthesis hooks
  const {
    isListening,
    transcript,
    setTranscript,
    duration,
    startListening,
    stopListening,
    resetTranscript,
  } = useVoiceInput();
  const { speak, isSpeaking } = useSpeechSynthesis();

  const [isPreparing, setIsPreparing] = useState(false);
  const fail = (e: unknown, fallback: string) => toast.error(e instanceof ApiError ? e.message : fallback);

  const handleRunAnalysis = async () => {
    if (resumeText.trim().length < 40 || jdText.trim().length < 40) {
      toast.info('Paste your resume and the job description first (at least a few lines each).');
      return;
    }
    setIsAnalyzing(true);
    setMilestones([]);
    setQuestions([]);
    setInterviewFeedback(null);
    try {
      const res = await api.analyzeSkillGap(resumeText, jdText);
      setAnalysis(res);
    } catch (e) {
      fail(e, 'Could not analyze your resume. Please try again.');
      setIsAnalyzing(false);
      return;
    }
    setIsAnalyzing(false);

    // Roadmap and interview questions are built from the same two texts, in the background.
    setIsPreparing(true);
    const [rMap, qs] = await Promise.allSettled([
      api.getRoadmap(resumeText, jdText),
      api.getInterviewQuestions(resumeText, jdText),
    ]);
    if (rMap.status === 'fulfilled') setMilestones(rMap.value);
    if (qs.status === 'fulfilled') {
      setQuestions(qs.value);
      setActiveQIndex(0);
    }
    setIsPreparing(false);
  };

  const handleRewrite = async (mode: 'quantified' | 'concise' = 'quantified') => {
    if (!bulletInput.trim()) return;
    setIsRewriting(true);
    try {
      const item = await api.rewriteBullet(bulletInput, mode);
      setBullets([item, ...bullets]);
    } catch (e) {
      fail(e, 'Could not rewrite that bullet. Please try again.');
    } finally {
      setIsRewriting(false);
    }
  };

  const handleFinishInterviewAnswer = async () => {
    if (isListening) {
      stopListening();
    }
    const finalAnswer = transcript.trim();
    if (finalAnswer.split(/\s+/).filter(Boolean).length < 5) {
      toast.info('Record or type a longer answer first.');
      return;
    }
    setIsEvaluating(true);
    try {
      const feedback = await api.evaluateInterview(
        finalAnswer,
        duration || 45,
        questions[activeQIndex]?.prompt ?? '',
      );
      setInterviewFeedback(feedback);
    } catch (e) {
      fail(e, 'Could not evaluate your answer. Please try again.');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-6xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Career Acceleration Hub
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Bridge JD skill gaps, quantify resume achievements, master targeted roadmaps, and rehearse with voice mock interviews
          </p>
        </div>
      </div>

      {/* Career Sub-Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
          <TabsTrigger value="analyzer" className="text-xs">
            Skill-Gap & ATS
          </TabsTrigger>
          <TabsTrigger value="rewriter" className="text-xs">
            Bullet Rewriter
          </TabsTrigger>
          <TabsTrigger value="roadmap" className="text-xs">
            Skill Roadmap
          </TabsTrigger>
          <TabsTrigger value="interview" className="text-xs">
            Voice Mock Interview
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: SKILL-GAP & ATS ANALYZER */}
        <TabsContent value="analyzer" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Your Resume Text / Experience
              </label>
              <Textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume text here"
                rows={6}
                className="text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Target Job Description (JD)
              </label>
              <Textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                placeholder="Paste the job description here"
                rows={6}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleRunAnalysis} disabled={isAnalyzing} className="text-xs">
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              <span>{isAnalyzing ? 'Analyzing…' : analysis ? 'Recalculate ATS Match' : 'Analyze Match'}</span>
            </Button>
          </div>

          {analysis && (
            <div className="space-y-6 pt-2">
              {/* ATS Gauge & Score Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="flex flex-col items-center justify-center p-6">
                  <MatchGauge score={analysis.overallMatchScore} />
                  <span className="text-[11px] text-slate-400 mt-2">
                    {analysis.jobTitle}
                  </span>
                </Card>

                {/* ATS Checklist & Metric Pillars */}
                <Card className="md:col-span-2 p-6 space-y-4">
                  <CardTitle className="text-sm">ATS Metric Dimension Breakdown</CardTitle>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                    {Object.entries(analysis.resumeScoreBreakdown).map(([k, v]) => (
                      <div key={k} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
                        <span className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                          {v}%
                        </span>
                        <span className="text-[10px] uppercase text-slate-400 font-semibold block mt-0.5">
                          {k}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      ATS Parsing Recommendations:
                    </span>
                    {analysis.atsChecklist.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        {item.passed ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        )}
                        <span className="font-medium text-slate-800 dark:text-slate-200">{item.item}:</span>
                        <span className="text-slate-500">{item.tip}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Skill Chips Grouped */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Skill Coverage Spectrum
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Matched */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Strongly Matched ({analysis.matchedSkills.length})</span>
                    </span>
                    <div className="space-y-2">
                      {analysis.matchedSkills.map((s, i) => (
                        <SkillChip key={i} name={s.name} status="matched" subtitle={s.evidence} />
                      ))}
                    </div>
                  </div>

                  {/* Partial */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>Partial Coverage ({analysis.partialSkills.length})</span>
                    </span>
                    <div className="space-y-2">
                      {analysis.partialSkills.map((s, i) => (
                        <SkillChip key={i} name={s.name} status="partial" subtitle={s.gap} />
                      ))}
                    </div>
                  </div>

                  {/* Missing */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>Critical Gaps ({analysis.missingSkills.length})</span>
                    </span>
                    <div className="space-y-2">
                      {analysis.missingSkills.map((s, i) => (
                        <SkillChip
                          key={i}
                          name={s.name}
                          status="missing"
                          priority={s.priority}
                          subtitle={`Resource: ${s.recommendedResource}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* TAB 2: BULLET REWRITER */}
        <TabsContent value="rewriter" className="space-y-6">
          <Card className="p-6 space-y-4">
            <CardTitle className="text-sm">Transform Passive Experience into Quantified Results</CardTitle>
            <p className="text-xs text-slate-500">
              Paste any bullet point from your resume. StudyPilot applies the XYZ formula (Accomplished [X], as measured by [Y], by doing [Z]).
            </p>
            <div className="flex gap-2">
              <Textarea
                value={bulletInput}
                onChange={(e) => setBulletInput(e.target.value)}
                placeholder="e.g. Optimized database queries and improved speed."
                className="text-xs"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRewrite('concise')}
                disabled={isRewriting}
                className="text-xs"
              >
                Make Concise
              </Button>
              <Button size="sm" onClick={() => handleRewrite('quantified')} disabled={isRewriting} className="text-xs">
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                <span>{isRewriting ? 'Quantifying...' : 'Quantify Impact'}</span>
              </Button>
            </div>
          </Card>

          {/* Generated Rewrites */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Rewritten Resume Bullets
            </h3>
            {bullets.length === 0 ? (
              <DiffView
                item={{
                  id: 'demo_br',
                  original: 'Worked on database queries and made them faster for the web app.',
                  improved: 'Optimized PostgreSQL queries by restructuring composite B-Tree indexes, reducing P99 latency by 58% (340ms to 142ms) across 2.4M daily requests.',
                  diffSummary: '+ composite indexes, + P99 latency 58%, + 2.4M volume',
                  quantificationScore: 94,
                  metricAdded: '58% latency reduction across 2.4M requests',
                }}
                onQuantifyMore={() => handleRewrite('quantified')}
                onMakeShorter={() => handleRewrite('concise')}
              />
            ) : (
              bullets.map((b) => (
                <DiffView
                  key={b.id}
                  item={b}
                  onQuantifyMore={() => handleRewrite('quantified')}
                  onMakeShorter={() => handleRewrite('concise')}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* TAB 3: LEARNING ROADMAP */}
        <TabsContent value="roadmap" className="space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Target Skill Gap Sprint Roadmap
              </h3>
              <p className="text-xs text-slate-500">
                Weekly milestones generated from your job description deficits
              </p>
            </div>
          </div>

          {milestones.length === 0 && (
            <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
              {isPreparing
                ? 'Building your roadmap…'
                : 'Run the analysis on the first tab and your personalised roadmap appears here.'}
            </div>
          )}
          <div className="relative pl-6 space-y-6 border-l-2 border-emerald-500/30">
            {milestones.map((m) => (
              <div key={m.id} className="relative space-y-2">
                <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-emerald-500">
                      WEEK {m.week} · {m.estimatedHours} HOURS
                    </span>
                    {m.isCompleted && (
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                        Completed
                      </span>
                    )}
                  </div>

                  <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {m.title}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {m.description}
                  </p>

                  <div className="pt-2 flex flex-wrap gap-1.5">
                    {m.skillsGained.map((skill, i) => (
                      <span key={i} className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">
                        {skill}
                      </span>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      Resource: {m.resources[0]?.name}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setMilestones((prev) => prev.map((x) => (x.id === m.id ? { ...x, isCompleted: !x.isCompleted } : x)))
                      }
                      className="text-xs h-7"
                    >
                      <CheckIcon className="h-3 w-3 mr-1" />
                      <span>{m.isCompleted ? 'Undo' : 'Mark complete'}</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* TAB 4: VOICE MOCK INTERVIEW */}
        <TabsContent value="interview" className="space-y-6">
          {questions.length === 0 && (
            <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
              {isPreparing
                ? 'Writing interview questions for this role…'
                : 'Run the analysis on the first tab and interview questions for that role appear here.'}
            </div>
          )}
          {questions.length > 0 && (
            <div className="space-y-6">
              {/* Question Card */}
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-emerald-500 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">
                      Question {activeQIndex + 1} of {questions.length}
                    </span>
                    <span className="text-slate-400 uppercase font-mono">
                      Source: {questions[activeQIndex].source} ({questions[activeQIndex].type})
                    </span>
                  </div>

                  <button
                    onClick={() => speak(questions[activeQIndex].prompt)}
                    className="flex items-center gap-1 text-slate-500 hover:text-emerald-500 text-xs cursor-pointer"
                    title="Read aloud"
                  >
                    <Volume2 className="h-4 w-4" />
                    <span>{isSpeaking ? 'Reading...' : 'Listen'}</span>
                  </button>
                </div>

                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                  "{questions[activeQIndex].prompt}"
                </div>

                {/* Expected keywords tag */}
                <div className="pt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                  <span>Target keywords:</span>
                  {questions[activeQIndex].expectedKeywords.map((kw, i) => (
                    <span key={i} className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                      {kw}
                    </span>
                  ))}
                </div>
              </Card>

              {/* Voice Recording / Dictation Arena */}
              <Card className="p-6 space-y-4 text-center">
                <Waveform isRecording={isListening} />

                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="flex items-center gap-3">
                    <Button
                      size="lg"
                      onClick={() => (isListening ? stopListening() : startListening())}
                      className={`text-xs px-6 ${
                        isListening
                          ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      {isListening ? (
                        <>
                          <Square className="h-4 w-4 mr-1.5 fill-current" />
                          <span>Stop Recording ({duration}s)</span>
                        </>
                      ) : (
                        <>
                          <Mic className="h-4 w-4 mr-1.5" />
                          <span>Record with Voice (Web Speech)</span>
                        </>
                      )}
                    </Button>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    {isListening
                      ? 'Listening to your microphone cadence in real time...'
                      : 'You can also type or edit your response in the transcript box below.'}
                  </p>
                </div>

                {/* Editable Transcript */}
                <div className="text-left pt-2">
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Your Response Transcript
                  </label>
                  <Textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Transcript appears here as you speak, or type your answer..."
                    rows={3}
                    className="text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={handleFinishInterviewAnswer}
                    disabled={isEvaluating}
                    className="text-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    <span>{isEvaluating ? 'Evaluating Speech...' : 'Finish & Evaluate Answer'}</span>
                  </Button>
                </div>
              </Card>

              {/* Feedback Radar & Rubric breakdown */}
              {interviewFeedback && (
                <div className="space-y-6 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Rubric Radar */}
                    <Card className="p-5">
                      <CardTitle className="text-sm mb-2">Performance Rubric Radar</CardTitle>
                      <RubricRadar scores={interviewFeedback.rubric} />
                    </Card>

                    {/* Cadence Metrics: WPM and Fillers */}
                    <Card className="p-6 flex flex-col justify-between space-y-4">
                      <CardTitle className="text-sm">Speech Cadence & Filler Detection</CardTitle>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-center">
                          <span className="font-mono text-3xl font-extrabold text-emerald-500">
                            {interviewFeedback.speakingPaceWpm}
                          </span>
                          <span className="text-[10px] uppercase text-slate-400 font-semibold block mt-1">
                            Words / Min (Optimal: 120-150)
                          </span>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-center">
                          <span className="font-mono text-3xl font-extrabold text-amber-500">
                            {interviewFeedback.fillerCount}
                          </span>
                          <span className="text-[10px] uppercase text-slate-400 font-semibold block mt-1">
                            Filler Words Flagged
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                          Flagged Fillers:
                        </span>
                        <p className="font-mono text-[11px] text-amber-500">
                          {interviewFeedback.fillerWords.join(', ')}
                        </p>
                      </div>
                    </Card>
                  </div>

                  {/* Strengths and Suggested Model Answer */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="p-5 space-y-3">
                      <CardTitle className="text-sm text-emerald-600 dark:text-emerald-400">
                        Observed Strengths
                      </CardTitle>
                      <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc pl-4">
                        {interviewFeedback.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </Card>

                    <Card className="p-5 space-y-3">
                      <CardTitle className="text-sm text-amber-600 dark:text-amber-400">
                        Improvement Vectors
                      </CardTitle>
                      <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc pl-4">
                        {interviewFeedback.improvements.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </Card>
                  </div>

                  {/* Model Answer Recommendation */}
                  <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-2 text-xs">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[11px] block">
                      Recommended High-Scoring STAR Model Answer:
                    </span>
                    <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                      "{interviewFeedback.modelAnswer}"
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
