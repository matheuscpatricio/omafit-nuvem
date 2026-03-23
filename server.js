import { createServer } from "http";
import {
	createReadStream,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "fs";
import { createHash, createHmac, randomUUID } from "crypto";
import { extname, join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT || 8080);
const DIST_DIR = join(__dirname, "dist");
const DATA_DIR = join(__dirname, ".omafit-data");
const SESSIONS_FILE = join(DATA_DIR, "nuvemshop-sessions.json");
const WEBHOOK_EVENTS = [
	"app/uninstalled",
	"app/suspended",
	"app/resumed",
	"order/paid",
	"subscription/updated",
];

const MIME_TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".webmanifest": "application/manifest+json",
};

const CSP_HEADER =
	"frame-ancestors 'self' *.mitiendanube.com:* *.lojavirtualnuvem.com.br:* cirrus.tiendanube.com:* *.tiendanube.com:* *.nuvemshop.com.br:* tn.panel.vici.la platform.twitter.com:* ct.pinterest.com:* *.pintergration.com:* bat.bing.com:* dev.visualwebsiteoptimizer.com:* *.doubleclick.net:* *.getbeamer.com:* *.myperfit.net:* *.mercadolibre.com:* *.cloudflare.com:*";

function loadEnvFiles() {
	const envCandidates = [".env.local", ".env"];
	for (const fileName of envCandidates) {
		const fullPath = join(__dirname, fileName);
		if (!existsSync(fullPath)) continue;
		const content = readFileSync(fullPath, "utf8");
		for (const rawLine of content.split(/\r?\n/)) {
			const line = rawLine.trim();
			if (!line || line.startsWith("#")) continue;
			const separatorIndex = line.indexOf("=");
			if (separatorIndex <= 0) continue;
			const key = line.slice(0, separatorIndex).trim();
			const rawValue = line.slice(separatorIndex + 1).trim();
			const value = rawValue.replace(/^['"]|['"]$/g, "");
			if (!(key in process.env)) {
				process.env[key] = value;
			}
		}
	}
}

loadEnvFiles();

function ensureDataDir() {
	mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonFile(path, fallback) {
	try {
		if (!existsSync(path)) return fallback;
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (_error) {
		return fallback;
	}
}

function writeJsonFile(path, value) {
	ensureDataDir();
	writeFileSync(path, JSON.stringify(value, null, 2));
}

function readSessions() {
	return readJsonFile(SESSIONS_FILE, {});
}

function saveSessions(sessions) {
	writeJsonFile(SESSIONS_FILE, sessions);
}

function getCanonicalShopKey(storeId) {
	return `nuvemshop/${String(storeId || "").trim()}`;
}

function normalizeStoreUrl(storeUrl) {
	if (!storeUrl) return "";
	return String(storeUrl).replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function normalizeSession(session) {
	if (!session) return null;
	const storeId = String(session.storeId || session.userId || session.store?.id || "").trim();
	if (!storeId) return null;
	return {
		storeId,
		accessToken: session.accessToken || session.access_token || "",
		scope: session.scope || "",
		tokenType: session.tokenType || session.token_type || "bearer",
		createdAt: session.createdAt || new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		lastSyncAt: session.lastSyncAt || null,
		webhooksSyncedAt: session.webhooksSyncedAt || null,
		store: session.store || null,
	};
}

function getSession(storeId) {
	const sessions = readSessions();
	return normalizeSession(sessions[String(storeId || "").trim()]);
}

function persistSession(session) {
	const normalized = normalizeSession(session);
	if (!normalized) return null;
	const sessions = readSessions();
	sessions[normalized.storeId] = normalized;
	saveSessions(sessions);
	return normalized;
}

function deleteSession(storeId) {
	const key = String(storeId || "").trim();
	if (!key) return;
	const sessions = readSessions();
	delete sessions[key];
	saveSessions(sessions);
}

function getPublicBaseUrl(req) {
	const envUrl =
		process.env.NUVEMSHOP_APP_URL ||
		process.env.APP_URL ||
		process.env.PUBLIC_APP_URL ||
		"";
	if (envUrl) return envUrl.replace(/\/+$/, "");
	const host = req.headers.host || `localhost:${PORT}`;
	return `http://${host}`;
}

function getWidgetBaseUrl(req) {
	return `${getPublicBaseUrl(req).replace(/\/+$/, "")}/widget.html`;
}

function getSupportUrl() {
	return process.env.OMAFIT_SUPPORT_URL || "mailto:contato@omafit.co";
}

function getSupportEmail() {
	return process.env.OMAFIT_SUPPORT_EMAIL || "contato@omafit.co";
}

function getAppName() {
	return process.env.OMAFIT_APP_NAME || "Omafit";
}

function getNuvemshopAppId() {
	return process.env.NUVEMSHOP_APP_ID || process.env.NUVEMSHOP_CLIENT_ID || "";
}

function isValidNuvemshopApiHost(value) {
	try {
		const url = new URL(value);
		return /(^|\.)api\.nuvemshop\.com\.br$|(^|\.)api\.tiendanube\.com$/.test(url.hostname);
	} catch (_error) {
		return false;
	}
}

function getApiBase() {
	const candidate = (
		process.env.NUVEMSHOP_API_BASE_URL ||
		process.env.TIENDANUBE_API_BASE_URL ||
		"https://api.nuvemshop.com.br/2025-03"
	).replace(/\/+$/, "");
	return isValidNuvemshopApiHost(candidate)
		? candidate
		: "https://api.nuvemshop.com.br/2025-03";
}

function isValidNuvemshopHost(value) {
	try {
		const url = new URL(value);
		return /(^|\.)nuvemshop\.com\.br$|(^|\.)tiendanube\.com$/.test(url.hostname);
	} catch (_error) {
		return false;
	}
}

function getAuthorizeBase() {
	const candidate = (
		process.env.NUVEMSHOP_AUTHORIZE_BASE_URL ||
		"https://www.nuvemshop.com.br"
	).replace(/\/+$/, "");
	return isValidNuvemshopHost(candidate)
		? candidate
		: "https://www.nuvemshop.com.br";
}

function getTokenEndpoint() {
	const candidate = (
		process.env.NUVEMSHOP_TOKEN_URL ||
		"https://www.nuvemshop.com.br/apps/authorize/token"
	).replace(/\/+$/, "");
	return isValidNuvemshopHost(candidate)
		? candidate
		: "https://www.nuvemshop.com.br/apps/authorize/token";
}

function getWebhookPublicBaseUrl(req) {
	const explicit = (
		process.env.NUVEMSHOP_WEBHOOK_BASE_URL ||
		process.env.PUBLIC_WEBHOOK_URL ||
		getPublicBaseUrl(req)
	).replace(/\/+$/, "");
	if (!explicit.startsWith("https://")) return null;
	return explicit;
}

function readRequestBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}

async function readJsonBody(req) {
	const raw = await readRequestBody(req);
	if (!raw.length) return {};
	return JSON.parse(raw.toString("utf8"));
}

function sendJson(res, status, payload) {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(payload));
}

function sendDebugLog(location, message, data, runId, hypothesisId) {
	fetch("http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Debug-Session-Id": "b68c2f",
		},
		body: JSON.stringify({
			sessionId: "b68c2f",
			location,
			message,
			data,
			timestamp: Date.now(),
			runId,
			hypothesisId,
		}),
	}).catch(() => {});
}

function sendText(res, status, payload) {
	res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
	res.end(payload);
}

function setCommonHeaders(res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
	res.setHeader(
		"Access-Control-Allow-Headers",
		"Content-Type, x-omafit-store-id, x-omafit-store-url, x-linkedstore-hmac-sha256",
	);
	res.setHeader("Content-Security-Policy", CSP_HEADER);
}

function getRequestStoreContext(reqUrl, req) {
	const storeId =
		reqUrl.searchParams.get("store_id") ||
		req.headers["x-omafit-store-id"] ||
		reqUrl.searchParams.get("user_id") ||
		"";
	const storeUrl =
		reqUrl.searchParams.get("store_url") ||
		req.headers["x-omafit-store-url"] ||
		reqUrl.searchParams.get("store_domain") ||
		"";
	return {
		storeId: String(storeId || "").trim(),
		storeUrl: normalizeStoreUrl(storeUrl),
		shopKey: getCanonicalShopKey(storeId),
	};
}

function toLocalizedValue(value, language = "pt") {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value !== "object") return String(value);
	return (
		value[language] ||
		value.pt ||
		value["pt-BR"] ||
		value.es ||
		value.en ||
		Object.values(value).find(Boolean) ||
		""
	);
}

function parseSupabaseError(text) {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch (_error) {
		return { message: text };
	}
}

function getSupabaseConfig() {
	const url = (
		process.env.SUPABASE_URL ||
		process.env.VITE_SUPABASE_URL ||
		""
	).replace(/\/+$/, "");
	const serviceKey =
		process.env.SUPABASE_SERVICE_ROLE_KEY ||
		process.env.SUPABASE_SERVICE_KEY ||
		"";
	const anonKey =
		process.env.SUPABASE_ANON_KEY ||
		process.env.VITE_SUPABASE_ANON_KEY ||
		"";
	if (!url || (!serviceKey && !anonKey)) return null;
	return {
		url,
		key: serviceKey || anonKey,
		hasServiceRole: Boolean(serviceKey),
	};
}

async function supabaseRequest(path, options = {}) {
	const config = getSupabaseConfig();
	if (!config) {
		throw new Error("Supabase not configured");
	}
	const response = await fetch(`${config.url}/rest/v1/${path}`, {
		...options,
		headers: {
			apikey: config.key,
			Authorization: `Bearer ${config.key}`,
			"Content-Type": "application/json",
			...(options.headers || {}),
		},
	});
	return response;
}

async function supabaseFunctionRequest(path, options = {}) {
	const config = getSupabaseConfig();
	if (!config) {
		throw new Error("Supabase not configured");
	}
	const headers = {
		apikey: config.key,
		Authorization: `Bearer ${config.key}`,
		...(options.headers || {}),
	};
	if (!headers["Content-Type"] && options.body && !Buffer.isBuffer(options.body)) {
		headers["Content-Type"] = "application/json";
	}
	return fetch(`${config.url}/functions/v1/${path.replace(/^\/+/, "")}`, {
		...options,
		headers,
	});
}

async function supabaseSelectFirst(path) {
	const response = await supabaseRequest(path, { method: "GET" });
	if (!response.ok) return null;
	const rows = await response.json().catch(() => []);
	return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function supabaseSelectAll(path) {
	const response = await supabaseRequest(path, { method: "GET" });
	if (!response.ok) return [];
	const rows = await response.json().catch(() => []);
	return Array.isArray(rows) ? rows : [];
}

async function supabaseRpc(functionName, payload = {}) {
	const response = await supabaseRequest(`rpc/${functionName}`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(parseSupabaseError(text)?.message || `RPC ${functionName} failed`);
	}
	return response.json().catch(() => null);
}

async function supabaseUpsert(table, payload) {
	const response = await supabaseRequest(table, {
		method: "POST",
		headers: {
			Prefer: "resolution=merge-duplicates,return=representation",
		},
		body: JSON.stringify(payload),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(parseSupabaseError(text)?.message || `Supabase upsert failed for ${table}`);
	}
	return response.json().catch(() => []);
}

async function supabaseDelete(path) {
	const response = await supabaseRequest(path, { method: "DELETE" });
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(parseSupabaseError(text)?.message || "Supabase delete failed");
	}
	return true;
}

function getPlanCatalog() {
	return [
		{
			id: "ondemand",
			name: "On demand",
			description: "Ideal para testes e operacao inicial.",
			imagesIncluded: 50,
			pricePerExtraImage: 0.18,
			currency: "BRL",
		},
		{
			id: "growth",
			name: "Growth",
			description: "Para lojas com operacao recorrente do widget.",
			imagesIncluded: 500,
			pricePerExtraImage: 0.12,
			currency: "BRL",
		},
		{
			id: "professional",
			name: "Professional",
			description: "Maior capacidade e governanca para catalogos grandes.",
			imagesIncluded: 1500,
			pricePerExtraImage: 0.08,
			currency: "BRL",
		},
	];
}

function getPlanDefinition(planId) {
	return getPlanCatalog().find((plan) => plan.id === planId) || getPlanCatalog()[0];
}

async function loadLegacyShopRecord(storeId, storeUrl = "") {
	const shopKey = getCanonicalShopKey(storeId);
	const normalizedUrl = normalizeStoreUrl(storeUrl);
	const candidates = [
		`platform_shops?store_id=eq.${encodeURIComponent(storeId)}&select=*`,
		`platform_shops?shop_key=eq.${encodeURIComponent(shopKey)}&select=*`,
		`nuvemshop_shops?store_id=eq.${encodeURIComponent(storeId)}&select=*`,
		`shopify_shops?shop_domain=eq.${encodeURIComponent(shopKey)}&select=*`,
	];
	if (normalizedUrl) {
		candidates.unshift(
			`platform_shops?store_url=eq.${encodeURIComponent(normalizedUrl)}&select=*`,
			`nuvemshop_shops?store_url=eq.${encodeURIComponent(normalizedUrl)}&select=*`,
			`shopify_shops?shop_domain=eq.${encodeURIComponent(normalizedUrl)}&select=*`,
		);
	}
	for (const candidate of candidates) {
		try {
			const row = await supabaseSelectFirst(candidate);
			if (row) return row;
		} catch (_error) {
			// keep trying compatible tables
		}
	}
	return null;
}

async function ensureShopifyCompatShop(storeId, storeUrl = "", shopRecord = null) {
	const normalizedDomain = normalizeStoreUrl(storeUrl);
	if (!storeId || !normalizedDomain) return null;
	const sourceRecord = shopRecord || (await loadLegacyShopRecord(storeId, storeUrl));
	const currentPlan = String(sourceRecord?.plan || "ondemand").toLowerCase();
	const planDef = getPlanDefinition(currentPlan);
	// #region agent log
	sendDebugLog(
		"server.js:497",
		"ensureShopifyCompatShop_start",
		{
			storeId,
			normalizedDomain,
			hasShopRecord: Boolean(sourceRecord),
			sourcePlan: currentPlan,
			sourceBillingStatus: String(sourceRecord?.billing_status || "active").toLowerCase(),
		},
		"initial",
		"H1",
	);
	// #endregion
	const payloadVariants = [
		{
			shop_domain: normalizedDomain,
			plan: currentPlan,
			billing_status: String(sourceRecord?.billing_status || "active").toLowerCase(),
			images_included: Number(sourceRecord?.images_included ?? planDef.imagesIncluded),
			images_used_month: Number(sourceRecord?.images_used_month ?? 0),
			price_per_extra_image: Number(
				sourceRecord?.price_per_extra_image ?? planDef.pricePerExtraImage,
			),
			currency: String(sourceRecord?.currency || planDef.currency || "BRL"),
			billing_cycle_end: sourceRecord?.billing_cycle_end || "2099-12-31T23:59:59.000Z",
			updated_at: new Date().toISOString(),
		},
		{
			shop_domain: normalizedDomain,
			plan: currentPlan,
			billing_status: String(sourceRecord?.billing_status || "active").toLowerCase(),
			images_included: Number(sourceRecord?.images_included ?? planDef.imagesIncluded),
			images_used_month: Number(sourceRecord?.images_used_month ?? 0),
			price_per_extra_image: Number(
				sourceRecord?.price_per_extra_image ?? planDef.pricePerExtraImage,
			),
			currency: String(sourceRecord?.currency || planDef.currency || "BRL"),
			updated_at: new Date().toISOString(),
		},
	];

	for (let index = 0; index < payloadVariants.length; index += 1) {
		const payload = payloadVariants[index];
		try {
			const rows = await supabaseUpsert("shopify_shops", [
				payload,
			]);
			// #region agent log
			sendDebugLog(
				"server.js:540",
				"ensureShopifyCompatShop_success",
				{
					storeId,
					normalizedDomain,
					attemptIndex: index,
					returnedShopDomain: rows?.[0]?.shop_domain || null,
					returnedBillingStatus: rows?.[0]?.billing_status || null,
				},
				"initial",
				"H1",
			);
			// #endregion
			return Array.isArray(rows) ? rows[0] || null : null;
		} catch (error) {
			// #region agent log
			sendDebugLog(
				"server.js:555",
				"ensureShopifyCompatShop_attempt_failed",
				{
					storeId,
					normalizedDomain,
					attemptIndex: index,
					error: error?.message || "unknown",
				},
				"initial",
				"H1",
			);
			// #endregion
			// try next compatible payload shape
		}
	}

	return null;
}

async function upsertStoreRecord(session, storeData = {}) {
	const storeId = String(session?.storeId || storeData?.id || "").trim();
	if (!storeId) return null;
	const shopKey = getCanonicalShopKey(storeId);
	const normalizedDomain = normalizeStoreUrl(
		storeData.original_domain || storeData.url || storeData.domain || session?.store?.url || "",
	);
	const currentPlan = String(storeData.plan || storeData.billing_plan || "ondemand").toLowerCase();
	const planDef = getPlanDefinition(currentPlan);
	const baseRecord = {
		store_id: storeId,
		shop_key: shopKey,
		store_url: normalizedDomain,
		platform: "nuvemshop",
		platform_store_id: storeId,
		platform_store_url: normalizedDomain,
		access_token: session?.accessToken || "",
		scope: session?.scope || "",
		name: toLocalizedValue(storeData.name, storeData.admin_language || storeData.main_language || "pt"),
		email: storeData.email || storeData.contact_email || null,
		currency: storeData.main_currency || storeData.currency || planDef.currency,
		language: storeData.admin_language || storeData.main_language || storeData.language || "pt",
		plan: currentPlan,
		billing_status: storeData.billing_status || "active",
		images_included:
			Number(storeData.images_included ?? planDef.imagesIncluded) || planDef.imagesIncluded,
		images_used_month: Number(storeData.images_used_month || 0) || 0,
		free_images_used: Number(storeData.free_images_used || 0) || 0,
		price_per_extra_image:
			Number(storeData.price_per_extra_image ?? planDef.pricePerExtraImage) ||
			planDef.pricePerExtraImage,
		updated_at: new Date().toISOString(),
	};

	const attempts = [
		{
			table: "platform_shops",
			payload: [
				{
					...baseRecord,
					id: storeData.record_id || undefined,
				},
			],
		},
		{
			table: "nuvemshop_shops",
			payload: [
				{
					...baseRecord,
				},
			],
		},
		{
			table: "shopify_shops",
			payload: [
				{
					shop_domain: shopKey,
					user_id: storeId,
					store_url: normalizedDomain,
					plan: baseRecord.plan,
					billing_status: baseRecord.billing_status,
					images_included: baseRecord.images_included,
					images_used_month: baseRecord.images_used_month,
					free_images_used: baseRecord.free_images_used,
					price_per_extra_image: baseRecord.price_per_extra_image,
					currency: baseRecord.currency,
					platform: "nuvemshop",
					updated_at: baseRecord.updated_at,
				},
			],
		},
	];

	for (const attempt of attempts) {
		try {
			const rows = await supabaseUpsert(attempt.table, attempt.payload);
			if (Array.isArray(rows) && rows[0]) return rows[0];
		} catch (_error) {
			// try next compatible table
		}
	}
	return null;
}

function buildAuthUrl(state) {
	const appId = getNuvemshopAppId();
	if (!appId) return "";
	const url = new URL(`${getAuthorizeBase()}/apps/${appId}/authorize`);
	if (state) url.searchParams.set("state", state);
	return url.toString();
}

function summarizeOAuthTokenData(tokenData) {
	const payload = tokenData && typeof tokenData === "object" ? tokenData : {};
	return {
		tokenKeys: Object.keys(payload),
		hasAccessToken: Boolean(payload.access_token),
		storeIdCandidate: payload.store_id || payload.user_id || null,
		tokenType: payload.token_type || null,
		hasScope: Boolean(payload.scope),
		error: payload.error || null,
		errorDescription: payload.error_description || payload.message || null,
	};
}

async function exchangeCodeForToken(code) {
	const clientId = process.env.NUVEMSHOP_APP_ID || process.env.NUVEMSHOP_CLIENT_ID || "";
	const clientSecret =
		process.env.NUVEMSHOP_CLIENT_SECRET ||
		process.env.NUVEMSHOP_APP_SECRET ||
		"";
	if (!clientId || !clientSecret) {
		throw new Error("NUVEMSHOP_APP_ID and NUVEMSHOP_CLIENT_SECRET are required");
	}
	const response = await fetch(getTokenEndpoint(), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: "authorization_code",
			code,
		}),
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(parseSupabaseError(text)?.message || "OAuth token exchange failed");
	}
	return JSON.parse(text);
}

async function nuvemshopApi(session, path, options = {}) {
	if (!session?.accessToken || !session?.storeId) {
		throw new Error("Store not authenticated with Nuvemshop");
	}
	const normalizedPath = String(path || "").startsWith("/") ? path : `/${path}`;
	const response = await fetch(`${getApiBase()}/${session.storeId}${normalizedPath}`, {
		...options,
		headers: {
			Authentication: `bearer ${session.accessToken}`,
			"User-Agent": `${getAppName()} (${getSupportEmail()})`,
			"Content-Type": "application/json; charset=utf-8",
			...(options.headers || {}),
		},
	});
	return response;
}

async function fetchStoreInfo(session) {
	const response = await nuvemshopApi(session, "/store", { method: "GET" });
	const text = await response.text();
	if (!response.ok) {
		const details = parseSupabaseError(text);
		const error = new Error(details?.message || "Could not fetch store info");
		Object.assign(error, {
			status: response.status,
			url: response.url,
			body: text,
		});
		throw error;
	}
	return JSON.parse(text);
}

async function listCategories(session) {
	const response = await nuvemshopApi(
		session,
		"/categories?fields=id,name,handle,parent&per_page=200&page=1",
		{ method: "GET" },
	);
	const text = await response.text();
	if (!response.ok) {
		throw new Error(parseSupabaseError(text)?.message || "Could not fetch categories");
	}
	const rows = JSON.parse(text);
	const storeLanguage = session?.store?.language || "pt";
	return Array.isArray(rows)
		? rows.map((row) => ({
				id: row.id,
				handle: toLocalizedValue(row.handle, storeLanguage) || String(row.id),
				title: toLocalizedValue(row.name, storeLanguage) || `Categoria ${row.id}`,
				parent: row.parent ?? null,
		  }))
		: [];
}

async function ensureWebhooks(session, req) {
	const webhookBase = getWebhookPublicBaseUrl(req);
	if (!webhookBase) {
		return { skipped: true, reason: "Configure NUVEMSHOP_WEBHOOK_BASE_URL with HTTPS" };
	}
	let existing = [];
	try {
		const listResponse = await nuvemshopApi(session, "/webhooks?per_page=200&page=1", {
			method: "GET",
		});
		existing = listResponse.ok ? await listResponse.json().catch(() => []) : [];
	} catch (_error) {
		existing = [];
	}
	const results = [];
	for (const event of WEBHOOK_EVENTS) {
		const url = `${webhookBase}/api/webhooks/nuvemshop`;
		const alreadyExists = Array.isArray(existing)
			? existing.find((item) => item.event === event && item.url === url)
			: null;
		if (alreadyExists) {
			results.push({ event, status: "existing" });
			continue;
		}
		const createResponse = await nuvemshopApi(session, "/webhooks", {
			method: "POST",
			body: JSON.stringify({ event, url }),
		});
		results.push({
			event,
			status: createResponse.ok ? "created" : "failed",
		});
	}
	const updated = persistSession({
		...session,
		webhooksSyncedAt: new Date().toISOString(),
	});
	return { skipped: false, results, session: updated };
}

function verifyWebhookSignature(rawBody, signature) {
	const secret =
		process.env.NUVEMSHOP_CLIENT_SECRET ||
		process.env.NUVEMSHOP_APP_SECRET ||
		"";
	if (!secret || !signature) return false;
	const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
	return digest === String(signature);
}

function buildWidgetUrl(baseUrl, state, config) {
	const url = new URL(baseUrl);
	url.searchParams.set("platform", "nuvemshop");
	url.searchParams.set("store_id", String(state.store.id || ""));
	url.searchParams.set("store_domain", state.store.domain || "");
	url.searchParams.set("currency", state.store.currency || "BRL");
	if (state.product.id) url.searchParams.set("product_id", String(state.product.id));
	if (state.product.variantId) url.searchParams.set("variant_id", String(state.product.variantId));
	if (state.product.name) url.searchParams.set("product_name", state.product.name);
	if (state.product.handle) url.searchParams.set("product_handle", state.product.handle);
	if (config.primaryColor) url.searchParams.set("primary_color", config.primaryColor);
	if (config.logoUrl) url.searchParams.set("store_logo", config.logoUrl);
	return url.toString();
}

async function getWidgetConfig(storeId) {
	if (!storeId) return null;
	const shopKey = getCanonicalShopKey(storeId);
	try {
		return await supabaseSelectFirst(
			`widget_configurations?shop_domain=eq.${encodeURIComponent(shopKey)}&select=*`,
		);
	} catch (_error) {
		return null;
	}
}

async function findWidgetKeyByShopDomain(shopDomain) {
	if (!shopDomain) return null;
	try {
		const byShopDomain = await supabaseSelectFirst(
			`widget_keys?shop_domain=eq.${encodeURIComponent(shopDomain)}&select=public_id,shop_domain,is_active,created_at,updated_at&order=updated_at.desc&limit=1`,
		);
		if (byShopDomain) return byShopDomain;
		return await supabaseSelectFirst(
			`widget_keys?domain=eq.${encodeURIComponent(shopDomain)}&select=public_id,shop_domain,domain,is_active,created_at,updated_at&order=updated_at.desc&limit=1`,
		);
	} catch (_error) {
		return null;
	}
}

function generateWidgetPublicId(shopDomain = "") {
	return `wgt_pub_${createHash("sha256")
		.update(`${shopDomain}:${Date.now()}:${randomUUID()}`)
		.digest("hex")
		.slice(0, 24)}`;
}

function generateWidgetSecretKey(shopDomain = "") {
	return `wgt_${createHash("sha256")
		.update(`secret:${shopDomain}:${Date.now()}:${randomUUID()}`)
		.digest("hex")
		.slice(0, 16)}`;
}

async function createWidgetKeyFallback(shopDomain) {
	if (!shopDomain) return null;
	const publicId = generateWidgetPublicId(shopDomain);
	const timestamp = new Date().toISOString();
	const payloadVariants = [
		{
			public_id: publicId,
			shop_domain: shopDomain,
			domain: shopDomain,
			status: "active",
			is_active: true,
			name: "Default Widget Key",
			key: generateWidgetSecretKey(shopDomain),
			created_at: timestamp,
			updated_at: timestamp,
		},
		{
			public_id: publicId,
			shop_domain: shopDomain,
			status: "active",
			name: "Default Widget Key",
			key: generateWidgetSecretKey(shopDomain),
			created_at: timestamp,
			updated_at: timestamp,
		},
		{
			public_id: publicId,
			shop_domain: shopDomain,
			is_active: true,
			created_at: timestamp,
			updated_at: timestamp,
		},
	];

	for (const payload of payloadVariants) {
		try {
			const response = await supabaseRequest("widget_keys?on_conflict=shop_domain&select=public_id,shop_domain", {
				method: "POST",
				headers: {
					Prefer: "resolution=merge-duplicates,return=representation",
				},
				body: JSON.stringify([payload]),
			});
			if (!response.ok) continue;
			const rows = await response.json().catch(() => []);
			const row = Array.isArray(rows) ? rows[0] : null;
			if (row?.public_id) return row;
		} catch (_error) {
			// try next payload shape
		}
	}

	return null;
}

async function resolveWidgetPublicId(storeId, storeUrl = "") {
	const normalizedDomain = normalizeStoreUrl(storeUrl);
	const shopKey = getCanonicalShopKey(storeId);

	const directCandidates = [normalizedDomain, shopKey].filter(Boolean);
	for (const candidate of directCandidates) {
		const widgetKey = await findWidgetKeyByShopDomain(candidate);
		if (widgetKey?.public_id) {
			// #region agent log
			sendDebugLog(
				"server.js:922",
				"resolveWidgetPublicId_direct_hit",
				{
					storeId,
					normalizedDomain,
					candidate,
					publicId: widgetKey.public_id,
					widgetShopDomain: widgetKey.shop_domain || null,
					widgetDomain: widgetKey.domain || null,
				},
				"initial",
				"H2",
			);
			// #endregion
			return String(widgetKey.public_id);
		}
	}

	const shopRecord = await loadLegacyShopRecord(storeId, storeUrl);
	if (normalizedDomain) {
		await ensureShopifyCompatShop(storeId, normalizedDomain, shopRecord);
	}
	const recordCandidates = [
		shopRecord?.public_id,
		shopRecord?.shop_domain,
		shopRecord?.store_url,
		shopRecord?.platform_store_url,
	]
		.map((value) => String(value || "").trim())
		.filter(Boolean);

	for (const candidate of recordCandidates) {
		if (candidate.startsWith("wgt_pub_")) {
			// #region agent log
			sendDebugLog(
				"server.js:948",
				"resolveWidgetPublicId_record_public_id",
				{
					storeId,
					normalizedDomain,
					candidate,
				},
				"initial",
				"H2",
			);
			// #endregion
			return candidate;
		}
		const widgetKey = await findWidgetKeyByShopDomain(normalizeStoreUrl(candidate) || candidate);
		if (widgetKey?.public_id) {
			// #region agent log
			sendDebugLog(
				"server.js:963",
				"resolveWidgetPublicId_record_hit",
				{
					storeId,
					normalizedDomain,
					candidate,
					publicId: widgetKey.public_id,
					widgetShopDomain: widgetKey.shop_domain || null,
					widgetDomain: widgetKey.domain || null,
				},
				"initial",
				"H2",
			);
			// #endregion
			return String(widgetKey.public_id);
		}
	}

	const creationCandidates = [normalizedDomain, shopKey].filter(Boolean);
	for (const candidate of creationCandidates) {
		try {
			const created = await supabaseRpc("create_widget_key_for_shop", {
				shop_domain_param: candidate,
			});
			if (created?.public_id) {
				return String(created.public_id);
			}
		} catch (_error) {
			// try next candidate
		}
	}

	for (const candidate of creationCandidates) {
		const created = await createWidgetKeyFallback(candidate);
		if (created?.public_id) {
			return String(created.public_id);
		}
	}

	return "";
}

async function enrichTryonRequestBody(rawBody, contentType) {
	if (!rawBody?.length) {
		return { body: rawBody, contentType };
	}

	if (String(contentType).includes("multipart/form-data")) {
		try {
			const request = new Request("http://localhost/api/widget/tryon", {
				method: "POST",
				headers: { "Content-Type": contentType },
				body: rawBody,
			});
			const formData = await request.formData();
			const incomingPublicId = String(formData.get("public_id") || "").trim();
			if (incomingPublicId) {
				return { body: rawBody, contentType };
			}
			const storeId = String(formData.get("store_id") || "").trim();
			const shopDomain = normalizeStoreUrl(String(formData.get("shop_domain") || ""));
			const resolvedPublicId = await resolveWidgetPublicId(storeId, shopDomain);
			// #region agent log
			sendDebugLog(
				"server.js:1020",
				"enrichTryonRequestBody_multipart",
				{
					storeId,
					shopDomain,
					incomingPublicId,
					resolvedPublicId: resolvedPublicId || "",
				},
				"initial",
				"H3",
			);
			// #endregion
			if (!resolvedPublicId) {
				return { body: rawBody, contentType };
			}
			formData.set("public_id", resolvedPublicId);
			const response = new Response(formData);
			return {
				body: Buffer.from(await response.arrayBuffer()),
				contentType: response.headers.get("content-type") || contentType,
			};
		} catch (error) {
			// #region agent log
			sendDebugLog(
				"server.js:1038",
				"enrichTryonRequestBody_multipart_failed",
				{
					contentType: String(contentType || ""),
					error: error?.message || "unknown",
				},
				"initial",
				"H3",
			);
			// #endregion
			return { body: rawBody, contentType };
		}
	}

	if (String(contentType).includes("application/json")) {
		const payload = JSON.parse(rawBody.toString("utf8") || "{}");
		if (String(payload.public_id || "").trim()) {
			return { body: rawBody, contentType };
		}
		const resolvedPublicId = await resolveWidgetPublicId(
			String(payload.store_id || "").trim(),
			normalizeStoreUrl(payload.shop_domain || payload.store_domain || ""),
		);
		if (!resolvedPublicId) {
			return { body: rawBody, contentType };
		}
		payload.public_id = resolvedPublicId;
		return {
			body: Buffer.from(JSON.stringify(payload)),
			contentType: "application/json",
		};
	}

	return { body: rawBody, contentType };
}

async function saveWidgetConfig(storeId, payload) {
	const shopKey = getCanonicalShopKey(storeId);
	const record = {
		shop_domain: shopKey,
		link_text: String(payload.link_text || "Ver meu tamanho ideal"),
		store_logo: payload.store_logo ? String(payload.store_logo) : null,
		primary_color: String(payload.primary_color || "#810707"),
		widget_enabled: payload.widget_enabled !== false,
		excluded_collections: Array.isArray(payload.excluded_collections)
			? payload.excluded_collections.map((value) => String(value))
			: [],
		admin_locale: String(payload.admin_locale || "pt-BR"),
		updated_at: new Date().toISOString(),
	};
	const rows = await supabaseUpsert("widget_configurations", [record]);
	return Array.isArray(rows) ? rows[0] || record : record;
}

async function getSizeCharts(storeId) {
	if (!storeId) return [];
	const shopKey = getCanonicalShopKey(storeId);
	try {
		return await supabaseSelectAll(
			`size_charts?shop_domain=eq.${encodeURIComponent(shopKey)}&select=*`,
		);
	} catch (_error) {
		return [];
	}
}

async function saveSizeCharts(storeId, charts) {
	const shopKey = getCanonicalShopKey(storeId);
	await supabaseDelete(`size_charts?shop_domain=eq.${encodeURIComponent(shopKey)}`);
	if (!Array.isArray(charts) || charts.length === 0) return [];
	const payload = charts.map((chart) => ({
		shop_domain: shopKey,
		collection_handle: chart.collection_handle || "",
		gender: chart.gender,
		collection_type: chart.collection_type || "upper",
		collection_elasticity: chart.collection_elasticity || "structured",
		measurement_refs: Array.isArray(chart.measurement_refs)
			? chart.measurement_refs
			: ["peito", "cintura", "quadril"],
		sizes: Array.isArray(chart.sizes) ? chart.sizes : [],
	}));
	return supabaseUpsert("size_charts", payload);
}

function toUsageSummary(shopRecord) {
	const planId = String(shopRecord?.plan || "ondemand").toLowerCase();
	const planDef = getPlanDefinition(planId);
	const isOnDemand = ["ondemand", "basic", "starter", "free"].includes(planId);
	const imagesIncluded =
		Number(shopRecord?.images_included ?? planDef.imagesIncluded) || planDef.imagesIncluded;
	const freeImagesUsed = Math.min(50, Number(shopRecord?.free_images_used || 0) || 0);
	const imagesUsedMonth = Number(shopRecord?.images_used_month || 0) || 0;
	const imagesUsed = isOnDemand ? freeImagesUsed + imagesUsedMonth : imagesUsedMonth;
	const remaining = isOnDemand
		? Math.max(0, 50 - Math.min(50, imagesUsed))
		: Math.max(0, imagesIncluded - imagesUsedMonth);
	const extraImages = Math.max(0, imagesUsed - imagesIncluded);
	return {
		plan: planId,
		imagesIncluded,
		imagesUsed,
		remaining,
		extraImages,
		pricePerExtraImage:
			Number(shopRecord?.price_per_extra_image ?? planDef.pricePerExtraImage) ||
			planDef.pricePerExtraImage,
		currency: shopRecord?.currency || planDef.currency,
		percentage:
			imagesIncluded > 0 ? Math.min(100, Math.round((imagesUsed / imagesIncluded) * 100)) : 0,
	};
}

async function getBillingSummary(storeId, storeUrl = "") {
	const shopRecord = await loadLegacyShopRecord(storeId, storeUrl);
	if (!shopRecord) {
		const planDef = getPlanDefinition("ondemand");
		return {
			plan: "ondemand",
			billingStatus: "inactive",
			usage: toUsageSummary({
				plan: "ondemand",
				images_included: planDef.imagesIncluded,
				images_used_month: 0,
				price_per_extra_image: planDef.pricePerExtraImage,
				currency: planDef.currency,
			}),
			plans: getPlanCatalog(),
		};
	}
	return {
		plan: String(shopRecord.plan || "ondemand").toLowerCase(),
		billingStatus: String(shopRecord.billing_status || "active").toLowerCase(),
		usage: toUsageSummary(shopRecord),
		plans: getPlanCatalog(),
	};
}

async function saveBillingPlan(storeId, planId) {
	const planDef = getPlanDefinition(String(planId || "ondemand").toLowerCase());
	const session = getSession(storeId);
	const storeInfo = session?.store || { id: storeId };
	return upsertStoreRecord(session || { storeId }, {
		...storeInfo,
		plan: planDef.id,
		billing_status: "active",
		images_included: planDef.imagesIncluded,
		price_per_extra_image: planDef.pricePerExtraImage,
		currency: planDef.currency,
	});
}

async function loadSessionAnalytics(shopKey, storeId, sinceIso) {
	const filters = [];
	if (sinceIso) filters.push(`created_at=gte.${encodeURIComponent(sinceIso)}`);
	try {
		const rows = await supabaseSelectAll(
			`session_analytics?shop_domain=eq.${encodeURIComponent(shopKey)}&select=*${filters.length ? `&${filters.join("&")}` : ""}&order=created_at.desc&limit=500`,
		);
		if (rows.length > 0) return rows;
	} catch (_error) {
		// ignore
	}
	try {
		return await supabaseSelectAll(
			`tryon_sessions?user_id=eq.${encodeURIComponent(storeId)}&select=*&order=session_start_time.desc&limit=500`,
		);
	} catch (_error) {
		return [];
	}
}

function average(values) {
	const numeric = values.filter((value) => Number.isFinite(value));
	if (numeric.length === 0) return null;
	return numeric.reduce((total, value) => total + value, 0) / numeric.length;
}

function normalizeGender(value) {
	const normalized = String(value || "").toLowerCase();
	if (["male", "masculino", "m"].includes(normalized)) return "male";
	if (["female", "feminino", "f"].includes(normalized)) return "female";
	return null;
}

function getMeasurements(session) {
	if (!session) return null;
	let measurements = session.user_measurements || null;
	if (typeof measurements === "string") {
		try {
			measurements = JSON.parse(measurements);
		} catch (_error) {
			measurements = null;
		}
	}
	const gender = normalizeGender(measurements?.gender || session.gender);
	return {
		gender,
		height: Number(measurements?.height ?? session.height ?? NaN),
		weight: Number(measurements?.weight ?? session.weight ?? NaN),
		recommendedSize:
			measurements?.recommended_size ??
			measurements?.recommendedSize ??
			session.recommended_size ??
			null,
		bodyType:
			measurements?.body_type_index ??
			measurements?.bodyType ??
			session.body_type_index ??
			null,
		collectionHandle:
			measurements?.collection_handle ??
			measurements?.collectionHandle ??
			session.collection_handle ??
			"geral",
	};
}

async function getAnalyticsSummary(storeId, storeUrl = "", days = 30) {
	const shopKey = getCanonicalShopKey(storeId);
	const since = new Date();
	since.setDate(since.getDate() - Number(days || 30));
	const sessions = await loadSessionAnalytics(shopKey, storeId, since.toISOString());

	let shopRecord = null;
	try {
		shopRecord = await loadLegacyShopRecord(storeId, storeUrl);
	} catch (_error) {
		shopRecord = null;
	}

	const genderStats = {
		male: { heights: [], weights: [] },
		female: { heights: [], weights: [] },
	};
	const collectionCount = {};
	const sizeCount = {};
	const bodyTypeCount = {};
	const fitByCollectionGender = {};

	for (const session of sessions) {
		const measurements = getMeasurements(session);
		if (!measurements.gender) continue;
		if (Number.isFinite(measurements.height)) {
			genderStats[measurements.gender].heights.push(measurements.height);
		}
		if (Number.isFinite(measurements.weight)) {
			genderStats[measurements.gender].weights.push(measurements.weight);
		}
		const collection = String(measurements.collectionHandle || "geral");
		const size = measurements.recommendedSize ? String(measurements.recommendedSize) : null;
		const bodyType = measurements.bodyType != null ? String(measurements.bodyType) : null;
		const mapKey = `${collection}|${measurements.gender}`;
		collectionCount[collection] = (collectionCount[collection] || 0) + 1;
		if (size) sizeCount[size] = (sizeCount[size] || 0) + 1;
		if (bodyType) bodyTypeCount[bodyType] = (bodyTypeCount[bodyType] || 0) + 1;
		if (!fitByCollectionGender[mapKey]) {
			fitByCollectionGender[mapKey] = {
				collection,
				gender: measurements.gender,
				sizes: {},
				bodyTypes: {},
			};
		}
		if (size) {
			fitByCollectionGender[mapKey].sizes[size] =
				(fitByCollectionGender[mapKey].sizes[size] || 0) + 1;
		}
		if (bodyType) {
			fitByCollectionGender[mapKey].bodyTypes[bodyType] =
				(fitByCollectionGender[mapKey].bodyTypes[bodyType] || 0) + 1;
		}
	}

	const totalSessions = sessions.length;
	const usageByCollection = Object.entries(collectionCount)
		.map(([collection, count]) => ({
			collection,
			count,
			percent: totalSessions > 0 ? (count / totalSessions) * 100 : 0,
		}))
		.sort((left, right) => right.count - left.count)
		.slice(0, 5);

	const sizeDistribution = Object.entries(sizeCount)
		.map(([size, count]) => ({
			size,
			count,
			percent: totalSessions > 0 ? (count / totalSessions) * 100 : 0,
		}))
		.sort((left, right) => right.count - left.count)
		.slice(0, 8);

	const bodyTypeDistribution = Object.entries(bodyTypeCount)
		.map(([bodyType, count]) => ({
			bodyType,
			count,
			percent: totalSessions > 0 ? (count / totalSessions) * 100 : 0,
		}))
		.sort((left, right) => right.count - left.count);

	const topRecommendations = Object.values(fitByCollectionGender).map((row) => {
		const topSize = Object.entries(row.sizes).sort((left, right) => right[1] - left[1])[0];
		const topBodyType = Object.entries(row.bodyTypes).sort((left, right) => right[1] - left[1])[0];
		return {
			collection: row.collection,
			gender: row.gender,
			recommendedSize: topSize?.[0] || null,
			bodyType: topBodyType?.[0] || null,
		};
	});

	let orderMetrics = {
		ordersAfter: 0,
		omafitOrdersAfter: 0,
		omafitRevenueAfter: 0,
		returnsAfter: 0,
	};
	try {
		const rows = await supabaseSelectAll(
			`order_analytics_omafit?shop_domain=eq.${encodeURIComponent(shopKey)}&select=*`,
		);
		if (rows.length > 0) {
			orderMetrics = rows.reduce(
				(accumulator, row) => ({
					ordersAfter: accumulator.ordersAfter + 1,
					omafitOrdersAfter: accumulator.omafitOrdersAfter + 1,
					omafitRevenueAfter:
						accumulator.omafitRevenueAfter + Number(row.total ?? row.order_total ?? 0),
					returnsAfter:
						accumulator.returnsAfter + (row.is_returned || row.returned ? 1 : 0),
				}),
				orderMetrics,
			);
		}
	} catch (_error) {
		// keep default values
	}

	return {
		totalSessions,
		usage: shopRecord ? toUsageSummary(shopRecord) : toUsageSummary({ plan: "ondemand" }),
		avgByGender: {
			male: {
				height: average(genderStats.male.heights),
				weight: average(genderStats.male.weights),
			},
			female: {
				height: average(genderStats.female.heights),
				weight: average(genderStats.female.weights),
			},
		},
		usageByCollection,
		sizeDistribution,
		bodyTypeDistribution,
		topRecommendations,
		orderMetrics,
	};
}

function buildAdminContext(storeContext, session, storeRecord) {
	const billing = storeRecord ? toUsageSummary(storeRecord) : toUsageSummary({ plan: "ondemand" });
	return {
		appName: getAppName(),
		supportUrl: getSupportUrl(),
		supportEmail: getSupportEmail(),
		store: {
			id: storeContext.storeId || session?.storeId || storeRecord?.store_id || null,
			url:
				storeContext.storeUrl ||
				normalizeStoreUrl(session?.store?.url || storeRecord?.store_url || storeRecord?.shop_domain || ""),
			name: session?.store?.name || storeRecord?.name || "Loja Nuvemshop",
			currency: session?.store?.currency || storeRecord?.currency || "BRL",
			language: session?.store?.language || storeRecord?.language || "pt",
		},
		auth: {
			connected: Boolean(session?.accessToken),
			lastSyncAt: session?.lastSyncAt || null,
			webhooksSyncedAt: session?.webhooksSyncedAt || null,
			authUrl: buildAuthUrl(randomUUID()),
		},
		billing: {
			status: String(storeRecord?.billing_status || "inactive").toLowerCase(),
			plan: String(storeRecord?.plan || "ondemand").toLowerCase(),
			usage: billing,
			plans: getPlanCatalog(),
		},
	};
}

async function handleApi(req, res, reqUrl) {
	const method = req.method || "GET";
	const pathname = reqUrl.pathname;
	const storeContext = getRequestStoreContext(reqUrl, req);
	const session = getSession(storeContext.storeId);

	if (pathname === "/api/health") {
		const supabaseConfig = getSupabaseConfig();
		sendJson(res, 200, {
			ok: true,
			app: getAppName(),
			hasSupabase: Boolean(supabaseConfig),
			supabaseMode: supabaseConfig?.hasServiceRole ? "service_role" : supabaseConfig ? "anon" : "missing",
			hasOAuthConfig: Boolean(
				process.env.NUVEMSHOP_APP_ID &&
					(process.env.NUVEMSHOP_CLIENT_SECRET || process.env.NUVEMSHOP_APP_SECRET),
			),
			widgetUrl: getWidgetBaseUrl(req),
		});
		return true;
	}

	if (pathname === "/api/config") {
		sendJson(res, 200, {
			appName: getAppName(),
			appId: getNuvemshopAppId(),
			widgetUrl: getWidgetBaseUrl(req),
			supportUrl: getSupportUrl(),
			supportEmail: getSupportEmail(),
			authUrl: buildAuthUrl(randomUUID()),
		});
		return true;
	}

	if (pathname === "/api/admin/context") {
		const storeRecord = storeContext.storeId
			? await loadLegacyShopRecord(storeContext.storeId, storeContext.storeUrl)
			: null;
		sendJson(res, 200, buildAdminContext(storeContext, session, storeRecord));
		return true;
	}

	if (pathname === "/api/admin/sync" && method === "POST") {
		if (!session) {
			sendJson(res, 404, { error: "Loja nao autenticada com a Nuvemshop." });
			return true;
		}
		const storeData = await fetchStoreInfo(session);
		const normalizedSession = persistSession({
			...session,
			store: {
				id: String(storeData.id),
				name: toLocalizedValue(storeData.name, storeData.admin_language || "pt"),
				url: normalizeStoreUrl(storeData.original_domain || storeData.domains?.[0] || ""),
				language: storeData.admin_language || storeData.main_language || "pt",
				currency: storeData.main_currency || "BRL",
				country: storeData.country || "",
			},
			lastSyncAt: new Date().toISOString(),
		});
		const row = await upsertStoreRecord(normalizedSession, storeData);
		sendJson(res, 200, {
			ok: true,
			session: normalizedSession,
			store: row || storeData,
		});
		return true;
	}

	if (pathname === "/api/collections") {
		if (!session) {
			sendJson(res, 200, { collections: [] });
			return true;
		}
		try {
			const collections = await listCategories(session);
			sendJson(res, 200, { collections });
		} catch (error) {
			sendJson(res, 500, { error: error.message || "Nao foi possivel carregar categorias." });
		}
		return true;
	}

	if (pathname === "/api/widget-config") {
		if (!storeContext.storeId) {
			sendJson(res, 400, { error: "store_id is required" });
			return true;
		}
		if (method === "GET") {
			const config = await getWidgetConfig(storeContext.storeId);
			sendJson(res, 200, {
				config: config || {
					link_text: "Ver meu tamanho ideal",
					store_logo: "",
					primary_color: "#810707",
					widget_enabled: true,
					excluded_collections: [],
					admin_locale: "pt-BR",
				},
			});
			return true;
		}
		if (method === "POST") {
			try {
				const payload = await readJsonBody(req);
				const config = await saveWidgetConfig(storeContext.storeId, payload);
				sendJson(res, 200, { config });
			} catch (error) {
				sendJson(res, 500, { error: error.message || "Nao foi possivel salvar a configuracao." });
			}
			return true;
		}
	}

	if (pathname === "/api/storefront/widget-config") {
		if (!storeContext.storeId) {
			sendJson(res, 200, {
				config: null,
				widgetUrl: getWidgetBaseUrl(req),
				publicId: "",
			});
			return true;
		}
		const config = await getWidgetConfig(storeContext.storeId);
		const resolvedStoreUrl =
			storeContext.storeUrl ||
			normalizeStoreUrl(session?.store?.url || session?.store?.domain || "");
		const publicId = await resolveWidgetPublicId(storeContext.storeId, resolvedStoreUrl);
		sendJson(res, 200, {
			config,
			widgetUrl: getWidgetBaseUrl(req),
			publicId,
		});
		return true;
	}

	if (pathname === "/api/size-charts") {
		if (!storeContext.storeId) {
			sendJson(res, 400, { error: "store_id is required" });
			return true;
		}
		if (method === "GET") {
			const charts = await getSizeCharts(storeContext.storeId);
			sendJson(res, 200, { charts });
			return true;
		}
		if (method === "POST") {
			try {
				const payload = await readJsonBody(req);
				const charts = await saveSizeCharts(storeContext.storeId, payload.charts || []);
				sendJson(res, 200, { charts });
			} catch (error) {
				sendJson(res, 500, { error: error.message || "Nao foi possivel salvar as tabelas." });
			}
			return true;
		}
	}

	if (pathname === "/api/widget/tryon" && method === "POST") {
		try {
			const rawBody = await readRequestBody(req);
			const originalContentType = req.headers["content-type"] || "application/json";
			const { body, contentType } = await enrichTryonRequestBody(rawBody, originalContentType);
			const response = await supabaseFunctionRequest("tryon", {
				method: "POST",
				headers: {
					"Content-Type": contentType,
				},
				body,
			});
			const payload = await response.text();
			// #region agent log
			sendDebugLog(
				"server.js:1585",
				"tryon_proxy_response",
				{
					status: response.status,
					contentType,
					payloadSnippet: String(payload || "").slice(0, 280),
				},
				"initial",
				"H4",
			);
			// #endregion
			res.writeHead(response.status, {
				"Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
			});
			res.end(payload);
		} catch (error) {
			// #region agent log
			sendDebugLog(
				"server.js:1601",
				"tryon_proxy_exception",
				{
					error: error?.message || "unknown",
				},
				"initial",
				"H4",
			);
			// #endregion
			sendJson(res, 500, {
				error: error.message || "Nao foi possivel processar o try-on.",
			});
		}
		return true;
	}

	if (pathname.startsWith("/api/widget/tryon-status/") && method === "GET") {
		const predictionId = pathname.split("/").pop();
		if (!predictionId) {
			sendJson(res, 400, { error: "prediction_id is required" });
			return true;
		}
		try {
			const response = await supabaseFunctionRequest(
				`tryon-status/${encodeURIComponent(predictionId)}`,
				{ method: "GET" },
			);
			const payload = await response.text();
			res.writeHead(response.status, {
				"Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
			});
			res.end(payload);
		} catch (error) {
			sendJson(res, 500, {
				error: error.message || "Nao foi possivel verificar o try-on.",
			});
		}
		return true;
	}

	if (pathname === "/api/widget/validate-size" && method === "POST") {
		try {
			const rawBody = await readRequestBody(req);
			const response = await supabaseFunctionRequest("validate-size", {
				method: "POST",
				headers: {
					"Content-Type": req.headers["content-type"] || "application/json",
				},
				body: rawBody,
			});
			const payload = await response.text();
			res.writeHead(response.status, {
				"Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
			});
			res.end(payload);
		} catch (error) {
			sendJson(res, 500, {
				error: error.message || "Nao foi possivel validar o tamanho.",
			});
		}
		return true;
	}

	if (pathname === "/api/billing") {
		if (!storeContext.storeId) {
			sendJson(res, 200, {
				plan: "ondemand",
				billingStatus: "inactive",
				usage: toUsageSummary({ plan: "ondemand" }),
				plans: getPlanCatalog(),
			});
			return true;
		}
		const summary = await getBillingSummary(storeContext.storeId, storeContext.storeUrl);
		sendJson(res, 200, summary);
		return true;
	}

	if (pathname === "/api/billing/plan" && method === "POST") {
		if (!storeContext.storeId) {
			sendJson(res, 400, { error: "store_id is required" });
			return true;
		}
		const payload = await readJsonBody(req);
		try {
			const record = await saveBillingPlan(storeContext.storeId, payload.planId);
			sendJson(res, 200, { ok: true, record });
		} catch (error) {
			sendJson(res, 500, { error: error.message || "Nao foi possivel atualizar o plano." });
		}
		return true;
	}

	if (pathname === "/api/analytics/summary") {
		if (!storeContext.storeId) {
			sendJson(res, 200, {
				totalSessions: 0,
				usage: toUsageSummary({ plan: "ondemand" }),
				avgByGender: {
					male: { height: null, weight: null },
					female: { height: null, weight: null },
				},
				usageByCollection: [],
				sizeDistribution: [],
				bodyTypeDistribution: [],
				topRecommendations: [],
				orderMetrics: {
					ordersAfter: 0,
					omafitOrdersAfter: 0,
					omafitRevenueAfter: 0,
					returnsAfter: 0,
				},
			});
			return true;
		}
		try {
			const summary = await getAnalyticsSummary(
				storeContext.storeId,
				storeContext.storeUrl,
				reqUrl.searchParams.get("days") || 30,
			);
			sendJson(res, 200, summary);
		} catch (error) {
			sendJson(res, 500, { error: error.message || "Nao foi possivel carregar analytics." });
		}
		return true;
	}

	if (pathname === "/api/webhooks/nuvemshop" && method === "POST") {
		const rawBody = await readRequestBody(req);
		const signature =
			req.headers["x-linkedstore-hmac-sha256"] ||
			req.headers["http_x_linkedstore_hmac_sha256"];
		if (!verifyWebhookSignature(rawBody, signature)) {
			sendJson(res, 401, { error: "Invalid webhook signature" });
			return true;
		}
		const payload = JSON.parse(rawBody.toString("utf8") || "{}");
		const storeId = String(payload.store_id || "").trim();
		if (payload.event === "app/uninstalled" && storeId) {
			deleteSession(storeId);
		}
		if (["subscription/updated", "app/resumed"].includes(payload.event) && storeId) {
			const activeSession = getSession(storeId);
			if (activeSession) {
				await upsertStoreRecord(activeSession, {
					...activeSession.store,
					id: storeId,
					billing_status: payload.event === "app/resumed" ? "active" : "pending",
				});
			}
		}
		if (payload.event === "app/suspended" && storeId) {
			const activeSession = getSession(storeId);
			if (activeSession) {
				await upsertStoreRecord(activeSession, {
					...activeSession.store,
					id: storeId,
					billing_status: "suspended",
				});
			}
		}
		sendJson(res, 200, { ok: true });
		return true;
	}

	return false;
}

async function handleAuth(req, res, reqUrl) {
	if (reqUrl.pathname === "/auth/install") {
		const state = reqUrl.searchParams.get("state") || randomUUID();
		const authUrl = buildAuthUrl(state);
		if (!authUrl) {
			sendJson(res, 500, {
				error: "Configure NUVEMSHOP_APP_ID before starting the install flow.",
			});
			return true;
		}
		res.writeHead(302, { Location: authUrl });
		res.end();
		return true;
	}

	if (reqUrl.pathname === "/auth/callback") {
		const code = reqUrl.searchParams.get("code") || "";
		if (!code) {
			sendJson(res, 400, { error: "Missing authorization code" });
			return true;
		}
		const authDebug = {
			step: "callback_start",
			tokenEndpoint: getTokenEndpoint(),
			hasCode: Boolean(code),
		};
		try {
			const tokenData = await exchangeCodeForToken(code);
			Object.assign(authDebug, {
				step: "token_exchanged",
				tokenSummary: summarizeOAuthTokenData(tokenData),
			});
			const storeId = String(tokenData.user_id || tokenData.store_id || "").trim();
			if (!tokenData?.access_token || !storeId) {
				throw new Error("OAuth token response missing access token or store id");
			}
			const baseSession = persistSession({
				storeId,
				accessToken: tokenData.access_token,
				scope: tokenData.scope || "",
				tokenType: tokenData.token_type || "bearer",
			});
			Object.assign(authDebug, {
				step: "session_persisted",
				persistedStoreId: baseSession?.storeId || null,
			});
			const storeData = await fetchStoreInfo(baseSession);
			Object.assign(authDebug, {
				step: "store_loaded",
				storeDataId: storeData?.id || null,
			});
			const session = persistSession({
				...baseSession,
				store: {
					id: String(storeData.id),
					name: toLocalizedValue(storeData.name, storeData.admin_language || "pt"),
					url: normalizeStoreUrl(storeData.original_domain || storeData.domains?.[0] || ""),
					language: storeData.admin_language || storeData.main_language || "pt",
					currency: storeData.main_currency || "BRL",
					country: storeData.country || "",
				},
				lastSyncAt: new Date().toISOString(),
			});
			await upsertStoreRecord(session, storeData);
			await ensureWebhooks(session, req);
			const storeDomain = normalizeStoreUrl(
				storeData.original_domain || storeData.domains?.[0] || session.store?.url || "",
			);
			const appId = getNuvemshopAppId();
			const appUrl =
				storeDomain && appId
					? `https://${storeDomain}/admin/apps/${encodeURIComponent(appId)}`
					: `${getPublicBaseUrl(req)}/app.html?store_id=${encodeURIComponent(session.storeId)}&connected=1`;
			res.writeHead(302, { Location: appUrl });
			res.end();
		} catch (error) {
			sendJson(res, 500, {
				error: error.message || "Nao foi possivel concluir a autenticacao.",
				debug: {
					...authDebug,
					failedStep: authDebug.step,
					fetchStatus: error?.status || null,
					fetchUrl: error?.url || null,
					fetchBody: error?.body || null,
				},
			});
		}
		return true;
	}
	return false;
}

function serveStaticFile(reqUrl, res) {
	let urlPath = reqUrl.pathname;
	if (urlPath === "/") urlPath = "/index.html";
	if (urlPath === "/app") urlPath = "/app.html";
	if (urlPath === "/manifest.json") {
		sendText(res, 404, "Not found");
		return;
	}

	let filePath = join(DIST_DIR, urlPath);
	if (!filePath.startsWith(DIST_DIR)) {
		sendText(res, 403, "Forbidden");
		return;
	}

	try {
		const stats = statSync(filePath);
		if (stats.isDirectory()) {
			filePath = join(filePath, "index.html");
		}
		const ext = extname(filePath);
		res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
		if (ext === ".html") {
			res.setHeader("Cache-Control", "no-store");
		}
		if (ext === ".js" || ext === ".css") {
			res.setHeader("Cache-Control", "no-cache, must-revalidate");
		}
		res.writeHead(200);
		createReadStream(filePath).pipe(res);
	} catch (error) {
		if (error.code === "ENOENT") {
			sendText(res, 404, "File not found");
			return;
		}
		sendText(res, 500, "Server error");
	}
}

const server = createServer(async (req, res) => {
	const reqUrl = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);
	setCommonHeaders(res);
	console.log(`[${new Date().toISOString()}] ${req.method} ${reqUrl.pathname}`);

	if (req.method === "OPTIONS") {
		res.writeHead(200);
		res.end();
		return;
	}

	try {
		if (await handleAuth(req, res, reqUrl)) return;
		if (await handleApi(req, res, reqUrl)) return;
		serveStaticFile(reqUrl, res);
	} catch (error) {
		console.error("[Omafit] Unhandled server error:", error);
		sendJson(res, 500, {
			error: error?.message || "Internal server error",
		});
	}
});

server.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}/`);
});

