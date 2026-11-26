export type InventoryImportRow = {
  sku: string;
  title: string;
  description: string;
  price: number;
  stock: number;
  currency: string;
  unitCost: number | null;
  condition: string;
  threshold: number;
  delivery: string;
};
export const inventoryTemplate =
  "sku,nombre,descripcion,precio,stock,moneda,costo,condicion,alerta,entrega\r\nGORRA-001,Gorra azul,Ejemplo de producto,250.00,10,MXN,120.00,new,3,meetup\r\n";
function csvRows(text: string) {
  if (new TextEncoder().encode(text).length > 1000000) throw Error("El archivo supera 1 MB");
  const separator = text.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      if (cell || closed) throw Error("Comillas inválidas en el CSV");
      quoted = true;
      continue;
    }
    if (ch === separator) {
      row.push(cell);
      cell = "";
      closed = false;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      closed = false;
      if (rows.length > 201) throw Error("Máximo 200 productos por importación");
      continue;
    }
    if (closed && ch.trim()) throw Error("Contenido después de cerrar comillas");
    if (!closed) cell += ch;
  }
  if (quoted) throw Error("Faltan cerrar comillas en el CSV");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}
export function parseInventoryImport(input: string) {
  const rows = csvRows(input.replace(/^\ufeff/, ""));
  const header = rows.shift()?.map((v) => v.trim().toLowerCase());
  const columns = [
    "sku",
    "nombre",
    "descripcion",
    "precio",
    "stock",
    "moneda",
    "costo",
    "condicion",
    "alerta",
    "entrega",
  ];
  if (!header || header.join(",") !== columns.join(","))
    throw Error("Usa las columnas de la plantilla, en el mismo orden");
  if (rows.length < 1 || rows.length > 200) throw Error("Incluye de 1 a 200 productos");
  const products: InventoryImportRow[] = [];
  const errors: string[] = [];
  const skus = new Set<string>();
  rows.forEach((raw, index) => {
    const v = raw.map((s) => s.trim());
    const [sku, title, description, price, stock, currency, cost, condition, threshold, delivery] =
      v;
    const integer = (s: string) => /^\d+$/.test(s);
    const decimal = (s: string) => /^\d+(?:\.\d{1,2})?$/.test(s);
    if (
      v.length !== 10 ||
      !sku ||
      sku.length > 64 ||
      skus.has(sku) ||
      !title ||
      title.length > 200 ||
      description.length > 4000 ||
      !decimal(price) ||
      Number(price) <= 0 ||
      Number(price) > 500000 ||
      !integer(stock) ||
      Number(stock) > 100000 ||
      !["MXN", "USD"].includes(currency) ||
      (cost !== "" && (!decimal(cost) || Number(cost) > 500000)) ||
      !["new", "used", "refurbished", "unspecified"].includes(condition) ||
      !integer(threshold) ||
      Number(threshold) > 100000 ||
      !["meetup", "shipping", "local_delivery"].includes(delivery) ||
      v.some((s) => s.includes("\0"))
    ) {
      errors.push(
        "Fila " +
          (index + 2) +
          ": revisa SKU único, textos, importes, existencias, condición y entrega.",
      );
      return;
    }
    skus.add(sku);
    products.push({
      sku,
      title,
      description,
      price: Number(price),
      stock: Number(stock),
      currency,
      unitCost: cost === "" ? null : Number(cost),
      condition,
      threshold: Number(threshold),
      delivery,
    });
  });
  return { products, errors };
}
