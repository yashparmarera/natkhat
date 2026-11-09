import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env to provision an admin.');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = process.env.ADMIN_EMAIL || process.argv[2] || 'admin@natkhatcafe.com';
  const fullName = process.env.ADMIN_NAME || 'Store Administrator';

  // Generate cryptographically secure one-time password
  const generatedPassword = crypto.randomBytes(18).toString('base64url') + '!A9';

  console.log(`\n[Admin Provisioning] Initializing admin account for: ${email}`);

  // Create user in Supabase Auth
  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: generatedPassword,
    email_confirm: true,
  });

  let userId: string;

  if (authError) {
    if (authError.message.includes('already registered') || (authError as any).code === 'email_exists') {
      console.log('[Admin Provisioning] Account already exists in Supabase Auth. Fetching user ID...');
      const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;
      const existing = users.users.find((u) => u.email === email);
      if (!existing) throw new Error('User reported existing but not found in user list');
      userId = existing.id;
    } else {
      throw authError;
    }
  } else {
    userId = authUser.user.id;
  }

  // Insert or update profile row in PostgreSQL
  const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
    id: userId,
    email,
    full_name: fullName,
    role: 'admin',
    is_active: true,
  });

  if (profileError) throw profileError;

  console.log('\n================================================================');
  console.log('✔ ADMINISTRATOR PROVISIONED SUCCESSFULLY');
  console.log(`  User ID:   ${userId}`);
  console.log(`  Email:     ${email}`);
  if (!authError) {
    console.log(`  Password:  ${generatedPassword}`);
    console.log('\n  IMPORTANT: Save this password now. It will not be shown again.');
  } else {
    console.log('  Password:  [Unchanged - Existing Account]');
  }
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('[Admin Provisioning] FAILED:', err);
  process.exit(1);
});
