/* Signed synthetic events: validates HTTP + PostgreSQL, not a Stripe purchase. */
const { loadEnvConfig } = require('@next/env');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

loadEnvConfig(process.cwd());
const base = process.argv[2] || 'http://localhost:3000';
const expectedProject = 'https://xnnkcgzijlpwxnvarqng.supabase.co';
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, expectedProject);
assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'));
assert.ok(process.env.STRIPE_WEBHOOK_SECRET);
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const db = createClient(expectedProject, process.env.SUPABASE_SERVICE_ROLE_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const runId = randomUUID();
const orderId = randomUUID();
const eventId = `evt_routeflow_synthetic_${runId}`;
let sellerId;
let primaryError;
async function checked(operation) {
  const { data, error } = await operation;
  if (error) throw new Error(error.message);
  return data;
}
async function deliver(event) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload, secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  const res = await fetch(`${base}/api/webhooks/stripe`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    body: payload, signal: AbortSignal.timeout(60000),
  });
  return { status: res.status, body: await res.json() };
}
async function main() {
  try {
    const event = {
      id: eventId, object: 'event', type: 'checkout.session.completed', livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: { object: {
        id: `cs_test_synthetic_${runId}`, object: 'checkout.session',
        metadata: { order_id: orderId }, payment_status: 'paid', amount_total: 10000,
        currency: 'mxn', payment_intent: `pi_test_synthetic_${runId}`,
      } },
    };
    const failed = await deliver(event);
    assert.equal(failed.status, 500);
    let record = await checked(db.from('stripe_webhook_events').select('status,attempt_count').eq('id', eventId).single());
    assert.equal(record.status, 'FAILED');
    assert.equal(record.attempt_count, 1);
    console.log('PASS: missing order returns 500 and records FAILED');

    const seller = await checked(db.from('sellers').insert({
      user_id: `synthetic_${runId}`, store_username: `verify_${runId.slice(0, 8)}`,
      store_name: 'Synthetic webhook verification',
    }).select('id').single());
    sellerId = seller.id;
    await checked(db.from('orders').insert({
      id: orderId, order_number: `VERIFY-${runId}`, seller_id: sellerId,
      buyer_name: 'Synthetic Test', buyer_email: 'test@example.invalid', buyer_phone: '000',
      shipping_address: {}, amount: 100, currency: 'MXN', status: 'PAYMENT_PENDING',
      payment_status: 'PENDING', buyer_token_hash: randomUUID(),
    }));
    const recovered = await deliver(event);
    assert.equal(recovered.status, 200);
    record = await checked(db.from('stripe_webhook_events').select('status,attempt_count').eq('id', eventId).single());
    assert.equal(record.status, 'PROCESSED');
    assert.equal(record.attempt_count, 2);
    const order = await checked(db.from('orders').select('status,payment_status').eq('id', orderId).single());
    assert.equal(order.status, 'PAID');
    assert.equal(order.payment_status, 'SUCCEEDED');
    console.log('PASS: identical event recovers after missing order is restored');

    const duplicate = await deliver(event);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.already_processed, true);
    const payments = await checked(db.from('payments').select('id,status').eq('order_id', orderId));
    const events = await checked(db.from('events').select('id').eq('order_id', orderId).eq('type', 'PAYMENT_SUCCEEDED'));
    assert.equal(payments.length, 1);
    assert.equal(payments[0].status, 'SUCCEEDED');
    assert.equal(events.length, 1);
    console.log('PASS: duplicate acknowledged without duplicate payment or business event');
  } catch (error) {
    primaryError = error;
  } finally {
    await checked(db.from('events').delete().eq('order_id', orderId));
    await checked(db.from('payments').delete().eq('order_id', orderId));
    await checked(db.from('orders').delete().eq('id', orderId));
    if (sellerId) await checked(db.from('sellers').delete().eq('id', sellerId));
    await checked(db.from('stripe_webhook_events').delete().eq('id', eventId));
    console.log('Synthetic fixtures removed');
  }
  if (primaryError) throw primaryError;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
