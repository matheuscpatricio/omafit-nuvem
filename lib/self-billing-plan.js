import { patchNuvemshopShopRecord } from "./nuvemshop-shop-keys.js";

export async function applySelfBillingPlan({
	storeId,
	planId,
	planDef,
	storeUrl = "",
	storeInfo = {},
	storeRecord = null,
	session = null,
	supabaseRequest,
	upsertStoreRecord,
	normalizeStoreUrl: _normalizeStoreUrl,
	convertUsdToBrl,
	usdRate,
	billingMode = "self",
}) {
	const pricePerExtraImageBrl = convertUsdToBrl(planDef.usdPricePerExtraImage || 0, usdRate);
	const desiredRecord = {
		...storeInfo,
		plan: planDef.id,
		billing_status: "active",
		images_included: planDef.imagesIncluded,
		price_per_extra_image: pricePerExtraImageBrl,
		currency: "BRL",
		billing_mode: billingMode,
		billing_cycle_start: new Date().toISOString(),
	};

	const patched = await patchNuvemshopShopRecord({
		supabaseRequest,
		storeId,
		patch: {
			plan: desiredRecord.plan,
			billing_status: desiredRecord.billing_status,
			images_included: desiredRecord.images_included,
			price_per_extra_image: desiredRecord.price_per_extra_image,
			currency: desiredRecord.currency,
			billing_mode: desiredRecord.billing_mode,
			billing_cycle_start: desiredRecord.billing_cycle_start,
		},
	});

	if (patched.ok) return patched.row;
	return upsertStoreRecord(session || { storeId }, desiredRecord);
}
