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

function mapCategoryRow(row, storeLanguage) {
	return {
		id: row.id,
		handle: toLocalizedValue(row.handle, storeLanguage) || String(row.id),
		title: toLocalizedValue(row.name, storeLanguage) || String(row.id),
	};
}

export async function loadAllStoreCategories(session, nuvemshopApi, { maxPages = 10 } = {}) {
	const storeLanguage = session?.store?.language || "pt";
	const byId = new Map();

	for (let page = 1; page <= maxPages; page += 1) {
		const response = await nuvemshopApi(
			session,
			`/categories?fields=id,name,handle&per_page=200&page=${page}`,
			{ method: "GET" },
		);
		if (!response.ok) break;
		const rows = await response.json().catch(() => []);
		if (!Array.isArray(rows) || rows.length === 0) break;

		for (const row of rows) {
			byId.set(String(row.id), mapCategoryRow(row, storeLanguage));
		}
		if (rows.length < 200) break;
	}

	return byId;
}

function resolveCollectionsFromCategoryIds(categoryIds, categoryById) {
	if (!Array.isArray(categoryIds) || categoryIds.length === 0) return [];
	return categoryIds
		.map((categoryId) => categoryById.get(String(categoryId)))
		.filter(Boolean);
}

function extractCategoryIds(row) {
	if (!row || typeof row !== "object") return [];
	if (Array.isArray(row.categories)) {
		return row.categories.map((categoryId) => String(categoryId)).filter(Boolean);
	}
	if (Array.isArray(row.category_ids)) {
		return row.category_ids.map((categoryId) => String(categoryId)).filter(Boolean);
	}
	return [];
}

export async function listStoreProducts(session, nuvemshopApi, { maxPages = 4 } = {}) {
	const storeLanguage = session?.store?.language || "pt";
	const products = [];
	const categoryById = await loadAllStoreCategories(session, nuvemshopApi);

	for (let page = 1; page <= maxPages; page += 1) {
		const response = await nuvemshopApi(
			session,
			`/products?published=true&per_page=200&page=${page}&fields=id,handle,name,images,published,categories`,
			{ method: "GET" },
		);
		if (!response.ok) break;
		const rows = await response.json().catch(() => []);
		if (!Array.isArray(rows) || rows.length === 0) break;

		for (const row of rows) {
			const handle = toLocalizedValue(row.handle, storeLanguage);
			const title = toLocalizedValue(row.name, storeLanguage) || handle || String(row.id);
			const categoryIds = extractCategoryIds(row);
			const collections = resolveCollectionsFromCategoryIds(categoryIds, categoryById);
			const images = Array.isArray(row.images)
				? row.images.map((img) => img.src || img.url || "").filter(Boolean)
				: [];
			products.push({
				id: String(row.id),
				handle,
				title,
				collections,
				category_ids: categoryIds,
				images,
				published: row.published !== false,
			});
		}
		if (rows.length < 200) break;
	}

	return products;
}

export async function getProductCategoryIdsByHandle(session, nuvemshopApi, handle) {
	const product = await getProductByHandle(session, nuvemshopApi, handle);
	return product?.category_ids || [];
}

export async function getProductByHandle(session, nuvemshopApi, handle) {
	const storeLanguage = session?.store?.language || "pt";
	const normalized = String(handle || "").trim().toLowerCase();
	if (!normalized) return null;

	const categoryById = await loadAllStoreCategories(session, nuvemshopApi);

	for (let page = 1; page <= 6; page += 1) {
		const response = await nuvemshopApi(
			session,
			`/products?published=true&per_page=200&page=${page}&fields=id,handle,name,images,published,variants,categories,brand`,
			{ method: "GET" },
		);
		if (!response.ok) break;
		const rows = await response.json().catch(() => []);
		if (!Array.isArray(rows) || rows.length === 0) break;

		for (const row of rows) {
			const productHandle = toLocalizedValue(row.handle, storeLanguage).toLowerCase();
			if (productHandle !== normalized) continue;

			const categoryIds = extractCategoryIds(row);
			const collections = resolveCollectionsFromCategoryIds(categoryIds, categoryById);
			const collection_handles = collections.map((category) => category.handle).filter(Boolean);

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
				category_ids: categoryIds,
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
