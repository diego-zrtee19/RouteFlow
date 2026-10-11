import type { Order, Product, Seller } from "@/domain/types";
import { generateBuyerToken, hashBuyerToken } from "@/lib/buyerToken";

/**
 * Deterministic fixtures for the test suite.
 *
 * `TEST_SELLER_A` and `TEST_SELLER_B` exist so ownership tests can prove that
 * seller A cannot reach seller B's order — the exact defect the audit found.
 */

export const TEST_SELLER_A: Seller = {
  id: "seller-a",
  userId: "clerk_user_a",
  storeUsername: "seller_a",
  storeName: "Seller A",
  instagramHandle: null,
  logoUrl: null,
  kycStatus: "verified",
  kycDocumentUrl: null,
  description: null,
  shipFromAddress: {
    fullName: "Seller A",
    phone: "5550000001",
    street: "Main St",
    streetNumber: "1",
    city: "Guadalajara",
    state: "JAL",
    postalCode: "44100",
    country: "MX",
  },
  contactEmail: "a@example.com",
  contactPhone: "5550000001",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

export const TEST_SELLER_B: Seller = {
  ...TEST_SELLER_A,
  id: "seller-b",
  userId: "clerk_user_b",
  storeUsername: "seller_b",
  storeName: "Seller B",
  contactEmail: "b@example.com",
};

export const TEST_PRODUCT: Product = {
  id: "product-1",
  sellerId: TEST_SELLER_A.id,
  title: "Test Product",
  description: "A product",
  price: 650,
  currency: "MXN",
  imageUrl: null,
  images: [],
  category: null,
  stock: 10,
  isExpress: false,
  isActive: true,
  deliveryOptions: ["shipping"],
  weightKg: 1.5,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

/** Buyer tokens for the two orders below, so tests can act as each buyer. */
export const BUYER_A_TOKEN = "buyer-a-token";
export const BUYER_B_TOKEN = "buyer-b-token";

export function makeOrder(overrides: Partial<Order> = {}): Order {
  const tokenHash = hashBuyerToken(
    (overrides.buyerEmail as string | undefined) === "buyer-b@example.com"
      ? BUYER_B_TOKEN
      : BUYER_A_TOKEN
  );

  return {
    id: "order-1",
    orderNumber: "RF-TEST01",
    sellerId: TEST_SELLER_A.id,
    purchaseLinkId: "link-1",
    buyerName: "Buyer A",
    buyerEmail: "buyer-a@example.com",
    buyerPhone: "5551111111",
    shippingAddress: {
      fullName: "Buyer A",
      phone: "5551111111",
      street: "Buyer Street",
      streetNumber: "42",
      city: "CDMX",
      state: "CDMX",
      postalCode: "06700",
      country: "MX",
    },
    deliveryMethod: "shipping",
    amount: 650,
    currency: "MXN",
    platformFee: 32.5,
    status: "PAID",
    paymentStatus: "SUCCEEDED",
    buyerTokenHash: tokenHash,
    items: [
      {
        id: "item-1",
        orderId: "order-1",
        productId: TEST_PRODUCT.id,
        title: TEST_PRODUCT.title,
        imageUrl: null,
        unitPrice: 650,
        quantity: 1,
        lineTotal: 650,
      },
    ],
    createdAt: "2024-03-18T11:20:00.000Z",
    updatedAt: "2024-03-18T11:20:00.000Z",
    paidAt: "2024-03-18T11:21:00.000Z",
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

/** An order that belongs to seller B, used for cross-seller tests. */
export function makeSellerBOrder(): Order {
  return makeOrder({
    id: "order-b",
    orderNumber: "RF-TESTB1",
    sellerId: TEST_SELLER_B.id,
    buyerEmail: "buyer-b@example.com",
    buyerName: "Buyer B",
  });
}

/** A paid token, for tests that need a fresh credential. */
export function freshBuyerToken(): { token: string; hash: string } {
  const token = generateBuyerToken();
  return { token, hash: hashBuyerToken(token) };
}