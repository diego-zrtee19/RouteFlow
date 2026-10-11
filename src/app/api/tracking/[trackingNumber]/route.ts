import { NextRequest, NextResponse } from "next/server";
import { ShippingRegistry } from "@/providers/shipping";
import type { ShippingProviderType } from "@/domain/types";

export const runtime = "nodejs";

/**
 * GET /api/tracking/[trackingNumber]?provider=DHL
 * Server-side tracking endpoint that calls the shipping provider's API
 * This ensures credentials are never exposed to the browser
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ trackingNumber: string }> }
) {
  const { trackingNumber } = await params;
  const { searchParams } = new URL(req.url);
  const provider = (searchParams.get("provider") || "DHL").toUpperCase() as ShippingProviderType;

  if (!trackingNumber) {
    return NextResponse.json({ error: "tracking_number_required" }, { status: 400 });
  }

  try {
    const shippingProvider = ShippingRegistry.getProvider(provider);

    if (!shippingProvider.isConfigured()) {
      return NextResponse.json(
        { error: "provider_not_configured", provider, status: "NOT_CONFIGURED" },
        { status: 503 }
      );
    }

    const trackingResult = await shippingProvider.getTracking(trackingNumber);

    return NextResponse.json({
      ok: true,
      tracking: trackingResult,
    });
  } catch (error) {
    console.error("Tracking request failed:", error);
    const errorMessage = error instanceof Error ? error.message : "Tracking service temporarily unavailable";
    return NextResponse.json(
      { error: errorMessage, provider },
      { status: 500 }
    );
  }
}
