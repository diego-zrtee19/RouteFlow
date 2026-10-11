import { getSupabaseAdmin, isSupabaseAdminAvailable } from "@/lib/supabaseAdmin";

/**
 * WEBHOOK IDEMPOTENCY V2 - RECOVERABLE EVENT LIFECYCLE.
 *
 * Previous implementation (V1):
 *   - Claimed event ID BEFORE executing business logic
 *   - If processing failed after claiming, Stripe retry was rejected as duplicate
 *   - Result: paid order could remain PAYMENT_PENDING forever
 *
 * V2 Implementation:
 *   - Uses atomic PostgreSQL function `claim_stripe_event()`
 *   - Event lifecycle: RECEIVED → PROCESSING → PROCESSED / FAILED
 *   - Processing lease with expiration for crash recovery
 *   - Failed events can be reclaimed and retried
 *   - Stale worker protection via attempt tracking
 *   - Event only marked PROCESSED after successful business logic
 */

export type EventStatus = "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED";

export interface ClaimResult {
  claimed: boolean;
  outcome: "claimed" | "reclaimed" | "already_processed" | "already_claimed" | "unavailable" | "invalid_lease_duration" | "not_found";
  eventId: string;
  status?: EventStatus;
  leaseExpiresAt?: string;
  attemptCount?: number;
  error?: string;
}

/**
 * Attempts to claim a Stripe event for processing with recoverable lifecycle.
 *
 * Returns claim result with ownership information. The event is not marked
 * PROCESSED until business logic completes successfully.
 */
export async function claimStripeEvent(
  eventId: string,
  eventType: string,
  payload: unknown
): Promise<ClaimResult> {
  if (!isSupabaseAdminAvailable()) {
    console.error(
      `[routeflow] cannot guarantee webhook idempotency: Supabase is not configured. ` +
        `Event ${eventId} (${eventType}) was NOT processed.`
    );
    return {
      claimed: false,
      outcome: "unavailable",
      eventId,
      error: "Supabase not configured",
    };
  }

  const admin = getSupabaseAdmin();

  // Call atomic PostgreSQL function for claiming
  const { data, error } = await admin.rpc("claim_stripe_event", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_payload: payload as Record<string, unknown>,
    p_lease_duration_seconds: 300, // 5-minute lease
  });

  if (error) {
    console.error(`[routeflow] webhook claim failed for ${eventId}: ${error.message}`);
    return {
      claimed: false,
      outcome: "unavailable",
      eventId,
      error: error.message,
    };
  }

  const result = data as Record<string, unknown>;
  const outcome = String(result.outcome || "unknown");

  if (outcome === "claimed" || outcome === "reclaimed") {
    return {
      claimed: true,
      outcome: outcome as "claimed" | "reclaimed",
      eventId: String(result.event_id),
      status: result.status as EventStatus,
      leaseExpiresAt: result.lease_expires_at as string | undefined,
      attemptCount: Number(result.attempt_count || 1),
    };
  }

  if (outcome === "already_processed") {
    return {
      claimed: false,
      outcome: "already_processed",
      eventId: String(result.event_id),
      status: result.status as EventStatus,
    };
  }

  if (outcome === "already_claimed") {
    return {
      claimed: false,
      outcome: "already_claimed",
      eventId: String(result.event_id),
      status: result.status as EventStatus,
      leaseExpiresAt: result.lease_expires_at as string | undefined,
    };
  }

  if (outcome === "invalid_lease_duration") {
    return {
      claimed: false,
      outcome: "invalid_lease_duration",
      eventId: String(result.event_id),
      error: result.error as string | undefined,
    };
  }

  if (outcome === "not_found") {
    return {
      claimed: false,
      outcome: "not_found",
      eventId: String(result.event_id),
      error: result.error as string | undefined,
    };
  }

  return {
    claimed: false,
    outcome: "unavailable",
    eventId,
    error: `Unknown outcome: ${outcome}`,
  };
}

/**
 * Marks an event as successfully processed.
 *
 * Only succeeds if the caller still owns the processing lease (prevents stale
 * workers from finalizing after losing ownership).
 */
export async function markEventProcessed(
  eventId: string,
  attemptCount: number
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseAdminAvailable()) {
    return { success: false, error: "Supabase not configured" };
  }

  const admin = getSupabaseAdmin();

  const { data, error } = await admin.rpc("mark_webhook_event_processed", {
    p_event_id: eventId,
    p_processing_attempt_id: attemptCount,
  });

  if (error) {
    console.error(`[routeflow] failed to mark event ${eventId} as processed: ${error.message}`);
    return { success: false, error: error.message };
  }

  const result = data as Record<string, unknown>;
  return { success: Boolean(result.success) };
}

/**
 * Marks an event as failed, allowing it to be reclaimed and retried.
 *
 * Only succeeds if the caller still owns the processing lease.
 */
export async function markEventFailed(
  eventId: string,
  attemptCount: number,
  errorMessage: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseAdminAvailable()) {
    return { success: false, error: "Supabase not configured" };
  }

  const admin = getSupabaseAdmin();

  const { data, error } = await admin.rpc("mark_webhook_event_failed", {
    p_event_id: eventId,
    p_processing_attempt_id: attemptCount,
    p_error_message: errorMessage,
  });

  if (error) {
    console.error(`[routeflow] failed to mark event ${eventId} as failed: ${error.message}`);
    return { success: false, error: error.message };
  }

  const result = data as Record<string, unknown>;
  return { success: Boolean(result.success) };
}