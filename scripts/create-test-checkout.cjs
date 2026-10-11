const { loadEnvConfig } = require('@next/env');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw Error('Stripe TEST required');
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://xnnkcgzijlpwxnvarqng.supabase.co') throw Error('Development database required');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  async function checked(q) { const {data,error}=await q; if(error)throw Error(error.message); return data; }
  const run = randomUUID().slice(0,8);
  const seller = await checked(db.from('sellers').insert({user_id:`checkout_verify_${run}`,store_username:`verify_${run}`,store_name:'RouteFlow TEST verification'}).select('id').single());
  const product = await checked(db.from('products').insert({seller_id:seller.id,title:'Producto de prueba V6',price:100,currency:'MXN',stock:1,is_active:true}).select('id').single());
  const publicId = `V6${run.toUpperCase()}`;
  const link = await checked(db.from('purchase_links').insert({seller_id:seller.id,product_id:product.id,public_id:publicId,status:'active'}).select('id').single());
  fs.mkdirSync('.routeflow-data',{recursive:true});
  const state = {sellerId:seller.id,productId:product.id,linkId:link.id,publicId};
  fs.writeFileSync('.routeflow-data/v6-checkout-verification.json',JSON.stringify(state,null,2));
  const res = await fetch('http://localhost:3000/api/checkout/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({publicId,buyerName:'RouteFlow Test',buyerEmail:'routeflow-test@example.com',buyerPhone:'3330000000',deliveryMethod:'shipping',address:{street:'Calle de prueba 123',city:'Guadalajara',state:'Jalisco',postalCode:'44100',country:'Mexico'}}),signal:AbortSignal.timeout(60000)});
  const data = await res.json();
  if(!res.ok) throw Error(JSON.stringify(data));
  Object.assign(state,{orderId:data.orderId,sessionId:data.sessionId,checkoutUrl:data.url});
  fs.writeFileSync('.routeflow-data/v6-checkout-verification.json',JSON.stringify(state,null,2));
  console.log(JSON.stringify({purchaseLink:`http://localhost:3000/p/${publicId}`,checkoutUrl:data.url,testMode:data.testMode}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
