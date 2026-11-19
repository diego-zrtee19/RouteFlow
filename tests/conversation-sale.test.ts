import { beforeEach, describe, expect, it, vi } from "vitest";
import { conversationSaleProgress } from "@/domain/conversationSale";
import { resolveConversationSelection } from "@/services/conversationSaleService";
import { GET as publicSale } from "@/app/api/public/conversation-sales/[publicId]/route";
import { GET as sellerSales, POST as prepareSale } from "@/app/api/dashboard/instagram/sales/route";
const { from, requireSeller } = vi.hoisted(() => ({ from: vi.fn(), requireSeller: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireSeller }));
vi.mock("@/lib/supabaseAdmin", () => ({ getSupabaseAdmin: () => ({ from }) }));
const product = "11111111-1111-4111-8111-111111111111";
const publicId = "a".repeat(64);
function query(data: unknown) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  return q;
}
function sale(overrides: Record<string, unknown> = {}) {
  return {
    id: "sale-id",
    seller_id: "seller-id",
    items: [{ productId: product, quantity: 2 }],
    line_snapshot: [{ title: "Gorra", quantity: 2, line_total: 200 }],
    subtotal: 200,
    currency: "MXN",
    expires_at: new Date(Date.now() + 60000).toISOString(),
    cancelled_at: null,
    order_id: null,
    sender_id: "private-instagram-id",
    ...overrides,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  requireSeller.mockResolvedValue({
    ok: true,
    value: { id: "seller-a", storeUsername: "seller_a" },
  });
});
describe("private conversation sales", () => {
  it("requires a seller session to read or prepare links", async () => {
    requireSeller.mockResolvedValue({ ok: false, status: 401, code: "UNAUTHENTICATED" });
    expect(
      (
        await sellerSales(
          new Request("https://example.com/api/dashboard/instagram/sales?sender=123"),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await prepareSale(
          new Request("https://example.com/api/dashboard/instagram/sales", { method: "POST" }),
        )
      ).status,
    ).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects a foreign origin before preparing a link", async () => {
    expect(
      (
        await prepareSale(
          new Request("https://example.com/api/dashboard/instagram/sales", {
            method: "POST",
            headers: { Origin: "https://other.example" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
  it("validates the conversation before database access", async () => {
    expect(
      (
        await sellerSales(
          new Request("https://example.com/api/dashboard/instagram/sales?sender=123,or(other)"),
        )
      ).status,
    ).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });
});
describe("conversation checkout selection", () => {
  it("ignores client-supplied seller, products, quantities and internal sale IDs", async () => {
    from
      .mockReturnValueOnce(query(sale()))
      .mockReturnValueOnce(query({ store_username: "seller_a", store_name: "Tienda" }));
    expect(
      await resolveConversationSelection({
        salePublicId: publicId,
        username: "other_seller",
        items: [{ productId: product, quantity: 20 }],
        conversationSaleId: "other-sale",
      }),
    ).toEqual({
      username: "seller_a",
      items: [{ productId: product, quantity: 2 }],
      conversationSaleId: "sale-id",
    });
  });
  it("keeps ordinary catalog checkouts independent", async () => {
    expect(await resolveConversationSelection({ username: "seller_a", items: [] })).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects invalid and inactive public links", async () => {
    await expect(resolveConversationSelection({ salePublicId: "guess" })).rejects.toThrow(
      "Enlace no disponible",
    );
    expect(from).not.toHaveBeenCalled();
    from.mockReturnValueOnce(query(sale({ cancelled_at: new Date().toISOString() })));
    await expect(resolveConversationSelection({ salePublicId: publicId })).rejects.toThrow(
      "venció o fue desactivado",
    );
    from.mockReturnValueOnce(query(sale({ expires_at: new Date(Date.now() - 1).toISOString() })));
    await expect(resolveConversationSelection({ salePublicId: publicId })).rejects.toThrow(
      "venció o fue desactivado",
    );
  });
  it("exposes only the prepared purchase, without conversation, buyer or order information", async () => {
    from
      .mockReturnValueOnce(
        query(sale({ order_id: "private-order", buyer_email: "private@example.test" })),
      )
      .mockReturnValueOnce(query({ store_username: "seller_a", store_name: "Tienda" }));
    const response = await publicSale(new Request("https://example.com"), {
      params: Promise.resolve({ publicId }),
    });
    const data = await response.json();
    expect(data.username).toBe("seller_a");
    expect(data.summary.items[0].title).toBe("Gorra");
    expect(JSON.stringify(data)).not.toMatch(/private|seller-id|sale-id/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
describe("conversation sale progress", () => {
  const base = {
    cancelledAt: null,
    sharedAt: null,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    order: null,
  };
  const order = {
    id: "order",
    number: "RF-1",
    status: "PAYMENT_PENDING",
    paymentStatus: "PENDING",
    deliveryMethod: "shipping",
    trackingNumber: null,
  };
  it("does not mistake a prepared or copied link for a payment", () => {
    expect(conversationSaleProgress(base).step).toBe(1);
    expect(conversationSaleProgress({ ...base, sharedAt: new Date().toISOString() }).step).toBe(2);
    expect(conversationSaleProgress({ ...base, order }).label).toContain("Esperando");
  });
  it("uses confirmed payment and order states for fulfillment", () => {
    expect(
      conversationSaleProgress({
        ...base,
        order: { ...order, status: "PAID", paymentStatus: "SUCCEEDED" },
      }),
    ).toMatchObject({ step: 3, action: "Preparar envío" });
    expect(
      conversationSaleProgress({
        ...base,
        order: { ...order, status: "PAID", paymentStatus: "SUCCEEDED", deliveryMethod: "meetup" },
      }).action,
    ).toBe("Coordinar entrega");
    expect(
      conversationSaleProgress({
        ...base,
        order: { ...order, status: "COMPLETED", paymentStatus: "SUCCEEDED" },
      }).label,
    ).toBe("Entrega confirmada");
  });
  it("shows exceptions instead of normal progress", () => {
    expect(conversationSaleProgress({ ...base, cancelledAt: new Date().toISOString() }).step).toBe(
      -1,
    );
    expect(
      conversationSaleProgress({ ...base, order: { ...order, status: "REFUNDED" } }).label,
    ).toBe("Reembolsado");
  });
});
