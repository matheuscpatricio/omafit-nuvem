/** Planos com layout hero e consultor stylist no provador. */
export const GROWTH_PLUS_PLANS = new Set([
	"growth",
	"pro",
	"professional",
	"enterprise",
]);

export function hasGrowthPlusPlan(plan) {
	return GROWTH_PLUS_PLANS.has(String(plan || "").trim().toLowerCase());
}

export const hasStylistConsultantAccess = hasGrowthPlusPlan;
export const hasHeroLayoutAccess = hasGrowthPlusPlan;

export function isBillingActive(shopRecord) {
	const status = String(shopRecord?.billing_status || "active").toLowerCase();
	return status === "active" || status === "trialing";
}
