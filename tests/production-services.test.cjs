const {test} = require('node:test');
const assert = require('node:assert/strict');
const {verifyServices} = require('../scripts/verify-production-services.cjs');

test('missing credentials and TEST keys make no external calls', async () => {
  const result = await verifyServices({STRIPE_SECRET_KEY: 'sk_test_fixture'}, () => {throw Error('Unexpected network');});
  assert.equal(result.ready, false);
  assert.ok(result.checks.every(check => check.status === 'PENDING'));
});
test('unverified sender cannot pass and never sends email', async () => {
  const requests = [];
  const result = await verifyServices({RESEND_API_KEY: 'fixture', ROUTEFLOW_EMAIL_FROM: 'RouteFlow <sales@example.com>'}, async (url, options) => {
    requests.push({url, method: options.method || 'GET'});
    return {ok: true, json: async () => ({data: [{name: 'example.com', status: 'pending'}]})};
  });
  assert.equal(result.checks[2].status, 'FAILED');
  assert.deepEqual(requests.map(request => request.method), ['GET']);
  assert.ok(requests.every(request => request.url.startsWith('https://api.resend.com/domains?')));
});
test('test balance does not validate LIVE credentials and secrets stay out of reports', async () => {
  const secret = 'sk_live_fixture_secret';
  const report = await verifyServices({STRIPE_SECRET_KEY: secret}, async () => ({ok: true,
    json: async () => ({livemode: false, charges_enabled: true, payouts_enabled: true})}));
  assert.equal(report.checks[0].status, 'FAILED');
  assert.ok(!JSON.stringify(report).includes(secret));
});
test('sandbox endpoint does not receive production FedEx credentials', async () => {
  const report = await verifyServices({FEDEX_BASE_URL: 'https://apis-sandbox.fedex.com',
    FEDEX_CLIENT_ID: 'fixture', FEDEX_CLIENT_SECRET: 'fixture', FEDEX_ACCOUNT_NUMBER: 'fixture'},
  () => {throw Error('Unexpected network');});
  assert.equal(report.checks[1].status, 'PENDING');
});
