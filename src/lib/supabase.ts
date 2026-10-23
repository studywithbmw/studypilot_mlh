import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, USE_MOCK, isSupabaseConfigured } from './env';

let client: SupabaseClient | null = null;

/**
 * The browser Supabase client (anon key only). Returns null in demo mode or
 * when the public Supabase variables are missing, so callers can show a clear
 * message instead of crashing at import time.
 */
export function getSupabase(): SupabaseClient | null {
  if (USE_MOCK || !isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  }
  return client;
}
