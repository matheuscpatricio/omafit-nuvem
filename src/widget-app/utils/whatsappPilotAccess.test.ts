import { describe, expect, it } from "vitest";
import {
	getWhatsappPilotStoreKeys,
	isWhatsappMarketingEnabledForShop,
	isWhatsappPilotRestrictionActive,
	normalizeWhatsappStoreKey,
} from "./whatsappPilotAccess";

describe("whatsappPilotAccess", () => {
	it("does not throw when import.meta.env is unavailable at runtime", () => {
		const env = import.meta.env;
		try {
			// Vitest may define import.meta.env; simulate production IIFE bundles.
			(import.meta as { env?: Record<string, string> }).env = undefined;
			expect(() => isWhatsappPilotRestrictionActive()).not.toThrow();
			expect(() => getWhatsappPilotStoreKeys()).not.toThrow();
			expect(() =>
				isWhatsappMarketingEnabledForShop("nuvemshop/6994912", false),
			).not.toThrow();
			expect(isWhatsappMarketingEnabledForShop("nuvemshop/6994912", false)).toBe(
				true,
			);
		} finally {
			(import.meta as { env?: Record<string, string> }).env = env;
		}
	});

	it("preserves nuvemshop store id when normalizing", () => {
		expect(normalizeWhatsappStoreKey("nuvemshop/6994912")).toBe("nuvemshop/6994912");
		expect(normalizeWhatsappStoreKey("NUVEMSHOP/6994912/extra")).toBe("nuvemshop/6994912");
		expect(normalizeWhatsappStoreKey("https://loja.myshopify.com/admin")).toBe(
			"loja.myshopify.com",
		);
	});

	it("does not allow other nuvemshop stores through the pilot allowlist", () => {
		const env = import.meta.env;
		try {
			(import.meta as { env?: Record<string, string> }).env = undefined;
			expect(isWhatsappMarketingEnabledForShop("nuvemshop/999999", false)).toBe(false);
		} finally {
			(import.meta as { env?: Record<string, string> }).env = env;
		}
	});
});
