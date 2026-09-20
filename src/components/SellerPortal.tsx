"use client";

import { useState } from "react";
import type { Product, ExternalOrder, Order } from "@/lib/types";
import {
  generateOrderCode,
  generateQrSeed,
  CATEGORIES,
  ZONES,
  pickRandomImage,
} from "@/lib/types";
import { QRCode } from "./QRCode";
import { Modal } from "./Modal";
import { ZoneSelect } from "./ZoneSelect";

interface SellerPortalProps {
  products: Product[];
  externalOrders: ExternalOrder[];
  orders: Order[];
  onAddProduct: (p: Product) => void;
  onAddExternalOrder: (o: ExternalOrder) => void;
}

type SellerTab = "marketplace" | "external";

interface MarketplaceForm {
  title: string;
  price: string;
  description: string;
  category: string;
  imageUrl: string;
  sellerName: string;
  originZone: string;
}

interface ExternalForm {
  sellerName: string;
  buyerName: string;
  productName: string;
  price: string;
  originZone: string;
  zone: string;
}

const emptyMp: MarketplaceForm = {
  title: "",
  price: "",
  description: "",
  category: CATEGORIES[0],
  imageUrl: "",
  sellerName: "",
  originZone: ZONES[0],
};

const emptyExt: ExternalForm = {
  sellerName: "",
  buyerName: "",
  productName: "",
  price: "",
  originZone: ZONES[0],
  zone: ZONES[1] ?? ZONES[0],
};

export function SellerPortal({
  products,
  externalOrders,
  orders,
  onAddProduct,
  onAddExternalOrder,
}: SellerPortalProps) {
  const [tab, setTab] = useState<SellerTab>("marketplace");
  const [mpForm, setMpForm] = useState<MarketplaceForm>(emptyMp);
  const [extForm, setExtForm] = useState<ExternalForm>(emptyExt);
  const [mpErrors, setMpErrors] = useState<Partial<MarketplaceForm>>({});
  const [extErrors, setExtErrors] = useState<Partial<ExternalForm>>({});
  const [lastExternal, setLastExternal] = useState<ExternalOrder | null>(null);
  const [lastProduct, setLastProduct] = useState<Product | null>(null);
  const [copied, setCopied] = useState(false);
  const [modal, setModal] = useState<{
    open: boolean;
    title: string;
    msg: string;
  }>({ open: false, title: "", msg: "" });

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const validateMp = (): boolean => {
    const e: Partial<MarketplaceForm> = {};
    if (!mpForm.sellerName.trim()) e.sellerName = "Requerido";
    if (!mpForm.title.trim()) e.title = "Requerido";
    if (!mpForm.price.trim() || parseFloat(mpForm.price) <= 0)
      e.price = "Precio válido";
    if (!mpForm.description.trim()) e.description = "Requerido";
    if (!mpForm.category) e.category = "Requerido";
    setMpErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateExt = (): boolean => {
    const e: Partial<ExternalForm> = {};
    if (!extForm.sellerName.trim()) e.sellerName = "Requerido";
    if (!extForm.buyerName.trim()) e.buyerName = "Requerido";
    if (!extForm.productName.trim()) e.productName = "Requerido";
    if (!extForm.price.trim() || parseFloat(extForm.price) <= 0)
      e.price = "Precio válido";
    if (!extForm.zone) e.zone = "Requerido";
    setExtErrors(e);
    return Object.keys(e).length === 0;
  };

  const submitProduct = () => {
    if (!validateMp()) return;
    const p: Product = {
      id: crypto.randomUUID(),
      title: mpForm.title.trim(),
      price: parseFloat(mpForm.price),
      description: mpForm.description.trim(),
      category: mpForm.category,
      imageUrl: mpForm.imageUrl.trim() || pickRandomImage(),
      sellerName: mpForm.sellerName.trim(),
      createdAt: new Date(),
      sold: false,
      zone: mpForm.originZone,
    };
    onAddProduct(p);
    setLastProduct(p);
    setMpForm(emptyMp);
    setModal({
      open: true,
      title: "¡Producto Publicado!",
      msg: `"${p.title}" ya está visible en el Marketplace Local para compradores.`,
    });
  };

  const submitExternal = () => {
    if (!validateExt()) return;
    const zone = extForm.zone;
    const originZone = extForm.originZone;
    const o: ExternalOrder = {
      id: crypto.randomUUID(),
      orderCode: generateOrderCode(),
      buyerName: extForm.buyerName.trim(),
      productName: extForm.productName.trim(),
      price: parseFloat(extForm.price),
      originAddress: originZone,
      destinationAddress: zone,
      originZone,
      sellerName: extForm.sellerName.trim(),
      createdAt: new Date(),
      paid: false,
      qrSeed: generateQrSeed(),
      zone,
    };
    onAddExternalOrder(o);
    setLastExternal(o);
    setExtForm(emptyExt);
    setModal({
      open: true,
      title: "¡Orden Externa Creada!",
      msg: `Código ${o.orderCode} generado. Origen ${originZone} → Destino ${zone}. Envía este código a ${o.buyerName} por WhatsApp/Facebook para que pague de forma segura.`,
    });
  };

  const handleWithdraw = () => {
    window.alert(
      "✅ ¡Solicitud de retiro enviada!\n\nLos fondos disponibles han sido solicitados para transferencia a tu tarjeta bancaria.\nRouteFlow procesará el depósito en los próximos 10-30 minutos hábiles."
    );
  };

  const inputCls = (err?: string) =>
    `w-full px-4 py-3 rounded-xl border-2 transition-all bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
      err
        ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
        : "border-gray-200 focus:border-indigo-500"
    }`;

  const lbl = "block text-sm font-semibold text-gray-700 mb-1.5";

  const sellerRevenue = orders
    .filter((o) => o.status === "delivered")
    .reduce((s, o) => s + o.price, 0);
  const sellerSales = orders.filter((o) => o.status === "delivered").length;
  const pendingOrders = orders.filter((o) => o.status !== "delivered").length;

  const saldoCustodia = orders
    .filter(
      (o) =>
        o.status === "escrow" || o.status === "in_transit" || o.status === "at_store"
    )
    .reduce((s, o) => s + o.price, 0);
  const saldoDisponible = sellerRevenue;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
      {/* Mi Billetera Virtual — panel superior */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-xl">
            👛
          </div>
          <div>
            <h3 className="font-black text-lg text-zinc-900">Mi Billetera</h3>
            <p className="text-xs text-zinc-500 font-semibold">
              Custodia RouteFlow · Liberación al entregar
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="bg-zinc-50 rounded-xl p-6 border border-zinc-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-zinc-200 flex items-center justify-center text-2xl shrink-0">
                🔒
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-2">
                  Saldo en Custodia
                </p>
                <p className="text-3xl font-black text-zinc-900 leading-none">
                  ${saldoCustodia.toFixed(2)}
                </p>
                <p className="text-xs text-zinc-500 mt-2">
                  Órdenes en escrow / tránsito / tienda
                </p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-50 rounded-xl p-6 border border-zinc-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-zinc-200 flex items-center justify-center text-2xl shrink-0">
                💰
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-2">
                  Saldo Disponible
                </p>
                <p className="text-3xl font-black text-zinc-900 leading-none">
                  ${saldoDisponible.toFixed(2)}
                </p>
                <p className="text-xs text-zinc-500 mt-2">
                  Órdenes entregadas · listo para retiro
                </p>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={handleWithdraw}
          className="mt-6 w-full py-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-black text-base active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          💸 Retirar Fondos a mi Tarjeta
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-2xl">
            👤
          </div>
          <div className="flex-1">
            <h2 className="text-xl sm:text-2xl font-black text-zinc-900">Portal del Vendedor</h2>
            <p className="text-xs sm:text-sm text-zinc-500">
              Marketplace Local + Órdenes Externas Sociales
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-zinc-700">En vivo</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200">
            <p className="text-2xl font-black text-zinc-900">{sellerSales}</p>
            <p className="text-xs text-zinc-500">Ventas completadas</p>
          </div>
          <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200">
            <p className="text-2xl font-black text-zinc-900">${sellerRevenue.toFixed(0)}</p>
            <p className="text-xs text-zinc-500">Cobrado MXN</p>
          </div>
          <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200">
            <p className="text-2xl font-black text-zinc-900">{pendingOrders}</p>
            <p className="text-xs text-zinc-500">En proceso</p>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-gray-100 to-gray-50 rounded-2xl p-1.5 grid grid-cols-2 gap-1">
        <button
          onClick={() => setTab("marketplace")}
          className={`py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            tab === "marketplace"
              ? "bg-white text-gray-900 shadow-md ring-1 ring-gray-200/50"
              : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
          }`}
        >
          <span>🛍️</span> Marketplace Local
        </button>
        <button
          onClick={() => setTab("external")}
          className={`py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            tab === "external"
              ? "bg-white text-gray-900 shadow-md ring-1 ring-gray-200/50"
              : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
          }`}
        >
          <span>🔗</span> Órdenes Sociales
          {externalOrders.filter((o) => !o.paid).length > 0 && (
            <span className="px-1.5 h-5 min-w-[20px] rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center animate-pulse">
              {externalOrders.filter((o) => !o.paid).length}
            </span>
          )}
        </button>
      </div>

      {tab === "marketplace" && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-black text-lg text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary-500" />
              🆕 Publicar Producto en Vitrina Pública
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Tu nombre o Tienda</label>
                  <input
                    value={mpForm.sellerName}
                    onChange={(e) =>
                      setMpForm({ ...mpForm, sellerName: e.target.value })
                    }
                    placeholder="ej. Leo Store"
                    className={inputCls(mpErrors.sellerName)}
                  />
                  {mpErrors.sellerName && (
                    <p className="text-xs text-red-500 mt-1">
                      {mpErrors.sellerName}
                    </p>
                  )}
                </div>
                <div>
                  <label className={lbl}>Categoría</label>
                  <select
                    value={mpForm.category}
                    onChange={(e) =>
                      setMpForm({ ...mpForm, category: e.target.value })
                    }
                    className={inputCls(mpErrors.category) + " cursor-pointer"}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <ZoneSelect
                label="📍 Zona de origen (tu Nano-Hub de salida)"
                value={mpForm.originZone}
                onChange={(originZone) => setMpForm({ ...mpForm, originZone })}
                hint="Desde aquí sale el paquete hacia la zona del comprador."
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className={lbl}>Título del Producto</label>
                  <input
                    value={mpForm.title}
                    onChange={(e) =>
                      setMpForm({ ...mpForm, title: e.target.value })
                    }
                    placeholder="ej. Playera Oversize Negra"
                    className={inputCls(mpErrors.title)}
                  />
                  {mpErrors.title && (
                    <p className="text-xs text-red-500 mt-1">
                      {mpErrors.title}
                    </p>
                  )}
                </div>
                <div>
                  <label className={lbl}>Precio (MXN)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">
                      $
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={mpForm.price}
                      onChange={(e) =>
                        setMpForm({ ...mpForm, price: e.target.value })
                      }
                      placeholder="350"
                      className={`${inputCls(mpErrors.price)} pl-8`}
                    />
                  </div>
                  {mpErrors.price && (
                    <p className="text-xs text-red-500 mt-1">
                      {mpErrors.price}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className={lbl}>Descripción</label>
                <textarea
                  value={mpForm.description}
                  onChange={(e) =>
                    setMpForm({ ...mpForm, description: e.target.value })
                  }
                  placeholder="Describe tu producto, tallas, estado, materiales..."
                  rows={3}
                  className={inputCls(mpErrors.description) + " resize-none"}
                />
                {mpErrors.description && (
                  <p className="text-xs text-red-500 mt-1">
                    {mpErrors.description}
                  </p>
                )}
              </div>
              <div>
                <label className={lbl}>
                  URL de Imagen{" "}
                  <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  value={mpForm.imageUrl}
                  onChange={(e) =>
                    setMpForm({ ...mpForm, imageUrl: e.target.value })
                  }
                  placeholder="https://... (dejar vacío para una demo)"
                  className={inputCls()}
                />
              </div>
              <button
                onClick={submitProduct}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white font-black shadow-lg shadow-primary-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-primary-500/30"
              >
                <span className="text-xl">🛍️</span>
                Publicar en Marketplace Local
              </button>
            </div>
          </div>

          {lastProduct && (
            <div className="bg-white rounded-3xl shadow-sm border-2 border-primary-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">✅</span>
                <h3 className="font-black text-gray-900">
                  ¡Producto publicado exitosamente!
                </h3>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-40 h-40 rounded-2xl overflow-hidden border border-gray-100 flex-shrink-0">
                  <img
                    src={lastProduct.imageUrl}
                    alt={lastProduct.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase">
                      Producto
                    </p>
                    <p className="font-bold text-gray-900">
                      {lastProduct.title}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Vendedor</p>
                      <p className="font-semibold text-gray-800">
                        {lastProduct.sellerName}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Categoría</p>
                      <p className="font-semibold text-gray-800">
                        {lastProduct.category}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Precio</p>
                      <p className="font-black text-primary-600 text-lg">
                        ${lastProduct.price.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {products.length > 0 && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-lg text-gray-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  Tu Vitrina ({products.length})
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[...products].reverse().map((p) => (
                  <div
                    key={p.id}
                    className={`rounded-2xl border overflow-hidden transition-all ${
                      p.sold
                        ? "border-success-200 bg-success-50/40 opacity-80"
                        : "border-gray-100 bg-white"
                    }`}
                  >
                    <div className="aspect-square bg-gray-100 relative overflow-hidden">
                      <img
                        src={p.imageUrl}
                        alt={p.title}
                        className={`w-full h-full object-cover ${
                          p.sold ? "grayscale" : ""
                        }`}
                      />
                      {p.sold && (
                        <div className="absolute inset-0 flex items-center justify-center bg-success-600/30">
                          <span className="bg-white text-success-700 font-black px-3 py-1 rounded-full text-xs shadow">
                            VENDIDO ✓
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-xs text-primary-600 font-bold mb-0.5">
                        {p.category}
                      </p>
                      <p className="font-bold text-gray-900 text-sm truncate">
                        {p.title}
                      </p>
                      <p className="text-lg font-black text-success-600 mt-0.5">
                        ${p.price.toFixed(0)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "external" && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
            <div className="mb-4">
              <h3 className="font-black text-lg text-gray-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                🔗 Crear Orden Externa (Redes Sociales)
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Para ventas cerradas en Facebook, Instagram o WhatsApp. Genera
                un código seguro para tu cliente.
              </p>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={lbl}>Vendedor (Tú)</label>
                  <input
                    value={extForm.sellerName}
                    onChange={(e) =>
                      setExtForm({ ...extForm, sellerName: e.target.value })
                    }
                    placeholder="ej. Leo Store"
                    className={inputCls(extErrors.sellerName)}
                  />
                  {extErrors.sellerName && (
                    <p className="text-xs text-red-500 mt-1">
                      {extErrors.sellerName}
                    </p>
                  )}
                </div>
                <div>
                  <label className={lbl}>Nombre del Comprador</label>
                  <input
                    value={extForm.buyerName}
                    onChange={(e) =>
                      setExtForm({ ...extForm, buyerName: e.target.value })
                    }
                    placeholder="ej. María González"
                    className={inputCls(extErrors.buyerName)}
                  />
                  {extErrors.buyerName && (
                    <p className="text-xs text-red-500 mt-1">
                      {extErrors.buyerName}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className={lbl}>Producto Acordado</label>
                  <input
                    value={extForm.productName}
                    onChange={(e) =>
                      setExtForm({ ...extForm, productName: e.target.value })
                    }
                    placeholder="ej. Playera Oversize + Gorra"
                    className={inputCls(extErrors.productName)}
                  />
                  {extErrors.productName && (
                    <p className="text-xs text-red-500 mt-1">
                      {extErrors.productName}
                    </p>
                  )}
                </div>
                <div>
                  <label className={lbl}>Precio Exacto (MXN)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">
                      $
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={extForm.price}
                      onChange={(e) =>
                        setExtForm({ ...extForm, price: e.target.value })
                      }
                      placeholder="450"
                      className={`${inputCls(extErrors.price)} pl-8`}
                    />
                  </div>
                  {extErrors.price && (
                    <p className="text-xs text-red-500 mt-1">
                      {extErrors.price}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ZoneSelect
                  label="📍 Zona de origen"
                  value={extForm.originZone}
                  onChange={(originZone) =>
                    setExtForm({ ...extForm, originZone })
                  }
                  hint="De dónde sale el paquete."
                />
                <ZoneSelect
                  label="📍 Zona de destino"
                  value={extForm.zone}
                  onChange={(zone) => setExtForm({ ...extForm, zone })}
                  error={extErrors.zone}
                  hint="✨ El Nano-Hub se asigna según el destino (ej. Santa Anita → Abarrotes Don Pepe)."
                />
              </div>
              <button
                onClick={submitExternal}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <span className="text-xl">🔗</span>
                Generar Enlace / Código de Orden Único
              </button>
            </div>
          </div>

          {lastExternal && (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl shadow-sm border-2 border-emerald-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🎉</span>
                <h3 className="font-black text-gray-900">
                  ¡Código de Orden Generado!
                </h3>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-3">
                  <div className="bg-white rounded-2xl p-4 border border-emerald-100">
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-1">
                      Código de Orden (envía esto al cliente)
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-3xl font-black text-emerald-700 tracking-tight">
                        {lastExternal.orderCode}
                      </p>
                      <button
                        onClick={() => handleCopy(lastExternal.orderCode)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          copied
                            ? "bg-success-500 text-white"
                            : "bg-emerald-600 text-white hover:bg-emerald-700"
                        }`}
                      >
                        {copied ? "¡Copiado! ✓" : "📋 Copiar"}
                      </button>
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100">
                      <span className="text-xs">📍</span>
                      <span className="text-xs font-bold text-primary-700">
                        Zona: {lastExternal.zone}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">
                      💬 Mensaje sugerido para WhatsApp:
                    </p>
                    <div
                      className="mt-1 p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm text-gray-700 cursor-pointer hover:bg-gray-100 transition-all"
                      onClick={() =>
                        handleCopy(
                          `Hola ${lastExternal.buyerName}! 👋 Tu pedido en RouteFlow está listo. Usa el código ${lastExternal.orderCode} para pagar de forma SEGURA con custodia: https://routeflow.app/pay/${lastExternal.orderCode} 🛡️`
                        )
                      }
                    >
                      Hola {lastExternal.buyerName}! 👋 Tu pedido está listo.
                      Usa el código <b>{lastExternal.orderCode}</b> para pagar
                      de forma SEGURA con RouteFlow 🛡️
                      <span className="block text-[10px] text-gray-400 mt-1 font-semibold">
                        (toca para copiar el mensaje completo)
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-white rounded-xl p-3 border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Comprador</p>
                      <p className="font-bold text-gray-900">
                        {lastExternal.buyerName}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-3 border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Monto</p>
                      <p className="font-black text-emerald-700">
                        ${lastExternal.price.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center bg-white rounded-2xl p-4 border border-emerald-100">
                  <p className="text-xs text-gray-500 font-bold mb-3">
                    Código QR Real
                  </p>
                  <QRCode value={lastExternal.qrSeed} size={128} />
                  <p className="font-mono text-xs text-gray-400 mt-3 font-bold">
                    {lastExternal.orderCode}
                  </p>
                </div>
              </div>
            </div>
          )}

          {externalOrders.length > 0 && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-black text-lg text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500" />
                Historial de Órdenes Sociales ({externalOrders.length})
              </h3>
              <div className="space-y-2">
                {[...externalOrders].reverse().map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between p-4 rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-gray-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-12 h-12 rounded-xl font-mono text-sm font-black flex items-center justify-center shrink-0 ${
                          o.paid
                            ? "bg-success-100 text-success-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {o.orderCode.slice(-4)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-sm truncate">
                          {o.productName}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {o.buyerName} · {o.orderCode} · 📍{o.zone}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="font-black text-gray-900">
                        ${o.price.toFixed(0)}
                      </p>
                      <p
                        className={`text-xs font-bold ${
                          o.paid ? "text-success-600" : "text-amber-600"
                        }`}
                      >
                        {o.paid ? "✓ Pagada" : "⏳ Esperando pago"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
