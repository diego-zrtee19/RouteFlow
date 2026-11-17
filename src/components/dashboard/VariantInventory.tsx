"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function VariantInventory({
  variant,
  onSaved,
}: {
  variant: { id: string; label: string; stock: number };
  onSaved: (stock: number, productStock: number) => void;
}) {
  return <StockEditor key={variant.stock} item={variant} kind="variant" onSaved={onSaved} />;
}

export function StockEditor({
  item,
  kind,
  onSaved,
}: {
  item: { id: string; label: string; stock: number };
  kind: "product" | "variant";
  onSaved: (stock: number, productStock: number) => void;
}) {
  const [stock, setStock] = useState(String(item.stock));
  const [expected, setExpected] = useState(item.stock);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2 mt-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || stock === "" || Number(stock) === expected) return;
        setBusy(true);
        setMessage("");
        try {
          const response = await fetch("/api/dashboard/catalog/stock", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id, kind, stock: Number(stock), expected }),
          });
          const data = await response.json();
          if (response.status === 409 && data.conflict) {
            setExpected(data.stock);
            setMessage(
              `Las existencias cambiaron a ${data.stock}. Revisa tu ajuste antes de guardar de nuevo.`,
            );
            return;
          }
          if (!response.ok) throw Error(data.error?.message ?? "No se pudo guardar");
          setExpected(data.stock);
          onSaved(data.stock, data.productStock);
          setMessage("Inventario guardado");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="text-sm">
        {item.label} · unidades disponibles
        <input
          type="number"
          min={0}
          max={100000}
          step={1}
          value={stock}
          required
          disabled={busy}
          onChange={(event) => setStock(event.target.value)}
          className="block border rounded-lg p-2 w-28"
        />
      </label>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        isLoading={busy}
        disabled={stock === "" || Number(stock) === expected}
      >
        Guardar stock
      </Button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </form>
  );
}
