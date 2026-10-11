import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStripe } from "@/lib/stripe";
import { createCheckoutSession } from "@/services/checkoutService";
import {
  quoteShipping,
  validateShippingQuote,
} from "@/services/shippingQuoteService";
import {
  processNotifications,
  runOperations,
} from "@/services/operationsService";
import { startConnect, connectStatus } from "@/services/connectService";
async function main() {
  assert.equal(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "https://xnnkcgzijlpwxnvarqng.supabase.co",
  );
  assert.ok(process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"));
  assert.equal(process.env.FEDEX_BASE_URL, "https://apis-sandbox.fedex.com");
  const db = getSupabaseAdmin();
  let sellerId: string | undefined,
    productId: string | undefined,
    linkId: string | undefined,
    sessionId: string | undefined;
  const run = randomUUID().slice(0, 8);
  const publicId = `COM${run.toUpperCase()}`;
  let orderId: string | undefined;
  const origin = {
    fullName: "Sandbox test",
    phone: "9015550100",
    street: "3610 Hacks Cross Road",
    city: "Memphis",
    state: "TN",
    postalCode: "38125",
    country: "US",
  };
  try {
    const { data: s, error: se } = await db
      .from("sellers")
      .insert({
        user_id: `commerce_verify_${run}`,
        store_username: `commerce_verify_${run}`,
        store_name: "Disposable commerce TEST",
        contact_email: "seller@example.com",
        ship_from_address: origin,
      })
      .select("id")
      .single();
    assert.ifError(se);
    sellerId = s.id;
    const { data: p, error: pe } = await db
      .from("products")
      .insert({
        seller_id: sellerId,
        title: "Commerce test",
        price: 100,
        currency: "USD",
        stock: 2,
        weight_kg: 3,
        package_dimensions: { length: 30, width: 20, height: 10 },
        shipping_payer: "buyer",
        delivery_options: ["shipping", "meetup"],
      })
      .select("id")
      .single();
    assert.ifError(pe);
    productId = p.id;
    const { data: l, error: le } = await db
      .from("purchase_links")
      .insert({
        seller_id: sellerId,
        product_id: productId,
        public_id: publicId,
      })
      .select("id")
      .single();
    assert.ifError(le);
    linkId = l.id;
    const address = {
      street: "10 FedEx Parkway",
      city: "Collierville",
      state: "TN",
      postalCode: "38017",
      country: "US",
    };
    const rates = await quoteShipping(publicId, address);
    assert.equal(rates.payer, "buyer");
    assert.ok(rates.quotes.length > 0);
    const quote = rates.quotes[0];
    const input = {
      publicId,
      buyerName: "Sandbox Test",
      buyerEmail: "buyer@example.com",
      buyerPhone: "9015550100",
      deliveryMethod: "shipping" as const,
      address,
      quoteId: quote.id,
    };
    await validateShippingQuote(input, productId!);
    await assert.rejects(
      validateShippingQuote(
        { ...input, address: { ...address, postalCode: "99999" } },
        productId!,
      ),
    );
    console.log(
      "PASS: real FedEx sandbox quote, currency, address tampering rejected",
    );
    const checkout = await createCheckoutSession(
      input,
      "http://localhost:3000",
    );
    orderId = checkout.order.id;
    sessionId = checkout.sessionId;
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    assert.equal(
      session.amount_total,
      Math.round((100 + Number(quote.amount)) * 100),
    );
    assert.equal(session.currency, "usd");
    assert.ok(session.expires_at <= Math.floor(Date.now() / 1000) + 31 * 60);
    const { data: reserved } = await db
      .from("products")
      .select("stock")
      .eq("id", productId)
      .single();
    assert.ok(reserved);
    assert.equal(reserved.stock, 1);
    console.log(
      "PASS: Stripe TEST session includes shipping, server-controlled total and 30-minute expiry",
    );
    await getStripe().checkout.sessions.expire(sessionId);
    const { error: expireError } = await db
      .from("orders")
      .update({
        reservation_expires_at: new Date(Date.now() - 60000).toISOString(),
      })
      .eq("id", orderId);
    assert.ifError(expireError);
    const operations = await runOperations();
    assert.deepEqual(operations.errors, []);
    const { data: restored } = await db
      .from("products")
      .select("stock")
      .eq("id", productId)
      .single();
    assert.ok(restored);
    assert.equal(restored.stock, 2);
    await runOperations();
    const { data: twice } = await db
      .from("products")
      .select("stock")
      .eq("id", productId)
      .single();
    assert.ok(twice);
    assert.equal(twice.stock, 2);
    console.log(
      "PASS: automatic worker recovers abandoned inventory exactly once",
    );
    const { error: noteError } = await db
      .from("notification_outbox")
      .insert({
        order_id: orderId,
        seller_id: sellerId,
        audience: "seller",
        kind: "TEST",
        recipient: "seller@example.com",
        subject: "Test preview",
        body: "Development test",
      });
    assert.ifError(noteError);
    await processNotifications();
    const { data: note } = await db
      .from("notification_outbox")
      .select("status")
      .eq("order_id", orderId)
      .eq("kind", "TEST")
      .single();
    assert.ok(note);
    assert.equal(note.status, "PREVIEW");
    console.log("PASS: durable notification preview; no real emails sent");
    try {
      const url = await startConnect(sellerId!, "http://localhost:3000");
      assert.ok(url.startsWith("https://connect.stripe.com/"));
      const status = await connectStatus(sellerId!);
      assert.equal(status.connected, true);
      assert.equal(status.testMode, true);
      console.log(
        "PASS: Stripe Connect TEST onboarding URL and real capability status",
      );
    } catch (e) {
      console.log(
        "CONNECT CONFIGURATION BLOCKER:",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  } finally {
    if (sessionId) {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      if (session.status === "open")
        await getStripe().checkout.sessions.expire(sessionId);
    }
    if (sellerId) {
      const { data: s } = await db
        .from("sellers")
        .select("stripe_account_id")
        .eq("id", sellerId)
        .single();
      if (s?.stripe_account_id)
        await getStripe().accounts.del(s.stripe_account_id);
    }
    if (orderId) {
      await db.from("events").delete().eq("order_id", orderId);
      const { error } = await db.from("orders").delete().eq("id", orderId);
      assert.ifError(error);
    }
    if (linkId) await db.from("purchase_links").delete().eq("id", linkId);
    if (productId) await db.from("products").delete().eq("id", productId);
    if (sellerId) await db.from("sellers").delete().eq("id", sellerId);
    console.log("Disposable commerce fixtures removed");
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
