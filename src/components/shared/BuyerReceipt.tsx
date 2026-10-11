"use client";

import Image from "next/image";
import type { BuyerOrderView } from "@/domain/dto";
import { Card } from "@/components/ui/Card";

export type BuyerReceiptView = BuyerOrderView & { deliveryPin?: string | null };

export function BuyerReceipt({ order }: { order: BuyerReceiptView }) {
  const address = order.deliveryAddress;
  const coordinated = order.deliveryMethod !== "shipping";
  const money = (amount: number) => new Intl.NumberFormat("es-MX", {
    style: "currency", currency: order.currency,
  }).format(amount);
  return (
    <>
      <Card className="p-5 space-y-4">
        <div className="flex justify-between gap-3">
          <div><h2 className="font-bold">Recibo de compra</h2><p className="font-mono text-sm text-slate-500">{order.orderNumber}</p></div>
          <span className="text-xs font-bold rounded-full bg-emerald-50 text-emerald-800 px-3 py-2 self-start">{order.status}</span>
        </div>
        {!!order.refundedAmount && <p className="text-sm text-amber-800">{order.refundedAmount < order.amount ? "Reembolso parcial confirmado" : "Reembolso completo confirmado"}: {money(order.refundedAmount)}. Importe neto: {money(order.amount-order.refundedAmount)}.</p>}
        {order.items.map((item, index) => (
          <div key={`${item.title}-${index}`} className="flex items-center gap-3 border-t pt-3">
            {item.imageUrl && <Image src={item.imageUrl} alt={item.title} width={48} height={48} unoptimized className="rounded-lg object-cover" />}
            <div className="flex-1"><p className="font-semibold text-sm">{item.title}</p><p className="text-xs text-slate-500">Cantidad: {item.quantity}</p></div>
            <span className="text-sm font-semibold">{money(item.lineTotal)}</span>
          </div>
        ))}
        {order.amount > order.items.reduce((sum,item)=>sum+item.lineTotal,0) && <div className="flex justify-between text-sm"><span>Envío</span><span>{money(order.amount-order.items.reduce((sum,item)=>sum+item.lineTotal,0))}</span></div>}
        <div className="flex justify-between border-t pt-3 font-bold"><span>Total pagado</span><span>{money(order.amount)} {order.currency}</span></div>
      </Card>
      <Card className="p-5 space-y-2">
        <h2 className="font-bold">{coordinated ? "Detalles de entrega coordinada" : "Dirección de envío"}</h2>
        {address && <address className="text-sm text-slate-600 not-italic">
          <p>{address.fullName}</p><p>{address.street}</p>
          <p>{address.city}, {address.state} · {address.postalCode}</p><p>{address.country}</p>
          {address.notes && <p className="mt-2">{address.notes}</p>}
        </address>}
      </Card>
      {coordinated ? (
        <Card className="p-5 space-y-3 border-blue-200">
          <h2 className="font-bold">NIP de entrega</h2>
          {order.deliveryPin ? <>
            <p className="font-mono text-3xl tracking-[0.35em] font-bold text-blue-700" aria-label="NIP de seis dígitos">{order.deliveryPin}</p>
            <p className="text-sm text-slate-600">Muestra este NIP al vendedor únicamente después de recibir y revisar tu producto.</p>
          </> : <p className="text-sm text-slate-600">{order.status === "COMPLETED" ? "Entrega confirmada. Este NIP ya no está activo." : "El NIP estará disponible cuando se confirme el pago."}</p>}
        </Card>
      ) : (
        <Card className="p-5 space-y-3">
          <h2 className="font-bold">Seguimiento del envío</h2>
          {order.shipment ? <>
            <p className="text-sm">{order.shipment.carrierName} · <span className="font-mono">{order.shipment.trackingNumber}</span></p>
            {order.shipment.trackingUrl && <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer" className="inline-block font-semibold text-blue-700 underline">Seguir mi paquete</a>}
          </> : <p className="text-sm text-slate-600">El vendedor está preparando tu pedido. La guía aparecerá aquí cuando se genere la etiqueta.</p>}
        </Card>
      )}
    </>
  );
}
