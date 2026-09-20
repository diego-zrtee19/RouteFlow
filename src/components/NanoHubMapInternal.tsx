"use client";

import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";

// Import CSS dinámicamente solo en el cliente
if (typeof window !== "undefined") {
  import("leaflet/dist/leaflet.css");
}

// Icono personalizado para los Nano-Hubs con estética premium
const nanoHubIcon = L.divIcon({
  className: "custom-nano-hub-icon",
  html: `
    <div style="
      background: #18181b;
      border: 2px solid #27272a;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.2s ease;
    ">
      <span style="font-size: 16px;">🏪</span>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
});

// Icono seleccionado
const selectedNanoHubIcon = L.divIcon({
  className: "custom-nano-hub-icon-selected",
  html: `
    <div style="
      background: #059669;
      border: 3px solid #ffffff;
      border-radius: 50%;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 20px rgba(5, 150, 105, 0.4);
      animation: pulse 2s infinite;
    ">
      <span style="font-size: 18px;">🏪</span>
    </div>
    <style>
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }
    </style>
  `,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  popupAnchor: [0, -22],
});

interface NanoHub {
  id: string;
  name: string;
  address: string;
  zone: string;
  coordinates: [number, number]; // [lat, lng]
}

// Puntos Route de ejemplo en Zapopan/Guadalajara
const ZAPOPAN_PUNTOS_ROUTE: NanoHub[] = [
  {
    id: "hub-1",
    name: "Tienda Aliada Zapopan Centro",
    address: "Av. Principal 123, Zapopan Centro",
    zone: "Zapopan Centro",
    coordinates: [20.7116, -103.4155],
  },
  {
    id: "hub-2",
    name: "Mini Andador Providencia",
    address: "Calle Andador 45, Providencia",
    zone: "Providencia",
    coordinates: [20.6855, -103.3922],
  },
  {
    id: "hub-3",
    name: "OXXO Plaza del Sol",
    address: "Plaza del Sol, Zapopan",
    zone: "Plaza del Sol",
    coordinates: [20.6504, -103.4086],
  },
  {
    id: "hub-4",
    name: "Tienda Aliada Chapalita",
    address: "Av. Chapalita 78, Guadalajara",
    zone: "Chapalita",
    coordinates: [20.6344, -103.4252],
  },
  {
    id: "hub-5",
    name: "7-Eleken Tlaquepaque",
    address: "Av. Tlaquepaque 234, Tlaquepaque",
    zone: "Tlaquepaque",
    coordinates: [20.6392, -103.3134],
  },
];

interface NanoHubMapInternalProps {
  selectedZone: string;
  onZoneSelect: (zone: string) => void;
  className?: string;
}

function MapClickHandler({ onZoneSelect }: { onZoneSelect: (zone: string) => void }) {
  useMapEvents({
    click(e) {
      // Encontrar el Nano-Hub más cercano al clic
      const clickedLat = e.latlng.lat;
      const clickedLng = e.latlng.lng;
      
      let closestHub: NanoHub | null = null;
      let minDistance = Infinity;
      
      ZAPOPAN_PUNTOS_ROUTE.forEach(hub => {
        const distance = Math.sqrt(
          Math.pow(hub.coordinates[0] - clickedLat, 2) + 
          Math.pow(hub.coordinates[1] - clickedLng, 2)
        );
        if (distance < minDistance && distance < 0.02) { // ~2km radio
          minDistance = distance;
          closestHub = hub;
        }
      });
      
      if (closestHub) {
        onZoneSelect(closestHub.zone);
      }
    },
  });
  return null;
}

export function NanoHubMapInternal({ selectedZone, onZoneSelect, className = "" }: NanoHubMapInternalProps) {
  return (
    <div className={`rounded-2xl overflow-hidden border border-zinc-200 ${className}`}>
      <MapContainer
        center={[20.6744, -103.386]} // Centro de Guadalajara/Zapopan
        zoom={12}
        style={{ height: "400px", width: "100%" }}
        className="bg-zinc-50"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onZoneSelect={onZoneSelect} />
        
        {ZAPOPAN_PUNTOS_ROUTE.map((hub) => (
          <Marker
            key={hub.id}
            position={hub.coordinates}
            icon={selectedZone === hub.zone ? selectedNanoHubIcon : nanoHubIcon}
          >
            <Popup
              className="custom-popup"
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
              }}
            >
              <div className="p-2">
                <h3 className="font-bold text-zinc-900 text-sm mb-1">{hub.name}</h3>
                <p className="text-xs text-zinc-600 mb-2">{hub.address}</p>
                <button
                  onClick={() => onZoneSelect(hub.zone)}
                  className="w-full py-1.5 px-3 bg-zinc-900 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  Seleccionar {hub.zone}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
