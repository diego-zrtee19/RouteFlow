export type OrderSource = "marketplace" | "external";

export type OrderStatus =
  | "escrow"
  | "in_transit"
  | "at_store"
  | "delivered_pending"
  | "delivered_confirmed"
  | "disputed";

export interface Product {
  id: string;
  title: string;
  price: number;
  description: string;
  category: string;
  imageUrl: string;
  sellerName: string;
  createdAt: Date;
  sold: boolean;
  zone?: string;
}

export interface ExternalOrder {
  id: string;
  orderCode: string;
  buyerName: string;
  productName: string;
  price: number;
  destinationAddress: string;
  originAddress?: string;
  sellerName: string;
  createdAt: Date;
  paid: boolean;
  qrSeed: string;
  zone: string;
  originZone?: string;
}

export interface Order {
  id: string;
  orderCode: string;
  source: OrderSource;
  status: OrderStatus;
  buyerName: string;
  sellerName: string;
  productName: string;
  productImage?: string;
  price: number;
  destinationAddress: string;
  originAddress?: string;
  assignedStore: string;
  createdAt: Date;
  qrSeed: string;
  zone: string;
  originZone?: string;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  escrow: "Pago Protegido en Custodia (Escrow)",
  in_transit: "En ruta hacia Punto Route",
  at_store: "Listo para recoger en Tiendita",
  delivered_pending: "Entregado · Esperando confirmación",
  delivered_confirmed: "Entregado · Dinero Liberado",
  disputed: "En disputa · Fondos bloqueados",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; dot: string; border: string }> = {
  escrow: { bg: "bg-zinc-50", text: "text-zinc-700", dot: "bg-zinc-500", border: "border-zinc-200" },
  in_transit: { bg: "bg-zinc-50", text: "text-zinc-700", dot: "bg-zinc-500", border: "border-zinc-200" },
  at_store: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", border: "border-amber-200" },
  delivered_pending: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", border: "border-blue-200" },
  delivered_confirmed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", border: "border-emerald-200" },
  disputed: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", border: "border-red-200" },
};

export const CATEGORIES = [
  "Ropa y Moda",
  "Electrónica",
  "Hogar y Decoración",
  "Belleza y Cuidado",
  "Deportes",
  "Libros y Papelería",
  "Alimentos y Gourmet",
  "Arte y Artesanías",
  "Otro",
];

export const ZONES = [
  "Zapopan Centro",
  "Bugambilias",
  "Paseos del Sol",
  "Santa Anita",
  "Tlajomulco",
  "La Estancia",
];

export const STORE_BY_ZONE: Record<string, string[]> = {
  "Zapopan Centro": [
    "Papelería Lupita - Zapopan Centro",
    "Farmacias Similares - Av. Hidalgo",
    "Oxxo Centro - Frente al IMSS",
  ],
  "Bugambilias": [
    "Tiendita Doña Mary - Bugambilias",
    "Oxxo Bugambilias - Entrada 3",
    "Mini Super El Sol - Circuito Bugambilias",
  ],
  "Paseos del Sol": [
    "Super 7 La Esmeralda - Paseos del Sol",
    "Mini Super El Sol - Blvd. Paseos",
    "Abarrotes Lupita - Esquina Cerezos",
  ],
  "Santa Anita": [
    "Abarrotes Don Pepe - Santa Anita",
    "Oxxo Las Flores - Santa Anita",
    "Papelería El Lápiz - Santa Anita",
  ],
  "Tlajomulco": [
    "Mini Super El Sol - Tlajomulco Centro",
    "Farmacias Guadalajara - Tlajomulco",
    "Oxxo Tlajomulco - Glorieta Central",
  ],
  "La Estancia": [
    "Super 7 La Esmeralda - La Estancia",
    "Papelería Lupita 2 - Sector La Estancia",
    "Tiendita Doña Mary - La Estancia",
  ],
};

export const STORES = Object.values(STORE_BY_ZONE).flat();

export function generateOrderCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `RF-${num}`;
}

export function generateQrSeed(): string {
  return Math.random().toString(36).substring(2, 20);
}

export function pickRandomStore(): string {
  return STORES[Math.floor(Math.random() * STORES.length)];
}

export function pickStoreByZone(zone: string): string {
  const list = STORE_BY_ZONE[zone];
  if (!list || list.length === 0) return pickRandomStore();
  // Primera tiendita del catálogo = Nano-Hub “ancla” de esa zona
  // (ej. Santa Anita → Abarrotes Don Pepe - Santa Anita)
  return list[0];
}

export const SAMPLE_IMAGE_URLS = [
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80",
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80",
  "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600&q=80",
  "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=600&q=80",
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&q=80",
];

export function pickRandomImage(): string {
  return SAMPLE_IMAGE_URLS[Math.floor(Math.random() * SAMPLE_IMAGE_URLS.length)];
}

// LocalStorage removed in favor of Cloud database infrastructure (Supabase)
