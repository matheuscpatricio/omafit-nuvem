/**
 * Cria produtos e preços Stripe alinhados à landing omafit-widget (Pricing.tsx).
 *
 * Uso:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-catalog.mjs
 *
 * Idempotente: reutiliza produtos com metadata omafit_plan existentes.
 */
import Stripe from "stripe";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

/** Espelha fallbackPlans em omafit-widget/src/components/landing/Pricing.tsx */
const CATALOG = [
	{
		planId: "ondemand",
		name: "Omafit On-Demand",
		description:
			"Instalação grátis. 50 sessões de try-on incluídas. US$ 0,18 por sessão extra. 5 acessórios AR.",
		monthlyUsd: 0,
		envKey: "STRIPE_PRICE_ONDEMAND",
	},
	{
		planId: "growth",
		name: "Omafit Growth",
		description:
			"US$ 89/mês · 700 imagens de try-on · 20 acessórios AR. Imagens extras a US$ 0,12.",
		monthlyUsd: 89,
		envKey: "STRIPE_PRICE_GROWTH",
	},
	{
		planId: "pro",
		name: "Omafit Pro",
		description:
			"US$ 300/mês · 3.000 imagens de try-on · 100 acessórios AR. Imagens extras a US$ 0,08.",
		monthlyUsd: 300,
		envKey: "STRIPE_PRICE_PRO",
	},
	{
		planId: "enterprise",
		name: "Omafit Enterprise",
		description:
			"US$ 600/mês · imagens de try-on ilimitadas · acessórios AR ilimitados.",
		monthlyUsd: 600,
		envKey: "STRIPE_PRICE_ENTERPRISE",
	},
];

async function findProductByPlan(stripe, planId) {
	const products = await stripe.products.search({
		query: `metadata['omafit_plan']:'${planId}' AND active:'true'`,
		limit: 1,
	});
	return products.data[0] || null;
}

async function findMonthlyPrice(stripe, productId, amountCents) {
	const prices = await stripe.prices.list({
		product: productId,
		active: true,
		limit: 20,
	});
	return (
		prices.data.find(
			(price) =>
				price.type === "recurring" &&
				price.currency === "usd" &&
				price.recurring?.interval === "month" &&
				price.unit_amount === amountCents,
		) || null
	);
}

async function ensurePlan(stripe, entry) {
	let product = await findProductByPlan(stripe, entry.planId);
	if (!product) {
		product = await stripe.products.create({
			name: entry.name,
			description: entry.description,
			metadata: {
				omafit_plan: entry.planId,
				platform: "nuvemshop",
				source: "omafit-widget-landing",
			},
		});
		console.log(`✓ Produto criado: ${entry.name} (${product.id})`);
	} else {
		await stripe.products.update(product.id, {
			name: entry.name,
			description: entry.description,
		});
		console.log(`→ Produto existente: ${entry.name} (${product.id})`);
	}

	const amountCents = Math.round(entry.monthlyUsd * 100);
	let price = await findMonthlyPrice(stripe, product.id, amountCents);
	if (!price) {
		price = await stripe.prices.create({
			product: product.id,
			currency: "usd",
			unit_amount: amountCents,
			recurring: { interval: "month" },
			metadata: {
				omafit_plan: entry.planId,
				platform: "nuvemshop",
			},
		});
		console.log(`  ✓ Preço mensal: US$ ${entry.monthlyUsd} (${price.id})`);
	} else {
		console.log(`  → Preço existente: US$ ${entry.monthlyUsd} (${price.id})`);
	}

	return {
		planId: entry.planId,
		productId: product.id,
		priceId: price.id,
		envKey: entry.envKey,
	};
}

async function main() {
	const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
	if (!secretKey) {
		console.error("Defina STRIPE_SECRET_KEY antes de executar este script.");
		process.exit(1);
	}

	const stripe = new Stripe(secretKey);
	const results = [];

	for (const entry of CATALOG) {
		results.push(await ensurePlan(stripe, entry));
	}

	const envLines = [
		"# Gerado por scripts/create-stripe-catalog.mjs — cole no Railway",
		`# Conta: ${secretKey.startsWith("sk_live") ? "LIVE" : "TEST"}`,
		"",
		...results.map((row) => `${row.envKey}=${row.priceId}`),
		"",
		"# Legado (mesmos valores — opcional):",
		...results.map((row) => `${row.envKey}_BRL=${row.priceId}`),
	];

	const outPath = join(rootDir, ".stripe-catalog.env");
	writeFileSync(outPath, `${envLines.join("\n")}\n`, "utf8");

	console.log("\n--- Variáveis para Railway ---\n");
	console.log(envLines.join("\n"));
	console.log(`\nSalvo em ${outPath}`);
}

main().catch((error) => {
	console.error(error?.message || error);
	process.exit(1);
});
