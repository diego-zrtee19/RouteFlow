const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd(), true);
if (!process.env.CRON_SECRET) throw new Error("Configura CRON_SECRET antes de iniciar el worker");
const workerOrigin = process.env.ROUTEFLOW_OPERATIONS_ORIGIN || "http://localhost:3001";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(workerOrigin))
  throw new Error("El worker local solo acepta localhost; configura ROUTEFLOW_OPERATIONS_ORIGIN");
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch(`${workerOrigin}/api/internal/operations`, {
      signal: AbortSignal.timeout(180_000),
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const d = await r.json();
    console.log("[operations]", r.status, JSON.stringify(d));
  } catch (e) {
    console.error("[operations]", e.message);
  } finally {
    busy = false;
  }
}
tick();
setInterval(tick, 60000);
