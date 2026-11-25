"use client";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  ConversationSales,
  emptySaleDraft,
  type ConversationSaleDraft,
} from "@/components/dashboard/ConversationSales";
function Quotes() {
  const [draft, setDraft] = useState<ConversationSaleDraft>(emptySaleDraft);
  const [copy, setCopy] = useState("");
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-7">
        <p className="text-sm font-medium text-accent-700">De una propuesta a un pedido</p>
        <h1 className="mt-1 text-3xl font-semibold">Cotizaciones</h1>
        <p className="mt-3 text-muted">
          Selecciona productos y variantes y prepara un enlace para tu comprador. Se muestran los
          precios vigentes; el envío se confirma en el checkout.
        </p>
        <p className="mt-2 text-sm text-muted">
          El enlace vence en 7 días y no aparta existencias. El inventario se reserva una sola vez
          al iniciar el pedido. Para cambiar una propuesta, desactívala y prepara otra. Se muestran
          las 30 más recientes.
        </p>
      </header>
      <p role="status" className="mb-4 text-sm">
        {copy}
      </p>
      <ConversationSales
        channel="quotes"
        sender="standalone"
        draft={draft}
        updateDraft={setDraft}
        onCompose={(sale) => {
          navigator.clipboard
            .writeText(sale.url)
            .then(() => setCopy("Enlace copiado. Compártelo con tu comprador."))
            .catch(() =>
              setCopy(
                "No se pudo copiar automáticamente. Abre el enlace de la cotización para compartirlo.",
              ),
            );
        }}
      />
    </div>
  );
}
export default function QuotesPage() {
  const { userId } = useAuth();
  return <DashboardLayout>{userId && <Quotes key={userId} />}</DashboardLayout>;
}
