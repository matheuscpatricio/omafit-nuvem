import { describe, expect, it } from "vitest";
import {
	isStorefrontSdkWhitelisted,
	resolveStorefrontSdkEnabled,
} from "./storefront-sdk-mode.js";

describe("resolveStorefrontSdkEnabled", () => {
	it("enables SDK for any theme with a name (ex.: Morelia)", () => {
		expect(resolveStorefrontSdkEnabled("morelia", "6994912", "6994912")).toBe(true);
		expect(resolveStorefrontSdkEnabled("Morelia", "123", "")).toBe(true);
	});

	it("enables SDK for Patagonia without whitelist", () => {
		expect(resolveStorefrontSdkEnabled("Patagonia", "123", "")).toBe(true);
	});

	it("enables SDK for whitelisted stores when theme is omitted", () => {
		expect(resolveStorefrontSdkEnabled("", "6994912", "6994912,888")).toBe(true);
	});

	it("disables SDK when theme is omitted and store is not whitelisted", () => {
		expect(resolveStorefrontSdkEnabled("", "123", "6994912")).toBe(false);
	});
});

describe("isStorefrontSdkWhitelisted", () => {
	it("matches store ids from comma-separated env list", () => {
		expect(isStorefrontSdkWhitelisted("6994912", " 6994912 , 42 ")).toBe(true);
		expect(isStorefrontSdkWhitelisted("1", "6994912")).toBe(false);
	});
});
