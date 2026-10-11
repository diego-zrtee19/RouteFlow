import { orderMoney } from "@/domain/orderMoney";
export function OrderMoney({ total, fee, refunded, itemTotal, currency, settlement, paid }: { total: number; fee: number; refunded: number; itemTotal: number; currency: string; settlement: string; paid: boolean }) {
  const m = orderMoney(total, fee, refunded, itemTotal);
  const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(n);
  return <section className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-bold">Dinero de este pedido</h2>
    {!paid && <p className="text-amber-800 text-sm">Pago no confirmado. Los siguientes importes corresponden al pedido y no a un cobro recibido.</p>}
    <dl className="text-sm space-y-2">{[["Total cobrado", m.total], ["Envío incluido en el total", m.shipping], ["Reembolso confirmado", m.refunded], ["Comisión después de reembolsos", m.retainedFee], ["Neto para el vendedor", m.sellerNet]].map(([label, value]) => <div className="flex justify-between gap-3" key={String(label)}><dt>{label}</dt><dd className="font-semibold whitespace-nowrap">{money(Number(value))}</dd></div>)}</dl>
    <p className="text-sm">{settlement === "TRANSFERRED" ? "Transferencia a tu cuenta Stripe registrada. El depósito bancario tiene su propio plazo." : settlement === "REVERSED" ? "La transferencia fue revertida por un reembolso." : settlement === "FAILED" ? "La transferencia requiere atención. Revisa Stripe y los avisos de tu tienda." : settlement === "PROCESSING" ? "Transferencia en proceso." : "Pendiente de transferencia: se procesa después de completar la entrega y revisar los bloqueos del pedido."}</p>
    <p className="text-xs text-slate-500">El neto incluye el envío cobrado al comprador; no equivale a utilidad. No descuenta tus costos de producto o logística ni cargos adicionales del proveedor.</p>
  </section>;
}
