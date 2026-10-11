// Connects Stripe TEST directly to localhost without exposing it publicly.
const { loadEnvConfig } = require('@next/env');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
loadEnvConfig(process.cwd());
if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw Error('Stripe TEST required');
const shim = path.join(process.env.APPDATA, 'npm/node_modules/@stripe/cli/bin/shim.js');
if (!fs.existsSync(shim)) throw Error('Install the official Stripe CLI first');
const cli = spawn(process.execPath, [shim, 'listen', '--skip-update', '--events',
  'refund.created,refund.updated,refund.failed,account.updated,checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,payment_intent.payment_failed,payment_intent.canceled',
  '--forward-to', 'http://localhost:3000/api/webhooks/stripe'], {
  env: { ...process.env, STRIPE_API_KEY: process.env.STRIPE_SECRET_KEY },
  windowsHide: true,
});
let configured = false;
let buffered = '';
function consume(chunk) {
  const text = chunk.toString();
  buffered = (buffered + text).slice(-8192);
  const secret = buffered.match(/whsec_[A-Za-z0-9]+/)?.[0];
  if (secret && !configured) {
    const envPath = '.env.local';
    const contents = fs.existsSync(envPath) ? fs.readFileSync(envPath,'utf8') : '';
    fs.mkdirSync('.routeflow-data',{recursive:true});
    fs.writeFileSync('.routeflow-data/env-local-before-stripe-listen.txt',contents);
    const replacement = `STRIPE_WEBHOOK_SECRET=${secret}`;
    const updated = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(contents)
      ? contents.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m,replacement)
      : `${contents}\n${replacement}\n`;
    fs.writeFileSync(envPath,updated);
    configured = true;
    console.log('Local signing secret configured in .env.local (redacted).');
  }
  process.stdout.write(text.replace(/whsec_[A-Za-z0-9]+/g,'[REDACTED]')
    .replace(/(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+/g,'[REDACTED]'));
}
cli.stdout.on('data',consume);
cli.stderr.on('data',consume);
cli.on('error',error=>{console.error(error.message);process.exitCode=1;});
cli.on('exit',code=>{process.exitCode=code || 0;});
process.on('SIGINT',()=>cli.kill());
process.on('SIGTERM',()=>cli.kill());
