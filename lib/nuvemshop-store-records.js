import { getCanonicalShopKey, isNuvemshopShopKey } from "./nuvemshop-shop-keys.js";

function normalizeStoreUrl(storeUrl) {
	if (!storeUrl) return "";
	return String(storeUrl).replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function normalizeLoadedShopRecord(row, storeId = "") {
	if (!row || typeof row !== "object") return null;

	const isNuvemshopStoresRow =
		row.store_name != null &&
		row.store_id != null &&
		row.shop_domain == null &&
		row.access_token == null;

	if (isNuvemshopStoresRow) {
		const id = String(row.store_id || storeId).trim();
		const shopKey = getCanonicalShopKey(id);
		const normalizedUrl = normalizeStoreUrl(row.store_url || "");
		return {
			...row,
			store_id: id,
			shop_key: shopKey,
			shop_domain: shopKey,
			name: row.store_name || row.name || "Loja Nuvemshop",
			store_url: normalizedUrl,
			platform_store_url: normalizedUrl,
			platform: "nuvemshop",
		};
	}

	if (isNuvemshopShopKey(row.shop_domain)) {
		const id =
			String(row.user_id || row.store_id || storeId || "").trim() ||
			String(row.shop_domain || "").split("/")[1] ||
			"";
		return {
			...row,
			store_id: id,
			shop_key: row.shop_domain,
			name: row.name || row.store_name || "Loja Nuvemshop",
			store_url: normalizeStoreUrl(row.store_url || ""),
			platform: row.platform || "nuvemshop",
		};
	}

	return row;
}

export function buildShopRecordLoadQueries(storeId, storeUrl = "") {
	const shopKey = getCanonicalShopKey(storeId);
	const normalizedUrl = normalizeStoreUrl(storeUrl);
	const candidates = [
		`nuvemshop_stores?store_id=eq.${encodeURIComponent(storeId)}&select=*`,
		`shopify_shops?shop_domain=eq.${encodeURIComponent(shopKey)}&platform=eq.nuvemshop&select=*`,
		`shopify_shops?shop_domain=eq.${encodeURIComponent(shopKey)}&select=*`,
	];
	if (normalizedUrl) {
		candidates.unshift(
			`nuvemshop_stores?store_url=eq.${encodeURIComponent(normalizedUrl)}&select=*`,
		);
	}
	return candidates;
}
