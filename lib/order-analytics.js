const OMAFIT_MARKER = "_source=omafit_tryon";

export function orderHasOmafitSource(order) {
	const note = String(order?.note || order?.owner_note || "").toLowerCase();
	if (note.includes(OMAFIT_MARKER) || note.includes("omafit_tryon")) return true;

	const products = Array.isArray(order?.products) ? order.products : [];
	for (const item of products) {
		const props = item?.properties || item?.custom_fields || {};
		if (typeof props === "object") {
			for (const [key, value] of Object.entries(props)) {
				if (String(key) === "_source" && String(value) === "omafit_tryon") return true;
			}
		}
		const name = String(item?.name || item?.product_name || "").toLowerCase();
		if (name.includes("omafit")) return true;
	}
	return false;
}

export async function upsertOmafitOrderAnalytics({
	shopDomain,
	order,
	supabaseRequest,
	supabaseDelete,
}) {
	const orderId = order?.id != null ? String(order.id) : "";
	if (!orderId || !shopDomain) return { skipped: true, reason: "missing_ids" };

	const hasOmafit = orderHasOmafitSource(order);
	if (!hasOmafit) {
		await supabaseDelete(
			`order_analytics_omafit?shop_domain=eq.${encodeURIComponent(shopDomain)}&order_id=eq.${encodeURIComponent(orderId)}`,
		).catch(() => null);
		return { deleted: true };
	}

	const row = {
		shop_domain: shopDomain,
		order_id: orderId,
		order_name: order?.number != null ? String(order.number) : null,
		order_number: Number(order?.number) || null,
		order_created_at: order?.created_at || order?.paid_at || new Date().toISOString(),
		order_updated_at: order?.updated_at || new Date().toISOString(),
		currency: order?.currency || "BRL",
		total_price:
			order?.total != null
				? String(order.total)
				: order?.total_price != null
					? String(order.total_price)
					: null,
		omafit_line_items_count: 1,
		_source: "omafit_tryon",
	};

	const response = await supabaseRequest(
		`order_analytics_omafit?on_conflict=shop_domain,order_id`,
		{
			method: "POST",
			headers: { Prefer: "resolution=merge-duplicates,return=representation" },
			body: JSON.stringify([row]),
		},
	);
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		return { ok: false, error: text };
	}
	return { ok: true };
}
