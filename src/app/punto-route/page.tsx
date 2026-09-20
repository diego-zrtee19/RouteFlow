"use client";

import { useState, useEffect } from "react";
import type { Order } from "@/lib/types";
import { NanoHubPanel } from "@/components/NanoHubPanel";
import { supabase } from "@/lib/supabaseClient";

export default function PuntoRoutePage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const oRes = await supabase.from("orders").select("*").order("created_at", { ascending: true });

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
          destinationAddress: db.destinationAddress,
          originAddress: db.origin_address,
          assignedStore: db.assigned_store,
          createdAt: new Date(db.created_at),
          qrSeed: db.qr_seed,
          zone: db.zone,
          originZone: db.origin_zone,
        })));
      } catch (err) {
        console.error("Error loading data from Supabase:", err);
      }
    }
    loadData();
  }, []);

  const deliverOrder = async (id: string) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "delivered_pending" } : o)));
    await supabase.from("orders").update({ status: "delivered_pending" }).eq("id", id);
  };

  const deliverOrderByQr = (qrSeed: string): Order | null => {
    const seed = qrSeed.trim();
    let matched: Order | null = null;
    setOrders((prev) => {
      const found = prev.find((o) => o.qrSeed === seed && o.status !== "delivered_confirmed");
      if (!found) return prev;
      matched = { ...found, status: "delivered_pending" };
      return prev.map((o) => (o.id === found.id ? { ...o, status: "delivered_pending" } : o));
    });
    if (matched) {
      supabase.from("orders").update({ status: "delivered_pending" }).eq("id", (matched as Order).id).then();
    }
    return matched;
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-zinc-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-white font-black text-xl">
              R
            </div>
            <span className="font-extrabold text-lg text-zinc-900">RouteFlow</span>
          </a>
          <span className="font-semibold text-zinc-600">Panel de Socio Route</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <NanoHubPanel
          orders={orders}
          onDeliverOrder={deliverOrder}
          onDeliverByQr={deliverOrderByQr}
        />
      </main>
    </div>
  );
}
