import { getProductByHandle, listStoreProducts, toLocalizedValue } from "./nuvemshop-products.js";

function tokenize(text) {
	return String(text || "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length > 2);
}

function scoreProduct(product, { terms, excludeHandle, collectionHandles }) {
	const handle = String(product.handle || "").toLowerCase();
	if (excludeHandle && handle === String(excludeHandle).toLowerCase()) return -1;

	let score = 0;
	const title = String(product.title || "").toLowerCase();
	const titleTokens = tokenize(title);
	const searchTerms = terms.flatMap(tokenize);

	for (const term of searchTerms) {
		if (title.includes(term)) score += 3;
		if (titleTokens.includes(term)) score += 2;
	}

	const allowedCollections = String(collectionHandles || "")
		.split(",")
		.map((h) => h.trim().toLowerCase())
		.filter(Boolean);
	if (allowedCollections.length > 0) {
		const productCollections = (product.collections || []).map((c) =>
			String(c.handle || "").toLowerCase(),
		);
		if (!productCollections.some((h) => allowedCollections.includes(h))) {
			return -1;
		}
		score += 2;
	}

	if (product.published !== false) score += 1;
	return score;
}

export async function searchCatalogCandidates(session, nuvemshopApi, params) {
	const excludeHandle = String(params.exclude_handle || "").trim();
	const userMessage = String(params.user_message || params.product_name || "").trim();
	const collectionHandles = String(params.collection_handles || "").trim();
	const terms = userMessage ? [userMessage] : [];

	const products = await listStoreProducts(session, nuvemshopApi, { maxPages: 4 });
	const storeLanguage = session?.store?.language || "pt";
	const storeUrl = session?.store?.url || "";

	const scored = products
		.map((product) => ({
			product,
			score: scoreProduct(product, { terms, excludeHandle, collectionHandles }),
		}))
		.filter((row) => row.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, 12);

	return scored.map(({ product, score }) => {
		const handle = product.handle;
		const image =
			product.images?.[0]?.src ||
			product.images?.[0] ||
			"";
		return {
			handle,
			title: product.title,
			url: storeUrl
				? `https://${storeUrl.replace(/^https?:\/\//, "")}/produtos/${handle}/`
				: "#",
			image_url: image,
			product_type: "",
			tags: [],
			price_amount: null,
			currency_code: session?.store?.currency || "BRL",
			in_stock: true,
			score_reason_tags: [`score:${score}`],
		};
	});
}

export async function getCatalogProductByHandle(session, nuvemshopApi, handle) {
	const product = await getProductByHandle(session, nuvemshopApi, handle);
	if (!product) return null;
	return {
		product,
		error: null,
	};
}

export async function recordSuggestionEvent(supabaseUpsert, shopKey, params) {
	const event = String(params.event || "").trim();
	const anchorHandle = String(params.anchor_handle || "").trim();
	const suggestedHandle = String(params.suggested_handle || "").trim();
	const impressionId = String(params.impression_id || "").trim();

	if (!event || !anchorHandle) {
		return { ok: false, error: "invalid_event" };
	}

	if (event === "impression") {
		let handles = [];
		try {
			handles = JSON.parse(String(params.suggested_handles || "[]"));
		} catch {
			handles = [];
		}
		const rows = (Array.isArray(handles) ? handles : [])
			.map((h) => String(h || "").trim())
			.filter(Boolean)
			.map((suggested) => ({
				shop_domain: shopKey,
				anchor_handle: anchorHandle,
				suggested_handle: suggested,
				impression_id: impressionId,
				impressions: 1,
				stylist_clicks: 0,
				atc: 0,
				updated_at: new Date().toISOString(),
			}));
		if (rows.length === 0) return { ok: true };
		await supabaseUpsert("widget_suggestion_pair_stats", rows, {
			onConflict: "shop_domain,anchor_handle,suggested_handle",
		}).catch(() => null);
		return { ok: true };
	}

	if (event === "stylist_click" || event === "atc") {
		const field = event === "stylist_click" ? "stylist_clicks" : "atc";
		await supabaseUpsert(
			"widget_suggestion_pair_stats",
			[
				{
					shop_domain: shopKey,
					anchor_handle: anchorHandle,
					suggested_handle: suggestedHandle,
					impression_id: impressionId,
					[field]: 1,
					updated_at: new Date().toISOString(),
				},
			],
			{ onConflict: "shop_domain,anchor_handle,suggested_handle" },
		).catch(() => null);
		return { ok: true };
	}

	return { ok: false, error: "unknown_event" };
}
