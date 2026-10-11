const assert = require('node:assert/strict');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd(), false);
const {createClient} = require('@supabase/supabase-js');

async function main() {
  const ref = process.env.ROUTEFLOW_PRODUCTION_PROJECT_REF;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.ok(ref && ref !== 'xnnkcgzijlpwxnvarqng', 'A separate production project is required');
  assert.equal(url, `https://${ref}.supabase.co`, 'Project URL mismatch');
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, 'Server credential is required');
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.ok(publicKey, 'Publishable key is required');
  const options = {auth: {persistSession: false, autoRefreshToken: false}};
  const server = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
  const publicClient = createClient(url, publicKey, options);
  const settings = await fetch(`${url}/auth/v1/settings`, {headers: {apikey: publicKey}});
  assert.equal(settings.status, 200, 'Publishable key could not authenticate to this project');
  for (const table of ['sellers', 'orders', 'payments', 'notification_outbox']) {
    const privileged = await server.from(table).select('id', {head: true, count: 'exact'});
    assert.equal(privileged.error, null, `Server cannot access ${table}`);
    const denied = await publicClient.from(table).select('id').limit(1);
    assert.ok(denied.error && ['42501', 'PGRST205'].includes(denied.error.code),
      `Public access is not explicitly blocked for ${table}`);
    console.log(`OK: ${table}, server access and public access blocked`);
  }
  const report = {projectRef: ref, checkedAt: new Date().toISOString(),
    serverAccess: true, publishableKeyValid: true, publicDataAccessBlocked: true};
  fs.mkdirSync('.routeflow-data', {recursive: true});
  fs.writeFileSync('.routeflow-data/production-database-verification.json', JSON.stringify(report, null, 2));
  console.log('Database API verified. This does not enable or verify LIVE payments.');
}
main().catch(error => {
  const message = String(error.message).split('\n')[0]
    .replace(/(?:sb_secret_|eyJ)[A-Za-z0-9_.-]+/g, '[redacted]');
  console.error(`Database verification failed: ${message}`);
  process.exitCode = 1;
});
