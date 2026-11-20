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
  try {
    appPromise ??= import('../src/server/app');
    return (await appPromise).app(req, res);
  } catch (err: any) {
    const detail = err instanceof Error ? err.message : 'Unknown API initialization failure';
    console.error(`[Natkhat Cafe] API initialization failed: ${detail}`);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({
      error: 'API initialization failed',
      detail,
    }));
  }
}
