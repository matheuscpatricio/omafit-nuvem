import { describe, expect, it } from "vitest";
import {
	buildShopRecordLoadQueries,
	expandAnalyticsDomainCandidates,
	normalizeLoadedShopRecord,
	resolveTryonStoreContext,
} from "./nuvemshop-store-records.js";

describe("normalizeLoadedShopRecord", () => {
	it("maps nuvemshop_stores rows to the legacy shop record shape", () => {
		const normalized = normalizeLoadedShopRecord(
			{
				store_id: 6994912,
				store_name: "Loja Nuvemshop",
				store_url: "arrascaneta.lojavirtualnuvem.com.br",
				plan: "ondemand",
				billing_status: "active",
			},
			"6994912",
		);

		expect(normalized?.shop_domain).toBe("nuvemshop/6994912");
		expect(normalized?.store_id).toBe("6994912");
		expect(normalized?.name).toBe("Loja Nuvemshop");
		expect(normalized?.store_url).toBe("arrascaneta.lojavirtualnuvem.com.br");
	});

	it("splits nuvemshop_stores total usage into free and extra counters", () => {
		const normalized = normalizeLoadedShopRecord(
			{
				store_id: 6994912,
				store_name: "Loja Nuvemshop",
				images_used_month: 52,
				plan: "ondemand",
			},
			"6994912",
		);

		expect(normalized?.free_images_used).toBe(50);
		expect(normalized?.images_used_month).toBe(2);
	});

	it("maps shopify_shops nuvemshop billing rows", () => {
		const normalized = normalizeLoadedShopRecord({
			shop_domain: "nuvemshop/6994912",
			user_id: "6994912",
			plan: "growth",
			billing_status: "active",
		});

		expect(normalized?.store_id).toBe("6994912");
		expect(normalized?.platform).toBe("nuvemshop");
	});
});

describe("resolveTryonStoreContext", () => {
	it("extracts store id from nuvemshop shop_domain", () => {
		expect(resolveTryonStoreContext({ shopDomain: "nuvemshop/6994912" })).toEqual({
			storeId: "6994912",
			shopDomain: "nuvemshop/6994912",
		});
	});

	it("prefers explicit store_id when present", () => {
		expect(
			resolveTryonStoreContext({ storeId: "6994912", shopDomain: "nuvemshop/6994912" }),
		).toEqual({
			storeId: "6994912",
			shopDomain: "nuvemshop/6994912",
		});
	});
});

describe("buildShopRecordLoadQueries", () => {
	it("prioritizes nuvemshop_stores lookups", () => {
		const queries = buildShopRecordLoadQueries(
			"6994912",
			"arrascaneta.lojavirtualnuvem.com.br",
		);

		expect(queries[0]).toContain("nuvemshop_stores?store_url=");
		expect(queries.some((query) => query.includes("nuvemshop_stores?store_id="))).toBe(true);
		expect(queries.some((query) => query.includes("shopify_shops?shop_domain="))).toBe(true);
	});
});

describe("expandAnalyticsDomainCandidates", () => {
	it("includes legacy nuvemshop alias for nuvemshop shop keys", () => {
		expect(
			expandAnalyticsDomainCandidates(
				["nuvemshop/6994912", "arrascaneta.lojavirtualnuvem.com.br"],
				"nuvemshop/6994912",
			),
		).toEqual(
			expect.arrayContaining([
				"nuvemshop/6994912",
				"arrascaneta.lojavirtualnuvem.com.br",
				"nuvemshop",
			]),
		);
	});
});
