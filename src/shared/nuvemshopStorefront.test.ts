import { describe, expect, it } from "vitest";
import {
	collectionHandleFromUrl,
	findVariantByRecommendedSize,
	getStorefrontCtaSlot,
	resolveWidgetBaseUrl,
} from "./nuvemshopStorefront";

describe("nuvemshopStorefront", () => {
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
});
