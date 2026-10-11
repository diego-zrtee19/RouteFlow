import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {getStripe} from "@/lib/stripe";
import {requestRefund} from "@/services/refundService";
async function main(){
 assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,"https://xnnkcgzijlpwxnvarqng.supabase.co");assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"));
 const db=getSupabaseAdmin(),stripe=getStripe();
 const orderId=process.argv[2];assert.match(orderId||"",/^[0-9a-f-]{36}$/);
 const {data:o,error}=await db.from("orders").select("amount,refunded_amount,transfer_id,order_items(title)").eq("id",orderId).single();assert.ifError(error);assert.ok(o);
 assert.ok(o.order_items.every(i=>i.title.startsWith("PRUEBA Connect ")));assert.equal(Number(o.amount),100);assert.equal(Number(o.refunded_amount),0);assert.ok(o.transfer_id);
 const key=randomUUID();const first=await requestRefund(orderId,25,key);assert.equal(first.order.refundedAmount,25);assert.equal(first.order.status,"COMPLETED");
 const transfer=await stripe.transfers.retrieve(o.transfer_id);assert.equal(transfer.amount_reversed,2375);
 const duplicate=await requestRefund(orderId,25,key);assert.equal(duplicate.alreadyRefunded,true);assert.equal((await stripe.transfers.retrieve(o.transfer_id)).amount_reversed,2375);
 const second=await requestRefund(orderId,75,randomUUID());assert.equal(second.order.status,"REFUNDED");assert.equal(second.order.refundedAmount,100);
 const reversed=await stripe.transfers.retrieve(o.transfer_id);assert.equal(reversed.amount_reversed,9500);assert.equal(reversed.reversed,true);
 const {data:ledger,error:le}=await db.from("refunds").select("amount,status").eq("order_id",orderId);assert.ifError(le);assert.equal(ledger?.length,2);
 console.log("PASS: 25 + 75 MXN TEST refunds after Connect transfer; proportional reversals 23.75 + 71.25 MXN, duplicate protection, full refund and transfer reversal.");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
