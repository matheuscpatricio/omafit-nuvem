import { getStripeClient } from "./stripe-billing.js";

const WHATSAPP_MESSAGE_PRICE_USD = 0.07;

/**
 * Cobra mensagem WhatsApp marketing via Stripe (USD).
 * Reutiliza shopify_usage_record_id na fila para guardar stripe invoice id (Nuvemshop).
 */
export async function chargeStripeWhatsappMessage({
	shopRecord,
	amountUsd = WHATSAPP_MESSAGE_PRICE_USD,
	storeKey = "",
	wamid = "",
}) {
	const stripe = getStripeClient();
	const customerId = String(shopRecord?.stripe_customer_id || "").trim();
	const amount = Number(amountUsd || WHATSAPP_MESSAGE_PRICE_USD);

	if (!stripe || !customerId || amount <= 0) {
		return { ok: false, reason: "stripe_not_ready" };
	}

	if (String(shopRecord?.billing_mode || "") !== "stripe") {
		return { ok: false, reason: "not_stripe_billing" };
	}

	if (String(shopRecord?.billing_status || "").toLowerCase() !== "active") {
		return { ok: false, reason: "billing_inactive" };
	}

	const amountCents = Math.max(1, Math.round(amount * 100));

	try {
		await stripe.invoiceItems.create({
			customer: customerId,
			amount: amountCents,
			currency: "usd",
			description: "WhatsApp Try On Marketing — mensagem entregue",
			metadata: {
				store_key: String(storeKey || ""),
				wamid: String(wamid || ""),
				type: "whatsapp_message",
				platform: "nuvemshop",
			},
		});

		const invoice = await stripe.invoices.create({
			customer: customerId,
			auto_advance: true,
			collection_method: "charge_automatically",
			metadata: {
				store_key: String(storeKey || ""),
				type: "whatsapp_message",
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
		return {
			ok: paid,
			invoiceId: paidInvoice.id,
			status: paidInvoice.status,
			amount,
		};
	} catch (error) {
		return {
			ok: false,
			reason: "stripe_error",
			error: String(error?.message || "stripe_whatsapp_billing_failed"),
		};
	}
}

/**
 * Processa eventos pending em whatsapp_message_billing_events para lojas Nuvemshop.
 */
export async function processPendingWhatsappMessageBilling({
	supabaseRequest,
	storeKey = null,
}) {
	if (!supabaseRequest) {
		throw new Error("supabaseRequest is required");
	}

	let path =
		"/rest/v1/whatsapp_message_billing_events?select=*&billing_status=eq.pending&store_platform=eq.nuvemshop&order=created_at.asc&limit=50";
	if (storeKey) {
		path += `&store_key=eq.${encodeURIComponent(storeKey)}`;
	}

	const events = await supabaseRequest(path);
	if (!events?.length) {
		return { processed: 0, billed: 0, failed: 0 };
	}

	let billed = 0;
	let failed = 0;

	for (const event of events) {
		const key = event.store_key;
		try {
			const shops = await supabaseRequest(
				`/rest/v1/shopify_shops?shop_domain=eq.${encodeURIComponent(key)}&select=shop_domain,billing_status,billing_mode,stripe_customer_id,plan&limit=1`,
			);
			const shop = Array.isArray(shops) ? shops[0] : null;

			if (
				!shop?.stripe_customer_id ||
				String(shop.billing_status || "").toLowerCase() !== "active" ||
				String(shop.billing_mode || "") !== "stripe"
			) {
				await supabaseRequest(
					`/rest/v1/whatsapp_message_billing_events?id=eq.${encodeURIComponent(event.id)}`,
					{
						method: "PATCH",
						body: JSON.stringify({
							billing_status: "skipped",
							error_reason: "no_stripe_customer_or_inactive_billing",
						}),
					},
				);
				continue;
			}

			const charge = await chargeStripeWhatsappMessage({
				shopRecord: shop,
				amountUsd: Number(event.amount_usd || WHATSAPP_MESSAGE_PRICE_USD),
				storeKey: key,
				wamid: event.wamid,
			});

			if (!charge.ok || !charge.invoiceId) {
				throw new Error(charge.error || charge.reason || "stripe_charge_failed");
			}

			await supabaseRequest(
				`/rest/v1/whatsapp_message_billing_events?id=eq.${encodeURIComponent(event.id)}`,
				{
					method: "PATCH",
					body: JSON.stringify({
						billing_status: "billed",
						shopify_usage_record_id: charge.invoiceId,
						billed_at: new Date().toISOString(),
					}),
				},
			);
			billed++;
		} catch (err) {
			console.error("[WhatsApp Billing Nuvemshop]", key, err);
			await supabaseRequest(
				`/rest/v1/whatsapp_message_billing_events?id=eq.${encodeURIComponent(event.id)}`,
				{
					method: "PATCH",
					body: JSON.stringify({
						billing_status: "failed",
						error_reason: err instanceof Error ? err.message : "billing_failed",
					}),
				},
			);
			failed++;
		}
	}

	return { processed: events.length, billed, failed };
}
