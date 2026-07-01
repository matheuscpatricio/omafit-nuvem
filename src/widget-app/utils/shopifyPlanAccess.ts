const GROWTH_PLUS = new Set(["growth", "pro", "professional", "enterprise"]);

export function hasGrowthPlusPlan(plan: string | null | undefined) {
	return GROWTH_PLUS.has(String(plan || "").trim().toLowerCase());
}
