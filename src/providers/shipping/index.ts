import { ShippingProvider } from "./types";
import { DHLShippingProvider } from "./DHLProvider";
import { FedExShippingProvider } from "./FedExProvider";
import { UberDeliveryProvider } from "./UberProvider";
import { MockShippingProvider } from "./MockProvider";
import { ShippingProviderType, ShippingRate } from "@/domain/types";

/**
 * Shipping provider registry.
 *
 * MOCK is deliberately NOT registered here. Registering it by default would mean
 * a misconfigured production environment silently issues fake labels; it is
 * only available through `registerMock()`, which the app calls exclusively in
 * test and development.
 */
export class ShippingRegistry {
  private static providers: Map<ShippingProviderType, ShippingProvider> = new Map<
    ShippingProviderType,
    ShippingProvider
  >([
    ["DHL", new DHLShippingProvider()],
    ["FEDEX", new FedExShippingProvider()],
    ["UBER", new UberDeliveryProvider()],
  ]);

  /** Opt-in registration, used by tests and local development. */
  static registerMock(): void {
    ShippingRegistry.providers.set("MOCK", new MockShippingProvider());
  }

  /** Removes MOCK again, e.g. at the end of a test suite. */
  static unregisterMock(): void {
    ShippingRegistry.providers.delete("MOCK");
  }

  /** Every registered provider type. */
  static registered(): ShippingProviderType[] {
    return Array.from(ShippingRegistry.providers.keys());
  }

  static getProvider(type: ShippingProviderType): ShippingProvider {
    const p = ShippingRegistry.providers.get(type);
    if (!p) {
      throw new Error(`Shipping provider ${type} is not registered.`);
    }
    return p;
  }

  static isRegistered(type: ShippingProviderType): boolean {
    return ShippingRegistry.providers.has(type);
  }

  static async getAllRates(
    origin: { postalCode: string; country: string },
    destination: { postalCode: string; country: string }
  ): Promise<ShippingRate[]> {
    const allRates: ShippingRate[] = [];
    for (const provider of ShippingRegistry.providers.values()) {
      try {
        const rates = await provider.getRates({ origin, destination });
        allRates.push(...rates);
      } catch (e) {
        console.warn(`Error getting rates from ${provider.name}:`, e);
      }
    }
    return allRates;
  }

  /**
   * Honest integration state, derived from configuration only.
   *
   * A provider is reported as CONFIGURED when its environment variables are
   * present â€” never as CONNECTED, because nothing has called the carrier. The
   * audit flagged documentation claiming carriers were "connected" on the
   * strength of environment variables alone.
   */
  static getIntegrationStatus(): Record<string, string> {
    const describe = (type: ShippingProviderType): string => {
      const provider = ShippingRegistry.providers.get(type);
      if (!provider) return "NOT_REGISTERED";
      if (!provider.isConfigured()) return "NOT_CONFIGURED";
      const withTestMode = provider as ShippingProvider & { isTestMode?: () => boolean };
      return typeof withTestMode.isTestMode === "function" && withTestMode.isTestMode()
        ? "TEST"
        : "CONFIGURED";
    };

    return {
      DHL: describe("DHL"),
      FEDEX: describe("FEDEX"),
      UBER: describe("UBER"),
      MOCK: describe("MOCK"),
    };
  }
}
