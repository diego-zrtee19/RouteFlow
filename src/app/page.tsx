"use client";

import { useState, useEffect } from "react";
import type { Product, ExternalOrder, Order, OrderStatus } from "@/lib/types";
import {
  generateOrderCode,
  generateQrSeed,
  pickStoreByZone,
} from "@/lib/types";
import { BuyerPortal } from "@/components/BuyerPortal";
import { RouteDropdown } from "@/components/RouteDropdown";
import { SignInButton, UserButton, Show } from "@clerk/nextjs";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [externalOrders, setExternalOrders] = useState<ExternalOrder[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const [pRes, extRes, oRes] = await Promise.all([
          supabase.from("products").select("*").order("created_at", { ascending: true }),
          supabase.from("external_orders").select("*").order("created_at", { ascending: true }),
          supabase.from("orders").select("*").order("created_at", { ascending: true }),
        ]);

        if (pRes.data) setProducts(pRes.data.map((db: any) => ({
          id: db.id,
          title: db.title,
          price: Number(db.price),
          description: db.description,
          category: db.category,
          imageUrl: db.image_url,
          sellerName: db.seller_name,
          createdAt: new Date(db.created_at),
          sold: db.sold,
          zone: db.zone,
        })));

        if (extRes.data) setExternalOrders(extRes.data.map((db: any) => ({
          id: db.id,
          orderCode: db.order_code,
          buyerName: db.buyer_name,
          productName: db.product_name,
          price: Number(db.price),
          destinationAddress: db.destination_address,
          originAddress: db.origin_address,
          sellerName: db.seller_name,
          createdAt: new Date(db.created_at),
          paid: db.paid,
          qrSeed: db.qr_seed,
          zone: db.zone,
          originZone: db.origin_zone,
        })));

        if (oRes.data) setOrders(oRes.data.map((db: any) => ({
          id: db.id,
          orderCode: db.order_code,
          source: db.source,
          status: db.status,
          buyerName: db.buyer_name,
          sellerName: db.seller_name,
          productName: db.product_name,
          productImage: db.product_image,
          price: Number(db.price),
          destinationAddress: db.destination_address,
          originAddress: db.origin_address,
          assignedStore: db.assigned_store,
          createdAt: new Date(db.created_at),
          qrSeed: db.qr_seed,
          zone: db.zone,
          originZone: db.origin_zone,
        })));
      } catch (err) {
        console.error("Error loading data from Supabase:", err);
      } finally {
        setHydrated(true);
      }
    }
    loadData();
  }, []);

  const buyFromMarketplace = (product: Product, buyerName: string, zone: string): Order => {
    const order: Order = {
      id: crypto.randomUUID(),
      orderCode: generateOrderCode(),
      source: "marketplace",
      status: "escrow",
      buyerName,
      sellerName: product.sellerName,
      productName: product.title,
      productImage: product.imageUrl,
      price: product.price,
      destinationAddress: zone,
      assignedStore: pickStoreByZone(zone),
      createdAt: new Date(),
      qrSeed: generateOrderCode() + "-" + generateQrSeed(),
      zone,
      originZone: product.zone,
      originAddress: product.zone,
    };
    setOrders((prev) => [...prev, order]);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, sold: true } : p)));

    supabase.from("products").update({ sold: true }).eq("id", product.id).then();
    supabase.from("orders").insert({
      id: order.id,
      order_code: order.orderCode,
      source: order.source,
      status: order.status,
      buyer_name: order.buyerName,
      seller_name: order.sellerName,
      product_name: order.productName,
      product_image: order.productImage,
      price: order.price,
      destination_address: order.destinationAddress,
      origin_address: order.originAddress,
      assigned_store: order.assignedStore,
      qr_seed: order.qrSeed,
      zone: order.zone,
      origin_zone: order.originZone,
    }).then();

    return order;
  };

  const payExternalOrder = (eo: ExternalOrder): Order => {
    const order: Order = {
      id: crypto.randomUUID(),
      orderCode: eo.orderCode,
      source: "external",
      status: "escrow",
      buyerName: eo.buyerName,
      sellerName: eo.sellerName,
      productName: eo.productName,
      price: eo.price,
      destinationAddress: eo.destinationAddress,
      originAddress: eo.originAddress ?? eo.originZone,
      assignedStore: pickStoreByZone(eo.zone),
      createdAt: new Date(),
      qrSeed: eo.qrSeed,
      zone: eo.zone,
      originZone: eo.originZone,
    };
    setOrders((prev) => [...prev, order]);
    
    supabase.from("orders").insert({
      id: order.id,
      order_code: order.orderCode,
      source: order.source,
      status: order.status,
      buyer_name: order.buyerName,
      seller_name: order.sellerName,
      product_name: order.productName,
      price: order.price,
      destination_address: order.destinationAddress,
      origin_address: order.originAddress,
      assigned_store: order.assignedStore,
      qr_seed: order.qrSeed,
      zone: order.zone,
      origin_zone: order.originZone,
    }).then();

    return order;
  };

  const advanceOrder = async (id: string) => {
    let nextStatus: OrderStatus | null = null;
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const seq: OrderStatus[] = ["escrow", "in_transit", "at_store", "delivered_pending", "delivered_confirmed"];
        const idx = seq.indexOf(o.status);
        if (idx < 0 || idx >= seq.length - 1) return o;
        nextStatus = seq[idx + 1];
        return { ...o, status: nextStatus };
      })
    );
    if (nextStatus) {
      await supabase.from("orders").update({ status: nextStatus }).eq("id", id);
    }
  };

  const onMarkExternalPaid = async (id: string) => {
    setExternalOrders((prev) => prev.map((e) => (e.id === id ? { ...e, paid: true } : e)));
    await supabase.from("external_orders").update({ paid: true }).eq("id", id);
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-zinc-200 selection:text-zinc-900">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-zinc-200 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4 sm:gap-6">
          
          <div
            className="flex items-center gap-3 cursor-pointer shrink-0 group"
            onClick={() => router.push("/")}
            role="button"
            tabIndex={0}
            aria-label="Ir al inicio"
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push("/");
            }}
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-zinc-900 flex items-center justify-center text-white font-black text-xl shadow-md group-hover:scale-105 transition-all duration-300">
              R
            </div>
            <span className="font-extrabold text-lg sm:text-xl tracking-tight hidden sm:inline text-zinc-900">
              RouteFlow
            </span>
          </div>

          <div className="flex-1 max-w-2xl relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <span className="text-zinc-400">🔍</span>
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar productos..."
              className="w-full pl-11 pr-4 py-2.5 rounded-full bg-zinc-100 border border-zinc-200 focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-200 text-sm font-medium placeholder:text-zinc-400 transition-all duration-300"
            />
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              onClick={() => router.push("/")}
              className="hidden md:inline-flex px-3 py-2 text-sm font-semibold rounded-full transition-all duration-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              Explorar
            </button>
            <button
              onClick={() => router.push("/seller")}
              className="px-3 py-2 text-sm font-semibold rounded-full transition-all duration-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              Vender
            </button>
            <RouteDropdown />

            <div className="hidden sm:block w-px h-6 bg-zinc-200 mx-2"></div>
            
            <div className="flex items-center justify-center min-w-[40px]">
              <Show when="signed-in">
                <div className="hover:scale-105 transition-transform duration-200">
                  <UserButton appearance={{ elements: { avatarBox: "w-9 h-9 border-2 border-zinc-200 shadow-sm" } }} />
                </div>
              </Show>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="px-4 py-2 text-sm font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-full transition-all duration-300 whitespace-nowrap">
                    Ingresar
                  </button>
                </SignInButton>
              </Show>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
        <BuyerPortal
          products={products}
          externalOrders={externalOrders}
          orders={orders}
          searchQuery={searchQuery}
          onBuyMarketplace={buyFromMarketplace}
          onPayExternalOrder={payExternalOrder}
          onAdvanceOrder={advanceOrder}
          onMarkExternalPaid={onMarkExternalPaid}
        />
      </main>
    </div>
  );
}
