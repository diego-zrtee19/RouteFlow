export type ConversationSale = {
  id: string;
  publicId: string;
  url: string;
  subtotal: number;
  currency: string;
  lines: { title: string; quantity: number; unit_price: number; line_total: number }[];
  createdAt: string;
  expiresAt: string;
  sharedAt: string | null;
  cancelledAt: string | null;
  order: {
    id: string;
    number: string;
    status: string;
    paymentStatus: string;
    deliveryMethod: string;
    trackingNumber: string | null;
  } | null;
};

export function conversationSaleProgress(
  sale: Pick<ConversationSale, "cancelledAt" | "expiresAt" | "sharedAt" | "order">,
  now = Date.now(),
) {
  const order = sale.order;
  if (order?.status === "REFUNDED")
    return { label: "Reembolsado", step: -1, action: "Revisar pedido" };
  if (order?.status === "DISPUTED")
    return { label: "Caso en revisión", step: -1, action: "Atender caso" };
  if (order?.status === "CANCELLED")
    return { label: "Pedido cancelado", step: -1, action: "Revisar pedido" };
  if (order && ["COMPLETED", "BUYER_CONFIRMED"].includes(order.status))
    return { label: "Entrega confirmada", step: 4, action: "Ver pedido" };
  if (order?.paymentStatus === "SUCCEEDED") {
    if (order.status === "DELIVERED")
      return {
        label: "Entrega reportada · falta confirmación",
        step: 4,
        action: "Revisar entrega",
      };
    if (order.status === "READY_TO_SHIP")
      return {
        label: "Listo para despacho",
        step: 3,
        action: order.deliveryMethod === "shipping" ? "Generar etiqueta" : "Coordinar entrega",
      };
    if (["SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(order.status))
      return { label: "Entrega en curso", step: 4, action: "Ver entrega" };
    return {
      label: "Pago confirmado · por preparar",
      step: 3,
      action: order.deliveryMethod === "shipping" ? "Preparar envío" : "Coordinar entrega",
    };
  }
  if (order)
    return { label: "Esperando confirmación del pago", step: 2, action: "Ver intento de compra" };
  if (sale.cancelledAt)
    return { label: "Enlace desactivado", step: -1, action: "Preparar otro enlace" };
  if (Date.parse(sale.expiresAt) <= now)
    return { label: "Enlace vencido", step: -1, action: "Preparar otro enlace" };
  return sale.sharedAt
    ? { label: "Enlace enviado · esperando compra", step: 2, action: "Ver enlace" }
    : { label: "Enlace preparado · por compartir", step: 1, action: "Compartir enlace" };
}
