"use client";

import { useState, useEffect } from "react";
import type { Product, ExternalOrder, Order } from "@/lib/types";
import {
  generateOrderCode,
  generateQrSeed,
  CATEGORIES,
  ZONES,
  pickRandomImage,
} from "@/lib/types";
import { SellerPortal } from "@/components/SellerPortal";
import { supabase } from "@/lib/supabaseClient";

export default function SellerPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [externalOrders, setExternalOrders] = useState<ExternalOrder[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

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
          assignedStore: db.assignedStore,
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

  const addProduct = async (p: Product) => {
    setProducts((prev) => [...prev, p]);
    await supabase.from("products").insert({
      id: p.id,
      title: p.title,
      price: p.price,
      description: p.description,
      category: p.category,
      image_url: p.imageUrl,
      seller_name: p.sellerName,
      sold: p.sold,
      zone: p.zone,
    });
  };

  const addExternalOrder = async (e: ExternalOrder) => {
    setExternalOrders((prev) => [...prev, e]);
    await supabase.from("external_orders").insert({
      id: e.id,
      order_code: e.orderCode,
      buyer_name: e.buyerName,
      product_name: e.productName,
      price: e.price,
      origin_address: e.originAddress,
      destination_address: e.destinationAddress,
      seller_name: e.sellerName,
      paid: e.paid,
      qr_seed: e.qrSeed,
      zone: e.zone,
      origin_zone: e.originZone,
    });
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
          <span className="font-semibold text-zinc-600">Portal del Vendedor</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SellerPortal
          products={products}
          externalOrders={externalOrders}
          orders={orders}
          onAddProduct={addProduct}
          onAddExternalOrder={addExternalOrder}
        />
      </main>
    </div>
  );
}
