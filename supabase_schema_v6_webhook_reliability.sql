-- =============================================================================
-- ROUTEFLOW - MIGRATION V6: WEBHOOK EVENT LIFECYCLE & PAYMENT ATOMICITY
-- =============================================================================
--
-- PROBLEM:
-- The current webhook idempotency claims an event ID BEFORE executing business
-- logic. If processing fails after claiming, Stripe retries but the retry is
-- rejected as a duplicate. Result: paid order remains PAYMENT_PENDING forever.
--
-- SOLUTION:
-- 1. Add event lifecycle states (RECEIVED, PROCESSING, PROCESSED, FAILED)
-- 2. Add processing lease with expiration for crash recovery
-- 3. Add attempt tracking and error logging
-- 4. Add atomic RPC function for claiming events with proper security
-- 5. Add atomic RPC function for completing payment + order transition
-- 6. Preserve historical events by marking them FAILED for reconciliation
--
-- SECURITY:
-- - All RPC functions use SECURITY DEFINER with restricted EXECUTE permissions
-- - search_path is explicitly set to prevent privilege escalation
-- - Functions are schema-qualified to prevent ambiguity
-- - EXECUTE granted only to service_role (Supabase service role)
-- - EXECUTE revoked from PUBLIC, anon, authenticated, and postgres
--
-- Safe to re-run. Preserves all existing data.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ENHANCE stripe_webhook_events TABLE
-- -----------------------------------------------------------------------------

-- Add status column for event lifecycle
ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'RECEIVED'
  CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED'));

-- Add processing lease fields for crash recovery
ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Add index for expiring lease queries
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_lease
  ON public.stripe_webhook_events (status, lease_expires_at)
  WHERE status = 'PROCESSING';

-- Add index for retrying failed events
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_failed
  ON public.stripe_webhook_events (status, attempt_count)
  WHERE status = 'FAILED';

-- -----------------------------------------------------------------------------
-- 2. MIGRATE HISTORICAL EVENTS
-- -----------------------------------------------------------------------------

-- Historical events: mark as FAILED for manual reconciliation.
-- We do NOT assume success based on age - an old event could have failed
-- silently. Operator will review FAILED events before marking PROCESSED.
UPDATE public.stripe_webhook_events
SET
  status = 'FAILED',
  last_error = 'Migrated from legacy schema - requires manual reconciliation'
WHERE status = 'RECEIVED' OR status IS NULL;

-- -----------------------------------------------------------------------------
-- 3. ATOMIC EVENT CLAIMING FUNCTION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  p_event_id TEXT,
  p_event_type TEXT,
  p_payload JSONB,
  p_lease_duration_seconds INTEGER DEFAULT 300
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_result JSONB;
  v_current_status TEXT;
  v_current_lease_expires TIMESTAMPTZ;
  v_current_attempt_count INTEGER;
  v_new_lease_expires TIMESTAMPTZ;
BEGIN
  -- Validate lease duration
  IF p_lease_duration_seconds IS NULL OR p_lease_duration_seconds < 10 OR p_lease_duration_seconds > 3600 THEN
    RETURN jsonb_build_object(
      'outcome', 'invalid_lease_duration',
      'event_id', p_event_id,
      'error', 'Lease duration must be between 10 and 3600 seconds'
    );
  END IF;

  -- Calculate NEW lease expiration (never reuse old value)
  v_new_lease_expires := NOW() + (p_lease_duration_seconds || ' seconds')::INTERVAL;

  -- Try to insert new event as PROCESSING with new lease
  INSERT INTO public.stripe_webhook_events (
    id,
    event_type,
    payload,
    status,
    processing_started_at,
    lease_expires_at,
    attempt_count
  ) VALUES (
    p_event_id,
    p_event_type,
    p_payload,
    'PROCESSING',
    NOW(),
    v_new_lease_expires,
    1
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING
    jsonb_build_object(
      'outcome', 'claimed',
      'event_id', id,
      'status', status,
      'lease_expires_at', lease_expires_at,
      'attempt_count', attempt_count
    )
  INTO v_claim_result;

  -- If insert succeeded, we own the event
  IF FOUND THEN
    RETURN v_claim_result;
  END IF;

  -- Event already exists - read current state for atomic decision
  SELECT
    status,
    lease_expires_at,
    attempt_count
  INTO
    v_current_status,
    v_current_lease_expires,
    v_current_attempt_count
  FROM public.stripe_webhook_events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    -- Should not happen due to conflict above, but handle defensively
    RETURN jsonb_build_object(
      'outcome', 'not_found',
      'event_id', p_event_id,
      'error', 'Event not found after conflict'
    );
  END IF;

  -- Already processed - no action needed
  IF v_current_status = 'PROCESSED' THEN
    RETURN jsonb_build_object(
      'outcome', 'already_processed',
      'event_id', p_event_id,
      'status', v_current_status
    );
  END IF;

  -- Atomic reclaim: only FAILED or expired PROCESSING events can be reclaimed
  UPDATE public.stripe_webhook_events
  SET
    status = 'PROCESSING',
    processing_started_at = NOW(),
    lease_expires_at = v_new_lease_expires,  -- NEW lease expiration
    attempt_count = attempt_count + 1,
    last_error = NULL
  WHERE id = p_event_id
    AND (
      (status = 'FAILED') OR
      (status = 'PROCESSING' AND lease_expires_at < NOW())
    )
  RETURNING
    jsonb_build_object(
      'outcome', 'reclaimed',
      'event_id', id,
      'status', status,
      'lease_expires_at', lease_expires_at,
      'attempt_count', attempt_count
    )
  INTO v_claim_result;

  IF FOUND THEN
    RETURN v_claim_result;
  END IF;

  -- Another worker owns the event with a valid lease
  RETURN jsonb_build_object(
    'outcome', 'already_claimed',
    'event_id', p_event_id,
    'status', v_current_status,
    'lease_expires_at', v_current_lease_expires
  );
END;
$$;

-- Revoke public execution and grant only to service role
REVOKE EXECUTE ON FUNCTION public.claim_stripe_event(TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_stripe_event(TEXT, TEXT, JSONB, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_stripe_event(TEXT, TEXT, JSONB, INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_stripe_event(TEXT, TEXT, JSONB, INTEGER) FROM postgres;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(TEXT, TEXT, JSONB, INTEGER) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. ATOMIC PAYMENT + ORDER TRANSITION FUNCTION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_payment_and_mark_order_paid(
  p_order_id UUID,
  p_checkout_session_id TEXT,
  p_payment_intent_id TEXT,
  p_amount_paid NUMERIC,
  p_currency TEXT,
  p_payer_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_expected_amount NUMERIC;
  v_payment RECORD;
  v_existing_payment RECORD;
BEGIN
  -- Validate inputs
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_ID_REQUIRED');
  END IF;
  IF p_checkout_session_id IS NULL AND p_payment_intent_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PAYMENT_IDENTIFIER_REQUIRED');
  END IF;
  IF p_amount_paid IS NULL OR p_amount_paid <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;
  IF p_currency IS NULL OR LENGTH(TRIM(p_currency)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'CURRENCY_REQUIRED');
  END IF;

  -- Lock the order row for the duration of the transaction
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  -- Validate amount matches order exactly
  v_expected_amount := v_order.amount;
  IF ABS(p_amount_paid - v_expected_amount) > 0.01 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AMOUNT_MISMATCH',
      'expected', v_expected_amount,
      'received', p_amount_paid
    );
  END IF;

  -- Validate currency matches order exactly
  IF LOWER(TRIM(v_order.currency)) != LOWER(TRIM(p_currency)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CURRENCY_MISMATCH',
      'expected', v_order.currency,
      'received', p_currency
    );
  END IF;

  -- Prevent reviving cancelled orders
  IF v_order.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_CANCELLED');
  END IF;

  -- Prevent paying already refunded or completed orders
  IF v_order.status IN ('REFUNDED', 'COMPLETED', 'DISPUTED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ORDER_STATE', 'current_status', v_order.status);
  END IF;

  -- Verify checkout session belongs to this order if provided
  IF p_checkout_session_id IS NOT NULL THEN
    SELECT * INTO v_existing_payment
    FROM public.payments
    WHERE checkout_session_id = p_checkout_session_id
    LIMIT 1;

    IF FOUND AND v_existing_payment.order_id::TEXT != p_order_id::TEXT THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CHECKOUT_SESSION_MISMATCH',
        'existing_order_id', v_existing_payment.order_id
      );
    END IF;
  END IF;

  -- Verify payment intent belongs to this order if provided
  IF p_payment_intent_id IS NOT NULL THEN
    SELECT * INTO v_existing_payment
    FROM public.payments
    WHERE payment_intent_id = p_payment_intent_id
    LIMIT 1;

    IF FOUND AND v_existing_payment.order_id::TEXT != p_order_id::TEXT THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'PAYMENT_INTENT_MISMATCH',
        'existing_order_id', v_existing_payment.order_id
      );
    END IF;
  END IF;

  -- Upsert payment with unique constraints to prevent duplicates
  -- Must verify payment was actually created/updated before marking order as paid
  INSERT INTO public.payments (
    order_id,
    provider,
    checkout_session_id,
    payment_intent_id,
    amount,
    currency,
    status
  ) VALUES (
    p_order_id,
    'stripe',
    p_checkout_session_id,
    p_payment_intent_id,
    p_amount_paid,
    UPPER(TRIM(p_currency)),
    'SUCCEEDED'
  )
  ON CONFLICT (checkout_session_id) DO UPDATE SET
    status = 'SUCCEEDED',
    payment_intent_id = COALESCE(EXCLUDED.payment_intent_id, payments.payment_intent_id),
    amount = p_amount_paid,
    currency = UPPER(TRIM(p_currency))
  WHERE payments.order_id = p_order_id  -- Ensure we only update our own order's payment
  RETURNING * INTO v_payment;

  -- Verify payment was actually created/updated
  IF v_payment IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'PAYMENT_UPSERT_FAILED');
  END IF;

  -- Verify payment belongs to the expected order
  IF v_payment.order_id::TEXT != p_order_id::TEXT THEN
    RETURN jsonb_build_object('success', false, 'error', 'PAYMENT_ORDER_MISMATCH', 'payment_order_id', v_payment.order_id);
  END IF;

  -- Already-paid orders still need the validated payment identifiers repaired.
  IF v_order.payment_status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true, 'order_id', p_order_id);
  END IF;

  -- Mark order as paid atomically with payment
  UPDATE public.orders
  SET
    status = 'PAID',
    payment_status = 'SUCCEEDED',
    paid_at = NOW()
  WHERE id = p_order_id
    AND payment_status != 'SUCCEEDED'  -- Defensive: don't revert already-paid orders
    AND status NOT IN ('CANCELLED', 'REFUNDED', 'COMPLETED', 'DISPUTED');  -- Don't revive incompatible orders

  -- Record success event (idempotent via order status check)
  INSERT INTO public.events (
    type,
    seller_id,
    order_id,
    amount,
    currency,
    metadata
  )
  SELECT
    'PAYMENT_SUCCEEDED',
    v_order.seller_id,
    p_order_id,
    v_expected_amount,
    v_order.currency,
    '{}'::JSONB
  WHERE NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE order_id = p_order_id
    AND type = 'PAYMENT_SUCCEEDED'
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'payment_id', v_payment.id,
    'amount', p_amount_paid,
    'currency', p_currency
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'sqlstate', SQLSTATE
    );
END;
$$;

-- Revoke public execution and grant only to service role
REVOKE EXECUTE ON FUNCTION public.complete_payment_and_mark_order_paid(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_payment_and_mark_order_paid(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_payment_and_mark_order_paid(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_payment_and_mark_order_paid(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM postgres;
GRANT EXECUTE ON FUNCTION public.complete_payment_and_mark_order_paid(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. EVENT COMPLETION FUNCTION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_webhook_event_processed(
  p_event_id TEXT,
  p_processing_attempt_id BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  -- Only mark as processed if we still own the lease AND lease is still valid
  -- This prevents stale workers from finalizing after lease expiration
  UPDATE public.stripe_webhook_events
  SET
    status = 'PROCESSED',
    processed_at = NOW(),
    processing_started_at = NULL,
    lease_expires_at = NULL
  WHERE id = p_event_id
    AND status = 'PROCESSING'
    AND attempt_count = p_processing_attempt_id
    AND lease_expires_at > NOW();  -- Additional lease validity check

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- Lost the race, lease expired, or attempt count changed
    RETURN jsonb_build_object('success', false, 'error', 'LEASE_LOST_OR_STALE');
  END IF;

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
END;
$$;

-- Revoke public execution and grant only to service role
REVOKE EXECUTE ON FUNCTION public.mark_webhook_event_processed(TEXT, BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_webhook_event_processed(TEXT, BIGINT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_webhook_event_processed(TEXT, BIGINT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_webhook_event_processed(TEXT, BIGINT) FROM postgres;
GRANT EXECUTE ON FUNCTION public.mark_webhook_event_processed(TEXT, BIGINT) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. EVENT FAILURE FUNCTION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_webhook_event_failed(
  p_event_id TEXT,
  p_processing_attempt_id BIGINT,
  p_error_message TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  -- Only mark as failed if we still own the lease AND lease is still valid
  UPDATE public.stripe_webhook_events
  SET
    status = 'FAILED',
    last_error = p_error_message,
    processing_started_at = NULL,
    lease_expires_at = NULL
  WHERE id = p_event_id
    AND status = 'PROCESSING'
    AND attempt_count = p_processing_attempt_id
    AND lease_expires_at > NOW();  -- Additional lease validity check

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    -- Lost the race, lease expired, or attempt count changed
    RETURN jsonb_build_object('success', false, 'error', 'LEASE_LOST_OR_STALE');
  END IF;

  RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
END;
$$;

-- Revoke public execution and grant only to service role
REVOKE EXECUTE ON FUNCTION public.mark_webhook_event_failed(TEXT, BIGINT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_webhook_event_failed(TEXT, BIGINT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_webhook_event_failed(TEXT, BIGINT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_webhook_event_failed(TEXT, BIGINT, TEXT) FROM postgres;
GRANT EXECUTE ON FUNCTION public.mark_webhook_event_failed(TEXT, BIGINT, TEXT) TO service_role;

COMMIT;

-- -----------------------------------------------------------------------------
-- VERIFICATION (run after applying)
-- -----------------------------------------------------------------------------
-- 1. Confirm new columns exist:
--
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_name = 'stripe_webhook_events'
--    AND column_name IN ('status', 'processing_started_at', 'lease_expires_at',
--                        'attempt_count', 'processed_at', 'last_error')
--  ORDER BY column_name;
-- -- expect 6 rows
--
-- 2. Confirm functions exist:
--
-- SELECT routine_name
--   FROM information_schema.routines
--  WHERE routine_schema = 'public'
--    AND routine_name IN ('claim_stripe_event',
--                        'complete_payment_and_mark_order_paid',
--                        'mark_webhook_event_processed',
--                        'mark_webhook_event_failed');
-- -- expect 4 rows
--
-- 3. Confirm permissions are restricted:
--
-- SELECT routine_name, grantee, privilege_type
--   FROM information_schema.routine_privileges
--  WHERE routine_schema = 'public'
--    AND routine_name IN ('claim_stripe_event',
--                        'complete_payment_and_mark_order_paid',
--                        'mark_webhook_event_processed',
--                        'mark_webhook_event_failed');
-- -- expect only service_role with EXECUTE
--
-- 4. Test claiming a new event:
--
-- SELECT claim_stripe_event(
--   'evt_test123',
--   'checkout.session.completed',
--   '{"test": true}'::JSONB
-- );
-- -- should return outcome='claimed'
--
-- 5. Test idempotent claim:
--
-- SELECT claim_stripe_event(
--   'evt_test123',
--   'checkout.session.completed',
--   '{"test": true}'::JSONB
-- );
-- -- should return outcome='already_claimed' (if still processing)
-- -- or outcome='already_processed' (after marking processed)
--
-- 6. Verify historical events are marked FAILED:
--
-- SELECT id, status, last_error
--   FROM stripe_webhook_events
--  WHERE last_error LIKE '%Migrated from legacy schema%';
-- -- expect status='FAILED' with reconciliation message
--
-- 7. Test lease duration validation:
--
-- SELECT claim_stripe_event(
--   'evt_invalid_lease',
--   'checkout.session.completed',
--   '{"test": true}'::JSONB,
--   5  -- Too short (less than 10 seconds)
-- );
-- -- should return outcome='invalid_lease_duration'
