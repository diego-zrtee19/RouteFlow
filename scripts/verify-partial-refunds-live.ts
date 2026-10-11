import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getStripe} from "@/lib/stripe";
import {createOrderFromPurchaseLink,findOrderByIdForWebhook} from "@/repositories/orderRepository";
import {requestRefund} from "@/services/refundService";
async function main(){
 assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,"https://xnnkcgzijlpwxnvarqng.supabase.co");assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"));
 const db=getSupabaseAdmin(),stripe=getStripe();const run=randomUUID().slice(0,8);let sellerId:string|undefined,productId:string|undefined,linkId:string|undefined,orderId:string|undefined,intentId:string|undefined;
 try{
 const {data:s,error:se}=await db.from("sellers").insert({user_id:`partial_verify_${run}`,store_username:`partial_verify_${run}`,store_name:"Disposable partial refund TEST",contact_email:"seller@example.com"}).select("id").single();assert.ifError(se);sellerId=s.id;
 const {data:p,error:pe}=await db.from("products").insert({seller_id:sellerId,title:"Partial refund TEST",price:100,stock:1,delivery_options:["meetup"]}).select("id").single();assert.ifError(pe);productId=p.id;
 const publicId=`PAR${run.toUpperCase()}`;const {data:l,error:le}=await db.from("purchase_links").insert({seller_id:sellerId,product_id:productId,public_id:publicId}).select("id").single();assert.ifError(le);linkId=l.id;
 const created=await createOrderFromPurchaseLink({publicId,buyerName:"Test buyer",buyerEmail:"buyer@example.com",buyerPhone:"3300000000",deliveryMethod:"meetup",shippingAddress:{fullName:"Test",phone:"3300000000",street:"Demo",city:"Demo",state:"JAL",postalCode:"45640",country:"MX"}});assert.ok(created);orderId=created.order.id;
 const intent=await stripe.paymentIntents.create({amount:10000,currency:"mxn",payment_method:"pm_card_visa",confirm:true,automatic_payment_methods:{enabled:true,allow_redirects:"never"},metadata:{order_id:orderId,test_fixture:"partial_refund_verification"}});intentId=intent.id;assert.equal(intent.status,"succeeded");
 const {data:paid,error:paidError}=await db.rpc("complete_payment_and_mark_order_paid",{p_order_id:orderId,p_checkout_session_id:`cs_test_partial_fixture_${run}`,p_payment_intent_id:intent.id,p_amount_paid:100,p_currency:"MXN",p_payer_id:null});assert.ifError(paidError);assert.equal(paid.success,true);
 const key=randomUUID();const first=await requestRefund(orderId,25,key);assert.equal(first.order.refundedAmount,25);assert.equal(first.order.status,"PAID");assert.equal(first.pending,false);
 const repeated=await requestRefund(orderId,25,key);assert.equal(repeated.alreadyRefunded,true);assert.equal(repeated.refundId,first.refundId);
 await assert.rejects(requestRefund(orderId,76,randomUUID()));
 const second=await requestRefund(orderId,75,randomUUID());assert.equal(second.order.refundedAmount,100);assert.equal(second.order.status,"REFUNDED");
 const history=await stripe.refunds.list({payment_intent:intent.id});assert.equal(history.data.length,2);assert.equal(history.data.reduce((sum,r)=>sum+r.amount,0),10000);
 const {data:ledger,error:ledgerError}=await db.from("refunds").select("amount,status").eq("order_id",orderId);assert.ifError(ledgerError);assert.equal(ledger?.length,2);assert.equal(ledger.reduce((sum,r)=>sum+Number(r.amount),0),100);
 // Replay a real Stripe event with the development signing secret, twice.
 let event;
 for(let attempt=0;attempt<4&&!event;attempt++){const events=await stripe.events.list({type:"refund.created",limit:30});event=events.data.find(e=>(e.data.object as {id:string}).id===second.refundId);}
 assert.ok(event,"Stripe refund event not available");const payload=JSON.stringify(event);const signature=stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET!});
 for(let n=0;n<2;n++){const response=await fetch("http://localhost:3000/api/webhooks/stripe",{method:"POST",headers:{"Content-Type":"application/json","stripe-signature":signature},body:payload});assert.equal(response.status,200);}
 assert.equal((await findOrderByIdForWebhook(orderId))?.refundedAmount,100);
 const {data:events}=await db.from("events").select("id").eq("order_id",orderId).eq("type","REFUND_CREATED");assert.equal(events?.length,2);
 console.log("PASS: Stripe TEST charge, 25+75 MXN refunds, duplicate protection, over-refund rejection, atomic ledger, real webhook replay");
 }finally{
 if(intentId){const intent=await stripe.paymentIntents.retrieve(intentId);if(intent.latest_charge){const charge=await stripe.charges.retrieve(typeof intent.latest_charge==="string"?intent.latest_charge:intent.latest_charge.id);const remaining=charge.amount-charge.amount_refunded;if(remaining>0)await stripe.refunds.create({payment_intent:intentId,amount:remaining},{idempotencyKey:`cleanup_partial_${run}`});}}
 if(orderId){await db.from("events").delete().eq("order_id",orderId);const {error}=await db.from("orders").delete().eq("id",orderId);assert.ifError(error);}
 if(linkId)await db.from("purchase_links").delete().eq("id",linkId);if(productId)await db.from("products").delete().eq("id",productId);if(sellerId)await db.from("sellers").delete().eq("id",sellerId);console.log("Disposable partial refund fixtures removed; Stripe retains TEST payment evidence");
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
