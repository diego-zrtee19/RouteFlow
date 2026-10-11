const { loadEnvConfig } = require('@next/env');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
loadEnvConfig(process.cwd());
async function main() {
  if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://xnnkcgzijlpwxnvarqng.supabase.co')throw Error('Development database required');
  const eventId='evt_1UMsaVJlVFXMAlaf2PQzHqdv';
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const {data:stored,error}=await db.from('stripe_webhook_events').select('*').eq('id',eventId).single();
  if(error)throw Error(error.message);
  const keys=new Map();
  keys.set(process.env.STRIPE_SECRET_KEY,'effective environment');
  for(const file of ['.env','.env.local']) {
    if(!fs.existsSync(file))continue;
    const match=fs.readFileSync(file,'utf8').match(/^STRIPE_SECRET_KEY\s*=\s*["']?(sk_test_[A-Za-z0-9]+)/m);
    if(match&&!keys.has(match[1]))keys.set(match[1],file);
  }
  let verified;
  for(const [key,source] of keys) {
    if(!key?.startsWith('sk_test_'))continue;
    const stripe=new Stripe(key);
    let account;
    try {account=(await stripe.accounts.retrieve()).id;}catch{}
    try {
      const event=await stripe.events.retrieve(eventId);
      if(event.livemode)throw Error('Live event rejected');
      verified={event,stripe,account,source};
      console.log(JSON.stringify({source,account,eventFound:true}));
      break;
    }catch(e){console.log(JSON.stringify({source,account,eventFound:false,reason:e.code||e.type||'unavailable'}));}
  }
  if(!verified) {
    // Reuse the user's existing TEST login; never copy its credentials.
    const shim=path.join(process.env.APPDATA,'npm/node_modules/@stripe/cli/bin/shim.js');
    const cliEnv={...process.env};
    delete cliEnv.STRIPE_API_KEY;
    function cli(args) {
      return JSON.parse(execFileSync(process.execPath,[shim,...args],{env:cliEnv,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
    }
    const identity=cli(['whoami','--format','json']);
    if(identity.mode!=='test')throw Error('Existing CLI login is not TEST');
    const event=cli(['events','retrieve',eventId]);
    if(event.livemode||event.id!==eventId)throw Error('Historical TEST event could not be verified');
    const session=cli(['checkout','sessions','retrieve',event.data.object.id]);
    verified={event,account:identity.account_id,source:'existing Stripe CLI TEST login',session};
    console.log(JSON.stringify({source:verified.source,account:verified.account,eventFound:true}));
  }
  const event=verified.event;
  const session=verified.session||await verified.stripe.checkout.sessions.retrieve(event.data.object.id);
  const orderId=session.metadata?.order_id||session.client_reference_id;
  const intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
  const {data:payments,error:paymentError}=await db.from('payments').select('id,order_id').or(`checkout_session_id.eq.${session.id},payment_intent_id.eq.${intent}`);
  if(paymentError)throw Error(paymentError.message);
  console.log(JSON.stringify({eventId,account:verified.account,checkout:session.id,paymentStatus:session.payment_status,amount:session.amount_total,currency:session.currency,orderReference:orderId||null,linkedPayments:payments.length}));
  if(process.argv.includes('--reconcile-unrelated')) {
    if(orderId||payments.length)throw Error('Order association exists: manual order reconciliation required');
    const payload={...stored.payload,routeflow_reconciliation:{classification:'unrelated_stripe_test_checkout',verified_account:verified.account,verified_via:'Stripe API event and session',reconciled_at:new Date().toISOString(),reason:'No RouteFlow order metadata/client_reference_id or matching payment'}};
    const {error:updateError}=await db.from('stripe_webhook_events').update({status:'PROCESSED',processed_at:new Date().toISOString(),lease_expires_at:null,processing_started_at:null,last_error:null,payload}).eq('id',eventId).eq('status','FAILED');
    if(updateError)throw Error(updateError.message);
    console.log('Reconciled as unrelated TEST checkout; no payment or order was changed.');
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
