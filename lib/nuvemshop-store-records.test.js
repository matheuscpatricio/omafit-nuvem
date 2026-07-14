import { describe, expect, it } from "vitest";
import {
	buildShopRecordLoadQueries,
	normalizeLoadedShopRecord,
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
