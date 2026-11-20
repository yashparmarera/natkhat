function clean(value: string | undefined): string {
  return (value || '').trim();
}

function sendJson(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function login(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const supabaseUrl =
    clean(process.env.SUPABASE_URL) || clean(process.env.VITE_SUPABASE_URL);
  const anonKey =
    clean(process.env.SUPABASE_ANON_KEY) ||
    clean(process.env.VITE_SUPABASE_ANON_KEY) ||
    clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !anonKey || !serviceKey) {
    sendJson(res, 503, { error: 'Authentication service is not configured' });
    return;
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      sendJson(res, 400, { error: 'Invalid request' });
      return;
    }
  }

  const username = clean(payload?.username);
  const password = payload?.password;
  if (!username || !password) {
    sendJson(res, 400, { error: 'Username and password required' });
    return;
  }

  const email = username.includes('@') ? username : `${username}@natkhatcafe.com`;

  try {
    const authResponse = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      }
    );

    if (!authResponse.ok) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const authData = await authResponse.json();
    const accessToken = authData?.access_token;
    const user = authData?.user;
    if (!accessToken || !user?.id) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=id,email,full_name,role,is_active&id=eq.${encodeURIComponent(user.id)}`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );
    if (!profileResponse.ok) {
      sendJson(res, 500, { error: 'Unable to verify staff account' });
      return;
    }
    const profiles = await profileResponse.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile) {
      sendJson(res, 403, { error: 'Account is not authorised for the staff portal' });
      return;
    }
    if (!profile.is_active) {
      sendJson(res, 403, { error: 'This staff account is inactive' });
      return;
    }
    if (!['admin', 'manager', 'staff'].includes(profile.role)) {
      sendJson(res, 403, { error: 'Account is not authorised for the staff portal' });
      return;
    }

    sendJson(res, 200, {
      success: true,
      token: accessToken,
      user: {
        id: profile.id,
        username: profile.email,
        role: profile.role,
      },
    });
  } catch (error) {
    console.error(
      '[StaffLogin] Authentication request failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    sendJson(res, 500, { error: 'Authentication server unavailable' });
  }
}
