// Disposable development DB fixtures + real FedEx SANDBOX. No Stripe charge.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createOrderFromPurchaseLink, findOrderByIdForWebhook } from "@/repositories/orderRepository";
import { dispatchOrder } from "@/services/shipmentService";
import { getBuyerDeliveryPin, completeCoordinatedDelivery } from "@/services/deliveryService";
import type { Address, Seller } from "@/domain/types";

async function main() {
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://xnnkcgzijlpwxnvarqng.supabase.co");
  assert.equal(process.env.FEDEX_BASE_URL || "https://apis-sandbox.fedex.com", "https://apis-sandbox.fedex.com");
  const db = getSupabaseAdmin();
  const run = randomUUID().slice(0, 8);
  const ids: string[] = [];
  let sellerId: string | undefined;
  let linkId: string | undefined;
  let productId: string | undefined;
  const address: Address = { fullName: "Sandbox Test", phone: "9015550100", street: "3610 Hacks Cross Road", city: "Memphis", state: "TN", postalCode: "38125", country: "US" };
  try {
    const { data: sellerRow, error: sellerError } = await db.from("sellers").insert({ user_id: `delivery_verify_${run}`, store_username: `delivery_verify_${run}`, store_name: "Delivery SANDBOX test", ship_from_address: address }).select("*").single();
    assert.ifError(sellerError); sellerId = sellerRow.id;
    const seller = { id: sellerId, storeName: sellerRow.store_name, shipFromAddress: address, contactPhone: address.phone, contactEmail: "sandbox@example.com" } as Seller;
    const { data: product, error: productError } = await db.from("products").insert({ seller_id: sellerId, title: "Delivery test product", price: 100, stock: 2, weight_kg: 1, delivery_options: ["shipping", "meetup"] }).select("id").single();
    assert.ifError(productError); productId = product.id;
    const publicId = `DEL${run.toUpperCase()}`;
    const { data: link, error: linkError } = await db.from("purchase_links").insert({ seller_id: sellerId, product_id: productId, public_id: publicId }).select("id").single();
    assert.ifError(linkError); linkId = link.id;
    for (const deliveryMethod of ["meetup", "shipping"] as const) {
      const created = await createOrderFromPurchaseLink({ publicId, buyerName: address.fullName, buyerEmail: "sandbox@example.com", buyerPhone: address.phone, shippingAddress: address, deliveryMethod });
      assert.ok(created); ids.push(created.order.id);
      const { data: paid, error } = await db.rpc("complete_payment_and_mark_order_paid", { p_order_id: created.order.id, p_checkout_session_id: `cs_test_delivery_${run}_${deliveryMethod}`, p_payment_intent_id: `pi_test_delivery_${run}_${deliveryMethod}`, p_amount_paid: 100, p_currency: "MXN", p_payer_id: null });
      assert.ifError(error); assert.equal(paid.success, true);
      const order = await findOrderByIdForWebhook(created.order.id); assert.ok(order);
      const noCredential = await fetch(`http://localhost:3000/api/orders/${order.id}`);
      assert.equal(noCredential.status, 401);
      const receipt = await fetch(`http://localhost:3000/api/orders/${order.id}`, { headers: { "x-buyer-token": created.buyerToken } });
      assert.equal(receipt.status, 200);
      const view = (await receipt.json()).order;
      assert.equal(view.items[0].title, "Delivery test product");
      assert.equal(view.items[0].quantity, 1);
      assert.equal(view.amount, 100); assert.equal(view.deliveryAddress.street, address.street);
      if (deliveryMethod === "meetup") {
        const pin = await getBuyerDeliveryPin(order); assert.match(pin || "", /^\d{6}$/);
        assert.equal(view.deliveryPin, pin);
        await assert.rejects(completeCoordinatedDelivery(order.id, seller.id, pin === "000000" ? "111111" : "000000"));
        await completeCoordinatedDelivery(order.id, seller.id, pin!);
        assert.equal((await findOrderByIdForWebhook(order.id))?.status, "COMPLETED");
        console.log("PASS: authenticated receipt, stable six-digit PIN and coordinated completion");
      } else {
        assert.equal(view.deliveryPin, null);
        const shipment = await dispatchOrder(order, seller, { provider: "FEDEX", serviceCode: "STANDARD_OVERNIGHT" });
        assert.ok(shipment.trackingNumber); assert.ok(shipment.labelUrl);
        const repeated = await dispatchOrder(order, seller, { provider: "FEDEX", serviceCode: "STANDARD_OVERNIGHT" });
        assert.equal(repeated.id, shipment.id);
        if (shipment.labelUrl.startsWith("/api/")) {
          const { data: pdf, error: labelError } = await db.storage.from("shipping-labels").download(`${order.id}.pdf`);
          assert.ifError(labelError); assert.ok(pdf);
          assert.ok(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString() === "%PDF");
        }
        console.log("PASS: real FedEx sandbox tracking + printable label + sequential dispatch idempotency");
      }
    }
    const { data: stock } = await db.from("products").select("stock").eq("id", productId).single();
    assert.equal(stock?.stock, 0);
    console.log("PASS: two orders reserve two units; payment confirmation does not decrement twice");
  } finally {
    if (ids.length) {
      const { error: storageError } = await db.storage.from("shipping-labels").remove(ids.map(id => `${id}.pdf`));
      if (storageError) throw Error(storageError.message);
      for (const table of ["events", "payments", "shipments", "order_items"]) {
        const { error } = await db.from(table).delete().in("order_id", ids); if (error) throw Error(error.message);
      }
      const { error } = await db.from("orders").delete().in("id", ids); if (error) throw Error(error.message);
    }
    if (linkId) await db.from("purchase_links").delete().eq("id", linkId);
    if (productId) await db.from("products").delete().eq("id", productId);
    if (sellerId) await db.from("sellers").delete().eq("id", sellerId);
    console.log("Disposable verification fixtures removed");
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
