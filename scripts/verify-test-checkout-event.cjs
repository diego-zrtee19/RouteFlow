// Replays an authentic Stripe TEST event through the local signed webhook.
// This does not prove automatic delivery via Stripe CLI or a public endpoint.
const { loadEnvConfig } = require('@next/env');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const fs = require('node:fs');
const assert = require('node:assert/strict');
loadEnvConfig(process.cwd());
async function main() {
  const automatic = process.argv.includes('--automatic');
  if (automatic && process.argv.includes('--reconcile')) throw Error('Automatic verification must not repair state');
  assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'));
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'https://xnnkcgzijlpwxnvarqng.supabase.co');
  const statePath = '.routeflow-data/v6-checkout-verification.json';
  const state = JSON.parse(fs.readFileSync(statePath,'utf8'));
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const session = await stripe.checkout.sessions.retrieve(state.sessionId);
  assert.equal(session.livemode,false);
  assert.equal(session.payment_status,'paid');
  const events = await stripe.events.list({type:'checkout.session.completed',limit:30});
  const event = events.data.find(e=>e.data.object.id===state.sessionId);
  assert.ok(event,'Checkout event not yet available from Stripe');
  assert.equal(event.livemode,false);
  if (process.argv.includes('--reconcile')) {
    const {data:result,error}=await db.rpc('complete_payment_and_mark_order_paid',{
      p_order_id:state.orderId,p_checkout_session_id:session.id,
      p_payment_intent_id:typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent.id,
      p_amount_paid:session.amount_total/100,p_currency:session.currency,p_payer_id:null,
    });
    if(error)throw Error(error.message);
    assert.equal(result.success,true,JSON.stringify(result));
  }
  const payload = JSON.stringify(event);
  async function send() {
    const signature = stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
    const res = await fetch('http://localhost:3000/api/webhooks/stripe',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body:payload});
    const body = await res.json();
    assert.equal(res.status,200,JSON.stringify(body));
    return body;
  }
  if (!automatic) {
    await send();
    const duplicate = await send();
    assert.equal(duplicate.already_processed,true);
  }
  const {data:order,error:orderError}=await db.from('orders').select('id,status,payment_status').eq('id',state.orderId).single();
  if(orderError)throw Error(orderError.message);
  assert.equal(order.status,'PAID');
  assert.equal(order.payment_status,'SUCCEEDED');
  const {data:record,error:eventError}=await db.from('stripe_webhook_events').select('id,status,attempt_count').eq('id',event.id).single();
  if(eventError)throw Error(eventError.message);
  assert.equal(record.status,'PROCESSED');
  const {data:payments,error:paymentError}=await db.from('payments').select('id,status,payment_intent_id').eq('order_id',state.orderId);
  if(paymentError)throw Error(paymentError.message);
  assert.equal(payments.length,1);
  assert.equal(payments[0].status,'SUCCEEDED');
  assert.equal(payments[0].payment_intent_id,typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent.id);
  state.eventId = event.id;
  fs.writeFileSync(statePath,JSON.stringify(state,null,2));
  console.log(JSON.stringify({checkout:'Stripe TEST paid',delivery:automatic?'automatic Stripe CLI delivery; read-only verification':'authentic event replay, locally signed',event:record,order,payments:payments.length,...(!automatic?{duplicate:'acknowledged without side effects'}:{})}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
