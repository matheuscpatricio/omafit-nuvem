/**
 * Chaves e filtros seguros para billing Nuvemshop.
 * Nunca usar domínio bare/URL de loja em shopify_shops — a tabela é compartilhada com Shopify.
 */

export function getCanonicalShopKey(storeId) {
	return `nuvemshop/${String(storeId || "").trim()}`;
}

export function isNuvemshopShopKey(domain) {
	return String(domain || "").trim().startsWith("nuvemshop/");
}

export function isShopifyDomain(domain) {
	const normalized = String(domain || "").trim().toLowerCase();
	return normalized.endsWith(".myshopify.com") || normalized.includes(".myshopify.com");
}

/** Domínio seguro para PATCH/upsert de billing em shopify_shops (somente chaves Nuvemshop). */
export function isSafeNuvemshopBillingDomain(domain) {
	const value = String(domain || "").trim();
	if (!value || isShopifyDomain(value)) return false;
	return isNuvemshopShopKey(value);
}

/** Candidatos exclusivos para billing: apenas nuvemshop/{storeId}. */
export function buildNuvemshopOnlyShopDomainCandidates(storeId, shopRecord = null) {
	const shopKey = getCanonicalShopKey(storeId);
	const recordDomain = String(shopRecord?.shop_domain || "").trim();
	const candidates = [shopKey];
	if (recordDomain && isSafeNuvemshopBillingDomain(recordDomain)) {
		candidates.push(recordDomain);
	}
	return Array.from(new Set(candidates));
}

/**
 * PATCH em shopify_shops restrito a linhas Nuvemshop (shop_domain nuvemshop/*).
 * Tenta com filtro platform=nuvemshop quando disponível.
 */
export async function patchNuvemshopShopRecord({
	supabaseRequest,
	storeId,
	patch,
	select = "*",
}) {
	const shopKey = getCanonicalShopKey(storeId);
	if (!storeId || !shopKey) return { ok: false, row: null, error: "missing_store_id" };

	const body = JSON.stringify({
		...patch,
		platform: "nuvemshop",
		updated_at: new Date().toISOString(),
	});

	const queryVariants = [
		`shopify_shops?shop_domain=eq.${encodeURIComponent(shopKey)}&platform=eq.nuvemshop&select=${select}`,
		`shopify_shops?shop_domain=eq.${encodeURIComponent(shopKey)}&select=${select}`,
	];

	let lastError = null;
	for (const query of queryVariants) {
		try {
			const response = await supabaseRequest(query, {
				method: "PATCH",
				headers: { Prefer: "return=representation" },
				body,
			});
			if (response.ok) {
				const rows = await response.json().catch(() => []);
				if (Array.isArray(rows) && rows[0]) {
					return { ok: true, row: rows[0], error: null };
				}
			} else {
				const text = await response.text().catch(() => "");
				lastError = text.slice(0, 300);
			}
		} catch (error) {
			lastError = String(error?.message || "patch_failed");
		}
	}

	return { ok: false, row: null, error: lastError };
}
