const fs = require("node:fs");
const path = require("node:path");
require("@next/env").loadEnvConfig(process.cwd(), false);
const checks = [];
function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}
const project = process.env.ROUTEFLOW_PRODUCTION_PROJECT_REF;
check(
  "Proyecto de producción identificado y separado de desarrollo",
  project &&
    project !== "xnnkcgzijlpwxnvarqng" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === `https://${project}.supabase.co`,
);
check(
  "Stripe con credenciales LIVE",
  process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_"),
);
check(
  "Firma de webhooks configurada",
  process.env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"),
);
check(
  "Clerk de producción",
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_") &&
    process.env.CLERK_SECRET_KEY?.startsWith("sk_live_"),
);
check(
  "FedEx de producción",
  process.env.FEDEX_BASE_URL === "https://apis.fedex.com" &&
    process.env.FEDEX_CLIENT_ID &&
    process.env.FEDEX_CLIENT_SECRET &&
    process.env.FEDEX_ACCOUNT_NUMBER,
);
check(
  "Correo con remitente configurado",
  process.env.RESEND_API_KEY &&
    process.env.ROUTEFLOW_EMAIL_FROM &&
    process.env.ROUTEFLOW_EMAIL_DELIVERY === "enabled",
);
check(
  "URL pública HTTPS",
  /^https:\/\//.test(process.env.NEXT_PUBLIC_APP_URL || "") &&
    !/localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_APP_URL),
);
check("Secreto del proceso automático", process.env.CRON_SECRET?.length >= 32);
const report = {
  checkedAt: new Date().toISOString(),
  ready: checks.every((c) => c.ok),
  checks,
};
fs.mkdirSync(".routeflow-data", { recursive: true });
fs.writeFileSync(
  path.join(".routeflow-data", "production-preflight.json"),
  JSON.stringify(report, null, 2),
);
for (const c of checks) console.log(`${c.ok ? "OK" : "PENDIENTE"}: ${c.name}`);
console.log(
  report.ready
    ? "Configuración básica lista; todavía requiere pruebas de integraciones, respaldo y restauración."
    : "Producción bloqueada por configuración pendiente. No se modificó ningún servicio.",
);
process.exitCode = report.ready ? 0 : 2;
