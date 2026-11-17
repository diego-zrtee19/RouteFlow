import type { BuyerOrderView } from "@/domain/dto";
import { orderProgress } from "@/domain/orderProgress";
import { buyerGuidance } from "@/domain/buyerGuidance";
import Link from "next/link";
import { logisticsGuidance } from "@/domain/operationalExperience";

export function OrderProgress({ order }: { order: BuyerOrderView }) {
  const progress = orderProgress(order.status, order.deliveryMethod !== "shipping");
  const guidance = buyerGuidance(order);
  const updated =
    [order.shipment?.lastEvent?.occurredAt, order.updatedAt, order.paidAt, order.createdAt]
      .filter((v): v is string => !!v && Number.isFinite(Date.parse(v)))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? order.createdAt;
  const validDate = Number.isFinite(Date.parse(updated));
  return (
    <section className="rounded-lg border bg-white p-5 space-y-3" aria-label="Progreso del pedido">
      <h2 className="font-semibold">Estado de tu entrega</h2>
      {order.shipment && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm">
          {logisticsGuidance(order.shipment.status)}
        </p>
      )}
      {progress.exception ? (
        <p role="status" className="text-amber-800">
          {progress.exception}
        </p>
      ) : (
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3">
          {progress.stages.map((label, i) => (
            <li
              key={label}
              aria-current={i === progress.index ? "step" : undefined}
              className={`border-t-2 pt-3 text-sm ${i <= progress.index ? "border-accent-700 text-accent-700" : "border-slate-200 text-slate-500"}`}
            >
              <span className="block font-bold">{i <= progress.index ? "✓" : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      )}
      {!progress.exception && (
        <p className="text-sm text-slate-600">
          {progress.index < 0
            ? "Estamos esperando la confirmación del pago."
            : progress.index === 0
              ? "Pago recibido. El siguiente paso es que el vendedor prepare la entrega."
              : progress.index === 1
                ? "El vendedor está preparando tu producto."
                : progress.index === 2
                  ? "Revisa el rastreo o los detalles de entrega. Confirma únicamente cuando recibas el producto."
                  : "Compra completada. Conserva tu recibo."}
        </p>
      )}
      <dl className="grid sm:grid-cols-2 gap-5 border-t border-slate-200 pt-5 text-sm leading-relaxed text-slate-600">
        <div>
          <dt className="font-semibold text-slate-900 mb-1">¿Qué pasó?</dt>
          <dd>{guidance.happened}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900 mb-1">¿Qué sigue?</dt>
          <dd>{guidance.next}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold text-slate-900 mb-1">
            ¿Qué hago si hay un retraso o problema?
          </dt>
          <dd>{guidance.delayed}</dd>
        </div>
      </dl>
      {validDate && (
        <p className="text-sm text-slate-600">
          Último cambio registrado:{" "}
          <time dateTime={updated}>{new Date(updated).toLocaleString("es-MX")}</time>. Esta fecha no
          es una promesa de entrega.
        </p>
      )}
      {!progress.exception &&
        progress.index < 3 &&
        (order.shipment?.estimatedDelivery ? (
          <p className="text-sm">
            Estimación de la paquetería: {order.shipment.estimatedDelivery}. Puede cambiar; no es un
            compromiso confirmado del vendedor.
          </p>
        ) : (
          <p className="text-sm">
            {order.deliveryMethod === "shipping"
              ? "Todavía no hay una fecha estimada de paquetería."
              : "Confirma el lugar y la fecha con el vendedor; las instrucciones del recibo son lo propuesto al comprar."}
          </p>
        ))}
      {order.shipment?.lastEvent && (
        <p className="text-sm">
          Última actualización: {order.shipment.lastEvent.description} ·{" "}
          {new Date(order.shipment.lastEvent.occurredAt).toLocaleString("es-MX")}
        </p>
      )}
      <Link href="/help" className="inline-block min-h-11 py-3 text-accent-700 underline">
        Cómo pedir ayuda o solicitar una cancelación
      </Link>
    </section>
  );
}
