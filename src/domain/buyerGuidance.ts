import type { BuyerOrderView } from "./dto";

export function buyerGuidance(
  order: Pick<BuyerOrderView, "status" | "deliveryMethod" | "shipment">,
) {
  if (order.status === "DISPUTED")
    return {
      happened: "Se abrió un caso sobre tu compra.",
      next: "Consulta el caso, la respuesta del vendedor y la evidencia.",
      delayed: "Si falta información, agrégala al caso existente; no necesitas abrir otro.",
    };
  if (["REFUNDED", "CANCELLED"].includes(order.status))
    return {
      happened:
        order.status === "REFUNDED"
          ? "El pedido registra un reembolso."
          : "El pedido fue cancelado.",
      next: "Conserva el recibo y revisa el detalle del pedido.",
      delayed: "Consulta Ayuda si necesitas aclarar el resultado.",
    };
  if (["COMPLETED", "BUYER_CONFIRMED"].includes(order.status))
    return {
      happened: "La entrega fue confirmada.",
      next: "Conserva tu recibo y consulta el caso si existe uno.",
      delayed: "Si detectas un problema, revisa las condiciones de ayuda de tu pedido.",
    };
  if (["DELIVERED"].includes(order.status))
    return {
      happened: "La paquetería registró la entrega.",
      next: "Comprueba que recibiste todos los artículos antes de confirmar.",
      delayed: "Si no lo recibiste aunque figure entregado, usa Tengo un problema.",
    };
  if (["SHIPPED", "IN_TRANSIT"].includes(order.status))
    return {
      happened: "Tu pedido está en camino.",
      next: "Consulta el rastreo y sus últimas actualizaciones.",
      delayed: "Si la estimación ya pasó o el rastreo no cambia, solicita ayuda desde el pedido.",
    };
  if (["PAID", "READY_TO_SHIP"].includes(order.status))
    return {
      happened: "El pago está confirmado.",
      next:
        order.deliveryMethod === "shipping"
          ? order.shipment
            ? "Se creó la guía. El rastreo confirmará cuándo la paquetería reciba el paquete."
            : "El vendedor debe preparar el paquete y generar la guía."
          : "Acuerda lugar y fecha con el vendedor. Comparte el NIP solo después de recibir y revisar todos los artículos.",
      delayed:
        "Si el vendedor no cumple lo acordado o no responde, usa Tengo un problema y describe lo ocurrido.",
    };
  return {
    happened: "El pago todavía no está confirmado.",
    next: "Espera la actualización del pedido. No entregues tu NIP ni pagues nuevamente sin revisar tu recibo.",
    delayed: "Si ya pagaste y no se actualiza, conserva el comprobante y consulta Ayuda.",
  };
}
