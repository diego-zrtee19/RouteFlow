"use client";
import Image from "next/image";
import { useState } from "react";
export function ProductGallery({
  images,
  title,
  spacious = false,
}: {
  images: string[];
  title: string;
  spacious?: boolean;
}) {
  const photos = images.filter((url) => url.startsWith("https://")).slice(0, 10);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const current = photos[index] ?? photos[0];
  return (
    <div className="space-y-2">
      {current && !failed[current] ? (
        <Image
          unoptimized
          src={current}
          alt={`${title} · foto ${index + 1}`}
          width={800}
          height={800}
          onError={() => setFailed((previous) => ({ ...previous, [current]: true }))}
          className={
            spacious
              ? "w-full aspect-square max-h-[560px] object-contain bg-white"
              : "rounded-lg w-full h-48 object-contain bg-slate-50"
          }
        />
      ) : (
        <div
          className={`${spacious ? "aspect-square" : "h-48"} rounded-lg flex items-center justify-center bg-slate-100 text-slate-600 text-sm`}
        >
          {current ? "No se pudo cargar esta foto" : "Producto sin foto publicada"}
        </div>
      )}
      {photos.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label={`Fotos de ${title}`}>
          {photos.map((url, i) => (
            <button
              type="button"
              key={`${url}-${i}`}
              aria-label={`Ver foto ${i + 1} de ${title}`}
              aria-pressed={index === i}
              onClick={() => setIndex(i)}
              className={`min-h-11 min-w-11 rounded-md border p-1 text-sm ${index === i ? "border-accent-700 ring-1 ring-accent-700" : "bg-white border-slate-200"}`}
            >
              {spacious ? (
                <Image
                  unoptimized
                  src={url}
                  alt=""
                  width={52}
                  height={52}
                  className="size-12 object-contain"
                />
              ) : (
                i + 1
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
