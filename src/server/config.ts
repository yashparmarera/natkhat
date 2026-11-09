import './loadEnv';
import { isPlaceholder } from './loadEnv';

/**
 * Runtime mode (single source of truth).
 * - Production runtime: NODE_ENV === 'production' OR VERCEL is set.
 *   Uses Supabase PostgreSQL + Supabase Auth only. Missing config fails closed.
 * - Local SQLite mode: NOT production AND (USE_LOCAL_SQLITE === 'true' OR DATABASE_URL empty).
 *   USE_LOCAL_SQLITE never overrides production.
 * - Otherwise (non-production with DATABASE_URL): Postgres + Supabase, validated like production.
 * All functions read process.env at call time and never return secret values.
 */

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

function clean(value: string | undefined): string {
  const v = (value || '').trim();
  return v === '' || isPlaceholder(v) ? '' : v;
}

export function useLocalSqlite(): boolean {
  if (isProductionRuntime()) return false;
  return process.env.USE_LOCAL_SQLITE === 'true' || clean(process.env.DATABASE_URL) === '';
}

export function getSupabaseUrl(): string {
  return clean(process.env.SUPABASE_URL) || clean(process.env.VITE_SUPABASE_URL);
}

export function getSupabaseServiceKey(): string {
  return clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAnonKey(): string {
  return clean(process.env.SUPABASE_ANON_KEY) || clean(process.env.VITE_SUPABASE_ANON_KEY);
}

export function getDatabaseUrl(): string {
  return clean(process.env.DATABASE_URL);
}

/** Names (never values) of required variables that are missing. Empty in local SQLite mode. */
export function getMissingConfig(): string[] {
  if (useLocalSqlite()) return [];
  const missing: string[] = [];
  if (!getDatabaseUrl()) missing.push('DATABASE_URL');
  if (!getSupabaseUrl()) missing.push('SUPABASE_URL');
  if (!getSupabaseServiceKey()) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!getSupabaseAnonKey()) missing.push('SUPABASE_ANON_KEY');
  return missing;
}

export function isRuntimeConfigValid(): boolean {
  return getMissingConfig().length === 0;
}
