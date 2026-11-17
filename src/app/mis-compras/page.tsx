"use client";
import { CommerceHeader } from "@/components/shared/CommerceHeader";
import { useEffect, useState } from "react";
import { useUser, SignInButton, UserButton, UserProfile } from "@clerk/nextjs";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/Button";

type Purchase = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  amount: number;
  currency: string;
  createdAt: string;
  sellerName: string;
  items: { title: string; quantity: number }[];
};
const statuses: Record<string, string> = {
  PAID: "Pago confirmado",
  READY_TO_SHIP: "Preparando",
  IN_TRANSIT: "En camino",
  DELIVERED: "Entrega registrada",
  COMPLETED: "Completado",
  DISPUTED: "Caso en revisión",
  REFUNDED: "Reembolsado",
  CANCELLED: "Cancelado",
  CREATED: "Pago pendiente",
};
export default function PurchasesPage() {
  const { user } = useUser();
  const identity =
    user?.emailAddresses
      .filter((email) => email.verification.status === "verified")
      .map((email) => email.emailAddress)
      .sort()
      .join("|") ?? "";
  // Discard pagination and private results when the authenticated identity changes.
  return <PurchasesContent key={`${user?.id ?? "guest"}:${identity}`} />;
}
function PurchasesContent() {
  const { user, isLoaded, isSignedIn } = useUser();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [profile, setProfile] = useState(false);
  const emailIdentity = user?.emailAddresses
    .filter((email) => email.verification.status === "verified")
    .map((email) => email.emailAddress)
    .sort()
    .join("|");
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/buyer/purchases?page=${page}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error?.message ?? "No se pudieron cargar tus compras");
        if (!controller.signal.aborted) {
          setPurchases(data.purchases);
          setMore(data.hasMore);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isLoaded, isSignedIn, user?.id, emailIdentity, page, reload]);
  const verified = user?.emailAddresses.some((email) => email.verification.status === "verified");
  return (
    <div className="min-h-screen bg-brand-bg">
      <CommerceHeader>{isSignedIn && <UserButton />}</CommerceHeader>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <h1 className="text-3xl font-medium">Mis compras</h1>
        <p>Consulta tus pedidos, sigue las entregas y solicita ayuda desde cada compra.</p>
        {!isLoaded ? (
          <p role="status">Cargando…</p>
        ) : !isSignedIn ? (
          <section className="bg-white rounded-2xl border border-line p-6 space-y-4">
            <h2 className="font-semibold">Recupera tus compras con tu correo</h2>
            <p>
              Usa el mismo correo que escribiste al pagar. Verificaremos tu acceso antes de mostrar
              pedidos. No necesitas una cuenta para comprar; este acceso es opcional para consultar
              tus compras después.
            </p>
            <SignInButton
              mode="modal"
              forceRedirectUrl="/mis-compras"
              signUpForceRedirectUrl="/mis-compras"
            >
              <Button type="button">Entrar / recuperar mis compras</Button>
            </SignInButton>
          </section>
        ) : (
          <>
            <p className="text-sm">
              Mostramos únicamente pedidos asociados a tus correos verificados.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProfile(!profile)}
              aria-expanded={profile}
              aria-controls="purchase-access-settings"
            >
              {profile ? "Cerrar ajustes de acceso" : "Verificar o agregar el correo de mi compra"}
            </Button>
            {profile && (
              <div id="purchase-access-settings" className="overflow-x-auto">
                <UserProfile routing="hash" />
              </div>
            )}
            {!verified && (
              <p role="alert">
                Verifica tu correo en los ajustes de acceso para recuperar tus compras.
              </p>
            )}
            {error && (
              <div role="alert">
                <p>{error}</p>
                <Button
                  type="button"
                  variant="outline"

                  onClick={() => setReload((value) => value + 1)}
                >
                  Volver a intentar
                </Button>
              </div>
            )}
            {loading ? (
              <p role="status">Buscando tus compras…</p>
            ) : (
              !error && (
                <>
                  {!purchases.length && (
                    <section className="bg-white border border-line rounded-2xl p-6">
                      <h2 className="font-semibold">
                        Todavía no encontramos compras con este correo
                      </h2>
                      <p>
                        Si pagaste con otro correo, agrégalo y verifícalo en los ajustes de acceso.
                        También puedes volver al enlace privado de tu recibo.
                      </p>
                    </section>
                  )}
                  {purchases.map((purchase) => (
                    <article
                      key={purchase.id}
                      className="bg-white border border-line rounded-2xl p-5 sm:p-7 space-y-4"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <h2 className="font-semibold">
                          {purchase.items
                            .map((item) => `${item.title} × ${item.quantity}`)
                            .join(", ")}
                        </h2>
                        <span className="border-l-2 border-accent-700 pl-3 text-sm font-medium text-accent-700">
                          {statuses[purchase.status] ?? purchase.status}
                        </span>
                      </div>
                      <p>
                        {purchase.sellerName} ·{" "}
                        {new Date(purchase.createdAt).toLocaleDateString("es-MX")}
                      </p>
                      <p>
                        {purchase.orderNumber} ·{" "}
                        {new Intl.NumberFormat("es-MX", {
                          style: "currency",
                          currency: purchase.currency,
                        }).format(purchase.amount)}
                      </p>
                      <Link className={buttonStyles()} href={`/order/${purchase.id}`}>
                        Seguir mi pedido / pedir ayuda
                      </Link>
                    </article>
                  ))}
                  <div className="flex gap-4">
                    {page > 0 && (
                      <Button
                        type="button"
                        variant="outline"

                        onClick={() => setPage((value) => value - 1)}
                      >
                        Anterior
                      </Button>
                    )}
                    {more && (
                      <Button
                        type="button"
                        variant="outline"

                        onClick={() => setPage((value) => value + 1)}
                      >
                        Más compras
                      </Button>
                    )}
                  </div>
                </>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
