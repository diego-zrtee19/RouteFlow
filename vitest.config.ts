import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest configuration.
 *
 * Tests run against the pure domain layer (state machine, DTOs, tokens,
 * validation, Stripe reconciliation) with an in-memory data source, so the
 * suite needs no database, no network, and no real Stripe/carrier credentials.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});