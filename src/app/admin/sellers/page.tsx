import { requireAdmin } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";
export default async function Sellers() {
  if (!(await requireAdmin()).ok) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("sellers")
    .select("id,store_name,store_username,kyc_status,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (
    <main className="p-5 sm:p-8 space-y-6">
      <h1 className="text-3xl font-semibold">Vendedores</h1>
      <p className="text-muted">
        Las 50 tiendas más recientes. Registro y verificación son estados distintos.
      </p>
      <div className="space-y-3">
        {data?.map((s) => (
          <article className="rounded-2xl border border-line bg-white p-5" key={s.id}>
            <h2 className="font-semibold">{s.store_name || "Tienda sin nombre"}</h2>
            <p className="text-sm text-muted">
              @{s.store_username || "Sin catálogo"} ·{" "}
              {s.kyc_status === "verified"
                ? "Verificación registrada"
                : s.kyc_status === "pending"
                  ? "Verificación pendiente"
                  : "Sin verificar"}
            </p>
          </article>
        ))}
        {!data?.length && (
          <p className="rounded-xl border p-6 bg-white">Todavía no hay vendedores registrados.</p>
        )}
      </div>
    </main>
  );
}
