"use client";
import { useEffect, useState } from "react";
import { Button, buttonStyles } from "@/components/ui/Button";
export function SharePurchaseLink({
  publicId,
  title = "Mi producto",
  showCopy = false,
}: {
  publicId: string;
  title?: string;
  showCopy?: boolean;
}) {
  const [origin, setOrigin] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/p/${encodeURIComponent(publicId)}`;
  const text = `${title}: consulta el producto, paga y sigue tu pedido en RouteFlow. ${url}`;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        {showCopy ? (
          <Button
            type="button"
            variant="secondary"
            disabled={!origin}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setMessage("Mensaje con enlace copiado. Pégalo en Instagram o WhatsApp.");
              } catch {
                setMessage("Selecciona el mensaje de abajo para copiarlo.");
              }
            }}
          >
            Copiar mensaje
          </Button>
        ) : (
          <button
            type="button"
            disabled={!origin}
            className={buttonStyles()}
            onClick={async () => {
              try {
                if (navigator.share) await navigator.share({ title, text, url });
                else {
                  await navigator.clipboard.writeText(url);
                  setMessage("Enlace copiado");
                }
              } catch (e) {
                if (!(e instanceof DOMException && e.name === "AbortError"))
                  setMessage("No se pudo compartir. Copia el enlace manualmente.");
              }
            }}
          >
            Compartir enlace
          </button>
        )}
        {origin && (
          <a
            className={buttonStyles({ variant: "ghost" })}
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noreferrer"
          >
            Enviar por WhatsApp
          </a>
        )}
      </div>
      {showCopy && origin && (
        <details>
          <summary className="cursor-pointer py-2 text-accent-700">
            Ver mensaje para Instagram o WhatsApp
          </summary>
          <p className="mt-1 select-all break-words rounded-lg border bg-white p-3">{text}</p>
        </details>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
