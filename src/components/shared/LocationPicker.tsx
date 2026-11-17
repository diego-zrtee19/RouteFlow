"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { parseLocationPoint, type LocationPoint } from "@/domain/locationPoint";
interface MapLike {
  addListener: (
    name: string,
    fn: (event: { latLng?: { lat: () => number; lng: () => number } | null }) => void,
  ) => { remove: () => void };
  panTo: (point: LocationPoint) => void;
}
interface SDK {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapLike;
  marker: {
    AdvancedMarkerElement: new (options: Record<string, unknown>) => {
      position: LocationPoint;
      map: MapLike | null;
    };
  };
  Geocoder: new () => {
    geocode: (request: { location: LocationPoint }) => Promise<{
      results: {
        formatted_address: string;
        address_components: { long_name: string; short_name: string; types: string[] }[];
      }[];
    }>;
  };
}
let loader: Promise<SDK> | null = null;
function loadGoogle(key: string) {
  if (!loader)
    loader = new Promise<SDK>((resolve, reject) => {
      const get = () => (window as unknown as { google?: { maps: SDK } }).google?.maps;
      if (get()) {
        resolve(get()!);
        return;
      }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=marker&v=weekly&language=es&region=MX`;
      script.async = true;
      script.onload = () => (get() ? resolve(get()!) : reject(Error("No se pudo abrir el mapa")));
      script.onerror = () => {
        loader = null;
        reject(Error("No se pudo conectar con el mapa. Usa el enlace de Google Maps."));
      };
      document.head.append(script);
    });
  return loader;
}
export function LocationPicker({
  onPoint,
  onAddress,
  disabled = false,
}: {
  onPoint: (point: LocationPoint | null) => void;
  onAddress?: (address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }) => void;
  disabled?: boolean;
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<LocationPoint | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const element = useRef<HTMLDivElement>(null);
  const pointCallback = useRef(onPoint);
  pointCallback.current = onPoint;
  const addressCallback = useRef(onAddress);
  addressCallback.current = onAddress;
  useEffect(() => {
    if (!open || !key || !element.current) return;
    let stopped = false;
    let sequence = 0;
    let listener: { remove: () => void } | undefined;
    let marker: { position: LocationPoint; map: MapLike | null } | undefined;
    setStatus("Abriendo mapa…");
    loadGoogle(key)
      .then((sdk) => {
        if (stopped || !element.current) return;
        const map = new sdk.Map(element.current, {
          center: { lat: 20.59, lng: -103.44 },
          zoom: 13,
          mapId: "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
        });
        const geocoder = new sdk.Geocoder();
        setStatus("Toca el punto exacto de entrega en el mapa.");
        listener = map.addListener("click", async (event) => {
          if (!event.latLng) return;
          const selected = { lat: event.latLng.lat(), lng: event.latLng.lng() };
          if (marker) marker.position = selected;
          else
            marker = new sdk.marker.AdvancedMarkerElement({
              map,
              position: selected,
              title: "Punto de entrega",
            });
          setPoint(selected);
          pointCallback.current(selected);
          const ticket = ++sequence;
          setStatus("Buscando dirección de referencia…");
          try {
            const result = await geocoder.geocode({ location: selected });
            if (stopped || ticket !== sequence) return;
            const r = result.results[0];
            if (r) {
              const part = (type: string, short = false) => {
                const c = r.address_components.find((c) => c.types.includes(type));
                return (short ? c?.short_name : c?.long_name) ?? "";
              };
              addressCallback.current?.({
                street: [part("route"), part("street_number")].filter(Boolean).join(" "),
                city: part("locality") || part("administrative_area_level_2"),
                state: part("administrative_area_level_1", true).replace(/\./g, "").toUpperCase(),
                postalCode: part("postal_code"),
                country: part("country", true),
              });
              setStatus("Punto elegido. Revisa calle, número y código postal antes de continuar.");
            } else setStatus("Punto elegido. Completa la dirección manualmente.");
          } catch {
            if (!stopped && ticket === sequence)
              setStatus("Punto elegido. No pudimos obtener la dirección; complétala manualmente.");
          }
        });
      })
      .catch((e) => {
        if (!stopped) {
          setError(e.message);
          setStatus("");
        }
      });
    return () => {
      stopped = true;
      sequence++;
      listener?.remove();
      if (marker) marker.map = null;
    };
  }, [open, key]);
  return (
    <section className="rounded-lg border border-accent-100 bg-accent-50/40 p-4 space-y-3">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-accent-600 shadow-none">
          <MapPin className="size-5" />
        </span>
        <div>
          <h3 className="font-semibold text-slate-900">Marca dónde recibirás tu compra</h3>
          <p className="text-sm text-slate-600 mt-1">
            Añade un punto de referencia. La dirección completa sigue siendo necesaria para el
            envío.
          </p>
        </div>
      </div>
      {key && (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
        >
          <MapPin className="size-4" />
          {open ? "Cerrar mapa" : "Elegir punto en Google Maps"}
        </Button>
      )}
      {open && key && (
        <div
          ref={element}
          aria-label="Google Maps: selecciona el punto de entrega"
          className="h-72 rounded-lg border bg-slate-100"
        />
      )}
      <a
        href="https://www.google.com/maps"
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent-700"
      >
        Abrir Google Maps <ExternalLink className="size-4" />
      </a>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
          Enlace completo de Google Maps o coordenadas
          <input
            disabled={disabled}
            className="mt-2 block w-full rounded-lg border border-slate-200 bg-white p-3 text-sm"
            placeholder="20.589000, -103.440000"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || !input.trim()}
          onClick={() => {
            const p = parseLocationPoint(input);
            if (!p) {
              setError(
                "Usa coordenadas o un enlace completo con el punto. Los enlaces cortos no incluyen las coordenadas.",
              );
              return;
            }
            setError("");
            setPoint(p);
            onPoint(p);
            setStatus("Referencia guardada. Revisa tu dirección para el envío.");
          }}
        >
          Usar punto
        </Button>
      </div>
      {point && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm">
          <a
            className="font-semibold text-accent-700 underline"
            target="_blank"
            rel="noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`}
          >
            Ver punto seleccionado
          </a>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setPoint(null);
              onPoint(null);
              setStatus("");
            }}
          >
            Quitar ubicación
          </Button>
        </div>
      )}
      {status && (
        <p role="status" className="text-sm text-slate-600">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
