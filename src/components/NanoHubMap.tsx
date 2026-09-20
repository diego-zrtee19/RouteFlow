"use client";

import dynamic from "next/dynamic";

// Dynamic import para evitar problemas con SSR de Leaflet
const NanoHubMapInternal = dynamic(
  () => import("./NanoHubMapInternal").then((mod) => ({ default: mod.NanoHubMapInternal })),
  { 
    ssr: false,
    loading: () => (
      <div className="bg-zinc-100 rounded-2xl flex items-center justify-center h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 mx-auto mb-2"></div>
          <p className="text-sm text-zinc-500">Cargando mapa...</p>
        </div>
      </div>
    )
  }
);

interface NanoHubMapProps {
  selectedZone: string;
  onZoneSelect: (zone: string) => void;
  className?: string;
}

export function NanoHubMap({ selectedZone, onZoneSelect, className = "" }: NanoHubMapProps) {
  return <NanoHubMapInternal selectedZone={selectedZone} onZoneSelect={onZoneSelect} className={className} />;
}
