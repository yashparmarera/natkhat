import { validateTransition } from '../../src/utils/orderStatus';

function clean(value: string | undefined): string {
  return (value || '').trim();
}

async function restRequest(path: string, token: string, options: { method?: string; body?: unknown } = {}) {
  const supabaseUrl =
    clean(process.env.SUPABASE_URL) || clean(process.env.VITE_SUPABASE_URL);
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) throw new Error('Service misconfigured');

  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${response.status}: ${body}`);
  }
  if (response.status === 204) return [];
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function verifyStaff(req: any): Promise<boolean> {
  const authorization = req.headers?.authorization;
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  if (!token) return false;
  const supabaseUrl =
    clean(process.env.SUPABASE_URL) || clean(process.env.VITE_SUPABASE_URL);
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) return false;

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
  });
  if (!authResponse.ok) return false;
  const user = await authResponse.json();
  if (!user?.id) return false;

  const profiles = await restRequest(
    `/profiles?select=role,is_active&id=eq.${encodeURIComponent(user.id)}`,
    token
  );
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  return Boolean(profile?.is_active && ['admin', 'manager', 'staff'].includes(profile.role));
}

export default async function status(req: any, res: any) {
  if (req.method !== 'PATCH') {
    res.statusCode = 405;
    res.setHeader('Allow', 'PATCH');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    if (!(await verifyStaff(req))) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unauthorized: Session invalid or expired' }));
      return;
    }

    const pathname = String(req.url || '').split('?')[0];
    const match = pathname.match(/\/api\/orders\/([^/]+)\/status$/);
    if (!match) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid order number' }));
      return;
    }
    const referenceId = decodeURIComponent(match[1]).trim().toUpperCase();
    let payload = req.body;
    if (typeof payload === 'string') payload = JSON.parse(payload);
    const nextStatus = payload?.status;

    const rows = await restRequest(
      `/orders?select=reference_id,order_type,status&id=eq.${encodeURIComponent(referenceId)}`,
      ''
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unknown order' }));
      return;
    }
    const row = rows[0];
    const transition = validateTransition(row.order_type, row.status, nextStatus);
    if (!transition.ok) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: transition.message, currentStatus: row.status }));
      return;
    }

    await restRequest(
      `/orders?reference_id=eq.${encodeURIComponent(referenceId)}`,
      '',
      {
        method: 'PATCH',
        body: { status: nextStatus, updated_at: new Date().toISOString() },
      }
    );
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, referenceId, status: nextStatus }));
  } catch (error) {
    console.error('[Natkhat Cafe] Status update failed:', error instanceof Error ? error.message : 'Unknown error');
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to update order status' }));
  }
}
