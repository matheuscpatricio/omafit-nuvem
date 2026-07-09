import {
	isStoreWhatsappPilotAllowed,
	isWhatsappPilotRestrictionActive,
} from "../../lib/whatsapp-pilot-access.js";

const GROWTH_PLUS_PLANS = new Set(["growth", "pro", "professional", "enterprise"]);

export function hasGrowthPlusPlan(plan: string | null | undefined): boolean {
	return GROWTH_PLUS_PLANS.has(String(plan || "").trim().toLowerCase());
}

export function hasWhatsappMarketingAccess(
	plan: string | null | undefined,
	billingStatus?: string | null,
	storeKey?: string | null,
): boolean {
	if (isWhatsappPilotRestrictionActive()) {
		return isStoreWhatsappPilotAllowed(storeKey);
	}
	const status = String(billingStatus || "active").trim().toLowerCase();
	const billingActive = status === "active" || status === "trialing";
	return billingActive && hasGrowthPlusPlan(plan);
}
