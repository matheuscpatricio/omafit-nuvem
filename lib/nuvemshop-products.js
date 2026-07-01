export function toLocalizedValue(value, language = "pt") {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value !== "object") return String(value);
	return (
		value[language] ||
		value.pt ||
		value["pt-BR"] ||
		value.es ||
		value.en ||
		Object.values(value).find(Boolean) ||
		""
	);
}

export async function listStoreProducts(session, nuvemshopApi, { maxPages = 4 } = {}) {
	const storeLanguage = session?.store?.language || "pt";
	const products = [];
	const categoryCache = new Map();

	async function loadProductCategories(productId) {
		if (categoryCache.has(productId)) return categoryCache.get(productId);
		const response = await nuvemshopApi(session, `/products/${productId}/categories`, {
			method: "GET",
		});
		if (!response.ok) {
			categoryCache.set(productId, []);
			return [];
		}
		const rows = await response.json().catch(() => []);
		const collections = Array.isArray(rows)
			? rows.map((row) => ({
					id: row.id,
					handle: toLocalizedValue(row.handle, storeLanguage) || String(row.id),
					title: toLocalizedValue(row.name, storeLanguage) || String(row.id),
				}))
			: [];
		categoryCache.set(productId, collections);
		return collections;
	}

	for (let page = 1; page <= maxPages; page += 1) {
		const response = await nuvemshopApi(
			session,
			`/products?published=true&per_page=200&page=${page}`,
			{ method: "GET" },
		);
		if (!response.ok) break;
		const rows = await response.json().catch(() => []);
		if (!Array.isArray(rows) || rows.length === 0) break;

		for (const row of rows) {
			const handle = toLocalizedValue(row.handle, storeLanguage);
			const title = toLocalizedValue(row.name, storeLanguage) || handle || String(row.id);
			const collections = await loadProductCategories(row.id);
			const images = Array.isArray(row.images)
				? row.images.map((img) => img.src || img.url || "").filter(Boolean)
				: [];
			products.push({
				id: String(row.id),
				handle,
				title,
				collections,
				images,
				published: row.published !== false,
			});
		}
		if (rows.length < 200) break;
	}

	return products;
}

export async function getProductByHandle(session, nuvemshopApi, handle) {
	const storeLanguage = session?.store?.language || "pt";
	const normalized = String(handle || "").trim().toLowerCase();
	if (!normalized) return null;

	for (let page = 1; page <= 6; page += 1) {
		const response = await nuvemshopApi(
			session,
			`/products?published=true&per_page=200&page=${page}`,
			{ method: "GET" },
		);
		if (!response.ok) break;
		const rows = await response.json().catch(() => []);
		if (!Array.isArray(rows) || rows.length === 0) break;

		for (const row of rows) {
			const productHandle = toLocalizedValue(row.handle, storeLanguage).toLowerCase();
			if (productHandle !== normalized) continue;

			const catResponse = await nuvemshopApi(session, `/products/${row.id}/categories`, {
				method: "GET",
			});
			const categories = catResponse.ok ? await catResponse.json().catch(() => []) : [];
			const collection_handles = Array.isArray(categories)
				? categories
						.map((c) => toLocalizedValue(c.handle, storeLanguage))
						.filter(Boolean)
				: [];

			const variants = Array.isArray(row.variants) ? row.variants : [];
			const sizes = new Set();
			const colors = new Set();
			for (const variant of variants) {
				const values = Array.isArray(variant.values)
					? variant.values.map((v) => toLocalizedValue(v, storeLanguage))
					: [];
				for (const value of values) {
					if (!value) continue;
					if (/^\d+$/.test(value) || /^[a-z]{1,3}$/i.test(value)) {
						sizes.add(value);
					} else {
						colors.add(value);
					}
				}
			}

			const images = Array.isArray(row.images)
				? row.images.map((img) => img.src || img.url || "").filter(Boolean)
				: [];

			const storeUrl = session?.store?.url || "";
			return {
				id: String(row.id),
				handle: productHandle,
				title: toLocalizedValue(row.name, storeLanguage),
				product_type: toLocalizedValue(row.brand, storeLanguage) || "",
				url: storeUrl ? `https://${storeUrl.replace(/^https?:\/\//, "")}/produtos/${productHandle}/` : "#",
				images,
				collection_handles,
				catalog: {
					sizes: Array.from(sizes),
					colors: Array.from(colors),
					variants: variants.map((v) => ({
						id: v.id,
						stock: v.stock,
						values: Array.isArray(v.values)
							? v.values.map((val) => toLocalizedValue(val, storeLanguage))
							: [],
					})),
				},
			};
		}
		if (rows.length < 200) break;
	}
	return null;
}
