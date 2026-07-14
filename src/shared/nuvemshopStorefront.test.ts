import { describe, expect, it, vi, afterEach } from "vitest";
import {
	buildStorefrontConfigEndpoint,
	collectionHandleFromUrl,
	findVariantByRecommendedSize,
	getStorefrontCtaSlot,
	loadStorefrontBootstrap,
	resolveWidgetBaseUrl,
	shouldHideForProduct,
} from "./nuvemshopStorefront";

describe("nuvemshopStorefront", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("extracts collection handle from storefront URL", () => {
		expect(
			collectionHandleFromUrl("https://loja.com/collections/tenis-classico/products/tenis"),
		).toBe("tenis-classico");
		expect(collectionHandleFromUrl("https://loja.com/produtos/tenis")).toBe("");
	});

	it("routes footwear products to widget-footwear.html", () => {
		const url = resolveWidgetBaseUrl(
			"https://app.example.com/widget.html",
			"tenis-classico",
			"tenis-classico",
			["tenis-classico"],
		);
		expect(new URL(url).pathname).toBe("/widget-footwear.html");
	});

	it("maps embed position to NubeSDK slot", () => {
		expect(getStorefrontCtaSlot({ embed_position: "above_buy_buttons" } as never)).toBe(
			"before_product_detail_add_to_cart",
		);
		expect(getStorefrontCtaSlot({} as never)).toBe("after_product_detail_add_to_cart");
	});

	it("hides widget only when disabled or excluded", () => {
		expect(shouldHideForProduct(null, { widget_enabled: true } as never)).toBe(false);
		expect(shouldHideForProduct({ categories: ["1"] } as never, {
			widget_enabled: true,
			excluded_collections: ["1"],
		} as never)).toBe(true);
	});

	it("finds variant by recommended size", () => {
		const variant = findVariantByRecommendedSize(
			{
				id: 1,
				variants: [
					{ id: 10, variant_values: "P" },
					{ id: 11, variant_values: "M" },
				],
			} as never,
			"M",
		);
		expect(variant?.id).toBe(11);
	});

	it("includes theme in storefront config endpoint when provided", () => {
		const endpoint = buildStorefrontConfigEndpoint(123, "loja.nuvemshop.com.br", "Morelia");
		expect(endpoint).toContain("store_id=123");
		expect(endpoint).toContain("theme=Morelia");
	});

	it("maps storefront_sdk_enabled from widget-config response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					config: { widget_enabled: true, excluded_collections: [] },
					widgetUrl: "/widget.html",
					storefront_sdk_enabled: false,
				}),
			}),
		);

		const bootstrap = await loadStorefrontBootstrap(6994912, "loja.nuvemshop.com.br");
		expect(bootstrap.ready).toBe(true);
		expect(bootstrap.storefront_sdk_enabled).toBe(false);
	});

	it("defaults storefront_sdk_enabled to false when missing", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					config: { widget_enabled: true, excluded_collections: [] },
					widgetUrl: "/widget.html",
				}),
			}),
		);

		const bootstrap = await loadStorefrontBootstrap(123, "loja.nuvemshop.com.br");
		expect(bootstrap.storefront_sdk_enabled).toBe(false);
	});
});
