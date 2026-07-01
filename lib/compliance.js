export async function handleStoreRedact({
	storeId,
	shopKey,
	storeUrl,
	supabaseDelete,
	deleteSession,
	deleteNuvemshopCredential,
}) {
	const domains = [shopKey, storeUrl].filter(Boolean);
	for (const domain of domains) {
		await supabaseDelete(`widget_keys?shop_domain=eq.${encodeURIComponent(domain)}`).catch(
			() => null,
		);
		await supabaseDelete(
			`widget_configurations?shop_domain=eq.${encodeURIComponent(domain)}`,
		).catch(() => null);
	}
	if (storeId) {
		deleteSession?.(storeId);
		await deleteNuvemshopCredential?.(storeId).catch(() => null);
	}
	return { ok: true };
}

export async function handleCustomerRedact({ shopKey, customerId, supabaseDelete }) {
	if (!shopKey || !customerId) return { ok: true, skipped: true };
	await supabaseDelete(
		`session_analytics?shop_domain=eq.${encodeURIComponent(shopKey)}&customer_id=eq.${encodeURIComponent(String(customerId))}`,
	).catch(() => null);
	await supabaseDelete(
		`user_measurements?shop_domain=eq.${encodeURIComponent(shopKey)}&customer_id=eq.${encodeURIComponent(String(customerId))}`,
	).catch(() => null);
	return { ok: true };
}

export async function handleCustomerDataRequest({ shopKey, customerId, supabaseSelectAll }) {
	if (!shopKey || !customerId) {
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
