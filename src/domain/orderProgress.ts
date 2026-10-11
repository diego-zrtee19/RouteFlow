import type { OrderStatus } from "./types";

export function orderProgress(status: OrderStatus, coordinated: boolean) {
  const stages = ["Pago confirmado", "Preparando pedido", coordinated ? "Entrega coordinada" : "En camino", "Entrega confirmada"];
  const index = status === "COMPLETED" ? 3 : ["IN_TRANSIT", "DELIVERED"].includes(status) ? 2 : status === "READY_TO_SHIP" ? 1 : status === "PAID" ? 0 : -1;
  const exception = status === "DISPUTED" ? "Hay un caso en revisión. Consulta sus mensajes y evidencia antes de confirmar la entrega." : status === "REFUNDED" ? "El pedido fue reembolsado. Consulta el importe en tu recibo." : status === "CANCELLED" ? "El pedido está cancelado." : null;
  return { stages, index: exception ? -1 : index, exception };
}
