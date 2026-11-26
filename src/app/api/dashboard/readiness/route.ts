import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorResponse } from "@/lib/apiResponse";
import { readableNotificationBody } from "@/domain/notificationMessage";
export async function GET() {
  const a = await requireSeller();
  if (!a.ok) return apiErrorResponse(a.code, "Seller access required", a.status);
  try {
    const db = getSupabaseAdmin();
    const [
      { data: s, error: se },
      { data: products, error: pe },
      { data: notes, error: ne },
      { data: orders, error: oe },
      { data: alerts, error: ale },
      pending,
      followups,
      inventory,
    ] = await Promise.all([
      db
        .from("sellers")
        .select(
          "contact_email,contact_phone,ship_from_address,stripe_account_id,stripe_transfers_enabled,stripe_payouts_enabled",
        )
        .eq("id", a.value.id)
        .single(),
      db
        .from("products")
        .select("id,title,stock,weight_kg,package_dimensions,delivery_options,is_active")
        .eq("seller_id", a.value.id),
      db
        .from("notification_outbox")
        .select("id,subject,body,status,created_at,order_id")
        .eq("seller_id", a.value.id)
        .eq("audience", "seller")
        .order("created_at", { ascending: false })
        .limit(15),
      db
        .from("orders")
        .select("id,order_number,status,delivery_method,settlement_status,settlement_error")
        .eq("seller_id", a.value.id)
        .order("created_at", { ascending: false })
        .limit(10),
      db
        .from("operational_alerts")
        .select("id,kind,order_id,message")
        .eq("seller_id", a.value.id)
        .eq("status", "OPEN")
        .order("created_at", { ascending: false })
        .limit(20),
      db
        .from("orders")
        .select("id,order_number,status,delivery_method", { count: "exact" })
        .eq("seller_id", a.value.id)
        .in("status", ["PAID", "READY_TO_SHIP", "DISPUTED"])
        .order("created_at", { ascending: true })
        .limit(12),
      db
        .from("seller_customer_followup")
        .select("email,followup_at", { count: "exact" })
        .eq("seller_id", a.value.id)
        .not("followup_at", "is", null)
        .lte("followup_at", new Date(Date.now() + 86400000).toISOString())
        .order("followup_at", { ascending: true })
        .limit(12),
      db
        .from("product_business_details")
        .select("product_id,low_stock_threshold")
        .eq("seller_id", a.value.id)
        .order("product_id")
        .limit(1001),
    ]);
    if (se || pe || ne || oe || ale || pending.error || followups.error || inventory.error)
      throw se || pe || ne || oe || ale || pending.error || followups.error || inventory.error;
    const imported = (inventory.data ?? []).slice(0, 1000);
    const drafts = (products ?? []).filter(
      (p) => !p.is_active && imported.some((d) => d.product_id === p.id),
    );
    const lowStock = (products ?? []).filter(
      (p) =>
        p.is_active &&
        p.stock <= (imported.find((d) => d.product_id === p.id)?.low_stock_threshold ?? 3),
    );
    const origin = s.ship_from_address;
    const configured =
      origin &&
      ["fullName", "phone", "street", "city", "state", "postalCode", "country"].every(
        (k) => origin[k],
      );
    const shipping = (products ?? []).filter(
      (p) => p.is_active && p.delivery_options?.includes("shipping"),
    );
    const incompletePackages = shipping.filter(
      (p) =>
        !(
          Number(p.weight_kg) > 0 &&
          p.package_dimensions &&
          ["length", "width", "height"].every((k) => Number(p.package_dimensions[k]) > 0)
        ),
    );
    return NextResponse.json(
      {
        checks: [
          {
            label: "Datos de contacto",
            done: Boolean(s.contact_email && s.contact_phone),
            href: "/dashboard/settings",
          },
          {
            label: "Dirección real de origen",
            done:
              shipping.length === 0 ||
              Boolean(configured && !JSON.stringify(origin).toUpperCase().includes("DEMO")),
            href: "/dashboard/settings",
          },
          {
            label: "Primer producto publicado",
            done: (products ?? []).some((p) => p.is_active),
            href: "/dashboard/products/new",
          },
          {
            label: "Peso y dimensiones de productos con envío",
            done: shipping.every(
              (p) =>
                Number(p.weight_kg) > 0 &&
                p.package_dimensions &&
                ["length", "width", "height"].every((k) => Number(p.package_dimensions[k]) > 0),
            ),
            href: "/dashboard/products",
          },
          {
            label: "Cuenta de Stripe lista para recibir fondos",
            done: Boolean(
              s.stripe_account_id && s.stripe_transfers_enabled && s.stripe_payouts_enabled,
            ),
            href: "/dashboard/settings",
          },
        ],
        notifications: (notes ?? []).map((note) => ({
          ...note,
          body: readableNotificationBody(note.body),
        })),
        alerts: alerts ?? [],
        taskSummary: {
          pendingOrders: pending.count ?? pending.data?.length ?? 0,
          incompletePackages: incompletePackages.length,
          dueContacts: followups.count ?? followups.data?.length ?? 0,
          lowStock: lowStock.length,
          importedDrafts: drafts.length,
          inventoryMayBePartial:
            (inventory.data ?? []).length > 1000 || (products ?? []).length >= 1000,
        },
        actions: [
          ...(pending.data ?? [])
            .sort((a, b) => Number(b.status === "DISPUTED") - Number(a.status === "DISPUTED"))
            .map((o) => ({
              id: o.id,
              label: `${o.order_number}: ${o.status === "DISPUTED" ? "Responder al caso" : o.delivery_method === "shipping" ? "Preparar envío / generar etiqueta" : "Coordinar entrega / confirmar NIP"}`,
              href:
                o.status === "DISPUTED"
                  ? `/dashboard/disputes#case-order-${o.id}`
                  : `/dashboard/orders/${o.id}`,
            })),
          ...incompletePackages.map((product) => ({
            id: `package-${product.id}`,
            label: `${product.title}: completa el peso y las dimensiones del paquete`,
            href: `/dashboard/products#product-${product.id}`,
          })),
          ...(followups.data ?? []).map((f) => ({
            id: `contact-${f.email}`,
            label: `Seguimiento pendiente: ${f.email}. Fecha: ${new Date(f.followup_at).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`,
            href: `/dashboard/customers?search=${encodeURIComponent(f.email)}`,
          })),
          ...lowStock
            .slice(0, 12)
            .map((p) => ({
              id: `stock-${p.id}`,
              label: `${p.title}: quedan ${p.stock} unidades`,
              href: `/dashboard/products#product-${p.id}`,
            })),
          ...drafts
            .slice(0, 12)
            .map((p) => ({
              id: `draft-${p.id}`,
              label: `${p.title}: revisa el borrador importado antes de publicarlo`,
              href: "/dashboard/products/import",
            })),
        ],
        settlements: (orders ?? []).filter((o) => o.status === "COMPLETED"),
        emailDelivery:
          process.env.ROUTEFLOW_EMAIL_DELIVERY === "enabled" && Boolean(process.env.RESEND_API_KEY),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return apiErrorResponse(
      "INTERNAL_ERROR",
      "No se pudo cargar la preparación de tu tienda",
      500,
      e,
    );
  }
}
