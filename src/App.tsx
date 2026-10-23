/**
 * StudyPilot - AI Study & Career Copilot
 * Root Application Router & Global Context Providers
 */
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { AppShell } from './components/layout/AppShell';
import { TooltipProvider } from './components/ui/tooltip';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { PublicOnlyRoute } from './components/auth/PublicOnlyRoute';
import { OnboardingRoute } from './components/auth/OnboardingRoute';
import { queryClient } from './lib/queryClient';
import { useSettingsStore, isDarkTheme } from './store/useSettingsStore';

// Lazy-loaded route components for performance & code-splitting
const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then(m => ({ default: m.AuthPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const QuickAskPage = lazy(() => import('./pages/QuickAskPage').then(m => ({ default: m.QuickAskPage })));
const ChatPage = lazy(() => import('./pages/ChatPage').then(m => ({ default: m.ChatPage })));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage').then(m => ({ default: m.DocumentsPage })));
const SummariesPage = lazy(() => import('./pages/SummariesPage').then(m => ({ default: m.SummariesPage })));
const QuizzesPage = lazy(() => import('./pages/QuizzesPage').then(m => ({ default: m.QuizzesPage })));
const FlashcardsPage = lazy(() => import('./pages/FlashcardsPage').then(m => ({ default: m.FlashcardsPage })));
const MindMapPage = lazy(() => import('./pages/MindMapPage').then(m => ({ default: m.MindMapPage })));
const StudyPlannerPage = lazy(() => import('./pages/StudyPlannerPage').then(m => ({ default: m.StudyPlannerPage })));
const WeakTopicsPage = lazy(() => import('./pages/WeakTopicsPage').then(m => ({ default: m.WeakTopicsPage })));
const ExamPredictorPage = lazy(() => import('./pages/ExamPredictorPage').then(m => ({ default: m.ExamPredictorPage })));
const CareerPage = lazy(() => import('./pages/CareerPage').then(m => ({ default: m.CareerPage })));
const RoomsPage = lazy(() => import('./pages/RoomsPage').then(m => ({ default: m.RoomsPage })));
const RoomPage = lazy(() => import('./pages/RoomPage').then(m => ({ default: m.RoomPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage').then(m => ({ default: m.DesignSystemPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-foreground">
      <div className="relative w-12 h-12 mb-4">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
        <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
      <p className="text-sm font-medium text-muted-foreground animate-pulse">Loading StudyPilot workspace...</p>
    </div>
  );
}

export default function App() {
  const theme = useSettingsStore((st) => st.theme);
  // Re-render when the OS scheme flips while on "system" so the Toaster follows.
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', force);
    return () => mq.removeEventListener('change', force);
  }, [theme]);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <BrowserRouter>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              {/* Public Landing Page */}
              <Route path="/" element={<LandingPage />} />

              {/* Authentication & Onboarding Routes */}
              <Route element={<PublicOnlyRoute />}>
                <Route path="/login" element={<AuthPage />} />
                <Route path="/signup" element={<AuthPage />} />
                <Route path="/forgot-password" element={<AuthPage />} />
              </Route>
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route element={<OnboardingRoute />}>
                <Route path="/onboarding" element={<OnboardingPage />} />
              </Route>

              {/* Dev-only Design System Tokens & Primitives */}
              <Route path="/design" element={<DesignSystemPage />} />

              {/* Protected Application Workspace Shell */}
              <Route element={<ProtectedRoute />}>
              <Route path="/app" element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="ask" element={<QuickAskPage />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="documents" element={<DocumentsPage />} />
                <Route path="summaries" element={<SummariesPage />} />
                <Route path="quizzes" element={<QuizzesPage />} />
                <Route path="flashcards" element={<FlashcardsPage />} />
                <Route path="mindmap" element={<MindMapPage />} />
                <Route path="planner" element={<StudyPlannerPage />} />
                <Route path="weak-topics" element={<WeakTopicsPage />} />
                <Route path="exam-predictor" element={<ExamPredictorPage />} />
                <Route path="career" element={<CareerPage />} />
                <Route path="rooms" element={<RoomsPage />} />
                <Route path="rooms/:code" element={<RoomPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              </Route>

              {/* 404 Fallback */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>

          {/* Global Sonner Toast Notifications */}
          <Toaster position="bottom-right" richColors closeButton theme={isDarkTheme(theme) ? 'dark' : 'light'} />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
