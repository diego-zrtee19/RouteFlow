export function disputeGuidance(
  status: string,
  sellerResponse: string | null,
  responseDueAt: string,
  audience: "buyer" | "seller" | "admin",
  now = Date.now(),
) {
  const open = ["OPEN", "UNDER_REVIEW"].includes(status);
  const awaitingSeller = open && !sellerResponse;
  const due = Date.parse(responseDueAt);
  const overdue = awaitingSeller && Number.isFinite(due) && due < now;
  return {
    open,
    awaitingSeller,
    overdue,
    owner: !open
      ? "Caso cerrado"
      : awaitingSeller
        ? "Vendedor: responder lo ocurrido"
        : "RouteFlow: revisar respuesta y evidencia",
    next: !open
      ? "Consulta la resolución y conserva el recibo."
      : audience === "seller" && awaitingSeller
        ? "Explica qué ocurrió, qué solución propones y agrega evidencia si la tienes."
        : awaitingSeller
          ? "Esperamos la respuesta del vendedor. Puedes agregar evidencia al mismo caso."
          : "Revisa la respuesta publicada. Si hay información relevante que falta, agrega evidencia al caso.",
    timing: overdue
      ? "Venció el plazo solicitado al vendedor. El caso sigue abierto para revisión; no implica un reembolso automático."
      : awaitingSeller
        ? "La fecha indicada es el plazo solicitado al vendedor, no una fecha garantizada de resolución."
        : open
          ? "Todavía no hay una fecha de resolución confirmada. Las novedades aparecerán en este caso."
          : "Este caso ya no requiere una respuesta pendiente.",
  };
}
