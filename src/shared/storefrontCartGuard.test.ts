import { afterEach, describe, expect, it, vi } from "vitest";
import { claimStorefrontCartAdd } from "./storefrontCartGuard";

describe("claimStorefrontCartAdd", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function useWindow() {
		const fake = {} as Window & { __omafitCartClaims?: Record<string, number> };
		vi.stubGlobal("window", fake);
		return fake;
	}

	it("allows one claim per request id and rejects the duplicate", () => {
		useWindow();
		expect(claimStorefrontCartAdd("cart_1", 1_000)).toBe(true);
		expect(claimStorefrontCartAdd("cart_1", 1_100)).toBe(false);
		expect(claimStorefrontCartAdd("cart_2", 1_100)).toBe(true);
	});

	it("releases a claim after the dedupe window", () => {
		useWindow();
		expect(claimStorefrontCartAdd("cart_1", 1_000)).toBe(true);
		expect(claimStorefrontCartAdd("cart_1", 12_000)).toBe(true);
	});
});
