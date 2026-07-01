import { createHash } from "crypto";

export function buildDeterministicPublicId(shopDomain) {
	const hash = createHash("sha256").update(String(shopDomain || "")).digest("hex");
	return `wgt_pub_${hash.substring(0, 24)}`;
}

export async function reactivateWidgetKeyForShop({
	shopDomain,
	supabaseSelectFirst,
	supabaseRequest,
	generateWidgetPublicId,
}) {
	const domain = String(shopDomain || "").trim();
	if (!domain) {
		return { success: false, error: "shop_domain is required" };
	}

	const existing = await supabaseSelectFirst(
		`widget_keys?shop_domain=eq.${encodeURIComponent(domain)}&select=is_active,public_id&order=updated_at.desc&limit=1`,
	).catch(() => null);

	if (!existing) {
		const publicId = generateWidgetPublicId
			? generateWidgetPublicId(domain)
			: buildDeterministicPublicId(domain);
		const response = await supabaseRequest("widget_keys", {
			method: "POST",
			headers: { Prefer: "return=representation" },
			body: JSON.stringify({
				shop_domain: domain,
				public_id: publicId,
				is_active: true,
				status: "active",
			}),
		});
		if (!response.ok) {
			const text = await response.text().catch(() => "");
			return { success: false, nonCritical: true, skipped: true, error: text || "create failed" };
		}
		const rows = await response.json().catch(() => []);
		const row = Array.isArray(rows) ? rows[0] : null;
		return { success: true, created: true, publicId: row?.public_id || publicId };
	}

	if (existing.is_active === true) {
		return { success: true, alreadyActive: true, publicId: existing.public_id || null };
	}

	const patchResponse = await supabaseRequest(
		`widget_keys?shop_domain=eq.${encodeURIComponent(domain)}`,
		{
			method: "PATCH",
			headers: { Prefer: "return=representation" },
			body: JSON.stringify({
				is_active: true,
				status: "active",
				updated_at: new Date().toISOString(),
			}),
		},
	);
	if (!patchResponse.ok) {
		const text = await patchResponse.text().catch(() => "");
		return { success: false, nonCritical: true, skipped: true, error: text || "reactivate failed" };
	}
	const updated = await patchResponse.json().catch(() => []);
	return {
		success: true,
		reactivated: true,
		publicId: updated?.[0]?.public_id || existing.public_id || null,
	};
}
