/**
 * WEBHOOK IDEMPOTENCY V2 TESTS
 *
 * Tests for the recoverable webhook event lifecycle:
 * - Atomic event claiming
 * - Processing lease with expiration
 * - Crash recovery
 * - Stale worker protection
 * - Failed event retry
 * - Payment + order atomicity
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase admin client
const mockAdmin = {
  rpc: vi.fn(),
  from: vi.fn(() => ({
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    delete: vi.fn(),
  })),
};

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdmin: () => mockAdmin,
  isSupabaseAdminAvailable: () => true,
}));

describe("Webhook Idempotency V2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("claimStripeEvent", () => {
    it("should claim a new event successfully", async () => {
      const { claimStripeEvent } = await import("@/services/webhookIdempotency");

      mockAdmin.rpc.mockResolvedValueOnce({
        data: {
          outcome: "claimed",
          event_id: "evt_test123",
          status: "PROCESSING",
          lease_expires_at: new Date(Date.now() + 300000).toISOString(),
          attempt_count: 1,
        },
        error: null,
      });

      const result = await claimStripeEvent(
        "evt_test123",
        "checkout.session.completed",
        { test: true }
      );

      expect(result.claimed).toBe(true);
      expect(result.outcome).toBe("claimed");
      expect(result.eventId).toBe("evt_test123");
      expect(result.status).toBe("PROCESSING");
      expect(result.attemptCount).toBe(1);
    });

    it("should reclaim a failed event", async () => {
      const { claimStripeEvent } = await import("@/services/webhookIdempotency");

      mockAdmin.rpc.mockResolvedValueOnce({
        data: {
          outcome: "reclaimed",
          event_id: "evt_test123",
          status: "PROCESSING",
          lease_expires_at: new Date(Date.now() + 300000).toISOString(),
          attempt_count: 2,
        },
        error: null,
      });

      const result = await claimStripeEvent(
        "evt_test123",
        "checkout.session.completed",
        { test: true }
      );

      expect(result.claimed).toBe(true);
      expect(result.outcome).toBe("reclaimed");
      expect(result.attemptCount).toBe(2);
    });

    it("should reject duplicate already-processed event", async () => {
      const { claimStripeEvent } = await import("@/services/webhookIdempotency");

      mockAdmin.rpc.mockResolvedValueOnce({
        data: {
          outcome: "already_processed",
          event_id: "evt_test123",
          status: "PROCESSED",
        },
        error: null,
      });

      const result = await claimStripeEvent(
        "evt_test123",
        "checkout.session.completed",
        { test: true }
      );

      expect(result.claimed).toBe(false);
      expect(result.outcome).toBe("already_processed");
      expect(result.status).toBe("PROCESSED");
    });

    it("should reject event already claimed by another worker", async () => {
      const { claimStripeEvent } = await import("@/services/webhookIdempotency");

      mockAdmin.rpc.mockResolvedValueOnce({
        data: {
          outcome: "already_claimed",
          event_id: "evt_test123",
          status: "PROCESSING",
          lease_expires_at: new Date(Date.now() + 300000).toISOString(),
        },
        error: null,
      });

      const result = await claimStripeEvent(
        "evt_test123",
        "checkout.session.completed",
        { test: true }
      );

      expect(result.claimed).toBe(false);
      expect(result.outcome).toBe("already_claimed");
      expect(result.status).toBe("PROCESSING");
    });

    it("should handle database unavailability", async () => {
      const { claimStripeEvent } = await import("@/services/webhookIdempotency");

      mockAdmin.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: "Connection failed" },
      });

      const result = await claimStripeEvent(
        "evt_test123",
        "checkout.session.completed",
        { test: true }
      );

      expect(result.claimed).toBe(false);
      expect(result.outcome).toBe("unavailable");
      expect(result.error).toBeDefined();
    });

    it("should reject invalid lease duration", async () => {
      const { claimStripeEvent } = await import("@/services/webhookIdempotency");

      mockAdmin.rpc.mockResolvedValueOnce({
        data: {
          outcome: "invalid_lease_duration",
          event_id: "evt_test123",
          error: "Lease duration must be between 10 and 3600 seconds",
        },
        error: null,
      });

      const result = await claimStripeEvent(
        "evt_test123",
        "checkout.session.completed",
        { test: true }
      );

      expect(result.claimed).toBe(false);
      expect(result.outcome).toBe("invalid_lease_duration");
      expect(result.error).toBeDefined();
    });
  });

  describe("markEventProcessed", () => {
    it("should mark event as processed successfully", async () => {
      const { markEventProcessed } = await import("@/services/webhookIdempotency");

      mockAdmin.rpc.mockResolvedValueOnce({
        data: { success: true, event_id: "evt_test123" },
        error: null,
      });

      const result = await markEventProcessed("evt_test123", 1);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should fail when lease is lost or stale", async () => {
      const { markEventProcessed } = await import("@/services/webhookIdempotency");

      mockAdmin.rpc.mockResolvedValueOnce({
        data: { success: false },
        error: { message: "LEASE_LOST_OR_STALE" },
      });

      const result = await markEventProcessed("evt_test123", 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe("LEASE_LOST_OR_STALE");
    });
  });

  describe("markEventFailed", () => {
    it("should mark event as failed successfully", async () => {
      const { markEventFailed } = await import("@/services/webhookIdempotency");

      mockAdmin.rpc.mockResolvedValueOnce({
        data: { success: true, event_id: "evt_test123" },
        error: null,
      });

      const result = await markEventFailed("evt_test123", 1, "Test error");

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should fail when lease is lost or stale", async () => {
      const { markEventFailed } = await import("@/services/webhookIdempotency");

      mockAdmin.rpc.mockResolvedValueOnce({
        data: { success: false },
        error: { message: "LEASE_LOST_OR_STALE" },
      });

      const result = await markEventFailed("evt_test123", 1, "Test error");

      expect(result.success).toBe(false);
      expect(result.error).toBe("LEASE_LOST_OR_STALE");
    });
  });
});
