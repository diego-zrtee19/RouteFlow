"use client";

import { useMemo, useState } from "react";
import type { Product, ExternalOrder, Order } from "@/lib/types";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ZONES,
} from "@/lib/types";
import QRCode from "react-qr-code";
import { Modal } from "./Modal";
import { CheckoutForm } from "./CheckoutForm";
import { NanoHubMap } from "./NanoHubMap";
import { ProductCardSkeleton } from "./ProductCardSkeleton";
import { TrustSignals } from "./TrustSignals";
import { AppleWalletQR } from "./AppleWalletQR";
import { ProgressStepper } from "./ProgressStepper";

interface BuyerPortalProps {
  products: Product[];
  externalOrders: ExternalOrder[];
  orders: Order[];
  onBuyMarketplace: (product: Product, buyerName: string, zone: string) => Order;
  onPayExternalOrder: (order: ExternalOrder) => Order;
  onAdvanceOrder: (id: string) => void;
  onMarkExternalPaid: (id: string) => void;
  searchQuery?: string;
}

type BuyerTab = "landing" | "marketplace" | "code" | "myOrders";

export function BuyerPortal({
  products,
  externalOrders,
  orders,
  onBuyMarketplace,
  onPayExternalOrder,
  onAdvanceOrder,
  onMarkExternalPaid,
  searchQuery = "",
}: BuyerPortalProps) {
  const [tab, setTab] = useState<BuyerTab>("landing");
  const [categoryFilter, setCategoryFilter] = useState<string>("Todos");
  const [searchCode, setSearchCode] = useState("");
  const [searchError, setSearchError] = useState("");
  const [foundOrder, setFoundOrder] = useState<ExternalOrder | null>(null);
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);
  const [buyingFor, setBuyingFor] = useState("");
  const [buyingZone, setBuyingZone] = useState<string>(ZONES[0]);
  const [modal, setModal] = useState<{
    open: boolean;
    title: string;
    msg: string;
  }>({ open: false, title: "", msg: "" });
  const [loading, setLoading] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydration fix for map component
  useState(() => {
    setHydrated(true);
  });

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const availableProducts = useMemo(
    () =>
      products.filter((p) => {
        if (p.sold) return false;
        if (categoryFilter !== "Todos" && p.category !== categoryFilter) return false;
        if (normalizedQuery) {
          const haystack = `${p.title} ${p.description} ${p.category} ${p.sellerName}`.toLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        return true;
      }),
    [products, categoryFilter, normalizedQuery]
  );

  const categoriesUsed = useMemo(() => {
    const set = new Set(products.filter((p) => !p.sold).map((p) => p.category));
    return ["Todos", ...Array.from(set)];
  }, [products]);

  const searchForOrder = () => {
    setSearchError("");
    setFoundOrder(null);
    const code = searchCode.trim().toUpperCase();
    if (!code.startsWith("RF-") || code.length < 6) {
      setSearchError("Formato inválido. Usa: RF-XXXX");
      return;
    }
    const found = externalOrders.find((o) => o.orderCode === code);
    if (!found) {
      setSearchError(
        `No encontramos la orden ${code}. Verifica el código con tu vendedor.`
      );
      return;
    }
    setFoundOrder(found);
  };

  const handleBuyFromMarketplace = () => {
    if (!confirmProduct) return;
    const bName = buyingFor.trim() || "Comprador Invitado";
    const order = onBuyMarketplace(confirmProduct, bName, buyingZone);
    
    setBuyingFor("");
    setBuyingZone(ZONES[0]);
    setConfirmProduct(null);
    
    setModal({
      open: true,
      title: "Pago Protegido Aprobado",
      msg: `Se retuvieron $${order.price.toFixed(2)} MXN en custodia. Zona ${order.zone}. Recoge en: ${order.assignedStore}. Código: ${order.orderCode}`,
    });
  };

  const handlePayExternal = () => {
    if (!foundOrder) return;
    const order = onPayExternalOrder(foundOrder);
    onMarkExternalPaid(foundOrder.id);
    setFoundOrder(null);
    setSearchCode("");
    setModal({
      open: true,
      title: "Pago Seguro Completado",
      msg: `¡${foundOrder.buyerName}! Tu pago de $${foundOrder.price.toFixed(2)} está en custodia. Recoge en: ${order.assignedStore}. Código ${order.orderCode}`,
    });
  };

  const activeCount = orders.filter((o) => o.status !== "delivered").length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
      {/* Landing View - Minimalista Apple Style */}
      {tab === "landing" && (
        <div className="space-y-12 animate-fade-in-up">
          {/* Trust Badge Minimalista */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100 border border-zinc-200">
              <span className="text-emerald-600 text-sm">🛡️</span>
              <span className="text-sm font-semibold text-zinc-700">
                Pago en custodia • Entrega en tu tiendita
              </span>
            </div>
          </div>

          {/* Hero - Enfoque Absoluto */}
          <div className="text-center space-y-6">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-zinc-900 leading-tight tracking-tight">
              Compra en tu colonia{" "}
              <span className="bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent">
                sin miedo a que te bailen
              </span>
            </h1>
            <p className="text-lg text-zinc-500 max-w-2xl mx-auto">
              Tu dinero queda protegido hasta que recoges y apruebas el paquete en el Punto Route de tu zona.
            </p>
            
            {/* CTAs Centrados */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <button
                onClick={() => setTab("marketplace")}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-lg transition-all active:scale-[0.98]"
              >
                Explorar Marketplace
              </button>
              <button
                onClick={() => setTab("myOrders")}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 font-black text-lg transition-all active:scale-[0.98]"
              >
                Mis Pedidos ({activeCount})
              </button>
            </div>
          </div>

          {/* Input de Código - Copywriting para Redes Sociales */}
          <div className="max-w-md mx-auto">
            <div className="space-y-3">
              <p className="text-center text-sm font-semibold text-zinc-600">
                ¿Quedaste con alguien por Facebook o Instagram? Inserta el código de compra para una transacción segura.
              </p>
              <div className="flex gap-2">
                <input
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && searchForOrder()}
                  placeholder="Código RF-XXXX"
                  maxLength={7}
                  className="flex-1 px-4 py-3 rounded-lg border border-zinc-200 focus:border-zinc-400 focus:outline-none text-center font-mono font-bold text-lg"
                />
                <button
                  onClick={searchForOrder}
                  className="px-6 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-black transition-all"
                >
                  Pagar
                </button>
              </div>
              {searchError && (
                <p className="text-sm text-red-600 mt-2 text-center">{searchError}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs (solo mostrar cuando no estemos en landing) */}
      {tab !== "landing" && (
        <div className="bg-zinc-100 rounded-xl p-1 grid grid-cols-3 gap-1">
          {[
            { k: "marketplace" as const, l: "Marketplace", i: "🛍️" },
            { k: "code" as const, l: "Código Orden", i: "🔑" },
            {
              k: "myOrders" as const,
              l: "Mis Pedidos",
              i: "📦",
              n: activeCount,
            },
          ].map((t) => {
            const active = tab === t.k;
            return (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`py-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                  active
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700 hover:bg-white/50"
                }`}
              >
                <span className="text-base">{t.i}</span>
                <span className="hidden sm:inline">{t.l}</span>
                <span className="sm:hidden">{t.l.split(" ")[0]}</span>
                {t.n !== undefined && t.n > 0 && (
                  <span
                    className={`px-2 h-5 min-w-[20px] rounded-full text-[10px] font-black flex items-center justify-center ${
                      active
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-300 text-zinc-700"
                    }`}
                  >
                    {t.n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {tab === "marketplace" && (
        <div className="space-y-6 animate-fade-in-up">
          {normalizedQuery && (
            <p className="text-sm text-zinc-500">
              Resultados para <span className="font-semibold text-zinc-900">&ldquo;{searchQuery}&rdquo;</span>{" "}
              <span className="text-zinc-400">({availableProducts.length})</span>
            </p>
          )}
          
          {/* Category Filters */}
          <div className="flex flex-wrap gap-2">
            {categoriesUsed.map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all border ${
                  categoryFilter === c
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Products Grid */}
          {!hydrated ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : availableProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-zinc-200 p-12 text-center">
              <div className="text-6xl mb-4">{normalizedQuery ? "🔍" : "🏪"}</div>
              <h3 className="font-black text-zinc-900 mb-2 text-xl">
                {normalizedQuery ? "Sin resultados" : "Vitrina vacía por ahora"}
              </h3>
              <p className="text-zinc-500 text-sm max-w-sm mx-auto">
                {normalizedQuery ? (
                  <>
                    No encontramos productos que coincidan con{" "}
                    <b>&ldquo;{searchQuery}&rdquo;</b>. Intenta con otro término o
                    revisa las categorías disponibles.
                  </>
                ) : (
                  <>
                    Los vendedores locales aún no publican productos en esta
                    categoría. ¡Vuelve pronto o pide a tu vendedor que use el
                    código de orden externa!
                  </>
                )}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
              {availableProducts.map((p) => (
                <div
                  key={p.id}
                  className="group bg-white rounded-2xl overflow-hidden border border-zinc-200 hover:border-zinc-300 hover:shadow-lg transition-all duration-300"
                >
                  <div className="aspect-square bg-zinc-100 overflow-hidden relative">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className="hidden w-full h-full flex flex-col items-center justify-center bg-zinc-100">
                      <div className="text-4xl mb-2">📦</div>
                      <div className="text-xs font-bold text-zinc-400">RouteFlow</div>
                    </div>
                    <div className="absolute top-3 left-3">
                      <span className="px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-sm text-[10px] font-bold text-zinc-700 border border-zinc-200 shadow-sm">
                        {p.category}
                      </span>
                    </div>
                    <div className="absolute top-3 right-3">
                      <span className="w-8 h-8 rounded-lg bg-white/95 backdrop-blur-sm flex items-center justify-center text-sm border border-zinc-200 shadow-sm">
                        🛡️
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="text-xs text-zinc-500 font-semibold mb-1">
                      {p.sellerName}
                    </p>
                    <h4 className="font-black text-zinc-900 leading-tight mb-2 line-clamp-2 min-h-[40px] text-lg">
                      {p.title}
                    </h4>
                    <p className="text-xs text-zinc-500 line-clamp-2 mb-4 min-h-[32px]">
                      {p.description}
                    </p>
                    <div className="flex items-end justify-between mb-4">
                      <div>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight">
                          Pago seguro
                        </p>
                        <p className="text-3xl font-black text-zinc-900 leading-none">
                          ${p.price.toFixed(0)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setConfirmProduct(p);
                        setBuyingZone(ZONES[0]);
                      }}
                      className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-black text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <span>🛒</span> Comprar Seguro
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "code" && (
        <div className="space-y-6 animate-fade-in-up">
          <div className="bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center text-2xl">
                🔑
              </div>
              <div>
                <h3 className="font-black text-xl text-zinc-900">
                  ¿Tienes un código de orden?
                </h3>
                <p className="text-sm text-zinc-500">
                  Ingresa el código que te envió tu vendedor por WhatsApp,
                  Facebook o Instagram.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <input
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && searchForOrder()}
                  placeholder="RF-XXXX"
                  maxLength={7}
                  className="w-full px-5 py-4 pl-12 rounded-xl border-2 border-zinc-200 focus:border-zinc-400 focus:outline-none bg-white text-center font-mono font-black text-2xl tracking-widest text-zinc-900 placeholder:text-zinc-300"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-zinc-400">
                  🎫
                </span>
              </div>
              <button
                onClick={searchForOrder}
                className="sm:w-auto px-8 py-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-black transition-all active:scale-[0.98]"
              >
                🔍 Buscar Orden
              </button>
            </div>
            {searchError && (
              <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-start gap-2">
                <span>⚠️</span>
                {searchError}
              </div>
            )}
          </div>

          {foundOrder && !foundOrder.paid && (
            <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
              <div className="bg-zinc-50 p-6 border-b border-zinc-200">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mb-1">
                  Orden Encontrada · {foundOrder.orderCode}
                </p>
                <h3 className="font-black text-2xl text-zinc-900">Venta Acordada en Redes</h3>
              </div>
              <div className="p-6">
                <div className="grid sm:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-4">
                    <InfoRow label="Comprador" value={foundOrder.buyerName} />
                    <InfoRow label="Vendedor" value={foundOrder.sellerName} />
                    <InfoRow
                      label="Producto Acordado"
                      value={foundOrder.productName}
                    />
                    <InfoRow label="Zona" value={foundOrder.zone} />
                  </div>
                  <div className="flex flex-col items-center justify-center bg-zinc-50 rounded-xl p-6 border border-zinc-200">
                    <span className="text-sm font-bold text-zinc-700 uppercase tracking-wide mb-2">
                      Total a Pagar
                    </span>
                    <p className="text-4xl font-black text-zinc-900">
                      ${foundOrder.price.toFixed(2)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2">
                      MXN · En custodia 🛡️
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 mb-6 flex items-start gap-3">
                  <span className="text-2xl">🛡️</span>
                  <div className="text-sm">
                    <p className="font-black text-zinc-900 mb-1">
                      Protección RouteFlow Escrow
                    </p>
                    <p className="text-zinc-600">
                      Tu dinero se retiene de forma segura. Solo se libera al
                      vendedor cuando tú recojas y apruebes el producto en la
                      tiendita aliada asignada de tu zona <b>{foundOrder.zone}</b>.
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  <TrustSignals />
                  
                  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                    <p className="text-sm text-zinc-600 mb-2 font-bold text-center">Simulador de Tarjeta Stripe (Modo Prueba):</p>
                    <p className="font-mono text-xl font-black text-zinc-900 tracking-widest bg-white p-3 rounded-lg border border-zinc-200 text-center">4242 4242 4242 4242</p>
                    <p className="text-xs text-zinc-500 mt-2 text-center">Cualquier fecha futura (ej. 12/30) y cualquier CVC (ej. 123) funcionarán.</p>
                  </div>
                  
                  <CheckoutForm 
                    amount={foundOrder.price} 
                    orderCode={foundOrder.orderCode} 
                    onSuccess={handlePayExternal} 
                  />
                </div>
              </div>
            </div>
          )}

          {foundOrder && foundOrder.paid && (
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 text-center">
              <div className="text-6xl mb-3">✅</div>
              <h3 className="font-black text-2xl text-zinc-900 mb-2">
                ¡Esta orden ya fue pagada!
              </h3>
              <p className="text-zinc-600">
                Código {foundOrder.orderCode} · Revisa la pestaña &ldquo;Mis Pedidos&rdquo;
                para ver el estado de entrega.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "myOrders" && (
        <div className="space-y-4 animate-fade-in-up">
          {orders.length === 0 && (
            <div className="bg-white rounded-2xl border-2 border-dashed border-zinc-200 p-12 text-center">
              <div className="text-6xl mb-4">📦</div>
              <h3 className="font-black text-zinc-900 mb-2 text-xl">
                Aún no tienes pedidos
              </h3>
              <p className="text-zinc-500 text-sm max-w-sm mx-auto mb-6">
                Compra en el Marketplace o ingresa un código de orden de tu
                vendedor favorito.
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <button
                  onClick={() => setTab("marketplace")}
                  className="px-6 py-3 rounded-xl bg-zinc-900 text-white font-bold text-sm hover:bg-zinc-800"
                >
                  🛍️ Ir al Marketplace
                </button>
                <button
                  onClick={() => setTab("code")}
                  className="px-6 py-3 rounded-xl bg-zinc-100 text-zinc-800 font-bold text-sm hover:bg-zinc-200"
                >
                  🔑 Tengo un código
                </button>
              </div>
            </div>
          )}
          {orders.map((o) => {
            const c = ORDER_STATUS_COLORS[o.status];
            const stepIdx = [
              "escrow",
              "in_transit",
              "at_store",
              "delivered",
            ].indexOf(o.status);
            return (
              <div
                key={o.id}
                className="bg-white rounded-2xl border border-zinc-200 overflow-hidden"
              >
                <div className="p-6 flex flex-col sm:flex-row gap-6 sm:items-start">
                  <div className="w-full sm:w-28 h-28 rounded-xl overflow-hidden bg-zinc-100 flex-shrink-0 border border-zinc-200">
                    {o.productImage ? (
                      <img
                        src={o.productImage}
                        alt={o.productName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className="hidden w-full h-full flex items-center justify-center bg-zinc-100">
                      <div className="text-4xl">📦</div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="font-mono text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-700 border border-zinc-200">
                        {o.orderCode}
                      </span>
                      <span className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-zinc-50 text-zinc-600 uppercase tracking-wide border border-zinc-200">
                        {o.source === "marketplace" ? "Marketplace" : "Externa"}
                      </span>
                      <span className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-zinc-50 text-zinc-700 border border-zinc-200">
                        📍 Zona: {o.zone}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg ${c.bg} ${c.text} inline-flex items-center gap-1.5 border ${c.border}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                        {ORDER_STATUS_LABELS[o.status]}
                      </span>
                    </div>
                    <h4 className="font-black text-zinc-900 text-xl mb-4">
                      {o.productName}
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
                      <Mini label="Vendedor" value={o.sellerName} />
                      <Mini label="Comprador" value={o.buyerName} />
                      <Mini
                        label="Tiendita"
                        value={o.assignedStore.split(" - ")[0]}
                      />
                      <Mini
                        label="Total"
                        value={`$${o.price.toFixed(0)}`}
                        strong
                        color="text-zinc-900"
                      />
                    </div>
                    <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200">
                      <div className="flex items-center justify-between mb-3">
                        {[
                          { i: "💰", t: "Pago" },
                          { i: "🚚", t: "Ruta" },
                          { i: "🏪", t: "Tienda" },
                          { i: "✅", t: "Entrega" },
                        ].map((s, i) => (
                          <div key={s.t} className="flex-1 text-center">
                            <div
                              className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-base border-2 transition-all ${
                                i < stepIdx
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : i === stepIdx
                                  ? "bg-zinc-900 text-white border-zinc-900 shadow-md"
                                  : "bg-white text-zinc-400 border-zinc-200"
                              }`}
                            >
                              {i < stepIdx ? "✓" : s.i}
                            </div>
                            <p className="text-[10px] font-bold mt-2 text-zinc-600">
                              {s.t}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="h-2 mx-10 bg-zinc-200 rounded-full overflow-hidden mt-2">
                        <div
                          className="h-full bg-zinc-900 transition-all duration-500"
                          style={{
                            width: `${(stepIdx / 3) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Progress Stepper */}
                    <ProgressStepper currentStatus={o.status} />

                    {o.status !== "delivered_confirmed" && o.status !== "disputed" && (
                      <button
                        onClick={() => onAdvanceOrder(o.id)}
                        className="w-full mt-4 py-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-sm transition-all border border-zinc-200 active:scale-[0.98]"
                      >
                        ⏭️ Simular siguiente paso (Demo)
                      </button>
                    )}

                    {o.status === "at_store" && (
                      <div className="mt-4 flex flex-col sm:flex-row gap-4 items-center p-6 rounded-xl border-2 bg-amber-50 border-amber-200">
                        <div className="flex-shrink-0">
                          <AppleWalletQR order={o} />
                        </div>
                        <div className="flex-1 text-center sm:text-left">
                          <p className="font-black text-amber-900 mb-2 text-lg">
                            🎉 ¡Listo para recoger!
                          </p>
                          <p className="font-bold text-amber-800 mb-3">
                            {o.assignedStore}
                          </p>
                          <p className="text-sm text-amber-700 mb-4">
                            Muestra este código QR en la caja. Código:{" "}
                            <b>{o.orderCode}</b>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Botón de Pánico - Disputas Escrow */}
                    {o.status === "delivered_pending" && (
                      <div className="mt-4 space-y-3">
                        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700">
                          <p className="font-semibold mb-1">🕐 Período de gracia de 24 horas</p>
                          <p>El pago está retenido por seguridad. Confirma que todo está en orden para liberar los fondos al vendedor.</p>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => onAdvanceOrder(o.id)}
                            className="flex-1 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-all active:scale-[0.98]"
                          >
                            ✓ Todo en orden (Liberar pago)
                          </button>
                          <button
                            onClick={() => {
                              // Esto debería cambiar el estado a "disputed"
                              alert("Disputa registrada. Fondos bloqueados en Stripe.");
                            }}
                            className="flex-1 py-4 rounded-xl bg-white border-2 border-red-200 hover:border-red-300 text-red-600 font-black text-sm transition-all active:scale-[0.98]"
                          >
                            ⚠️ Reportar problema
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE COMPRA DEL MARKETPLACE */}
      {confirmProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[95vh] overflow-y-auto">
            <div className="aspect-video bg-zinc-100 relative">
              {confirmProduct.imageUrl ? (
                <img
                  src={confirmProduct.imageUrl}
                  alt={confirmProduct.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className="hidden w-full h-full flex flex-col items-center justify-center bg-zinc-100">
                <div className="text-5xl mb-3">📦</div>
                <div className="text-sm font-bold text-zinc-400">RouteFlow</div>
              </div>
              <button
                onClick={() => setConfirmProduct(null)}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/95 backdrop-blur flex items-center justify-center text-zinc-700 font-black hover:bg-white border border-zinc-200"
              >
                ✕
              </button>
              <div className="absolute bottom-4 left-4">
                <span className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-black text-xs shadow-lg flex items-center gap-2">
                  🛡️ Pago Protegido
                </span>
              </div>
            </div>
            <div className="p-6">
              <p className="text-xs text-zinc-500 font-black uppercase tracking-wide mb-2">
                {confirmProduct.category}
              </p>
              <h3 className="font-black text-2xl text-zinc-900 mb-2">
                {confirmProduct.title}
              </h3>
              <p className="text-sm text-zinc-600 mb-4">
                Vendedor: <b>{confirmProduct.sellerName}</b>
              </p>
              <p className="text-4xl font-black text-zinc-900 mb-6">
                ${confirmProduct.price.toFixed(2)}
                <span className="text-sm font-bold text-zinc-500 ml-2">MXN</span>
              </p>
              
              <div className="space-y-5 mb-6">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">
                    Tu nombre (para la entrega)
                  </label>
                  <input
                    value={buyingFor}
                    onChange={(e) => setBuyingFor(e.target.value)}
                    placeholder="¿Cómo te llamamos?"
                    className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                  />
                </div>
                
                {/* Mapa Interactivo de Puntos Route */}
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">
                    📍 Selecciona tu Punto Route de recolección
                  </label>
                  {hydrated && (
                    <NanoHubMap
                      selectedZone={buyingZone}
                      onZoneSelect={setBuyingZone}
                      className="w-full"
                    />
                  )}
                  <p className="text-xs text-zinc-500 mt-2">
                    Zona seleccionada: <b>{buyingZone}</b>
                  </p>
                </div>
              </div>
              
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-sm text-zinc-700 font-semibold mb-6 flex items-start gap-3">
                <span>🏪</span>
                <span>
                  Se asignará el Punto Route más cercano a{" "}
                  <b>{buyingZone}</b> automáticamente.
                </span>
              </div>
              
              <div className="space-y-6">
                <TrustSignals />
                
                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                  <p className="text-sm text-zinc-600 mb-2 font-bold text-center">Simulador de Tarjeta Stripe:</p>
                  <p className="font-mono text-xl font-black text-zinc-900 tracking-widest bg-white p-3 rounded-lg border border-zinc-200 text-center">4242 4242 4242 4242</p>
                </div>
                
                <CheckoutForm 
                  amount={confirmProduct.price} 
                  orderCode={`MKT-${confirmProduct.id.substring(0,6).toUpperCase()}`} 
                  onSuccess={handleBuyFromMarketplace} 
                />
                
                <button
                  onClick={() => setConfirmProduct(null)}
                  className="w-full py-3 rounded-xl bg-zinc-100 text-zinc-700 font-black hover:bg-zinc-200 active:scale-[0.98] transition-all"
                >
                  Cancelar Compra
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={modal.open}
        onClose={() => setModal({ ...modal, open: false })}
        title={modal.title}
        message={modal.msg}
        type="success"
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-zinc-100 pb-3">
      <span className="text-xs text-zinc-500 font-bold uppercase tracking-wide min-w-[100px] pt-0.5">
        {label}
      </span>
      <span className="font-bold text-zinc-900 text-sm">{value}</span>
    </div>
  );
}

function Mini({
  label,
  value,
  strong,
  color,
}: {
  label: string;
  value: string;
  strong?: boolean;
  color?: string;
}) {
  return (
    <div className="bg-zinc-50 rounded-lg p-3 border border-zinc-200">
      <p className="text-[10px] text-zinc-500 font-bold uppercase">{label}</p>
      <p
        className={`truncate ${
          strong ? "font-black" : "font-semibold"
        } text-zinc-800 ${color || ""}`}
      >
        {value}
      </p>
    </div>
  );
}
