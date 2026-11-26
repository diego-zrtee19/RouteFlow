import { expect, it } from "vitest";
import { inventoryTemplate, parseInventoryImport } from "@/domain/inventoryImport";

it("accepts the template and preserves private cost without activating products", () => {
  const result = parseInventoryImport("\ufeff" + inventoryTemplate);
  expect(result.errors).toEqual([]);
  expect(result.products[0]).toMatchObject({
    sku: "GORRA-001",
    unitCost: 120,
    price: 250,
    stock: 10,
  });
  expect(result.products[0]).not.toHaveProperty("is_active");
});
it("reads quoted commas, escaped quotes and multiline descriptions", () => {
  const text =
    inventoryTemplate.split("\r\n")[0] +
    '\r\nA,"Gorra, azul","Una ""edición""\nlimitada",100,2,MXN,,used,1,meetup';
  expect(parseInventoryImport(text).products[0]).toMatchObject({
    title: "Gorra, azul",
    description: 'Una "edición"\nlimitada',
    unitCost: null,
  });
});
it("accepts semicolon exports while rejecting ambiguous decimal commas", () => {
  expect(parseInventoryImport(inventoryTemplate.replaceAll(",", ";")).errors).toEqual([]);
  expect(parseInventoryImport(inventoryTemplate.replace("250.00", "250.001")).errors).toHaveLength(
    1,
  );
});
it("rejects duplicate SKU and invalid stock without hiding the error", () => {
  const [header, row] = inventoryTemplate.trim().split("\r\n");
  expect(parseInventoryImport(`${header}\n${row}\n${row}`).errors).toHaveLength(1);
  expect(parseInventoryImport(inventoryTemplate.replace(",10,MXN", ",-1,MXN")).errors).toHaveLength(
    1,
  );
});
it("rejects broken quoting, unexpected columns and excessive input", () => {
  expect(() => parseInventoryImport("sku,nombre")).toThrow();
  expect(() => parseInventoryImport(inventoryTemplate + '"unfinished')).toThrow();
  expect(() => parseInventoryImport("a".repeat(1000001))).toThrow();
  const [header, row] = inventoryTemplate.trim().split("\r\n");
  expect(() => parseInventoryImport(header + "\n" + Array(201).fill(row).join("\n"))).toThrow();
});
