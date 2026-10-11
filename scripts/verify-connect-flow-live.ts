import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";
import { createOrderFromPurchaseLink, findOrderByIdForWebhook } from "@/repositories/orderRepository";
import { getBuyerDeliveryPin, completeCoordinatedDelivery } from "@/services/deliveryService";
import { connectStatus, settleCompletedOrder } from "@/services/connectService";

async function main() {
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://xnnkcgzijlpwxnvarqng.supabase.co");
  assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"));
  const db = getSupabaseAdmin(), stripe = getStripe();
  const { data: seller, error: sellerError } = await db.from("sellers").select("id,stripe_account_id")
    .eq("stripe_account_id", "acct_1UP6ldPveSAFjAn8").single();
  assert.ifError(sellerError); assert.ok(seller);
  const status = await connectStatus(seller.id);
  assert.ok(status.testMode && status.transfersEnabled && status.payoutsEnabled);
  const run = randomUUID().slice(0, 8);
  const { data: product, error: productError } = await db.from("products").insert({
    seller_id: seller.id, title: `PRUEBA Connect ${run}`, price: 100, currency: "MXN", stock: 1,
    delivery_options: ["meetup"],
  }).select("id").single();
  assert.ifError(productError); assert.ok(product);
  const publicId = `CON${run.toUpperCase()}`;
  const { error: linkError } = await db.from("purchase_links").insert({seller_id: seller.id,product_id: product.id,public_id: publicId});
  assert.ifError(linkError);
  const created = await createOrderFromPurchaseLink({publicId,buyerName:"Comprador PRUEBA Connect",buyerEmail:"buyer@example.com",buyerPhone:"3300000000",deliveryMethod:"meetup",
    shippingAddress:{fullName:"Comprador TEST",phone:"3300000000",street:"Entrega coordinada TEST",city:"Tlajomulco",state:"JAL",postalCode:"45640",country:"MX"}});
  assert.ok(created);
  const orderId = created.order.id;
  // Retain the explicitly labelled TEST order as evidence. Never touch existing customer orders.
  writeFileSync(".routeflow-data/connect-flow-result.json", JSON.stringify({orderId,orderNumber:created.order.orderNumber,testMode:true,stage:"CREATED"},null,2));
  assert.deepEqual(await settleCompletedOrder(orderId), {pending:true});
  const intent = await stripe.paymentIntents.create({amount:10000,currency:"mxn",payment_method:"pm_card_visa",confirm:true,
    automatic_payment_methods:{enabled:true,allow_redirects:"never"},metadata:{order_id:orderId,test_fixture:"connect_flow"}},
    {idempotencyKey:`rf_test_charge_${orderId}`});
  assert.equal(intent.status,"succeeded");
  const {data:paid,error:paidError}=await db.rpc("complete_payment_and_mark_order_paid",{
    p_order_id:orderId,p_checkout_session_id:`cs_test_connect_fixture_${run}`,p_payment_intent_id:intent.id,p_amount_paid:100,p_currency:"MXN",p_payer_id:null});
  assert.ifError(paidError); assert.equal(paid.success,true);
  let order=await findOrderByIdForWebhook(orderId); assert.ok(order); assert.equal(order.status,"PAID");
  assert.deepEqual(await settleCompletedOrder(orderId),{pending:true});
  const receipt=await fetch(`http://localhost:3000/api/orders/${orderId}`,{headers:{"x-buyer-token":created.buyerToken}});
  assert.equal(receipt.status,200); const view=(await receipt.json()).order;
  const pin=await getBuyerDeliveryPin(order);assert.match(pin||"",/^\d{6}$/);assert.equal(view.deliveryPin,pin);
  await assert.rejects(completeCoordinatedDelivery(orderId,seller.id,pin==="000000"?"111111":"000000"));
  await completeCoordinatedDelivery(orderId,seller.id,pin!);
  order=await findOrderByIdForWebhook(orderId);assert.ok(order);assert.equal(order.status,"COMPLETED");
  await settleCompletedOrder(orderId);
  await settleCompletedOrder(orderId);
  const transfers=await stripe.transfers.list({transfer_group:`rf_order_${orderId}`,limit:100});
  assert.equal(transfers.data.length,1);const transfer=transfers.data[0];
  assert.equal(transfer.destination,seller.stripe_account_id);assert.equal(transfer.amount,9500);assert.equal(transfer.currency,"mxn");
  const {data:stored,error:storedError}=await db.from("orders").select("status,settlement_status,transfer_id").eq("id",orderId).single();
  assert.ifError(storedError);assert.equal(stored?.settlement_status,"TRANSFERRED");assert.equal(stored?.transfer_id,transfer.id);
  const {data:payments,error:paymentsError}=await db.from("payments").select("id,status").eq("order_id",orderId);
  assert.ifError(paymentsError);assert.equal(payments?.length,1);assert.equal(payments?.[0].status,"SUCCEEDED");
  const {data:stock}=await db.from("products").select("stock").eq("id",product.id).single();assert.equal(stock?.stock,0);
  const {error:disableError}=await db.from("purchase_links").update({status:"inactive"}).eq("public_id",publicId);assert.ifError(disableError);
  const result={testMode:true,orderId,orderNumber:created.order.orderNumber,paidMXN:100,platformFeeMXN:5,transferredMXN:95,
    transferId:transfer.id,status:stored?.status,settlementStatus:stored?.settlement_status,transferCount:transfers.data.length,
    paymentMethod:"Stripe TEST PaymentIntent via API; atomic payment RPC",hostedCheckoutTested:false};
  writeFileSync(".routeflow-data/connect-flow-result.json",JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  console.log("PASS: real Stripe TEST charge, buyer receipt/PIN, invalid PIN rejection, completion, 95 MXN Connect transfer, duplicate protection, one payment and inventory reservation.");
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Verification failed");process.exitCode=1;});
