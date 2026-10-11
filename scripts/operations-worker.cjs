const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());
if (!process.env.CRON_SECRET)
  throw new Error("Configura CRON_SECRET antes de iniciar el worker");
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch("http://localhost:3000/api/internal/operations", {
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
