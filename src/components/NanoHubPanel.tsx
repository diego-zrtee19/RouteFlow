"use client";

import { useState, useEffect } from "react";
import type { Order } from "@/lib/types";
import { QRCode } from "./QRCode";
import { Modal } from "./Modal";
import { supabase } from "@/lib/supabaseClient";

interface NanoHubPanelProps {
  orders: Order[];
  /** @deprecated Preferir onDeliverByQr (valida qrSeed). Se mantiene por API. */
  onDeliverOrder?: (id: string) => void;
  onDeliverByQr: (qrSeed: string) => Order | null;
}

export function NanoHubPanel({
  orders,
  onDeliverByQr,
}: NanoHubPanelProps) {
  const [scanning, setScanning] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualSeed, setManualSeed] = useState("");
  const [scanError, setScanError] = useState("");
  const [modal, setModal] = useState<{
    open: boolean;
    o?: Order;
  }>({ open: false });
  const [filter, setFilter] = useState<"pending" | "today" | "all">("pending");
  const [localOrders, setLocalOrders] = useState<Order[]>(orders);

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("orders")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `status=eq.delivered_pending`,
        },
        (payload) => {
          console.log("Order updated via Realtime:", payload);
          // Actualizar la orden local cuando cambie a delivered_pending
          if (payload.new) {
            setLocalOrders((prev) =>
              prev.map((o) =>
                o.id === payload.new.id
                  ? { ...o, status: payload.new.status as Order["status"] }
                  : o
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Sincronizar localOrders con props orders cuando cambian
  useEffect(() => {
    setLocalOrders(orders);
  }, [orders]);

  const atStore = localOrders.filter((o) => o.status === "at_store");
  const deliveredToday = localOrders.filter((o) => o.status === "delivered_confirmed");
  const totalPending = atStore.reduce((s, o) => s + o.price, 0);
  const totalLiberated = deliveredToday.reduce((s, o) => s + o.price, 0);

  const completeDelivery = (o: Order) => {
    setScanning(o.id);
    setScanError("");
    setTimeout(() => {
      const result = onDeliverByQr(o.qrSeed);
      setScanning(null);
      if (!result) {
        setScanError(
          "QR inválido o orden ya entregada. Verifica el código del comprador."
        );
        return;
      }
      setScannerOpen(false);
      setManualSeed("");
      setModal({ open: true, o: result });
    }, 900);
  };

  const handleScanDeliver = (o: Order) => {
    completeDelivery(o);
  };

  const handleManualScan = () => {
    const seed = manualSeed.trim();
    if (!seed) {
      setScanError("Ingresa o selecciona un qrSeed para escanear.");
      return;
    }
    setScanning("manual");
    setScanError("");
    setTimeout(() => {
      const result = onDeliverByQr(seed);
      setScanning(null);
      if (!result) {
        setScanError(
          "❌ QR no válido. No hay orden pendiente con ese qrSeed."
        );
        return;
      }
      setScannerOpen(false);
      setManualSeed("");
      setModal({ open: true, o: result });
    }, 900);
  };

  const handlePickPending = (o: Order) => {
    setManualSeed(o.qrSeed);
    setScanError("");
  };

  let displayed: Order[] = [];
  if (filter === "pending") displayed = atStore;
  else if (filter === "today") displayed = deliveredToday;
  else displayed = localOrders;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
      <div className="bg-white border-b border-zinc-200 py-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-2xl">
            🏪
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-zinc-900">Panel de Socio Route</h2>
            <p className="text-xs sm:text-sm text-zinc-500">
              Puntos Route · Validación QR y Liberación de Pagos
            </p>
          </div>
        </div>
      </div>

      {/* Métricas en línea */}
      <div className="flex flex-wrap gap-4">
        <Stat label="En Mostrador" value={atStore.length.toString()} />
        <Stat
          label="$ por entregar"
          value={`$${totalPending.toFixed(0)}`}
        />
        <Stat
          label="Entregados hoy"
          value={deliveredToday.length.toString()}
        />
        <Stat
          label="$ Liberados"
          value={`$${totalLiberated.toFixed(0)}`}
          accent
        />
      </div>

      {/* Simulador de Escáner QR */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <button
          onClick={() => {
            setScannerOpen((v) => !v);
            setScanError("");
          }}
          className="w-full p-5 flex items-center justify-between gap-3 hover:bg-zinc-50 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-zinc-900 text-white flex items-center justify-center text-2xl shadow-md relative overflow-hidden">
              <span className="relative z-10">📷</span>
              <span className="absolute inset-x-2 top-1/2 h-0.5 bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-left">
              <p className="font-black text-zinc-900 text-lg">
                Simulador de Escáner QR
              </p>
              <p className="text-sm text-zinc-500">
                Valida el <code className="text-xs bg-zinc-100 px-1 rounded">qrSeed</code> del
                comprador y marca la orden como entregada
              </p>
            </div>
          </div>
          <span
            className={`text-2xl text-zinc-400 transition-transform ${
              scannerOpen ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </button>

        {scannerOpen && (
          <div className="px-5 pb-5 border-t border-zinc-100 pt-5 space-y-4">
            <div className="relative mx-auto max-w-xs aspect-square rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center overflow-hidden shadow-inner">
              <div className="absolute inset-6 border-2 border-emerald-400/60 rounded-2xl" />
              <div className="absolute left-6 right-6 h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399] animate-[scan_2s_ease-in-out_infinite]" />
              <div className="text-center text-white relative z-10 px-4">
                <p className="text-4xl mb-2">📡</p>
                <p className="font-black text-sm">Apunta al QR del comprador</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Demo · Validación por qrSeed
                </p>
              </div>
            </div>

            {atStore.length > 0 && (
              <div>
                <p className="text-xs font-black text-zinc-500 uppercase tracking-wide mb-3 text-center sm:text-left">
                  Órdenes en mostrador (toca para escanear)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {atStore.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => handlePickPending(o)}
                      className={`px-4 py-6 rounded-xl text-sm font-bold border-2 transition-all text-left ${
                        manualSeed === o.qrSeed
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                          : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300"
                      }`}
                    >
                      <div className="font-black text-base">{o.orderCode}</div>
                      <div className="text-xs font-semibold">{o.productName.slice(0, 25)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-zinc-700 mb-2">
                qrSeed escaneado
              </label>
              <input
                value={manualSeed}
                onChange={(e) => setManualSeed(e.target.value)}
                placeholder="Se llena al seleccionar una orden o pega el seed…"
                className="w-full px-4 py-4 rounded-xl border-2 border-zinc-200 focus:border-zinc-400 focus:outline-none font-mono text-lg bg-zinc-50"
              />
            </div>

            {scanError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
                {scanError}
              </div>
            )}

            <button
              onClick={handleManualScan}
              disabled={scanning === "manual" || !manualSeed.trim()}
              className="w-full py-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-lg sm:text-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {scanning === "manual" ? (
                <>
                  <span className="inline-block w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Validando QR · Liberando pago…
                </>
              ) : (
                <>
                  <span className="text-2xl sm:text-3xl">📷</span>
                  ESCANEAR Y VALIDAR ENTREGA
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-r from-gray-100 to-gray-50 rounded-2xl p-1.5 grid grid-cols-3 gap-1">
        {[
          { k: "pending" as const, l: "Pendientes", n: atStore.length },
          { k: "today" as const, l: "Entregados", n: deliveredToday.length },
          { k: "all" as const, l: "Todos", n: localOrders.length },
        ].map((t) => {
          const active = filter === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setFilter(t.k)}
              className={`py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-1.5 ${
                active
                  ? "bg-white text-gray-900 shadow-md ring-1 ring-gray-200/50"
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
              }`}
            >
              {t.l}
              <span
                className={`px-1.5 h-5 min-w-[20px] rounded-full text-[10px] font-black flex items-center justify-center ${
                  active ? "bg-amber-500 text-white shadow-sm" : "bg-gray-300 text-gray-700"
                }`}
              >
                {t.n}
              </span>
            </button>
          );
        })}
      </div>

      {displayed.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-12 text-center animate-fade-in-up">
          <div className="text-6xl mb-4">
            {filter === "pending" ? "📭" : filter === "today" ? "📊" : "🗂️"}
          </div>
          <h3 className="font-black text-gray-900 mb-2">
            {filter === "pending"
              ? "Mostrador vacío"
              : filter === "today"
              ? "Sin entregas aún"
              : "Sin órdenes"}
          </h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            {filter === "pending"
              ? "Los paquetes aparecerán aquí cuando lleguen a la tiendita para ser recogidos por los compradores."
              : filter === "today"
              ? "Aquí verás todos los paquetes entregados y el dinero liberado hacia los vendedores."
              : "Historial completo vacío."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...displayed].reverse().map((o) => {
            const isPending = o.status === "at_store";
            const isDelivered = o.status === "delivered_confirmed";
            const isScanning = scanning === o.id;

            return (
              <div
                key={o.id}
                className={`bg-white rounded-3xl overflow-hidden shadow-sm border-2 transition-all ${
                  isScanning
                    ? "border-primary-400 scale-[1.01] shadow-xl"
                    : isPending
                    ? "border-amber-200"
                    : isDelivered
                    ? "border-success-200 bg-success-50/30"
                    : "border-gray-100"
                }`}
              >
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`${isScanning ? "animate-pulse ring-4 ring-primary-300 rounded-xl" : ""}`}
                      >
                        <QRCode value={o.qrSeed} size={96} />
                      </div>
                      <p className="font-mono text-[10px] font-black text-gray-500 mt-2 tracking-wider">
                        {o.orderCode}
                      </p>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                o.source === "marketplace"
                                  ? "bg-violet-100 text-violet-700"
                                  : "bg-teal-100 text-teal-700"
                              }`}
                            >
                              {o.source === "marketplace"
                                ? "🛍️ MARKETPLACE"
                                : "🔗 ORDEN EXTERNA"}
                            </span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                              📍 {o.zone}
                            </span>
                            {isPending && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                ESPERANDO COMPRADOR
                              </span>
                            )}
                            {isDelivered && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-success-100 text-success-700 inline-flex items-center gap-1">
                                ✓ ENTREGADO
                              </span>
                            )}
                          </div>
                          <h4 className="font-black text-gray-900 text-lg leading-tight">
                            {o.productName}
                          </h4>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500 font-bold">
                            Monto en Custodia
                          </p>
                          <p
                            className={`text-2xl font-black ${
                              isDelivered ? "text-success-600" : "text-amber-600"
                            }`}
                          >
                            ${o.price.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
                        <Pill label="Vendedor" value={o.sellerName} />
                        <Pill label="Comprador" value={o.buyerName} />
                        <Pill label="Zona" value={o.zone} />
                        <Pill
                          label="Tiendita"
                          value={o.assignedStore.split(" - ")[0]}
                        />
                      </div>

                      {isPending && (
                        <button
                          onClick={() => handleScanDeliver(o)}
                          disabled={!!scanning}
                          className={`w-full py-3.5 rounded-2xl font-black transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                            isScanning
                              ? "bg-primary-100 text-primary-700"
                              : "bg-gradient-to-r from-success-500 to-emerald-600 hover:from-success-600 hover:to-emerald-700 text-white shadow-lg shadow-success-500/25"
                          } disabled:cursor-not-allowed`}
                        >
                          {isScanning ? (
                            <>
                              <span className="inline-block w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                              Escaneando QR · Validando qrSeed…
                            </>
                          ) : (
                            <>
                              <span className="text-xl">📷</span>
                              Escanear QR / Validar Entrega
                            </>
                          )}
                        </button>
                      )}

                      {isDelivered && (
                        <div className="p-4 rounded-2xl bg-success-50 border border-success-200 flex items-start gap-3">
                          <span className="text-2xl">💸</span>
                          <div>
                            <p className="font-black text-success-800">
                              ¡Dinero liberado con éxito!
                            </p>
                            <p className="text-sm text-success-700">
                              ${o.price.toFixed(2)} MXN depositados a la cuenta
                              de <b>{o.sellerName}</b>.
                            </p>
                          </div>
                        </div>
                      )}

                      {!isPending && !isDelivered && (
                        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200">
                          <p className="text-sm font-bold text-blue-700">
                            🚚 Estado actual: En tránsito hacia esta tiendita.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={modal.open}
        onClose={() => setModal({ open: false })}
        title="🎉 ¡Entrega Confirmada & Dinero Liberado!"
        message={
          modal.o
            ? `Se entregó ${modal.o.productName} al comprador ${modal.o.buyerName}. Los $${modal.o.price.toFixed(2)} MXN retenidos en custodia acaban de ser depositados INSTANTÁNEAMENTE a ${modal.o.sellerName}. ¡Ciclo de confianza cerrado! 🛡️`
            : ""
        }
        type="success"
      />

    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 border border-zinc-200 ${
        accent ? "bg-zinc-50" : "bg-zinc-50"
      }`}
    >
      <p className={`text-2xl font-black text-zinc-900`}>
        {value}
      </p>
      <p
        className={`text-xs font-semibold text-zinc-500`}
      >
        {label}
      </p>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2 border border-gray-100 min-w-0">
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-semibold text-gray-800 truncate">{value}</p>
    </div>
  );
}
