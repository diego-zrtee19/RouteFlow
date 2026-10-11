import type { Shipment, ShipmentEvent, ShipmentStatus, ShippingProviderType } from "@/domain/types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { DatabaseError } from "@/lib/errors";

/**
 * SHIPMENT REPOSITORY — shipments + shipment_events.
 *
 * Replaces the in-memory shipment lifecycle that `dataStore` owned. Tracking
 * numbers now survive a restart, which is what made the buyer tracking page
 * unreliable before.
 *
 * Ordering guarantees relied upon by the UI:
 *   - `createShipment` is idempotent per order: a second dispatch returns the
 *     existing shipment instead of buying a second label.
 *   - `recordShipmentEvents` upserts on (shipment_id, status, occurred_at), so
 *     polling the same carrier repeatedly does not grow the event list.
 */

export interface CreateShipmentInput {
  orderId: string;
  provider: ShippingProviderType;
  providerShipmentId: string | null;
  trackingNumber: string;
  serviceCode: string;
  carrierName: string;
  status: ShipmentStatus;
  trackingUrl: string | null;
  labelUrl: string | null;
  estimatedDelivery: string | null;
}

export interface ShipmentEventInput {
  status: ShipmentStatus;
  description: string;
  location: string | null;
  occurredAt: string;
}

/** Creates the shipment for an order. Returns the existing one if present. */
export async function createShipment(input: CreateShipmentInput): Promise<Shipment> {
  const admin = getSupabaseAdmin();

  // Idempotency: one shipment per order, so a double click cannot buy two labels.
  const existing = await findShipmentByOrder(input.orderId);
  if (existing) return existing;

  const { data, error } = await admin
    .from("shipments")
    .insert({
      order_id: input.orderId,
      provider: input.provider,
      provider_shipment_id: input.providerShipmentId,
      tracking_number: input.trackingNumber,
      service_code: input.serviceCode,
      carrier_name: input.carrierName,
      status: input.status,
      tracking_url: input.trackingUrl,
      label_url: input.labelUrl,
      estimated_delivery: input.estimatedDelivery,
    })
    .select()
    .single();

  if (error || !data) {
    throw new DatabaseError(`Could not create the shipment: ${error?.message ?? "unknown"}`);
  }

  return rowToShipment(data as Record<string, unknown>);
}

/** The shipment for an order, or null when it has not shipped yet. */
export async function findShipmentByOrder(orderId: string): Promise<Shipment | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("shipments")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not load the shipment: ${error.message}`);
  return data ? rowToShipment(data as Record<string, unknown>) : null;
}

/** A shipment by its public tracking number (the buyer's lookup path). */
export async function findShipmentByTracking(
  trackingNumber: string
): Promise<Shipment | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("shipments")
    .select("*")
    .eq("tracking_number", trackingNumber)
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not load the shipment: ${error.message}`);
  return data ? rowToShipment(data as Record<string, unknown>) : null;
}

/** Updates the shipment status after a carrier poll. */
export async function updateShipmentStatus(
  shipmentId: string,
  status: ShipmentStatus
): Promise<Shipment | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("shipments")
    .update({ status })
    .eq("id", shipmentId)
    .select()
    .maybeSingle();

  if (error) throw new DatabaseError(`Could not update the shipment: ${error.message}`);
  return data ? rowToShipment(data as Record<string, unknown>) : null;
}
/**
 * Persists carrier scans.
 *
 * `ignoreDuplicates` + the UNIQUE (shipment_id, status, occurred_at) constraint
 * make a repeated poll of the same scan a no-op rather than a duplicate row.
 */
export async function recordShipmentEvents(
  shipmentId: string,
  events: ShipmentEventInput[]
): Promise<number> {
  if (events.length === 0) return 0;

  const admin = getSupabaseAdmin();
  const { error } = await admin.from("shipment_events").upsert(
    events.map((event) => ({
      shipment_id: shipmentId,
      status: event.status,
      description: event.description,
      location: event.location,
      occurred_at: event.occurredAt,
    })),
    { onConflict: "shipment_id,status,occurred_at", ignoreDuplicates: true }
  );

  if (error) {
    throw new DatabaseError(`Could not record shipment events: ${error.message}`);
  }
  return events.length;
}

/** Events for a shipment, newest first. */
export async function listShipmentEvents(shipmentId: string): Promise<ShipmentEvent[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("shipment_events")
    .select("*")
    .eq("shipment_id", shipmentId)
    .order("occurred_at", { ascending: false });

  if (error) throw new DatabaseError(`Could not list shipment events: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToShipmentEvent);
}

/** All shipments belonging to one seller (joined through their orders). */
export async function listShipmentsForSeller(sellerId: string): Promise<Shipment[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("shipments")
    .select("*, orders!inner(seller_id)")
    .eq("orders.seller_id", sellerId)
    .order("created_at", { ascending: false });

  if (error) throw new DatabaseError(`Could not list shipments: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToShipment);
}

/** Maps a `shipments` row to the domain type. */
export function rowToShipment(row: Record<string, unknown>): Shipment {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    provider: row.provider as ShippingProviderType,
    providerShipmentId: (row.provider_shipment_id as string) ?? null,
    trackingNumber: String(row.tracking_number ?? ""),
    serviceCode: String(row.service_code ?? ""),
    carrierName: String(row.carrier_name ?? ""),
    status: (row.status as ShipmentStatus) ?? "LABEL_CREATED",
    trackingUrl: (row.tracking_url as string) ?? null,
    labelUrl: (row.label_url as string) ?? null,
    estimatedDelivery: (row.estimated_delivery as string) ?? null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

/** Maps a `shipment_events` row to the domain type. */
export function rowToShipmentEvent(row: Record<string, unknown>): ShipmentEvent {
  return {
    id: String(row.id),
    shipmentId: String(row.shipment_id),
    status: row.status as ShipmentStatus,
    description: String(row.description ?? ""),
    location: (row.location as string) ?? null,
    occurredAt: String(row.occurred_at ?? new Date().toISOString()),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}
