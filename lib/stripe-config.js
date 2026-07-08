const PLAN_PRICE_ENV_KEYS = {
	ondemand: "STRIPE_PRICE_ONDEMAND_BRL",
	growth: "STRIPE_PRICE_GROWTH_BRL",
	pro: "STRIPE_PRICE_PRO_BRL",
	enterprise: "STRIPE_PRICE_ENTERPRISE_BRL",
};

export function getStripeSecretKey() {
	return String(process.env.STRIPE_SECRET_KEY || "").trim();
}

export function getStripeWebhookSecret() {
	return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
}

export function isStripeConfigured() {
	return Boolean(getStripeSecretKey());
}

export function getStripePriceIdForPlan(planId) {
	const normalized = String(planId || "ondemand").trim().toLowerCase();
	const envKey = PLAN_PRICE_ENV_KEYS[normalized];
	if (!envKey) return "";
	return String(process.env[envKey] || "").trim();
}

export function planRequiresStripeCheckout(planId) {
	const normalized = String(planId || "").trim().toLowerCase();
	if (normalized === "enterprise") return false;
	return ["ondemand", "growth", "pro"].includes(normalized);
}

export function toStripeAmountInCents(amountBrl) {
	return Math.max(0, Math.round(Number(amountBrl || 0) * 100));
}
