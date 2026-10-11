import type { BuyerOrderView } from "@/domain/dto";
import { orderProgress } from "@/domain/orderProgress";

export function OrderProgress({ order }: { order: BuyerOrderView }) {
  const progress = orderProgress(order.status, order.deliveryMethod !== "shipping");
  return <section className="rounded-xl border bg-white p-5 space-y-3" aria-label="Progreso del pedido">
    <h2 className="font-bold">Estado de tu entrega</h2>
    {progress.exception ? <p role="status" className="text-amber-800">{progress.exception}</p> : <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {progress.stages.map((label, i) => <li key={label} aria-current={i === progress.index ? "step" : undefined} className={`rounded-lg p-3 text-sm ${i <= progress.index ? "bg-blue-50 text-blue-900" : "bg-slate-50 text-slate-500"}`}>
        <span className="block font-bold">{i <= progress.index ? "✓" : i + 1}</span>{label}
      </li>)}
    </ol>}
    {!progress.exception && <p className="text-sm text-slate-600">{progress.index < 0 ? "Estamos esperando la confirmación del pago." : progress.index === 0 ? "Pago recibido. El siguiente paso es que el vendedor prepare la entrega." : progress.index === 1 ? "El vendedor está preparando tu producto." : progress.index === 2 ? "Revisa el rastreo o los detalles de entrega. Confirma únicamente cuando recibas el producto." : "Compra completada. Conserva tu recibo."}</p>}
    {order.shipment?.estimatedDelivery && <p className="text-sm">Entrega estimada por la paquetería: {order.shipment.estimatedDelivery}</p>}
    {order.shipment?.lastEvent && <p className="text-sm">Última actualización: {order.shipment.lastEvent.description} · {new Date(order.shipment.lastEvent.occurredAt).toLocaleString("es-MX")}</p>}
  </section>;
}
