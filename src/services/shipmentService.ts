import { ShippingRegistry } from "@/providers/shipping";
import {
  NotConfiguredError,
  ValidationError,
  DatabaseError,
} from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createShipment,
  findShipmentByOrder,
  recordShipmentEvents,
  updateShipmentStatus,
  listShipmentEvents,
} from "@/repositories/shipmentRepository";
import { transitionOrder } from "@/repositories/orderRepository";
import { recordEvent } from "@/services/orderService";
import type { CreateShipmentInput } from "@/providers/shipping/types";
import type {
  Order,
  Seller,
  Shipment,
  ShipmentEvent,
  ShippingProviderType,
} from "@/domain/types";

/**
 * SHIPMENT SERVICE.
 *
 * The audit found `dataStore.createShipmentForOrder` built carrier requests
 * from invented data:
 *
 *   street: "Default Address", state: "N/A", postalCode: "00000",
 *   weightKg: 1,  // "In production, this should come from product data"
 *
 * That produces labels with a fabricated origin and a wrong parcel weight;
 * DHL/FedEx reject them, so the failure only appeared in production.
 *
 * This module refuses to dispatch unless the data is real. Missing configuration
 * is a typed error, not something to paper over with a default.
 *
 * It is now decoupled from `dataStore`: the Order arrives from
 * `orderRepository` and everything written goes through `shipmentRepository`.
 */

export interface DispatchOptions {
  provider: ShippingProviderType;
  serviceCode: string;
}
/**
 * Creates a real shipment for a paid order and persists it.
 *
 * Throws `ValidationError` when the seller has no origin address or the product
 * has no weight — both are configuration errors the seller must fix.
 */
export async function dispatchOrder(
  order: Order,
  seller: Seller,
  options: DispatchOptions,
): Promise<Shipment> {
  // 1. Refuse to ship an unpaid order.
  if (order.paymentStatus !== "SUCCEEDED") {
    throw new ValidationError("Only a paid order can be dispatched");
  }
  if (order.deliveryMethod !== "shipping") {
    throw new ValidationError(
      "La entrega coordinada se confirma con el NIP del comprador.",
    );
  }
  const priorShipment = await findShipmentByOrder(order.id);
  if (priorShipment) return priorShipment;
  if (!["PAID", "READY_TO_SHIP"].includes(order.status)) {
    throw new ValidationError(
      "El estado del pedido no permite generar una etiqueta.",
    );
  }

  // 2. The seller must have configured a real origin.
  const { data: stored, error: profileError } = await getSupabaseAdmin()
    .from("orders")
    .select("shipping_profile,shipping_service")
    .eq("id", order.id)
    .eq("seller_id", seller.id)
    .single();
  if (profileError)
    throw new DatabaseError("No se pudo consultar el paquete del pedido");
  const profile = stored.shipping_profile as {
    origin?: typeof seller.shipFromAddress;
    weightKg?: number;
    dimensions?: { length: number; width: number; height: number };
  } | null;
  const origin = profile?.origin ?? seller.shipFromAddress;
  if (
    stored.shipping_service &&
    options.serviceCode !== stored.shipping_service
  )
    throw new ValidationError(
      "Utiliza el servicio FedEx que el comprador pagó",
    );
  if (!origin) {
    throw new ValidationError(
      "Shipping is not configured for this store. Add a ship-from address in Settings before creating a shipment.",
    );
  }
  assertAddressComplete(origin, "ship-from");

  // 3. The recipient address comes from the order, captured at checkout.
  assertAddressComplete(order.shippingAddress, "delivery");

  // 4. The product must declare a real weight.
  const weightKg = profile?.weightKg
    ? Number(profile.weightKg)
    : await resolveProductWeight(order);
  if (weightKg === null) {
    throw new ValidationError(
      "This product has no shipping weight configured, so a real label cannot be created.",
    );
  }

  const provider = ShippingRegistry.getProvider(options.provider);
  if (!provider.isConfigured()) {
    throw new NotConfiguredError(
      `${provider.name} is not configured. Set the required environment variables before creating a shipment.`,
    );
  }

  // 5. Dispatch is idempotent: a second call returns the existing shipment
  // rather than buying another label.
  const existing = await findShipmentByOrder(order.id);
  if (existing) return existing;

  const input: CreateShipmentInput = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    serviceCode: options.serviceCode,
    sender: {
      name: origin.fullName || seller.storeName,
      phone: origin.phone || seller.contactPhone || "",
      email: seller.contactEmail ?? undefined,
      street: origin.street,
      city: origin.city,
      state: origin.state,
      postalCode: origin.postalCode,
      country: origin.country,
    },
    recipient: {
      name: order.shippingAddress.fullName,
      phone: order.shippingAddress.phone,
      email: order.buyerEmail,
      street: order.shippingAddress.street,
      city: order.shippingAddress.city,
      state: order.shippingAddress.state,
      postalCode: order.shippingAddress.postalCode,
      country: order.shippingAddress.country,
    },
    packageDetails: {
      weightKg,
      description: order.items[0]?.title ?? "Package",
      dimensions: profile?.dimensions ?? undefined,
    },
  };

  const result = await provider.createShipment(input);

  if (!result.success) {
    // Surface the carrier's reason instead of reporting a false success.
    throw new DatabaseError(
      result.error ?? `${provider.name} could not create the shipment`,
    );
  }

  let labelUrl = result.labelUrl ?? null;
  if (result.labelBase64) {
    const { error } = await getSupabaseAdmin()
      .storage.from("shipping-labels")
      .upload(`${order.id}.pdf`, Buffer.from(result.labelBase64, "base64"), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (error)
      throw new DatabaseError(
        "La guía se creó, pero no se pudo guardar su etiqueta. Contacta a soporte antes de reintentar.",
      );
    labelUrl = `/api/orders/${order.id}/label`;
  }
  const shipment = await createShipment({
    orderId: order.id,
    provider: options.provider,
    providerShipmentId: result.providerShipmentId,
    trackingNumber: result.trackingNumber,
    serviceCode: options.serviceCode,
    carrierName: provider.name,
    status: result.status,
    trackingUrl: result.trackingUrl,
    labelUrl,
    estimatedDelivery: result.estimatedDelivery,
  });

  // The label creation itself is the first carrier scan.
  await recordShipmentEvents(shipment.id, [
    {
      status: result.status,
      description: `Label created with ${provider.name}`,
      location: null,
      occurredAt: new Date().toISOString(),
    },
  ]);

  await recordEvent({
    type: "ORDER_SHIPPED",
    sellerId: order.sellerId,
    orderId: order.id,
    metadata: { provider: options.provider, tracking: result.trackingNumber },
  });

  // Move the order along the state machine, never by direct write.
  await transitionOrder(order, "SHIPPED");

  return shipment;
}
/**
 * Refreshes tracking from the carrier and persists new scans.
 *
 * A carrier failure is raised, never swallowed: the audit found the old code
 * returned the *stale* shipment with `ok: true`, so a parcel delivered days ago
 * could still be reported as in transit.
 */
export async function refreshTracking(
  order: Order,
  provider: ShippingProviderType,
): Promise<{ status: Shipment["status"]; events: ShipmentEvent[] }> {
  const shipment = await findShipmentByOrder(order.id);
  if (!shipment) {
    throw new ValidationError("This order has no shipment yet");
  }

  const client = ShippingRegistry.getProvider(provider);
  if (!client.isConfigured()) {
    throw new NotConfiguredError(
      `${client.name} is not configured, so tracking cannot be refreshed`,
    );
  }

  const tracking = await client.getTracking(shipment.trackingNumber);

  const updated = await updateShipmentStatus(shipment.id, tracking.status);

  const scanned = Array.isArray(tracking.events) ? tracking.events : [];
  if (scanned.length > 0) {
    // The carrier interface names this `timestamp`; the domain model calls it
    // `occurredAt`, because that is when the carrier saw the event, not when we
    // happened to poll.
    await recordShipmentEvents(
      shipment.id,
      scanned.map((event) => ({
        status: event.status,
        description: event.description,
        location: event.location ?? null,
        occurredAt: event.timestamp,
      })),
    );
  }

  if (tracking.status === "DELIVERED" && updated) {
    await recordEvent({
      type: "ORDER_DELIVERED",
      sellerId: order.sellerId,
      orderId: order.id,
      metadata: { tracking: shipment.trackingNumber },
    });
    await transitionOrder(order, "DELIVERED");
  }

  return {
    status: tracking.status,
    events: await listShipmentEvents(shipment.id),
  };
}

/** Reads the product weight. Null when it is genuinely not configured. */
async function resolveProductWeight(order: Order): Promise<number | null> {
  const productIds = order.items.map((item) => item.productId).filter(Boolean);
  if (productIds.length === 0) return null;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .select("weight_kg")
    .in("id", productIds)
    .limit(1);

  if (error)
    throw new DatabaseError(
      `Could not read the product weight: ${error.message}`,
    );

  const weight = data?.[0]?.weight_kg;
  if (weight === null || weight === undefined) return null;

  const parsed = Number(weight);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Rejects an incomplete address instead of substituting placeholders.
 *
 * The old code filled gaps with "Default Address" / "N/A" / "00000", which the
 * carriers reject at label creation time.
 */
function assertAddressComplete(
  address: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  },
  label: string,
): void {
  const missing: string[] = [];
  if (!address.street?.trim()) missing.push("street");
  if (!address.city?.trim()) missing.push("city");
  if (!address.state?.trim()) missing.push("state");
  if (!address.postalCode?.trim()) missing.push("postalCode");
  if (!address.country?.trim()) missing.push("country");

  if (missing.length > 0) {
    throw new ValidationError(
      `The ${label} address is incomplete (missing: ${missing.join(", ")}). ` +
        `A real label cannot be created with placeholder values.`,
    );
  }
}
