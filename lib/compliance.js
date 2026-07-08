function isShopifyShopDomain(domain) {
	return /\.myshopify\.com$/i.test(String(domain || "").trim());
}

function shouldManageNuvemshopWidgetDomain(domain) {
	const normalized = String(domain || "").trim();
	if (!normalized || isShopifyShopDomain(normalized)) return false;
	return true;
}

function uniqueNuvemshopDomains(domains) {
	return Array.from(
		new Set(
			(domains || [])
				.map((value) => String(value || "").trim())
				.filter(shouldManageNuvemshopWidgetDomain),
		),
	);
}

async function deactivateWidgetKeysForShopDomains(domains, supabaseRequest) {
	const managedDomains = uniqueNuvemshopDomains(domains);
	for (const domain of managedDomains) {
		await supabaseRequest(`widget_keys?shop_domain=eq.${encodeURIComponent(domain)}`, {
			method: "PATCH",
			headers: { Prefer: "return=minimal" },
			body: JSON.stringify({
				is_active: false,
				status: "inactive",
				updated_at: new Date().toISOString(),
			}),
		}).catch(() => null);
	}
	return managedDomains;
}

/**
 * Uninstall do app Nuvemshop: remove credenciais locais e desativa widget_keys
 * sem apagar linhas compartilhadas com Shopify em widget_keys/widget_configurations.
 */
export async function handleNuvemshopAppUninstalled({
	storeId,
	shopKey,
	storeUrl,
	supabaseRequest,
	deleteSession,
	deleteNuvemshopCredential,
}) {
	const deactivatedDomains = await deactivateWidgetKeysForShopDomains(
		[shopKey, storeUrl],
		supabaseRequest,
	);
	if (storeId) {
		deleteSession?.(storeId);
		await deleteNuvemshopCredential?.(storeId).catch(() => null);
	}
	return {
		ok: true,
		deactivatedWidgetDomains: deactivatedDomains,
		preservedSharedTables: ["widget_keys", "widget_configurations"],
	};
}

/**
 * LGPD store/redact da Nuvemshop: desativa widget_keys da loja e remove credenciais.
 * Nao apaga widget_keys nem widget_configurations (tabelas compartilhadas com Shopify).
 */
export async function handleStoreRedact({
	storeId,
	shopKey,
	storeUrl,
	supabaseRequest,
	supabaseDelete,
	deleteSession,
	deleteNuvemshopCredential,
}) {
	const deactivatedDomains = await deactivateWidgetKeysForShopDomains(
		[shopKey, storeUrl],
		supabaseRequest,
	);
	const domains = uniqueNuvemshopDomains([shopKey, storeUrl]);
	for (const domain of domains) {
		await supabaseDelete(
			`session_analytics?shop_domain=eq.${encodeURIComponent(domain)}`,
		).catch(() => null);
		await supabaseDelete(
			`user_measurements?shop_domain=eq.${encodeURIComponent(domain)}`,
		).catch(() => null);
		await supabaseDelete(`size_charts?shop_domain=eq.${encodeURIComponent(domain)}`).catch(
			() => null,
		);
	}
	if (storeId) {
		deleteSession?.(storeId);
		await deleteNuvemshopCredential?.(storeId).catch(() => null);
	}
	return {
		ok: true,
		deactivatedWidgetDomains: deactivatedDomains,
		preservedSharedTables: ["widget_keys", "widget_configurations"],
	};
}

export async function handleCustomerRedact({ shopKey, customerId, supabaseDelete }) {
	if (!shopKey || !customerId || isShopifyShopDomain(shopKey)) {
		return { ok: true, skipped: true };
	}
	await supabaseDelete(
		`session_analytics?shop_domain=eq.${encodeURIComponent(shopKey)}&customer_id=eq.${encodeURIComponent(String(customerId))}`,
	).catch(() => null);
	await supabaseDelete(
		`user_measurements?shop_domain=eq.${encodeURIComponent(shopKey)}&customer_id=eq.${encodeURIComponent(String(customerId))}`,
	).catch(() => null);
	return { ok: true };
}

export async function handleCustomerDataRequest({ shopKey, customerId, supabaseSelectAll }) {
	if (!shopKey || !customerId || isShopifyShopDomain(shopKey)) {
		return { ok: true, data: { sessions: [], measurements: [] } };
	}
	const cid = encodeURIComponent(String(customerId));
	const sessions = await supabaseSelectAll(
		`session_analytics?shop_domain=eq.${encodeURIComponent(shopKey)}&customer_id=eq.${cid}&select=id,created_at,recommended_size,gender`,
	).catch(() => []);
	const measurements = await supabaseSelectAll(
		`user_measurements?shop_domain=eq.${encodeURIComponent(shopKey)}&customer_id=eq.${cid}&select=id,created_at,gender,height,weight`,
	).catch(() => []);
	return { ok: true, data: { sessions, measurements } };
}
