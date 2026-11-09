import { getMissingConfig } from '../src/server/config';

// Vercel Serverless Function entry point (Node.js runtime).
// Fails closed: if required Supabase config is missing, every request gets 503 and the app
// (and therefore SQLite/Postgres) is never loaded.
let appPromise: Promise<typeof import('../src/server/app')> | null = null;

export default async function handler(req: any, res: any) {
  const missing = getMissingConfig();
  if (missing.length > 0) {
    console.error(`[Natkhat Cafe] Service misconfigured; missing: ${missing.join(', ')}`);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Service misconfigured' }));
    return;
  }
  appPromise ??= import('../src/server/app');
  return (await appPromise).app(req, res);
}
