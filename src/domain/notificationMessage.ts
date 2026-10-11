export function notificationMessage(kind: string, audience: string): string {
  if (kind === "PAID") return audience === "seller" ? "Nueva venta pagada. Abre el pedido para preparar el envío o coordinar la entrega." : "Tu pago está confirmado. El siguiente paso es preparar la entrega.";
  if (kind === "READY_TO_SHIP") return "El pedido está en preparación. Consulta los detalles de entrega en RouteFlow.";
  if (kind === "IN_TRANSIT") return "El pedido está en camino. Consulta el número de guía y las actualizaciones en tu pedido.";
  if (kind === "DELIVERED") return "La paquetería reportó la entrega. El comprador debe revisar el producto antes de confirmar la recepción.";
  if (kind === "COMPLETED") return "La entrega fue confirmada. Conserva el recibo y consulta el estado del pedido.";
  if (kind === "DISPUTED") return "Hay un problema reportado. Revisa el caso, responde y conserva la evidencia; evita confirmar la entrega mientras esté en revisión.";
  if (kind.includes("REFUND")) return "Consulta el importe y estado del reembolso en el recibo. El plazo de abono depende del banco.";
  return "Consulta el pedido en RouteFlow para ver el estado y el siguiente paso.";
}

export function readableNotificationBody(body: string): string {
  return body.replace(/\b\d+\.\d{3,}\b/g, value => Number(value).toFixed(2));
}
