import {
	buildNuvemshopOnlyShopDomainCandidates,
	getCanonicalShopKey,
	patchNuvemshopShopRecord,
} from "./nuvemshop-shop-keys.js";

export function shouldUseSelfBilling(billingMode, conceptCode = "") {
	const mode = String(billingMode || "self").trim().toLowerCase();
	if (mode === "self") return true;
	if (mode === "nuvemshop") return false;
	return !String(conceptCode || "").trim();
}

export function calculateOverageChargeAmount(extraUnits, pricePerExtra) {
	const units = Math.max(0, Math.floor(Number(extraUnits) || 0));
	const unitPrice = Number(pricePerExtra) || 0;
	return Number((units * unitPrice).toFixed(2));
}

/**
 * Acumula excedente de try-on no Supabase (billing proprio do parceiro).
 * Atualiza pending_overage_* apenas em linhas Nuvemshop (shop_domain nuvemshop/*).
 */
export async function recordSelfBillingOverage({
	storeId,
	storeUrl = "",
	shopRecord = null,
	extraUnits,
	pricePerExtra,
	currency = "BRL",
	predictionId = "",
	supabaseRequest,
	getCanonicalShopKey: getShopKey = getCanonicalShopKey,
	normalizeStoreUrl: _normalizeStoreUrl,
}) {
	const units = Math.max(0, Math.floor(Number(extraUnits) || 0));
	if (!storeId || units <= 0) {
		return { ok: false, reason: "no_overage" };
	}

	const amount = calculateOverageChargeAmount(units, pricePerExtra);
	if (amount <= 0) {
		return { ok: false, reason: "zero_amount" };
	}

	const shopKey = getShopKey(storeId);
	const previousPendingAmount = Number(shopRecord?.pending_overage_amount || 0) || 0;
	const previousPendingUnits = Number(shopRecord?.pending_overage_units || 0) || 0;
	const nextPendingAmount = Number((previousPendingAmount + amount).toFixed(2));
	const nextPendingUnits = previousPendingUnits + units;
	const now = new Date().toISOString();

	const patchResult = await patchNuvemshopShopRecord({
		supabaseRequest,
		storeId,
		patch: {
			pending_overage_amount: nextPendingAmount,
			pending_overage_units: nextPendingUnits,
			billing_mode: String(shopRecord?.billing_mode || "self"),
		},
		select: "shop_domain,pending_overage_amount,pending_overage_units,billing_mode,stripe_customer_id",
	});
	const shopPatched = patchResult.ok;
	const lastPatchError = patchResult.error;

	let chargeRow = null;
	let chargeError = null;
	try {
		const response = await supabaseRequest("billing_usage_charges?select=id", {
			method: "POST",
			headers: {
				Prefer: "return=representation",
			},
			body: JSON.stringify([
				{
					shop_domain: shopKey,
					store_id: String(storeId),
					platform: "nuvemshop",
					prediction_id: predictionId ? String(predictionId) : null,
					units,
					amount,
					currency: String(currency || "BRL").toUpperCase(),
					status: "pending",
					created_at: now,
				},
			]),
		});
		if (response.ok) {
			const rows = await response.json().catch(() => []);
			chargeRow = Array.isArray(rows) ? rows[0] || null : null;
		} else {
			const text = await response.text().catch(() => "");
			chargeError = text.slice(0, 300);
		}
	} catch (error) {
		chargeError = String(error?.message || "charge_insert_failed");
	}

	return {
		ok: shopPatched || Boolean(chargeRow),
		mode: String(shopRecord?.billing_mode || "self"),
		amount,
		units,
		currency: String(currency || "BRL").toUpperCase(),
		pendingOverageAmount: nextPendingAmount,
		pendingOverageUnits: nextPendingUnits,
		shopPatched,
		chargeRow,
		chargeError: chargeError || (shopPatched ? null : lastPatchError),
		shopRecord: patchResult.row,
	};
}

export { buildNuvemshopOnlyShopDomainCandidates };
