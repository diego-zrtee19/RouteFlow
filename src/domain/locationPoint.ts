export interface LocationPoint {
  lat: number;
  lng: number;
}
export function parseLocationPoint(value: string): LocationPoint | null {
  let text = value.trim();
  if (text.startsWith("http")) {
    try {
      const url = new URL(text);
      if (
        url.protocol !== "https:" ||
        !["www.google.com", "google.com", "maps.google.com"].includes(url.hostname)
      )
        return null;
      text =
        url.searchParams.get("q") ??
        url.searchParams.get("query") ??
        url.pathname
          .match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/)
          ?.slice(1)
          .join(",") ??
        "";
    } catch {
      return null;
    }
  }
  const match = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]),
    lng = Number(match[2]);
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}
export function locationNotes(notes: string, point: LocationPoint | null) {
  return point
    ? `${notes.trim()}${notes.trim() ? " · " : ""}Ubicación de referencia: https://www.google.com/maps/search/?api=1&query=${point.lat.toFixed(6)},${point.lng.toFixed(6)}`
    : notes;
}
