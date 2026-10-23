/**
 * Public (browser-safe) configuration. Only four VITE_ variables are allowed
 * in the frontend; backend secrets must never appear here.
 */

export interface PublicEnv {
  useMock: boolean;
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function readEnv(raw: ImportMetaEnv): PublicEnv {
  return {
    // Demo mode is the default so a fresh clone runs with no backend.
    useMock: raw.VITE_USE_MOCK !== 'false',
    apiUrl: (raw.VITE_API_URL || 'http://localhost:7860/api/v1').replace(/\/+$/, ''),
    supabaseUrl: (raw.VITE_SUPABASE_URL || '').trim(),
    supabaseAnonKey: (raw.VITE_SUPABASE_ANON_KEY || '').trim(),
  };
}

const env = readEnv(import.meta.env);

export const USE_MOCK = env.useMock;
export const API_URL = env.apiUrl;
export const SUPABASE_URL = env.supabaseUrl;
export const SUPABASE_ANON_KEY = env.supabaseAnonKey;

/** Real mode needs both Supabase values; otherwise the login page explains why. */
export const isSupabaseConfigured =
  SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 0;
