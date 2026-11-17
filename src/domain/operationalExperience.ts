export function validateProductDetails(value: unknown) {
  if (!value || typeof value !== "object") throw Error("Producto inválido");
  const b = value as Record<string, unknown>;
  if (
    typeof b.title !== "string" ||
    !b.title.trim() ||
    b.title.trim().length > 200 ||
    typeof b.description !== "string" ||
    b.description.length > 4000 ||
    typeof b.price !== "number" ||
    !Number.isFinite(b.price) ||
    b.price <= 0 ||
    b.price > 500000 ||
    !Array.isArray(b.images) ||
    b.images.length > 4 ||
    !b.images.every(
      (url) => typeof url === "string" && url.length <= 2000 && /^https:\/\//.test(url),
    ) ||
    !Array.isArray(b.variants) ||
    b.variants.length > 30
  )
    throw Error("Revisa nombre, precio y hasta cuatro fotos HTTPS");
  const ids = new Set<string>();
  const labels = new Set<string>();
  const variants = b.variants.map((variant: unknown) => {
    if (!variant || typeof variant !== "object") throw Error("Variante inválida");
    const v = variant as Record<string, unknown>;
    if (
      typeof v.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(v.id) ||
      ids.has(v.id) ||
      typeof v.label !== "string" ||
      !v.label.trim() ||
      v.label.length > 100 ||
      labels.has(v.label.trim().toLowerCase()) ||
      typeof v.expectedLabel !== "string" ||
      ![v.price, v.expectedPrice].every(
        (p) => p === null || (typeof p === "number" && Number.isFinite(p) && p > 0 && p <= 500000),
      )
    )
      throw Error("Revisa tallas, colores y precios de variantes");
    ids.add(v.id);
    labels.add(v.label.trim().toLowerCase());
    return {
      id: v.id,
      label: v.label.trim(),
      price: v.price,
      expectedLabel: v.expectedLabel,
      expectedPrice: v.expectedPrice,
    };
  });
  return {
    title: b.title.trim(),
    description: b.description.trim(),
    price: b.price,
    images: b.images as string[],
    variants,
  };
}
export function logisticsGuidance(status: string) {
  if (status === "FAILED" || status === "CANCELLED")
    return "Hay una incidencia de paquetería. El vendedor debe consultar al transportista y publicar una solución; el comprador puede abrir un caso. No confirmes entrega si no recibiste el producto.";
  if (status === "DELIVERED")
    return "El transportista registra entrega. Si no recibiste el paquete, abre un caso y conserva el rastreo; este registro no confirma por ti la recepción.";
  if (status === "LABEL_CREATED")
    return "La etiqueta existe, pero aún falta el registro de recepción del paquete por el transportista. Si no puedes abrirla, consulta antes de generar otra.";
  return "Consulta el rastreo. Si la estimación venció o aparece devolución, conserva el detalle del transportista y pide ayuda desde el pedido.";
}
export function medianMinutes(pairs: { start: string; end: string | null }[]) {
  const values = pairs
    .flatMap((p) => {
      const value = (Date.parse(p.end ?? "") - Date.parse(p.start)) / 60000;
      return Number.isFinite(value) && value >= 0 ? [value] : [];
    })
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const m = Math.floor(values.length / 2);
  return Math.round((values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2) * 10) / 10;
}
