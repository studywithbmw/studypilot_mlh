/**
 * Global application constants
 * Product name is centralized here so it can be renamed across the entire app.
 */
export const PRODUCT_NAME = 'StudyPilot';
export const PRODUCT_TAGLINE = 'AI Study & Career Copilot';
export const PRODUCT_VERSION = '1.0.0';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const EXPLANATION_LEVELS = [
  { id: 'eli5', label: 'ELI5', description: 'Simple, intuitive, analogical explanations' },
  { id: 'student', label: 'Student', description: 'Curriculum-focused, balanced, comprehensive' },
  { id: 'expert', label: 'Expert', description: 'Deep technical, mathematically rigorous, nuanced' },
] as const;

export type ExplanationLevel = (typeof EXPLANATION_LEVELS)[number]['id'];

/**
 * Model aliases offered in the UI. The ids are stable app-level aliases — the
 * backend maps them to concrete provider model ids from its env, so this file
 * never hardcodes a model id that can go stale.
 *
 * Names below are verified against the providers' official model pages
 * (Oct 2026): console.groq.com/docs/models and ai.google.dev/gemini-api/docs/models.
 */
export const AI_MODELS = [
  { id: 'auto', name: 'Auto (Groq first, Gemini fallback)', provider: 'Adaptive' },
  { id: 'groq-llama', name: 'Groq - GPT-OSS 120B (fast)', provider: 'Groq' },
  { id: 'gemini-long', name: 'Gemini 3 Flash (long context)', provider: 'Google' },
] as const;

export type AIModelId = (typeof AI_MODELS)[number]['id'];
