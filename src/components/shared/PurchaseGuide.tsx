import Link from "next/link";

export function PurchaseGuide() {
  return <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm space-y-2">
    <h2 className="font-bold">Así funciona tu compra</h2>
    <p>Stripe procesa el pago. RouteFlow registra el pedido y su seguimiento. El vendedor prepara el producto y coordina la entrega o genera la guía de FedEx.</p>
    <p>En una entrega coordinada, comparte el NIP solo después de recibir y revisar el producto. En un envío, confirma la recepción desde tu pedido.</p>
    <p>Si hay un problema, abre un caso desde tu pedido y agrega evidencia. Un caso requiere revisión; abrirlo no garantiza un reembolso automático.</p>
    <Link href="/help" className="inline-block font-semibold text-blue-700 underline">Entregas, cancelaciones y reembolsos</Link>
  </section>;
}
