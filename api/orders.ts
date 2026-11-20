import { getMissingConfig } from '../src/server/config';

export default async function orders(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const missing = getMissingConfig();
  if (missing.length > 0) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Service misconfigured' }));
    return;
  }

  try {
    const { validateAndCreateOrder } = await import('../src/server/orderValidator');
    let payload = req.body;
    if (typeof payload === 'string') {
      payload = JSON.parse(payload);
    }
    const result = await validateAndCreateOrder(payload);
    res.statusCode = result.success ? 201 : 400;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(result.success ? result.order : { error: result.error }));
  } catch (err: any) {
    console.error('[Natkhat Cafe] Order API failed:', err instanceof Error ? err.message : 'Unknown error');
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Server error while validating order' }));
  }
}
