import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { normaliseStock, DEFAULT_STOCK } from "@/repositories/catalogRepository";

/**
 * V1 RETIREMENT — STRUCTURAL GUARD
 *
 * `dataStore.ts` and `storePersistence.ts` were removed once checkout, webhooks,
 * APIs and the dashboard all read and wrote Supabase. Nothing imports them
 * today, but a future contributor could reintroduce a dependency on them in a
 * single line, which would silently restore two defects:
 *
 *   1. Purchases would live in process memory again and die on a cold start.
 *   2. A client component importing the store would put buyer PII back into the
 *      browser bundle — the exact finding the audit started from.
 *
 * This test reads the source tree rather than trusting discipline, so the
 * regression fails the build instead of the next audit.
 */

const SRC = join(process.cwd(), "src");

/** Every .ts/.tsx file under `src`, skipping nothing. */
function sourceFiles(dir = SRC): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe("the V1 in-memory store stays removed", () => {
  it("the files themselves no longer exist", () => {
    for (const file of ["services/dataStore.ts", "services/storePersistence.ts"]) {
      expect(() => statSync(join(SRC, file))).toThrow();
    }
  });

  it("no source file imports the store or its persistence layer", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const contents = readFileSync(file, "utf8");
      // Import statements only. Comments are allowed to mention the old store:
      // several files document WHY it was removed.
      const importLines = contents
        .split("\n")
        .filter((line) => /^\s*import\s/.test(line))
        .join("\n");

      if (/services\/(dataStore|storePersistence)/.test(importLines)) {
        offenders.push(file.replace(SRC, "src"));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("no client component reaches a data layer directly", () => {
    // A "use client" file that imports a repository or supabaseAdmin would pull
    // the service-role client into the browser bundle.
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const contents = readFileSync(file, "utf8");
      if (!/^\s*["']use client["']/m.test(contents)) continue;

      const importLines = contents
        .split("\n")
        .filter((line) => /^\s*import\s/.test(line))
        .join("\n");

      if (
        /@\/repositories\//.test(importLines) ||
        /@\/lib\/supabase(Admin|Env)?/.test(importLines) ||
        /@\/services\/(dataStore|storePersistence|checkoutService)/.test(importLines)
      ) {
        offenders.push(file.replace(SRC, "src"));
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * STOCK IS NOT THE OFF-BY-ONE I THOUGHT
 *
 * Schema V3 shipped `stock INTEGER NOT NULL DEFAULT 0` while
 * `createOrderFromPurchaseLink` refuses a product at zero. Any product inserted
 * without an explicit stock was therefore permanently unsellable: the storefront
 * advertised it while checkout answered "product_out_of_stock", and nothing in
 * the UI explained why.
 *
 * The fix has to make the DEFAULT buyable, not merely validate the input.
 */
describe("a product created without a stock level is still buyable", () => {
  it("defaults to a positive, purchasable level", () => {
    expect(DEFAULT_STOCK).toBeGreaterThan(0);
  });

  const notBuyable: Array<[string, unknown]> = [
    ["undefined", undefined],
    ["null", null],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["an empty string", ""],
    ["non-numeric text", "many"],
    ["a negative number", -5],
  ];

  for (const [name, value] of notBuyable) {
    it(`falls back to the default for ${name}`, () => {
      expect(normaliseStock(value)).toBe(DEFAULT_STOCK);
    });
  }

  it("honours a deliberate zero as 'sold out' rather than resurrecting it", () => {
    // 0 is the seller saying "no". Clamping it up to the default would sell
    // inventory they meant to withhold.
    expect(normaliseStock(0)).toBe(0);
  });

  it("truncates a fractional stock without rounding it up into existence", () => {
    // 0.9 units is not a unit; rounding would invent inventory.
    expect(normaliseStock(0.9)).toBe(0);
    expect(normaliseStock(2.9)).toBe(2);
  });

  it("preserves an explicit positive level", () => {
    expect(normaliseStock(25)).toBe(25);
    expect(normaliseStock("42")).toBe(42);
  });

  it("matches the database default so the two layers cannot disagree", () => {
    const schema = readFileSync(
      join(process.cwd(), "supabase_schema_v4_stock.sql"),
      "utf8"
    );
    // The migration sets the column default to the same number the application
    // uses. If one drifts, a product created directly in the DB and one created
    // through the API would behave differently.
    expect(schema).toContain(`SET DEFAULT ${DEFAULT_STOCK}`);
  });
});

/**
 * C1 — `sellers` MUST NOT be publicly readable.
 *
 * Schema V3 shipped `CREATE POLICY "public read sellers" ... USING (true)`, which
 * granted the public anon key SELECT on the entire row, including
 * contact_email, contact_phone, ship_from_address and kyc_document_url. The
 * DTOs in `domain/dto.ts` omitted those fields, but a caller does not have to
 * go through the DTOs.
 *
 * This asserts on the shipped schema files rather than the live database
 * because CI has no database credentials. The live check is the anon probe in
 * `scripts/verify-flow-live.ts`.
 */
describe("seller PII is not exposed to the public anon key", () => {
  const readSchema = (name: string) => readFileSync(join(process.cwd(), name), "utf8");

  it("schema V3 grants no public SELECT on sellers", () => {
    const schema = readSchema("supabase_schema_v3.sql");
    expect(schema).not.toMatch(
      /CREATE\s+POLICY[^;]*ON\s+sellers[^;]*FOR\s+SELECT/i
    );
  });

  it("the V5 migration revokes it for databases already provisioned", () => {
    const migration = readSchema("supabase_schema_v5_sellers_pii.sql");
    expect(migration).toMatch(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+"public read sellers"\s+ON\s+sellers/i
    );
  });

  it("keeps RLS enabled on sellers", () => {
    expect(readSchema("supabase_schema_v3.sql")).toMatch(
      /ALTER\s+TABLE\s+sellers\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i
    );
  });

  it("still denies the order and payment tables publicly", () => {
    // The fix for `sellers` must not have relaxed anything else.
    const schema = readSchema("supabase_schema_v3.sql");
    for (const table of ["orders", "order_items", "payments", "disputes"]) {
      expect(schema).toMatch(new RegExp(`"deny anon ${table}"`, "i"));
    }
  });

  it("no code imports the browser anon client", () => {
    // Nothing may start reading `sellers` (or any table) straight from the
    // browser with the public key, which would bypass the API and its DTOs.
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const contents = readFileSync(file, "utf8");
      if (/import[^;]*from\s*["']@\/lib\/supabaseClient["']/.test(contents)) {
        offenders.push(file.replace(SRC, "src"));
      }
    }

    expect(offenders).toEqual([]);
  });
});

