import { createClient } from '@supabase/supabase-js';
import { useLocalSqlite, getSupabaseUrl, getSupabaseServiceKey, getSupabaseAnonKey } from './config';

const supabaseUrl = getSupabaseUrl();
const supabaseServiceKey = getSupabaseServiceKey();
const supabaseAnonKey = getSupabaseAnonKey();
const localMode = useLocalSqlite();

export const isSupabaseConfigured = !localMode && Boolean(supabaseUrl && supabaseServiceKey);

// Service-role client. Use ONLY for auth.getUser(token) (server-side JWT verification) and
// auth.admin.*. NEVER call signInWithPassword on it.
export const supabaseAdmin = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Anon-key client. Use ONLY for signInWithPassword.
export const supabaseAuth =
  !localMode && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;
