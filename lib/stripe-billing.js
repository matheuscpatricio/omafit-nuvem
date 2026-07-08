import Stripe from "stripe";
import {
	getCanonicalShopKey,
	patchNuvemshopShopRecord,
} from "./nuvemshop-shop-keys.js";
import {
	getStripeSecretKey,
	getStripeWebhookSecret,
	getStripePriceIdForPlan,
	isStripeConfigured,
	planRequiresStripeCheckout,
	toStripeAmountInCents,
} from "./stripe-config.js";

let stripeClient = null;

export function getStripeClient() {
	if (!isStripeConfigured()) return null;
	if (!stripeClient) {
		stripeClient = new Stripe(getStripeSecretKey());
	}
	return stripeClient;
}

export function verifyStripeWebhookSignature(rawBody, signatureHeader) {
	const secret = getStripeWebhookSecret();
	if (!secret) return null;
	const stripe = getStripeClient();
	if (!stripe) return null;
	try {
		return stripe.webhooks.constructEvent(
			rawBody,
			String(signatureHeader || ""),
			secret,
		);
	} catch (_error) {
		return null;
	}
}

export async function getOrCreateStripeCustomer({
	stripe,
	storeId,
	shopRecord = null,
	email = "",
	storeName = "",
	supabaseRequest,
}) {
	const existingId = String(shopRecord?.stripe_customer_id || "").trim();
	if (existingId) {
		try {
			const customer = await stripe.customers.retrieve(existingId);
			if (!customer.deleted) return customer;
		} catch (_error) {
			// create a new customer below
		}
	}

	const customer = await stripe.customers.create({
		email: email || undefined,
		name: storeName || undefined,
		metadata: {
			store_id: String(storeId),
			shop_key: getCanonicalShopKey(storeId),
			platform: "nuvemshop",
		},
	});

	if (supabaseRequest) {
		await patchNuvemshopShopRecord({
			supabaseRequest,
			storeId,
			patch: {
				stripe_customer_id: customer.id,
				billing_mode: "stripe",
			},
		});
	}

	return customer;
}

export async function createStripeCheckoutSession({
	storeId,
	planId,
	storeUrl = "",
	shopRecord = null,
	email = "",
	storeName = "",
	successUrl,
	cancelUrl,
	supabaseRequest,
}) {
	const stripe = getStripeClient();
	if (!stripe) {
		throw new Error("Stripe nao configurado. Defina STRIPE_SECRET_KEY.");
	}

	const normalizedPlanId = String(planId || "").trim().toLowerCase();
	if (!planRequiresStripeCheckout(normalizedPlanId)) {
		throw new Error("Este plano nao requer checkout Stripe.");
	}

	const priceId = getStripePriceIdForPlan(normalizedPlanId);
	if (!priceId) {
		throw new Error(
			`Price ID Stripe ausente para o plano ${normalizedPlanId}. Configure STRIPE_PRICE_* no ambiente.`,
		);
	}

	const customer = await getOrCreateStripeCustomer({
		stripe,
		storeId,
		shopRecord,
		email,
		storeName,
		supabaseRequest,
	});

	const session = await stripe.checkout.sessions.create({
		mode: "subscription",
		customer: customer.id,
		line_items: [{ price: priceId, quantity: 1 }],
		success_url: successUrl,
		cancel_url: cancelUrl,
		client_reference_id: String(storeId),
		metadata: {
			store_id: String(storeId),
			plan_id: normalizedPlanId,
			shop_key: getCanonicalShopKey(storeId),
			platform: "nuvemshop",
		},
		subscription_data: {
			metadata: {
				store_id: String(storeId),
				plan_id: normalizedPlanId,
				shop_key: getCanonicalShopKey(storeId),
				platform: "nuvemshop",
			},
		},
		allow_promotion_codes: true,
		billing_address_collection: "auto",
	});

	return { session, customerId: customer.id };
}

export async function createStripePortalSession({
	storeId,
	shopRecord,
	returnUrl,
}) {
	const stripe = getStripeClient();
	if (!stripe) {
		throw new Error("Stripe nao configurado. Defina STRIPE_SECRET_KEY.");
	}

	const customerId = String(shopRecord?.stripe_customer_id || "").trim();
	if (!customerId) {
		throw new Error("Nenhum cliente Stripe vinculado a esta loja.");
	}

	const session = await stripe.billingPortal.sessions.create({
		customer: customerId,
		return_url: returnUrl,
	});

	return session;
}

export async function applyStripeSubscriptionToStore({
	storeId,
	planId,
	subscription,
	customerId,
	supabaseRequest,
	upsertStoreRecord,
	session,
	storeInfo = {},
	getPlanDefinition,
	convertUsdToBrl,
	usdRate,
}) {
	const planDef = getPlanDefinition(planId);
	const pricePerExtraImageBrl = convertUsdToBrl(planDef.usdPricePerExtraImage || 0, usdRate);
	const subscriptionStatus = String(subscription?.status || "").toLowerCase();
	const billingStatus = ["active", "trialing"].includes(subscriptionStatus)
		? "active"
		: subscriptionStatus === "past_due"
			? "past_due"
			: "inactive";

	const patch = {
		plan: planDef.id,
		billing_status: billingStatus,
		images_included: planDef.imagesIncluded,
		price_per_extra_image: pricePerExtraImageBrl,
		currency: "BRL",
		billing_mode: "stripe",
		stripe_customer_id: customerId || subscription?.customer || null,
		stripe_subscription_id: subscription?.id || null,
		stripe_payment_status: subscriptionStatus || null,
		billing_cycle_start: subscription?.current_period_start
			? new Date(subscription.current_period_start * 1000).toISOString()
			: new Date().toISOString(),
		billing_cycle_end: subscription?.current_period_end
			? new Date(subscription.current_period_end * 1000).toISOString()
			: null,
	};

	const patched = await patchNuvemshopShopRecord({
		supabaseRequest,
		storeId,
		patch,
	});

	if (patched.ok) return patched.row;

	if (upsertStoreRecord) {
		return upsertStoreRecord(session || { storeId }, {
			...storeInfo,
			id: storeId,
			plan: patch.plan,
			billing_status: patch.billing_status,
			images_included: patch.images_included,
			price_per_extra_image: patch.price_per_extra_image,
			currency: patch.currency,
			billing_mode: "stripe",
			stripe_customer_id: patch.stripe_customer_id,
			stripe_subscription_id: patch.stripe_subscription_id,
			stripe_payment_status: patch.stripe_payment_status,
			billing_cycle_start: patch.billing_cycle_start,
			billing_cycle_end: patch.billing_cycle_end,
		});
	}

	return null;
}

export async function chargeStripeOverage({
	storeId,
	shopRecord,
	amountBrl,
	units,
	description,
	predictionId = "",
	supabaseRequest,
}) {
	const stripe = getStripeClient();
	const customerId = String(shopRecord?.stripe_customer_id || "").trim();
	const amount = Number(amountBrl || 0);

	if (!stripe || !customerId || amount <= 0) {
		return { ok: false, reason: "stripe_not_ready" };
	}

	if (String(shopRecord?.billing_mode || "") !== "stripe") {
		return { ok: false, reason: "not_stripe_billing" };
	}

	try {
		await stripe.invoiceItems.create({
			customer: customerId,
			amount: toStripeAmountInCents(amount),
			currency: "brl",
			description: description || `Excedente try-on Omafit (${units} sessoes)`,
			metadata: {
				store_id: String(storeId),
				prediction_id: String(predictionId || ""),
				units: String(units),
				platform: "nuvemshop",
			},
		});

		const invoice = await stripe.invoices.create({
			customer: customerId,
			auto_advance: true,
			collection_method: "charge_automatically",
			metadata: {
				store_id: String(storeId),
				prediction_id: String(predictionId || ""),
				type: "overage",
				platform: "nuvemshop",
			},
		});

		const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
		let paidInvoice = finalized;
		if (finalized.status === "open") {
			try {
				paidInvoice = await stripe.invoices.pay(finalized.id);
			} catch (payError) {
				return {
					ok: false,
					reason: "payment_failed",
					invoiceId: finalized.id,
					error: String(payError?.message || "pay_failed"),
				};
			}
		}

		const paid = paidInvoice.status === "paid";
		if (paid && supabaseRequest) {
			const previousPending = Number(shopRecord?.pending_overage_amount || 0) || 0;
			const previousUnits = Number(shopRecord?.pending_overage_units || 0) || 0;
			await patchNuvemshopShopRecord({
				supabaseRequest,
				storeId,
				patch: {
					pending_overage_amount: Math.max(0, Number((previousPending - amount).toFixed(2))),
					pending_overage_units: Math.max(0, previousUnits - units),
					stripe_payment_status: "active",
				},
			});
		}

		return {
			ok: paid,
			invoiceId: paidInvoice.id,
			status: paidInvoice.status,
			amount,
			units,
		};
	} catch (error) {
		return {
			ok: false,
			reason: "stripe_error",
			error: String(error?.message || "stripe_overage_failed"),
		};
	}
}

export async function handleStripeWebhookEvent(event, deps) {
	const {
		supabaseRequest,
		upsertStoreRecord,
		resolveSession,
		getPlanDefinition,
		convertUsdToBrl,
		resolveUsdToBrlRate,
		loadLegacyShopRecord,
	} = deps;

	const type = String(event?.type || "");
	const data = event?.data?.object || {};

	if (type === "checkout.session.completed") {
		const storeId = String(data.metadata?.store_id || data.client_reference_id || "").trim();
		const planId = String(data.metadata?.plan_id || "growth").trim();
		if (!storeId) return { ok: false, reason: "missing_store_id" };

		const subscriptionId = String(data.subscription || "").trim();
		const customerId = String(data.customer || "").trim();
		const stripe = getStripeClient();
		const subscription = subscriptionId
			? await stripe.subscriptions.retrieve(subscriptionId)
			: null;
		const session = await resolveSession(storeId).catch(() => null);
		const shopRecord = await loadLegacyShopRecord(storeId).catch(() => null);
		const rate = await resolveUsdToBrlRate();

		const record = await applyStripeSubscriptionToStore({
			storeId,
			planId,
			subscription,
			customerId,
			supabaseRequest,
			upsertStoreRecord,
			session,
			storeInfo: session?.store || shopRecord || {},
			getPlanDefinition,
			convertUsdToBrl,
			usdRate: rate,
		});

		return { ok: true, action: "checkout_completed", storeId, record };
	}

	if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
		const storeId = String(data.metadata?.store_id || "").trim();
		if (!storeId) return { ok: true, action: "subscription_ignored" };

		const planId = String(data.metadata?.plan_id || "").trim() || "growth";
		const session = await resolveSession(storeId).catch(() => null);
		const shopRecord = await loadLegacyShopRecord(storeId).catch(() => null);
		const rate = await resolveUsdToBrlRate();

		if (type === "customer.subscription.deleted") {
			await patchNuvemshopShopRecord({
				supabaseRequest,
				storeId,
				patch: {
					billing_status: "inactive",
					stripe_subscription_id: null,
					stripe_payment_status: "canceled",
				},
			});
			return { ok: true, action: "subscription_canceled", storeId };
		}

		const record = await applyStripeSubscriptionToStore({
			storeId,
			planId,
			subscription: data,
			customerId: data.customer,
			supabaseRequest,
			upsertStoreRecord,
			session,
			storeInfo: session?.store || shopRecord || {},
			getPlanDefinition,
			convertUsdToBrl,
			usdRate: rate,
		});

		return { ok: true, action: "subscription_updated", storeId, record };
	}

	if (type === "invoice.payment_failed") {
		const storeId = String(data.metadata?.store_id || "").trim();
		if (!storeId) return { ok: true, action: "invoice_failed_ignored" };
		await patchNuvemshopShopRecord({
			supabaseRequest,
			storeId,
			patch: {
				billing_status: "past_due",
				stripe_payment_status: "past_due",
			},
		});
		return { ok: true, action: "invoice_payment_failed", storeId };
	}

	if (type === "invoice.paid") {
		const storeId = String(data.metadata?.store_id || "").trim();
		if (!storeId) return { ok: true, action: "invoice_paid_ignored" };
		await patchNuvemshopShopRecord({
			supabaseRequest,
			storeId,
			patch: {
				billing_status: "active",
				stripe_payment_status: "active",
			},
		});
		return { ok: true, action: "invoice_paid", storeId };
	}

	return { ok: true, action: "ignored", type };
}

export function buildStripeBillingSummary(shopRecord) {
	return {
		configured: isStripeConfigured(),
		customerId: shopRecord?.stripe_customer_id || null,
		subscriptionId: shopRecord?.stripe_subscription_id || null,
		paymentStatus: shopRecord?.stripe_payment_status || null,
		hasPaymentMethod: Boolean(shopRecord?.stripe_customer_id),
	};
}
