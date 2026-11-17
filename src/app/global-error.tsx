"use client";
import Link from "next/link";

/** No providers or external styles: this also renders if the root layout fails. */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          background: "var(--color-canvas)",
          color: "var(--color-accent-700)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main role="alert" style={{ maxWidth: 560, margin: "12vh auto", padding: 24 }}>
          <p>RouteFlow</p>
          <h1>No pudimos abrir la aplicación</h1>
          <p>Vuelve a intentar. Si acabas de pagar, revisa tu pedido antes de repetir el pago.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: "12px 20px",
              background: "var(--color-accent-700)",
              color: "white",
              border: 0,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Volver a intentar
          </button>
          <p>
            <Link href="/mis-compras" style={{ color: "var(--color-accent-700)" }}>
              Consultar mis compras
            </Link>
          </p>
          <p>
            <Link href="/" style={{ color: "var(--color-accent-700)" }}>
              Volver al inicio
            </Link>
          </p>
        </main>
      </body>
    </html>
  );
}
