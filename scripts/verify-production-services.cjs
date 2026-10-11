const fs = require('node:fs');

// Read-only provider checks: never creates mail, payments, shipments or transfers.
async function verifyServices(env, request = fetch) {
  const checks = [];
  async function run(name, configured, verify) {
    if (!configured) { checks.push({name, status: 'PENDING', reason: 'Configuración real pendiente'}); return; }
    try { await verify(); checks.push({name, status: 'VERIFIED'}); }
    catch (error) { checks.push({name, status: 'FAILED', reason: error.code || 'No se pudo verificar; revisar acceso y configuración'}); }
  }
  async function json(url, options) {
    const response = await request(url, {...options, redirect: 'error', signal: AbortSignal.timeout(20000)});
    if (!response.ok) throw Object.assign(new Error(), {code: `HTTP_${response.status}`});
    return response.json();
  }
  await run('Stripe: cuenta LIVE habilitada', env.STRIPE_SECRET_KEY?.startsWith('sk_live_'), async () => {
    const headers = {Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`};
    const balance = await json('https://api.stripe.com/v1/balance', {headers});
    const account = await json('https://api.stripe.com/v1/account', {headers});
    if (!balance.livemode || !account.charges_enabled || !account.payouts_enabled)
      throw Object.assign(new Error(), {code: 'LIVE_ACCOUNT_NOT_READY'});
  });
  await run('FedEx: autenticación de producción', env.FEDEX_BASE_URL === 'https://apis.fedex.com' &&
    env.FEDEX_CLIENT_ID && env.FEDEX_CLIENT_SECRET && env.FEDEX_ACCOUNT_NUMBER, async () => {
    const token = await json('https://apis.fedex.com/oauth/token', {
      method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({grant_type: 'client_credentials', client_id: env.FEDEX_CLIENT_ID,
        client_secret: env.FEDEX_CLIENT_SECRET}).toString(),
    });
    if (!token.access_token) throw Object.assign(new Error(), {code: 'NO_ACCESS_TOKEN'});
  });
  const address = (env.ROUTEFLOW_EMAIL_FROM || '').match(/(?:^|<)([^<>\s]+@[^<>\s]+)>?$/)?.[1];
  const domain = address?.split('@')[1]?.toLowerCase();
  await run('Resend: dominio del remitente verificado', env.RESEND_API_KEY && domain, async () => {
    if (domain === 'resend.dev' || domain.endsWith('.vercel.app'))
      throw Object.assign(new Error(), {code: 'OWN_SENDER_DOMAIN_REQUIRED'});
    let after;
    for (let page = 0; page < 25; page++) {
      const query = new URLSearchParams({limit: '100'});
      if (after) query.set('after', after);
      const domains = await json(`https://api.resend.com/domains?${query}`, {
        headers: {Authorization: `Bearer ${env.RESEND_API_KEY}`},
      });
      const match = domains.data?.find(item => item.name?.toLowerCase() === domain);
      if (match) {
        if (match.status !== 'verified') throw Object.assign(new Error(), {code: 'DOMAIN_NOT_VERIFIED'});
        return;
      }
      if (!domains.has_more) break;
      after = domains.data?.at(-1)?.id;
      if (!after) break;
    }
    throw Object.assign(new Error(), {code: 'DOMAIN_NOT_FOUND'});
  });
  return {checkedAt: new Date().toISOString(), checks,
    ready: checks.every(check => check.status === 'VERIFIED'),
    limitations: ['No valida entrega de correo, tarifas/etiquetas FedEx, Connect ni webhooks LIVE.']};
}

module.exports = {verifyServices};
if (require.main === module) {
  require('@next/env').loadEnvConfig(process.cwd(), false);
  verifyServices(process.env).then(report => {
    fs.mkdirSync('.routeflow-data', {recursive: true});
    fs.writeFileSync('.routeflow-data/production-services-verification.json', JSON.stringify(report, null, 2));
    for (const check of report.checks) console.log(`${check.status}: ${check.name}${check.reason ? ' — ' + check.reason : ''}`);
    console.log('Comprobaciones sin crear pagos, correos ni envíos. La autenticación no sustituye la prueba completa de producción.');
    process.exitCode = report.ready ? 0 : 2;
  }).catch(() => { console.error('No se pudo completar la verificación.'); process.exitCode = 1; });
}
