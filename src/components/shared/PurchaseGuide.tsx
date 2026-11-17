import Link from "next/link";
import { CreditCard, PackageCheck, MessageCircle } from "lucide-react";

export function PurchaseGuide() {
  return (
    <section className="border-t border-slate-300 py-6 text-sm space-y-5">
      <h2 className="font-medium text-lg text-slate-900">Tu compra, paso a paso</h2>
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { Icon: CreditCard, title: "Paga con tarjeta", body: "Stripe procesa tu pago." },
          {
            Icon: PackageCheck,
            title: "Recibe tu producto",
            body: "Consulta el pedido y confirma al recibir.",
          },
          {
            Icon: MessageCircle,
            title: "Pide ayuda si la necesitas",
            body: "Abre un caso desde tu pedido.",
          },
        ].map(({ Icon, title, body }) => (
          <div className="flex items-start gap-3" key={title}>
            <span className="flex size-6 shrink-0 items-center justify-center text-slate-500">
              <Icon className="size-4" />
            </span>
            <div>
              <p className="font-medium text-slate-800">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
            </div>
          </div>
        ))}
      </div>
      <details className="border-t border-slate-100 pt-3">
        <summary className="cursor-pointer text-sm font-medium text-accent-700 min-h-11 py-3">
          Qué debes saber sobre entrega y ayuda
        </summary>
        <p className="mt-2 leading-relaxed text-slate-600">
          RouteFlow registra el pedido y su seguimiento. El vendedor prepara el producto y coordina
          la entrega o genera la guía de FedEx. Comparte el NIP solo después de recibir y revisar el
          producto. Si hay un problema, agrega evidencia al caso; abrirlo no garantiza un reembolso
          automático.
        </p>
        <Link
          href="/help"
          className="inline-block min-h-11 py-3 font-medium text-accent-700 underline"
        >
          Entregas, cancelaciones y reembolsos
        </Link>
      </details>
    </section>
  );
}
