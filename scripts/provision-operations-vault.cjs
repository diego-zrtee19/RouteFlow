// One-time setup: the administrator installs the restricted temporary RPC first.
// Credentials are read locally and sent only to the explicitly named existing project.
const fs = require('node:fs');
const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), true);
const { createClient } = require('@supabase/supabase-js');

async function main() {
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://xnnkcgzijlpwxnvarqng.supabase.co');
  const line = fs.readFileSync('.routeflow-data/vercel-preview-import.env', 'utf8')
    .split(/\r?\n/).find(value => value.startsWith('CRON_SECRET='));
  assert.ok(line, 'Preview operations secret must exist locally');
  const secret = JSON.parse(line.slice('CRON_SECRET='.length));
  assert.ok(secret.length >= 32);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY, {auth: {persistSession: false}});
  const {error} = await db.rpc('routeflow_provision_preview_operations', {p_secret: secret});
  if (error) throw Error('Vault provisioning failed: ' + error.code);
  console.log('Preview operations credential stored in Vault. No credentials printed.');
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
