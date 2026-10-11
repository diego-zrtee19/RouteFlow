"use client";
import { useEffect, useState } from "react";
import { useUser, SignInButton, UserButton, UserProfile } from "@clerk/nextjs";
import Link from "next/link";

type Purchase = { id: string; orderNumber: string; status: string; paymentStatus: string; amount: number; currency: string; createdAt: string; sellerName: string; items: { title: string; quantity: number }[] };
const statuses: Record<string, string> = { PAID: "Pago confirmado", READY_TO_SHIP: "Preparando", IN_TRANSIT: "En camino", DELIVERED: "Entrega registrada", COMPLETED: "Completado", DISPUTED: "Caso en revisión", REFUNDED: "Reembolsado", CANCELLED: "Cancelado", CREATED: "Pago pendiente" };
export default function PurchasesPage() {
  const { user, isLoaded, isSignedIn } = useUser();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [profile, setProfile] = useState(false);
  const emailIdentity = user?.emailAddresses.filter(email => email.verification.status === "verified").map(email => email.emailAddress).sort().join("|");
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`/api/buyer/purchases?page=${page}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? "No se pudieron cargar tus compras");
      if (!controller.signal.aborted) { setPurchases(data.purchases); setMore(data.hasMore); }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isLoaded, isSignedIn, user?.id, emailIdentity, page, reload]);
  const verified = user?.emailAddresses.some(email => email.verification.status === "verified");
  return <div className="min-h-screen bg-brand-bg">
    <header className="bg-white border-b"><nav className="max-w-3xl mx-auto p-4 flex justify-between items-center"><Link href="/" className="font-bold">RouteFlow</Link><div className="flex gap-4 items-center"><Link href="/help">Ayuda</Link>{isSignedIn && <UserButton />}</div></nav></header>
    <main className="max-w-3xl mx-auto p-4 space-y-5"><h1 className="text-3xl font-bold">Mis compras</h1><p>Consulta tus pedidos, sigue las entregas y solicita ayuda desde cada compra.</p>
      {!isLoaded ? <p role="status">Cargando…</p> : !isSignedIn ? <section className="bg-white rounded-xl border p-6 space-y-4"><h2 className="font-bold">Recupera tus compras con tu correo</h2><p>Usa el mismo correo que escribiste al pagar. Verificaremos tu acceso antes de mostrar pedidos. No necesitas una cuenta para comprar; este acceso es opcional para consultar tus compras después.</p><SignInButton mode="modal" forceRedirectUrl="/mis-compras" signUpForceRedirectUrl="/mis-compras"><button className="bg-blue-600 text-white rounded-lg px-4 py-3">Entrar / recuperar mis compras</button></SignInButton></section> : <>
        <p className="text-sm">Mostramos únicamente pedidos asociados a tus correos verificados.</p>
        <button onClick={() => setProfile(!profile)} className="text-blue-700 underline min-h-11">{profile ? "Cerrar ajustes de acceso" : "Verificar o agregar el correo de mi compra"}</button>
        {profile && <div className="overflow-x-auto"><UserProfile routing="hash" /></div>}
        {!verified && <p role="alert">Verifica tu correo en los ajustes de acceso para recuperar tus compras.</p>}
        {error && <div role="alert"><p>{error}</p><button className="text-blue-700 underline min-h-11" onClick={() => setReload(value => value + 1)}>Volver a intentar</button></div>}
        {loading ? <p role="status">Buscando tus compras…</p> : !error && <>
          {!purchases.length && <section className="bg-white border rounded-xl p-6"><h2 className="font-bold">Todavía no encontramos compras con este correo</h2><p>Si pagaste con otro correo, agrégalo y verifícalo en los ajustes de acceso. También puedes volver al enlace privado de tu recibo.</p></section>}
          {purchases.map(purchase => <article key={purchase.id} className="bg-white border rounded-xl p-5 space-y-3"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">{purchase.items.map(item => `${item.title} × ${item.quantity}`).join(", ")}</h2><span>{statuses[purchase.status] ?? purchase.status}</span></div><p>{purchase.sellerName} · {new Date(purchase.createdAt).toLocaleDateString("es-MX")}</p><p>{purchase.orderNumber} · {new Intl.NumberFormat("es-MX", { style: "currency", currency: purchase.currency }).format(purchase.amount)}</p><Link className="inline-block bg-blue-600 text-white rounded-lg px-4 py-3" href={`/order/${purchase.id}`}>Seguir mi pedido / pedir ayuda</Link></article>)}
          <div className="flex gap-4">{page > 0 && <button className="min-h-11 underline" onClick={() => setPage(value => value - 1)}>Anterior</button>}{more && <button className="min-h-11 underline" onClick={() => setPage(value => value + 1)}>Más compras</button>}</div>
        </>}
      </>}
    </main></div>;
}
