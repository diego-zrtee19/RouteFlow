import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { DisputeManager } from "@/components/shared/DisputeManager";
export const dynamic = "force-dynamic";
export default async function AdminDisputes() {
  const a = await requireAdmin();
  if (!a.ok) redirect("/dashboard?error=forbidden_admin");
  const { data, error } = await getSupabaseAdmin()
    .from("disputes")
    .select("id,order_id,reason,description,status")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-5">
      <h1 className="text-2xl font-bold">Resolución de disputas</h1>
      {data?.length ? (
        data.map((d) => (
          <article key={d.id} className="border rounded-sm p-4">
            <h2>
              {d.order_id} · {d.status}
            </h2>
            <p>
              {d.reason}: {d.description}
            </p>
            <DisputeManager id={d.id} audience="admin" />
          </article>
        ))
      ) : (
        <p>Sin disputas.</p>
      )}
    </main>
  );
}
