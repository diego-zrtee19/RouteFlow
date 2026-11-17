"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { ImagePlus, UploadCloud, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
export function PhotoUpload({
  value,
  onUploaded,
  onBusyChange,
  disabled = false,
  label = "Foto del producto",
}: {
  value?: string;
  onUploaded: (url: string) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const [broken, setBroken] = useState(false);
  async function upload(file?: File) {
    if (!file || busy || disabled) return;
    setError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size <= 0 ||
      file.size > 3 * 1024 * 1024
    ) {
      setError("Elige una foto JPG, PNG o WebP de hasta 3 MB.");
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const r = await fetch("/api/dashboard/images", { method: "POST", body });
      const data = await r.json();
      if (!r.ok || typeof data.url !== "string")
        throw Error(data.error?.message || "No se pudo subir la foto. Intenta de nuevo.");
      onUploaded(data.url);
      setBroken(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <section aria-label={label} className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
        <span className="text-xs text-slate-500">Hasta 3 MB</span>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !busy) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files[0]);
        }}
        className={`relative rounded-lg border-2 border-dashed p-5 transition-colors ${drag ? "border-accent-500 bg-accent-50" : "border-slate-200 bg-slate-50/70"}`}
      >
        {value && !broken ? (
          <div className="flex flex-wrap items-center gap-5">
            <Image
              unoptimized
              src={value}
              width={112}
              height={112}
              alt="Vista previa de la foto"
              onError={() => setBroken(true)}
              className="size-28 rounded-lg object-cover border bg-white"
            />
            <div className="flex-1 min-w-40">
              <p className="font-semibold text-slate-800">Tu foto está lista</p>
              <p className="mt-1 text-sm text-slate-500">Se mostrará a tus compradores.</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled || busy}
                  onClick={() => input.current?.click()}
                >
                  <ImagePlus className="size-4" />
                  Cambiar foto
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Quitar foto"
                  disabled={disabled || busy}
                  onClick={() => {
                    onUploaded("");
                    setBroken(false);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-3">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-lg bg-accent-100 text-accent-700">
              {busy ? (
                <LoaderCircle className="size-6 animate-spin" />
              ) : (
                <UploadCloud className="size-6" />
              )}
            </div>
            <p className="font-semibold text-slate-800">
              {busy ? "Estamos subiendo tu foto…" : "Una buena foto hace la diferencia"}
            </p>
            <p className="mt-1 mb-4 text-sm text-slate-500">
              Arrastra tu imagen aquí o elígela de tu dispositivo.
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || busy}
              onClick={() => input.current?.click()}
            >
              <ImagePlus className="size-4" />
              Elegir foto
            </Button>
            <p className="mt-3 text-xs text-slate-500">JPG, PNG o WebP · La foto será pública</p>
          </div>
        )}
        <input
          ref={input}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp"
          aria-label={label}
          disabled={disabled || busy}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {busy && value && (
          <p role="status" className="mt-3 text-sm text-accent-700">
            Subiendo la nueva foto…
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
