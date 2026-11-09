import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema';
import { useLocalSqlite } from './config';

// Module-level cache across warm lambda invocations
let sqlClient: postgres.Sql | null = null;
let drizzleDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function isPostgresConfigured(): boolean {
  return !useLocalSqlite() && Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '');
}

export function getPostgresClient() {
  if (!isPostgresConfigured()) {
    return null;
  }

  if (!sqlClient) {
    const connectionString = process.env.DATABASE_URL!;
    sqlClient = postgres(connectionString, {
      // MANDATORY for Supabase Transaction Pooler (PgBouncer on port 6543)
      prepare: false,
      // Conservative connection limit to prevent pooler exhaustion across scaling lambdas
      max: 1,
      idle_timeout: 15,
      connect_timeout: 10,
    });

    drizzleDb = drizzle(sqlClient, { schema });
  }

  return drizzleDb;
}

export const pgDb = getPostgresClient();
