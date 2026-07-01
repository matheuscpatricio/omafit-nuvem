import { createHmac, timingSafeEqual } from "crypto";

const MAX_SKEW_SEC = 300;

export function getWidgetCatalogSecret() {
	return (
		process.env.WIDGET_CATALOG_HMAC_SECRET ||
		process.env.OMAFIT_WIDGET_HMAC_SECRET ||
		""
	).trim();
}

function hmacHex(secret, payload) {
	return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function safeEqual(a, b) {
	const ba = Buffer.from(a, "utf8");
	const bb = Buffer.from(b, "utf8");
	if (ba.length !== bb.length) return false;
	return timingSafeEqual(ba, bb);
}

export function verifyCatalogSearchSignature(params, { shopDomain, publicId, timestamp, signature }) {
	const secret = getWidgetCatalogSecret();
	if (!secret || !signature || !shopDomain || !publicId || !timestamp) {
		return { ok: false, reason: "missing_params" };
	}
	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SEC) {
		return { ok: false, reason: "timestamp_skew" };
	}

	const pairs = [
		["shop_domain", String(shopDomain)],
		["public_id", String(publicId)],
		["timestamp", String(timestamp)],
		["collection_type", String(params.collection_type || "")],
		["exclude_handle", String(params.exclude_handle || "")],
		["product_name", String(params.product_name || "")],
		["user_message", String(params.user_message || "")],
		["shopper_gender", String(params.shopper_gender || "")],
		["chart_gender_scope", String(params.chart_gender_scope || "")],
		["collection_handles", String(params.collection_handles || "")],
	];
	const canonical = pairs.map(([k, v]) => `${k}=${v}`).join("|");
	const expected = hmacHex(secret, canonical);
	if (!safeEqual(expected, String(signature).trim())) {
		return { ok: false, reason: "bad_signature" };
	}
	return { ok: true };
}

export function verifyProductByHandleSignature({ shopDomain, publicId, handle, timestamp, signature }) {
	const secret = getWidgetCatalogSecret();
	if (!secret || !signature || !shopDomain || !publicId || !handle || !timestamp) {
		return { ok: false, reason: "missing_params" };
	}
	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SEC) {
		return { ok: false, reason: "timestamp_skew" };
	}
	const canonical = [
		`shop_domain=${shopDomain}`,
		`public_id=${publicId}`,
		`handle=${handle}`,
		`timestamp=${timestamp}`,
	].join("|");
	const expected = hmacHex(secret, canonical);
	if (!safeEqual(expected, String(signature).trim())) {
		return { ok: false, reason: "bad_signature" };
	}
	return { ok: true };
}

export function verifySuggestionEventSignature(params, { shopDomain, publicId, timestamp, signature }) {
	const secret = getWidgetCatalogSecret();
	if (!secret || !signature || !shopDomain || !publicId || !timestamp) {
		return { ok: false, reason: "missing_params" };
	}
	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SEC) {
		return { ok: false, reason: "timestamp_skew" };
	}
	const canonical = [
		`shop_domain=${shopDomain}`,
		`public_id=${publicId}`,
		`timestamp=${timestamp}`,
		`event=${String(params.event || "")}`,
		`impression_id=${String(params.impression_id || "")}`,
		`anchor_handle=${String(params.anchor_handle || "")}`,
		`suggested_handle=${String(params.suggested_handle || "")}`,
		`suggested_handles=${String(params.suggested_handles || "")}`,
	].join("|");
	const expected = hmacHex(secret, canonical);
	if (!safeEqual(expected, String(signature).trim())) {
		return { ok: false, reason: "bad_signature" };
	}
	return { ok: true };
}
