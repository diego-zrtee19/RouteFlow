import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createOrderFromPurchaseLink } from "@/repositories/orderRepository";
import { resolveDispute } from "@/services/disputeService";
async function main() {
  assert.equal(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "https://xnnkcgzijlpwxnvarqng.supabase.co",
  );
  const db = getSupabaseAdmin();
  const run = randomUUID().slice(0, 8);
  let sellerId: string | undefined,
    productId: string | undefined,
    linkId: string | undefined,
    orderId: string | undefined,
    disputeId: string | undefined;
  try {
    const { data: s, error: se } = await db
      .from("sellers")
      .insert({
        user_id: `dispute_verify_${run}`,
        store_username: `dispute_verify_${run}`,
        store_name: "Disposable dispute TEST",
      })
      .select("id")
      .single();
    assert.ifError(se);
    sellerId = s.id;
    const { data: p, error: pe } = await db
      .from("products")
      .insert({
        seller_id: sellerId,
        title: "Dispute fixture",
        price: 100,
        stock: 1,
        delivery_options: ["meetup"],
      })
      .select("id")
      .single();
    assert.ifError(pe);
    productId = p.id;
    const publicId = `DIS${run.toUpperCase()}`;
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
    const checkout = await createOrderFromPurchaseLink({
      publicId,
      buyerName: "TEST",
      buyerEmail: "buyer@example.com",
      buyerPhone: "3300000000",
      deliveryMethod: "meetup",
      shippingAddress: {
        fullName: "TEST",
        phone: "3300000000",
        street: "Demo",
        city: "Demo",
        state: "JAL",
        postalCode: "45640",
        country: "MX",
      },
    });
    assert.ok(checkout);
    orderId = checkout.order.id;
    const { error: paidError } = await db
      .from("orders")
      .update({ status: "PAID", payment_status: "SUCCEEDED" })
      .eq("id", orderId);
    assert.ifError(paidError);
    const headers = { "x-buyer-token": checkout.buyerToken };
    const url = `http://localhost:3000/api/orders/${orderId}/dispute`;
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: "other",
            description: "Test dispute",
          }),
        })
      ).status,
      401,
    );
    const opened = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "other",
        description: "TEST fixture dispute",
      }),
    });
    assert.equal(opened.status, 200);
    disputeId = (await opened.json()).disputeId;
    const disputeUrl = `http://localhost:3000/api/disputes/${disputeId}`;
    assert.equal((await fetch(disputeUrl)).status, 404);
    assert.equal(
      (await fetch(disputeUrl, { headers: { "x-buyer-token": "wrong" } }))
        .status,
      404,
    );
    const form = new FormData();
    form.append(
      "file",
      new Blob(["%PDF-1.4\n% disposable test evidence\n%%EOF"], {
        type: "application/pdf",
      }),
      "fixture.pdf",
    );
    const uploaded = await fetch(disputeUrl, {
      method: "PUT",
      headers,
      body: form,
    });
    assert.equal(uploaded.status, 200);
    const details = await fetch(disputeUrl, { headers });
    assert.equal(details.status, 200);
    const result = await details.json();
    assert.equal(result.dispute.status, "OPEN");
    assert.equal(result.evidence.length, 1);
    const file = await fetch(result.evidence[0].url);
    assert.equal(file.status, 200);
    assert.ok((await file.text()).startsWith("%PDF-"));
    const fakeForm = new FormData();
    fakeForm.append(
      "file",
      new Blob(["not a pdf"], { type: "application/pdf" }),
      "bad.pdf",
    );
    assert.equal(
      (await fetch(disputeUrl, { method: "PUT", headers, body: fakeForm }))
        .status,
      400,
    );
    assert.equal(
      (
        await fetch(disputeUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "release", resolution: "test" }),
        })
      ).status,
      401,
    );
    await resolveDispute(
      disputeId!,
      "release",
      "TEST: seller evidence accepted",
      "fixture-admin",
    );
    const { data: restored } = await db
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .single();
    assert.equal(restored?.status, "PAID");
    console.log(
      "PASS: buyer authorization, atomic dispute, private evidence, invalid file rejection, admin authorization, resolution restores order",
    );
  } finally {
    if (disputeId) {
      const { data: files } = await db
        .from("dispute_evidence")
        .select("storage_path")
        .eq("dispute_id", disputeId);
      if (files?.length)
        await db.storage
          .from("dispute-evidence")
          .remove(files.map((f) => f.storage_path));
    }
    if (orderId) {
      await db.from("events").delete().eq("order_id", orderId);
      const { error } = await db.from("orders").delete().eq("id", orderId);
      assert.ifError(error);
    }
    if (linkId) await db.from("purchase_links").delete().eq("id", linkId);
    if (productId) await db.from("products").delete().eq("id", productId);
    if (sellerId) await db.from("sellers").delete().eq("id", sellerId);
    console.log("Disposable dispute fixtures removed");
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
