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
const TRYON_JOBS_FILE = join(DATA_DIR, "nuvemshop-tryon-jobs.json");
const BILLING_EVENTS_FILE = join(DATA_DIR, "nuvemshop-billing-events.json");
const WEBHOOK_AUDIT_FILE = join(DATA_DIR, "nuvemshop-webhook-audit.json");
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
		billingConceptCode: String(
			session.billingConceptCode || session.billing_concept_code || "",
		).trim(),
		billingServiceId: String(
			session.billingServiceId || session.billing_service_id || "",
		).trim(),
		billingNextExecution: session.billingNextExecution || session.billing_next_execution || null,
		store: session.store || null,
	};
}

function getSession(storeId) {
	const sessions = readSessions();
	return normalizeSession(sessions[String(storeId || "").trim()]);
}

async function loadNuvemshopCredential(storeId) {
	if (!storeId) return null;
	try {
		return await supabaseSelectFirst(
			`nuvemshop_credentials?store_id=eq.${encodeURIComponent(storeId)}&select=*`,
		);
	} catch (_error) {
		return null;
	}
}

async function saveNuvemshopCredential(sessionLike, storeData = {}) {
	const storeId = String(sessionLike?.storeId || storeData?.id || "").trim();
	const accessToken = String(sessionLike?.accessToken || sessionLike?.access_token || "").trim();
	if (!storeId || !accessToken) return null;
	const resolvedStoreUrl = normalizeStoreUrl(
		storeData?.original_domain ||
			storeData?.url ||
			storeData?.domain ||
			sessionLike?.store?.url ||
			"",
	);
	const payload = {
		store_id: storeId,
		access_token: accessToken,
		store_url: resolvedStoreUrl || null,
		scope: String(sessionLike?.scope || storeData?.scope || "").trim() || null,
		token_type: String(sessionLike?.tokenType || sessionLike?.token_type || "bearer").trim(),
		billing_concept_code:
			String(
				sessionLike?.billingConceptCode || sessionLike?.billing_concept_code || "",
			).trim() || null,
		billing_service_id:
			String(
				sessionLike?.billingServiceId || sessionLike?.billing_service_id || "",
			).trim() || null,
		billing_next_execution:
			sessionLike?.billingNextExecution || sessionLike?.billing_next_execution || null,
		api_url: getApiBase(),
		user_agent: `${getAppName()} (${getSupportEmail()})`,
		updated_at: new Date().toISOString(),
	};
	const existing = await loadNuvemshopCredential(storeId);
	if (existing?.id) {
		const response = await supabaseRequest(
			`nuvemshop_credentials?id=eq.${encodeURIComponent(existing.id)}&select=*`,
			{
				method: "PATCH",
				headers: {
					Prefer: "return=representation",
				},
				body: JSON.stringify(payload),
			},
		);
		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new Error(
				parseSupabaseError(text)?.message ||
					"Nao foi possivel atualizar as credenciais da Nuvemshop.",
			);
		}
		const rows = await response.json().catch(() => []);
		return Array.isArray(rows) ? rows[0] || null : null;
	}
	const rows = await supabaseUpsert("nuvemshop_credentials", [payload]);
	return Array.isArray(rows) ? rows[0] || null : null;
}

async function deleteNuvemshopCredential(storeId) {
	if (!storeId) return;
	try {
		await supabaseDelete(`nuvemshop_credentials?store_id=eq.${encodeURIComponent(storeId)}`);
	} catch (_error) {
		// ignore missing/unsupported delete failures
	}
}

function buildSessionFromNuvemshopCredential(storeId, credential, storeUrl = "", storeRecord = null) {
	if (!storeId || !credential?.access_token) return null;
	const resolvedStoreUrl = normalizeStoreUrl(
		storeUrl ||
			credential?.store_url ||
			storeRecord?.store_url ||
			storeRecord?.platform_store_url ||
			(storeRecord?.shop_domain?.includes(".") ? storeRecord.shop_domain : ""),
	);
	return normalizeSession({
		storeId,
		accessToken: credential.access_token,
		scope: credential.scope || "",
		tokenType: credential.token_type || "bearer",
		billingConceptCode: credential.billing_concept_code || "",
		billingServiceId: credential.billing_service_id || "",
		billingNextExecution: credential.billing_next_execution || null,
		lastSyncAt: credential.updated_at || null,
		store: {
			id: String(storeId),
			name: storeRecord?.name || "Loja Nuvemshop",
			url: resolvedStoreUrl,
			language: storeRecord?.language || "pt",
			currency: storeRecord?.currency || "BRL",
			country: storeRecord?.country || "",
		},
	});
}

function buildSessionFromStoreRecord(storeId, storeRecord) {
	if (!storeId || !storeRecord?.access_token) return null;
	return normalizeSession({
		storeId,
		accessToken: storeRecord.access_token,
		scope: storeRecord.scope || "",
		tokenType: storeRecord.token_type || "bearer",
		lastSyncAt: storeRecord.updated_at || null,
		store: {
			id: String(storeRecord.store_id || storeId),
			name: storeRecord.name || "Loja Nuvemshop",
			url: normalizeStoreUrl(
				storeRecord.store_url || storeRecord.platform_store_url || storeRecord.shop_domain || "",
			),
			language: storeRecord.language || "pt",
			currency: storeRecord.currency || "BRL",
			country: storeRecord.country || "",
		},
	});
}

function persistSession(session) {
	const normalized = normalizeSession(session);
	if (!normalized) return null;
	const sessions = readSessions();
	sessions[normalized.storeId] = normalized;
	saveSessions(sessions);
	return normalized;
}

function readTryonJobs() {
	return readJsonFile(TRYON_JOBS_FILE, {});
}

function saveTryonJobs(jobs) {
	writeJsonFile(TRYON_JOBS_FILE, jobs);
}

function rememberTryonJob(predictionId, payload) {
	if (!predictionId) return;
	const jobs = readTryonJobs();
	jobs[String(predictionId)] = {
		...(jobs[String(predictionId)] || {}),
		...payload,
		updatedAt: new Date().toISOString(),
	};
	saveTryonJobs(jobs);
}

function getTryonJob(predictionId) {
	const jobs = readTryonJobs();
	return jobs[String(predictionId)] || null;
}

function forgetTryonJob(predictionId) {
	const jobs = readTryonJobs();
	delete jobs[String(predictionId)];
	saveTryonJobs(jobs);
}

function readBillingEvents() {
	return readJsonFile(BILLING_EVENTS_FILE, {});
}

function saveBillingEvents(events) {
	writeJsonFile(BILLING_EVENTS_FILE, events);
}

function getBillingEvent(key) {
	const events = readBillingEvents();
	return events[String(key)] || null;
}

function rememberBillingEvent(key, payload) {
	if (!key) return;
	const events = readBillingEvents();
	events[String(key)] = {
		...(events[String(key)] || {}),
		...payload,
		updatedAt: new Date().toISOString(),
	};
	saveBillingEvents(events);
}

function readWebhookAudit() {
	return readJsonFile(WEBHOOK_AUDIT_FILE, []);
}

function appendWebhookAudit(entry) {
	const current = readWebhookAudit();
	const next = Array.isArray(current) ? current : [];
	next.unshift({
		...entry,
		recordedAt: new Date().toISOString(),
	});
	writeJsonFile(WEBHOOK_AUDIT_FILE, next.slice(0, 30));
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

function getPartnerActionToken() {
	return (
		process.env.NUVEMSHOP_CLIENT_SECRET ||
		process.env.NUVEMSHOP_APP_SECRET ||
		""
	).trim();
}

function getBillingConceptCodeFallback() {
	return String(process.env.NUVEMSHOP_BILLING_CONCEPT_CODE || "").trim();
}

function getBillingMode() {
	const mode = String(process.env.OMAFIT_BILLING_MODE || "auto").trim().toLowerCase();
	if (["nuvemshop", "self", "auto"].includes(mode)) return mode;
	return "auto";
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

function getPartnerActionBase() {
	const appId = getNuvemshopAppId();
	if (!appId) {
		throw new Error("NUVEMSHOP_APP_ID is required for billing partner actions.");
	}
	return `${getApiBase()}/apps/${encodeURIComponent(appId)}`;
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

async function supabaseStorageRequest(path, options = {}) {
	const config = getSupabaseConfig();
	if (!config) {
		throw new Error("Supabase not configured");
	}
	const normalizedPath = String(path || "").replace(/^\/+/, "");
	const headers = {
		apikey: config.key,
		Authorization: `Bearer ${config.key}`,
		...(options.headers || {}),
	};
	return fetch(`${config.url}/storage/v1/${normalizedPath}`, {
		...options,
		headers,
	});
}

async function ensureStorageBucket(bucketId) {
	const bucket = String(bucketId || "").trim();
	if (!bucket) throw new Error("bucket id is required");
	const getResponse = await supabaseStorageRequest(`bucket/${encodeURIComponent(bucket)}`, {
		method: "GET",
	});
	if (getResponse.ok) return true;
	const getBody = await getResponse.text().catch(() => "");
	const getErrorMessage = String(parseSupabaseError(getBody)?.message || "").toLowerCase();
	const missingBucket =
		getResponse.status === 404 ||
		getErrorMessage.includes("bucket not found") ||
		getErrorMessage.includes("not found");
	if (!missingBucket) {
		throw new Error(
			parseSupabaseError(getBody)?.message ||
				`Nao foi possivel verificar bucket de logos (status ${getResponse.status}).`,
		);
	}
	const createResponse = await supabaseStorageRequest("bucket", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			id: bucket,
			name: bucket,
			public: true,
			file_size_limit: "5242880",
			allowed_mime_types: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
		}),
	});
	if (!createResponse.ok) {
		const text = await createResponse.text().catch(() => "");
		throw new Error(parseSupabaseError(text)?.message || "Nao foi possivel criar bucket de logos.");
	}
	return true;
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

async function supabaseUpsert(table, payload, options = {}) {
	const tableName = String(table || "").trim();
	const onConflict = String(options?.onConflict || "").trim();
	const endpoint = onConflict
		? `${tableName}${tableName.includes("?") ? "&" : "?"}on_conflict=${encodeURIComponent(onConflict)}`
		: tableName;
	const response = await supabaseRequest(endpoint, {
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

const DEFAULT_USD_BRL_RATE = Number(
	process.env.USD_TO_BRL_RATE || process.env.NUVEMSHOP_BILLING_USD_BRL_RATE || 5.7,
);
let usdBrlRateCache = {
	value: Number.isFinite(DEFAULT_USD_BRL_RATE) && DEFAULT_USD_BRL_RATE > 0 ? DEFAULT_USD_BRL_RATE : 5.7,
	expiresAt: 0,
};

async function resolveUsdToBrlRate() {
	const envRate = Number(
		process.env.USD_TO_BRL_RATE || process.env.NUVEMSHOP_BILLING_USD_BRL_RATE || "",
	);
	if (Number.isFinite(envRate) && envRate > 0) {
		return envRate;
	}
	if (usdBrlRateCache.expiresAt > Date.now()) {
		return usdBrlRateCache.value;
	}
	const candidates = [
		"https://economia.awesomeapi.com.br/json/last/USD-BRL",
		"https://open.er-api.com/v6/latest/USD",
	];
	for (const url of candidates) {
		try {
			const response = await fetch(url);
			if (!response.ok) continue;
			const json = await response.json().catch(() => null);
			const value =
				Number(json?.USDBRL?.bid) ||
				Number(json?.rates?.BRL) ||
				0;
			if (Number.isFinite(value) && value > 0) {
				usdBrlRateCache = {
					value,
					expiresAt: Date.now() + 1000 * 60 * 60 * 12,
				};
				return value;
			}
		} catch (_error) {
			// try next source
		}
	}
	return usdBrlRateCache.value;
}

function convertUsdToBrl(value, rate = usdBrlRateCache.value) {
	return Number((Number(value || 0) * Number(rate || 1)).toFixed(2));
}

function normalizePlanId(planId) {
	const normalized = String(planId || "ondemand").toLowerCase();
	if (normalized.includes("ondemand") || normalized.includes("on-demand")) return "ondemand";
	if (normalized.includes("professional") || normalized.includes("growth") || normalized.includes("pro")) {
		return "pro";
	}
	if (["growth", "professional"].includes(normalized)) return "pro";
	if (["basic", "starter", "free"].includes(normalized)) return "ondemand";
	return normalized;
}

function getPlanCatalog() {
	const rate = usdBrlRateCache.value;
	return [
		{
			id: "ondemand",
			name: "On demand",
			description:
				"50 sessoes de try-on gratis na criacao da conta. Depois, cobranca por uso em real por sessao excedente.",
			monthlyPrice: 0,
			imagesIncluded: 50,
			pricePerExtraImage: convertUsdToBrl(0.18, rate),
			currency: "BRL",
			usdPricePerExtraImage: 0.18,
			monthlyPriceUsd: 0,
		},
		{
			id: "pro",
			name: "Pro",
			description:
				"Mensalidade em real com 3.000 sessoes de try-on incluidas. Excedente cobrado por uso em real.",
			monthlyPrice: convertUsdToBrl(300, rate),
			imagesIncluded: 3000,
			pricePerExtraImage: convertUsdToBrl(0.08, rate),
			currency: "BRL",
			usdPricePerExtraImage: 0.08,
			monthlyPriceUsd: 300,
		},
	];
}

function getPlanDefinition(planId) {
	const normalized = normalizePlanId(planId);
	return getPlanCatalog().find((plan) => plan.id === normalized) || getPlanCatalog()[0];
}

async function nuvemshopPartnerActionRequest(path, options = {}) {
	const token = getPartnerActionToken();
	if (!token) {
		throw new Error("NUVEMSHOP_CLIENT_SECRET is required for Nuvemshop billing API.");
	}
	const response = await fetch(`${getPartnerActionBase()}${path}`, {
		...options,
		headers: {
			Authentication: `bearer ${token}`,
			"User-Agent": `${getAppName()} (${getSupportEmail()})`,
			"Content-Type": "application/json; charset=utf-8",
			...(options.headers || {}),
		},
	});
	return response;
}

async function ensureNuvemshopBillingPlan(planId) {
	const planDef = getPlanDefinition(planId);
	const externalReference = `omafit-${planDef.id}-brl`;
	const body = {
		code: "BRL",
		external_reference: externalReference,
		description: planDef.description,
	};
	const patchResponse = await nuvemshopPartnerActionRequest(
		`/plans/${encodeURIComponent(externalReference)}`,
		{
			method: "PATCH",
			body: JSON.stringify(body),
		},
	);
	if (patchResponse.ok) {
		return {
			ok: true,
			externalReference,
			plan: await patchResponse.json().catch(() => body),
		};
	}
	if (patchResponse.status !== 404) {
		const text = await patchResponse.text().catch(() => "");
		throw new Error(
			parseSupabaseError(text)?.message || "Nao foi possivel atualizar o plano na Billing API.",
		);
	}
	const createResponse = await nuvemshopPartnerActionRequest("/plans", {
		method: "POST",
		body: JSON.stringify(body),
	});
	if (!createResponse.ok) {
		const text = await createResponse.text().catch(() => "");
		throw new Error(
			parseSupabaseError(text)?.message || "Nao foi possivel criar o plano na Billing API.",
		);
	}
	return {
		ok: true,
		externalReference,
		plan: await createResponse.json().catch(() => body),
	};
}

function resolveBillingIdentifiers(storeId) {
	const session = getSession(storeId);
	return {
		conceptCode:
			String(session?.billingConceptCode || getBillingConceptCodeFallback() || "").trim(),
		serviceId:
			String(session?.billingServiceId || getNuvemshopAppId() || "").trim(),
	};
}

async function discoverBillingIdentifiers(storeId, storeUrl = "", storeRecord = null) {
	const session = await resolveSession(storeId, storeUrl);
	const sourceRecord = storeRecord || (await loadLegacyShopRecord(storeId, storeUrl));
	const serviceId = String(
		session?.billingServiceId || getNuvemshopAppId() || sourceRecord?.service_id || "",
	).trim();
	const rawCandidates = [
		session?.billingConceptCode,
		getBillingConceptCodeFallback(),
		sourceRecord?.billing_concept_code,
		sourceRecord?.public_id,
		sourceRecord?.shop_domain,
	];
	const candidates = Array.from(
		new Set(
			rawCandidates
				.map((value) => String(value || "").trim())
				.filter(Boolean),
		),
	);
	const attempts = [];
	if (!serviceId || candidates.length === 0) {
		return {
			conceptCode: "",
			serviceId,
			candidateCount: candidates.length,
			attempts,
		};
	}
	for (const candidate of candidates) {
		try {
			const subscription = await getNuvemshopSubscription(candidate, serviceId);
			if (subscription?.concept_code) {
				const persisted = persistSession({
					...(session || { storeId }),
					billingConceptCode: String(subscription.concept_code || candidate),
					billingServiceId: serviceId,
					billingNextExecution: subscription?.next_execution || null,
				});
				await saveNuvemshopCredential(persisted || { storeId }).catch(() => null);
				attempts.push({ candidate, serviceId, ok: true });
				return {
					conceptCode: String(subscription.concept_code || candidate),
					serviceId,
					candidateCount: candidates.length,
					attempts,
				};
			}
			attempts.push({
				candidate,
				serviceId,
				ok: false,
				reason: "subscription_missing_concept",
			});
		} catch (error) {
			attempts.push({
				candidate,
				serviceId,
				ok: false,
				reason: String(error?.message || "subscription_lookup_failed"),
			});
		}
	}
	return {
		conceptCode: "",
		serviceId,
		candidateCount: candidates.length,
		attempts,
	};
}

async function getNuvemshopSubscription(conceptCode, serviceId) {
	const response = await nuvemshopPartnerActionRequest(
		`/concepts/${encodeURIComponent(conceptCode)}/services/${encodeURIComponent(serviceId)}/subscriptions`,
		{ method: "GET" },
	);
	const text = await response.text().catch(() => "");
	if (!response.ok) {
		throw new Error(parseSupabaseError(text)?.message || "Nao foi possivel consultar a assinatura.");
	}
	return text ? JSON.parse(text) : {};
}

async function patchNuvemshopSubscription({
	conceptCode,
	serviceId,
	planId,
	amountValue,
	amountCurrency,
}) {
	const response = await nuvemshopPartnerActionRequest(
		`/concepts/${encodeURIComponent(conceptCode)}/services/${encodeURIComponent(serviceId)}/subscriptions`,
		{
			method: "PATCH",
			body: JSON.stringify({
				amount_currency: amountCurrency,
				amount_value: amountValue,
				plan_external_id: `omafit-${normalizePlanId(planId)}-brl`,
			}),
		},
	);
	const text = await response.text().catch(() => "");
	if (!response.ok) {
		throw new Error(parseSupabaseError(text)?.message || "Nao foi possivel atualizar a assinatura.");
	}
	return text ? JSON.parse(text) : {};
}

async function createNuvemshopCharge({
	serviceId,
	conceptCode,
	externalReference,
	description,
	fromDate,
	toDate,
	amountValue,
	amountCurrency,
}) {
	const response = await nuvemshopPartnerActionRequest(
		`/services/${encodeURIComponent(serviceId)}/charges`,
		{
			method: "POST",
			body: JSON.stringify({
				external_reference: externalReference,
				description,
				from_date: fromDate,
				to_date: toDate,
				amount_value: amountValue,
				amount_currency: amountCurrency,
				concept_code: conceptCode,
			}),
		},
	);
	const text = await response.text().catch(() => "");
	if (!response.ok) {
		throw new Error(parseSupabaseError(text)?.message || "Nao foi possivel criar a cobranca extra.");
	}
	return text ? JSON.parse(text) : {};
}

function getCurrentBillingWindow(shopRecord, subscription = null) {
	const start = new Date(shopRecord?.billing_cycle_start || Date.now());
	const nextExecution = new Date(
		subscription?.next_execution || shopRecord?.billing_cycle_end || Date.now() + 30 * 24 * 60 * 60 * 1000,
	);
	return {
		fromDate: start.toISOString().slice(0, 10),
		toDate: nextExecution.toISOString().slice(0, 10),
		nextExecution: nextExecution.toISOString(),
	};
}

async function syncBillingStateFromSubscription(storeId, storeUrl, subscription, planOverride = "") {
	if (!storeId || !subscription) return null;
	const planId = normalizePlanId(
		planOverride || subscription?.plan?.external_reference || subscription?.plan?.id || "ondemand",
	);
	const planDef = getPlanDefinition(planId);
	const amountValue = Number(subscription?.amount_value ?? planDef.monthlyPrice) || planDef.monthlyPrice;
	const amountCurrency = String(subscription?.amount_currency || "BRL").toUpperCase();
	const session = await resolveSession(storeId, storeUrl);
	return upsertStoreRecord(session || { storeId }, {
		id: storeId,
		url: storeUrl,
		plan: planDef.id,
		billing_status: "active",
		images_included: planDef.imagesIncluded,
		price_per_extra_image: planDef.pricePerExtraImage,
		currency: amountCurrency,
		billing_cycle_start: new Date().toISOString(),
		billing_cycle_end: subscription?.next_execution || null,
		subscription_amount_value: amountValue,
	});
}

function calculateExtraUnitsForCompletedTryon(previousRecord, nextRecord, planDef) {
	const planId = normalizePlanId(nextRecord?.plan || previousRecord?.plan || planDef.id);
	if (planId === "ondemand") {
		const previousExtra = Number(previousRecord?.images_used_month || 0) || 0;
		const nextExtra = Number(nextRecord?.images_used_month || 0) || 0;
		return Math.max(0, nextExtra - previousExtra);
	}
	const previousUsed = Number(previousRecord?.images_used_month || 0) || 0;
	const nextUsed = Number(nextRecord?.images_used_month || 0) || 0;
	return Math.max(
		0,
		nextUsed - Math.max(planDef.imagesIncluded, previousUsed),
	);
}

async function recordCompletedTryonUsage(storeId, storeUrl, predictionId) {
	if (!storeId) return { ok: false, reason: "missing_store_id" };
	const eventKey = `tryon:${predictionId}`;
	if (getBillingEvent(eventKey)) {
		return { ok: true, alreadyProcessed: true };
	}

	const rate = await resolveUsdToBrlRate();
	usdBrlRateCache = {
		value: rate,
		expiresAt: Date.now() + 1000 * 60 * 60 * 12,
	};
	const shopRecord = await loadLegacyShopRecord(storeId, storeUrl);
	const planDef = getPlanDefinition(shopRecord?.plan || "ondemand");
	const updatedRecord = await upsertStoreRecord(await resolveSession(storeId, storeUrl) || { storeId }, {
		...(shopRecord || {}),
		id: storeId,
		url: storeUrl || shopRecord?.store_url || "",
		plan: planDef.id,
		currency: "BRL",
		free_images_used:
			planDef.id === "ondemand"
				? Math.min(50, (Number(shopRecord?.free_images_used || 0) || 0) + 1)
				: Number(shopRecord?.free_images_used || 0) || 0,
		images_used_month:
			planDef.id === "ondemand"
				? Math.max(0, (Number(shopRecord?.free_images_used || 0) || 0) + 1 - 50) +
					(Number(shopRecord?.images_used_month || 0) || 0)
				: (Number(shopRecord?.images_used_month || 0) || 0) + 1,
		price_per_extra_image: convertUsdToBrl(planDef.usdPricePerExtraImage || 0, rate),
	});

	const extraUnits = calculateExtraUnitsForCompletedTryon(
		shopRecord || {},
		updatedRecord || shopRecord || {},
		planDef,
	);
	const identifiers = resolveBillingIdentifiers(storeId);
	let charge = null;

	if (extraUnits > 0 && identifiers.conceptCode && identifiers.serviceId) {
		const subscription = await getNuvemshopSubscription(
			identifiers.conceptCode,
			identifiers.serviceId,
		).catch(() => null);
		const billingWindow = getCurrentBillingWindow(updatedRecord || shopRecord || {}, subscription);
		charge = await createNuvemshopCharge({
			serviceId: identifiers.serviceId,
			conceptCode: identifiers.conceptCode,
			externalReference: `omafit-${predictionId}`,
			description:
				extraUnits === 1
					? "Sessao extra de try-on Omafit"
					: `${extraUnits} sessoes extras de try-on Omafit`,
			fromDate: billingWindow.fromDate,
			toDate: billingWindow.toDate,
			amountValue: Number(
				(convertUsdToBrl(planDef.usdPricePerExtraImage || 0, rate) * extraUnits).toFixed(2),
			),
			amountCurrency: "BRL",
		}).catch((error) => ({
			error: error?.message || "charge_failed",
		}));
	}

	rememberBillingEvent(eventKey, {
		storeId,
		predictionId,
		charged: Boolean(charge && !charge.error),
		charge,
	});

	return {
		ok: true,
		charged: Boolean(charge && !charge.error),
		charge,
		record: updatedRecord,
	};
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
	const currentPlan = String(sourceRecord?.plan || "free").toLowerCase();
	const planDef = getPlanDefinition(currentPlan);
	const now = new Date();
	const cycleEnd = new Date(now);
	cycleEnd.setDate(cycleEnd.getDate() + 30);
	const payload = {
		shop_domain: normalizedDomain,
		plan: currentPlan,
		images_included: Number(sourceRecord?.images_included ?? planDef.imagesIncluded ?? 50),
		price_per_extra_image: Number(
			sourceRecord?.price_per_extra_image ?? planDef.pricePerExtraImage ?? 0.18,
		),
		currency: String(sourceRecord?.currency || planDef.currency || "BRL"),
		billing_status: String(sourceRecord?.billing_status || "active").toLowerCase(),
		billing_cycle_start: sourceRecord?.billing_cycle_start || now.toISOString(),
		billing_cycle_end: sourceRecord?.billing_cycle_end || cycleEnd.toISOString(),
		images_used_month: Number(sourceRecord?.images_used_month ?? 0),
		last_billed_images: Number(sourceRecord?.last_billed_images ?? 0),
		updated_at: now.toISOString(),
	};
	const response = await supabaseRequest(
		"shopify_shops?on_conflict=shop_domain&select=shop_domain,billing_status,plan,billing_cycle_end",
		{
			method: "POST",
			headers: {
				Prefer: "resolution=merge-duplicates,return=representation",
			},
			body: JSON.stringify([payload]),
		},
	);
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(parseSupabaseError(text)?.message || "Nao foi possivel sincronizar billing compatível.");
	}
	const rows = await response.json().catch(() => []);
	return Array.isArray(rows) ? rows[0] || null : null;
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
	const shopRecord = await loadLegacyShopRecord(storeId, storeUrl);
	if (normalizedDomain) {
		await ensureShopifyCompatShop(storeId, normalizedDomain, shopRecord);
	}

	const directCandidates = [normalizedDomain, shopKey].filter(Boolean);
	for (const candidate of directCandidates) {
		const widgetKey = await findWidgetKeyByShopDomain(candidate);
		if (widgetKey?.public_id) {
			return String(widgetKey.public_id);
		}
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
			return candidate;
		}
		const widgetKey = await findWidgetKeyByShopDomain(normalizeStoreUrl(candidate) || candidate);
		if (widgetKey?.public_id) {
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
			if (!resolvedPublicId) {
				return { body: rawBody, contentType };
			}
			formData.set("public_id", resolvedPublicId);
			const response = new Response(formData);
			return {
				body: Buffer.from(await response.arrayBuffer()),
				contentType: response.headers.get("content-type") || contentType,
			};
		} catch (_error) {
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

async function parseTryonDebugInput(rawBody, contentType) {
	const input = {
		contentType: String(contentType || ""),
		storeId: "",
		shopDomain: "",
		publicId: "",
		parseError: "",
	};
	if (!rawBody?.length) return input;
	try {
		if (String(contentType).includes("multipart/form-data")) {
			const request = new Request("http://localhost/api/widget/tryon", {
				method: "POST",
				headers: { "Content-Type": contentType },
				body: rawBody,
			});
			const formData = await request.formData();
			return {
				...input,
				storeId: String(formData.get("store_id") || "").trim(),
				shopDomain: normalizeStoreUrl(String(formData.get("shop_domain") || "")),
				publicId: String(formData.get("public_id") || "").trim(),
			};
		}
		if (String(contentType).includes("application/json")) {
			const payload = JSON.parse(rawBody.toString("utf8") || "{}");
			return {
				...input,
				storeId: String(payload.store_id || "").trim(),
				shopDomain: normalizeStoreUrl(payload.shop_domain || payload.store_domain || ""),
				publicId: String(payload.public_id || "").trim(),
			};
		}
		return input;
	} catch (error) {
		return {
			...input,
			parseError: error?.message || "unknown",
		};
	}
}

async function getWidgetKeyByPublicId(publicId) {
	if (!publicId) return null;
	try {
		return await supabaseSelectFirst(
			`widget_keys?public_id=eq.${encodeURIComponent(publicId)}&select=public_id,shop_domain,domain,user_id,status,is_active&limit=1`,
		);
	} catch (_error) {
		return null;
	}
}

async function getShopifyCompatByDomain(shopDomain) {
	if (!shopDomain) return null;
	try {
		return await supabaseSelectFirst(
			`shopify_shops?shop_domain=eq.${encodeURIComponent(shopDomain)}&select=shop_domain,billing_status,plan,billing_cycle_end&limit=1`,
		);
	} catch (_error) {
		return null;
	}
}

async function inspectWidgetPublicIdResolution(storeId, storeUrl = "") {
	const normalizedDomain = normalizeStoreUrl(storeUrl);
	const shopKey = getCanonicalShopKey(storeId);
	const directCandidates = [normalizedDomain, shopKey].filter(Boolean);
	for (const candidate of directCandidates) {
		const widgetKey = await findWidgetKeyByShopDomain(candidate);
		if (widgetKey?.public_id) {
			return {
				path: "direct",
				candidate,
				publicId: String(widgetKey.public_id),
				wouldSkipCompatSync: true,
			};
		}
	}

	const shopRecord = await loadLegacyShopRecord(storeId, storeUrl);
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
			return {
				path: "record-public-id",
				candidate,
				publicId: candidate,
				wouldSkipCompatSync: false,
			};
		}
		const widgetKey = await findWidgetKeyByShopDomain(normalizeStoreUrl(candidate) || candidate);
		if (widgetKey?.public_id) {
			return {
				path: "record-domain",
				candidate,
				publicId: String(widgetKey.public_id),
				wouldSkipCompatSync: false,
			};
		}
	}

	return {
		path: "creation-needed",
		candidate: normalizedDomain || shopKey || "",
		publicId: "",
		wouldSkipCompatSync: false,
	};
}

async function buildTryonDebugSnapshot(rawBody, contentType) {
	const incoming = await parseTryonDebugInput(rawBody, contentType);
	const resolution = await inspectWidgetPublicIdResolution(incoming.storeId, incoming.shopDomain);
	const resolvedPublicId =
		incoming.publicId ||
		(await resolveWidgetPublicId(incoming.storeId, incoming.shopDomain));
	const widgetKey = await getWidgetKeyByPublicId(resolvedPublicId);
	const widgetShopDomain =
		normalizeStoreUrl(widgetKey?.shop_domain) || normalizeStoreUrl(widgetKey?.domain);
	const requestShop = await getShopifyCompatByDomain(incoming.shopDomain);
	const widgetShop = await getShopifyCompatByDomain(widgetShopDomain);
	return {
		incoming,
		resolution,
		resolvedPublicId: resolvedPublicId || "",
		widgetKey: widgetKey
			? {
					publicId: widgetKey.public_id || "",
					shopDomain: widgetKey.shop_domain || "",
					domain: widgetKey.domain || "",
					hasUserId: Boolean(widgetKey.user_id),
					status: widgetKey.status || "",
					isActive: widgetKey.is_active ?? null,
			  }
			: null,
		requestShop: requestShop
			? {
					shopDomain: requestShop.shop_domain || "",
					billingStatus: requestShop.billing_status || "",
					plan: requestShop.plan || "",
			  }
			: null,
		widgetShop: widgetShop
			? {
					shopDomain: widgetShop.shop_domain || "",
					billingStatus: widgetShop.billing_status || "",
					plan: widgetShop.plan || "",
			  }
			: null,
	};
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
	const rows = await supabaseUpsert("widget_configurations", [record], {
		onConflict: "shop_domain",
	});
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
	const planId = normalizePlanId(shopRecord?.plan || "ondemand");
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
		plan: normalizePlanId(shopRecord.plan || "ondemand"),
		billingStatus: String(shopRecord.billing_status || "active").toLowerCase(),
		usage: toUsageSummary(shopRecord),
		plans: getPlanCatalog(),
	};
}

async function buildBillingDebugSnapshot(storeId, storeUrl = "") {
	const storeRecord = await loadLegacyShopRecord(storeId, storeUrl).catch(() => null);
	const credentialRecord = await loadNuvemshopCredential(storeId).catch(() => null);
	const session = await resolveSession(storeId, storeUrl).catch(() => null);
	let webhookState = {
		registered: false,
		subscriptionUpdatedWebhook: false,
		webhookCount: 0,
	};
	if (session?.accessToken && session?.storeId) {
		try {
			const response = await nuvemshopApi(session, "/webhooks?per_page=200&page=1", {
				method: "GET",
			});
			const hooks = response.ok ? await response.json().catch(() => []) : [];
			const expectedUrl = `${getWebhookPublicBaseUrl({ headers: {} }) || ""}/api/webhooks/nuvemshop`;
			const subscriptionWebhook = Array.isArray(hooks)
				? hooks.find(
						(item) =>
							item?.event === "subscription/updated" &&
							(!expectedUrl || item?.url === expectedUrl),
				  )
				: null;
			webhookState = {
				registered: Array.isArray(hooks) && hooks.length > 0,
				subscriptionUpdatedWebhook: Boolean(subscriptionWebhook),
				webhookCount: Array.isArray(hooks) ? hooks.length : 0,
			};
		} catch (error) {
			webhookState = {
				...webhookState,
				error: String(error?.message || "unknown"),
			};
		}
	}
	return {
		storeId,
		storeUrl,
		configuredAppId: String(getNuvemshopAppId() || ""),
		hasSession: Boolean(session),
		hasStoreRecord: Boolean(storeRecord),
		hasCredentialRecord: Boolean(credentialRecord),
		hasAccessToken: Boolean(session?.accessToken),
		sessionStoreId: String(session?.storeId || ""),
		sessionStoreUrl: String(session?.store?.url || ""),
		sessionBillingConceptCode: String(session?.billingConceptCode || ""),
		sessionBillingServiceId: String(session?.billingServiceId || ""),
		effectiveServiceId: String(session?.billingServiceId || getNuvemshopAppId() || ""),
		sessionWebhooksSyncedAt: session?.webhooksSyncedAt || null,
		fallbackConceptCode: String(getBillingConceptCodeFallback() || ""),
		recordPlan: String(storeRecord?.plan || ""),
		recordBillingStatus: String(storeRecord?.billing_status || ""),
		recordStoreUrl: String(storeRecord?.store_url || storeRecord?.platform_store_url || ""),
		credentialUpdatedAt: credentialRecord?.updated_at || null,
		webhookState,
		webhookAudit: readWebhookAudit()
			.filter((item) => String(item?.storeId || "") === String(storeId || ""))
			.slice(0, 5),
	};
}

async function saveBillingPlan(storeId, planId, storeUrl = "") {
	const normalizedPlanId = normalizePlanId(planId || "ondemand");
	const planDef = getPlanDefinition(normalizedPlanId);
	const requestedStoreUrl = normalizeStoreUrl(storeUrl);
	const storeRecord = await loadLegacyShopRecord(storeId, requestedStoreUrl);
	const session = await resolveSession(
		storeId,
		requestedStoreUrl || storeRecord?.store_url || storeRecord?.platform_store_url || "",
	);
	const storeInfo = session?.store || storeRecord || { id: storeId };
	let billingIdentifiers = resolveBillingIdentifiers(storeId);

	// #region agent log
	fetch("http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c", {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b68c2f" },
		body: JSON.stringify({
			sessionId: "b68c2f",
			runId: "billing-identifiers-debug",
			hypothesisId: "H1,H4,H5",
			location: "server.js:1687",
			message: "saveBillingPlan resolved billing identifiers",
			data: {
				storeId,
				planId: normalizedPlanId,
				requestedStoreUrl,
				hasStoreRecord: Boolean(storeRecord),
				hasSession: Boolean(session),
				sessionStoreId: String(session?.store?.id || ""),
				sessionStoreUrl: String(session?.store?.url || ""),
				recordStoreUrl: String(storeRecord?.store_url || storeRecord?.platform_store_url || ""),
				hasBillingConceptCode: Boolean(billingIdentifiers.conceptCode),
				hasBillingServiceId: Boolean(billingIdentifiers.serviceId),
				hasFallbackConceptCode: Boolean(getBillingConceptCodeFallback()),
				hasWebhooksSyncedAt: Boolean(session?.webhooksSyncedAt),
			},
			timestamp: Date.now(),
		}),
	}).catch(() => {});
	// #endregion

	if (!billingIdentifiers.conceptCode || !billingIdentifiers.serviceId) {
		const discovered = await discoverBillingIdentifiers(
			storeId,
			requestedStoreUrl || String(storeInfo?.url || ""),
			storeRecord,
		);
		if (discovered.conceptCode && discovered.serviceId) {
			billingIdentifiers = {
				conceptCode: discovered.conceptCode,
				serviceId: discovered.serviceId,
			};
		}
		const discoveryAttempts = discovered?.attempts || [];
		if (!billingIdentifiers.conceptCode || !billingIdentifiers.serviceId) {
		const billingMode = getBillingMode();
		const shouldUseSelfBilling = billingMode === "self" || billingMode === "auto";
		if (shouldUseSelfBilling) {
			const rate = await resolveUsdToBrlRate();
			usdBrlRateCache = {
				value: rate,
				expiresAt: Date.now() + 1000 * 60 * 60 * 12,
			};
			const pricePerExtraImageBrl = convertUsdToBrl(planDef.usdPricePerExtraImage || 0, rate);
			const desiredRecord = {
				...storeInfo,
				plan: planDef.id,
				billing_status: "active",
				images_included: planDef.imagesIncluded,
				price_per_extra_image: pricePerExtraImageBrl,
				currency: "BRL",
				billing_mode: "self",
				billing_cycle_start: new Date().toISOString(),
			};
			const domainCandidates = Array.from(
				new Set(
					[
						requestedStoreUrl,
						normalizeStoreUrl(storeInfo?.url || ""),
						normalizeStoreUrl(storeRecord?.store_url || ""),
						normalizeStoreUrl(storeRecord?.platform_store_url || ""),
						String(storeRecord?.shop_domain || "").includes(".")
							? normalizeStoreUrl(storeRecord?.shop_domain || "")
							: "",
					].filter(Boolean),
				),
			);
			for (const domain of domainCandidates) {
				try {
					const response = await supabaseRequest(
						`shopify_shops?shop_domain=eq.${encodeURIComponent(domain)}&select=*`,
						{
							method: "PATCH",
							headers: {
								Prefer: "return=representation",
							},
							body: JSON.stringify({
								plan: desiredRecord.plan,
								billing_status: desiredRecord.billing_status,
								images_included: desiredRecord.images_included,
								price_per_extra_image: desiredRecord.price_per_extra_image,
								currency: desiredRecord.currency,
								updated_at: new Date().toISOString(),
							}),
						},
					);
					if (response.ok) {
						const rows = await response.json().catch(() => []);
						if (Array.isArray(rows) && rows[0]) {
							return rows[0];
						}
					}
				} catch (_error) {
					// try next candidate
				}
			}
			return upsertStoreRecord(session || { storeId }, desiredRecord);
		}
		const error = new Error(
			"A assinatura da loja ainda nao informou o identificador de billing da Nuvemshop. Aguarde o webhook subscription/updated ou configure NUVEMSHOP_BILLING_CONCEPT_CODE.",
		);
		error.debug = await buildBillingDebugSnapshot(
			storeId,
			String(
				requestedStoreUrl ||
					session?.store?.url ||
					storeRecord?.store_url ||
					storeRecord?.platform_store_url ||
					"",
			),
		).catch(() => null);
		if (error.debug && typeof error.debug === "object") {
			error.debug.discoveryAttempts = discoveryAttempts;
		}
		// #region agent log
		fetch("http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b68c2f" },
			body: JSON.stringify({
				sessionId: "b68c2f",
				runId: "billing-identifiers-debug",
				hypothesisId: "H1,H5",
				location: "server.js:1689",
				message: "saveBillingPlan missing billing identifiers",
				data: {
					storeId,
					planId: normalizedPlanId,
				requestedStoreUrl,
					hasBillingConceptCode: Boolean(billingIdentifiers.conceptCode),
					hasBillingServiceId: Boolean(billingIdentifiers.serviceId),
					hasFallbackConceptCode: Boolean(getBillingConceptCodeFallback()),
				},
				timestamp: Date.now(),
			}),
		}).catch(() => {});
		// #endregion
		throw error;
		}
	}

	await ensureNuvemshopBillingPlan(normalizedPlanId);
	const rate = await resolveUsdToBrlRate();
	usdBrlRateCache = {
		value: rate,
		expiresAt: Date.now() + 1000 * 60 * 60 * 12,
	};
	const monthlyPriceBrl = convertUsdToBrl(planDef.monthlyPriceUsd || 0, rate);
	const pricePerExtraImageBrl = convertUsdToBrl(planDef.usdPricePerExtraImage || 0, rate);
	const subscription = await patchNuvemshopSubscription({
		conceptCode: billingIdentifiers.conceptCode,
		serviceId: billingIdentifiers.serviceId,
		planId: normalizedPlanId,
		amountValue: monthlyPriceBrl,
		amountCurrency: "BRL",
	});

	persistSession({
		...(session || { storeId }),
		billingConceptCode: billingIdentifiers.conceptCode,
		billingServiceId: billingIdentifiers.serviceId,
		billingNextExecution: subscription?.next_execution || null,
	});

	return upsertStoreRecord(session || { storeId }, {
		...storeInfo,
		plan: planDef.id,
		billing_status: "active",
		images_included: planDef.imagesIncluded,
		price_per_extra_image: pricePerExtraImageBrl,
		currency: "BRL",
		billing_cycle_start: new Date().toISOString(),
		billing_cycle_end: subscription?.next_execution || null,
	});
}

async function loadSessionAnalytics(shopKey, storeId, sinceIso, shopRecord = null, storeUrl = "") {
	const normalizedSince = String(sinceIso || "").trim();
	const userId = String(shopRecord?.user_id || "").trim();
	const normalize = (value) => String(value || "").trim().toLowerCase();
	const domainCandidates = Array.from(
		new Set(
			[
				shopKey,
				normalizeStoreUrl(storeUrl),
				normalizeStoreUrl(shopRecord?.store_url || ""),
				normalizeStoreUrl(shopRecord?.platform_store_url || ""),
				normalizeStoreUrl(shopRecord?.shop_domain || ""),
			]
				.map((value) => String(value || "").trim())
				.filter(Boolean),
		),
	);

	// 1) Shopify-like priority: user_measurements first + hydrate through tryon_sessions by ids.
	try {
		const measurementsFirst = await supabaseSelectAll(
			"user_measurements?select=*&order=updated_at.desc&limit=500",
		);
		if (Array.isArray(measurementsFirst) && measurementsFirst.length > 0) {
			const sessionIds = Array.from(
				new Set(
					measurementsFirst
						.map((item) => item?.tryon_session_id || item?.tryonSessionId)
						.filter(Boolean)
						.map((value) => String(value)),
				),
			);
			if (sessionIds.length > 0) {
				const bySessionRows = [];
				for (let index = 0; index < sessionIds.length; index += 100) {
					const chunk = sessionIds.slice(index, index + 100).join(",");
					const rows = await supabaseSelectAll(
						`tryon_sessions?id=in.(${chunk})&select=id,user_id,session_start_time,session_end_time,created_at,updated_at,shop_name`,
					).catch(() => []);
					if (Array.isArray(rows) && rows.length > 0) bySessionRows.push(...rows);
				}

				const allowedSessionIds = new Set();
				for (const row of bySessionRows) {
					if (normalizedSince) {
						const rowDate = row?.session_start_time || row?.created_at || "";
						if (rowDate && new Date(rowDate).getTime() < new Date(normalizedSince).getTime()) {
							continue;
						}
					}
					if (userId) {
						if (normalize(row?.user_id) === normalize(userId)) {
							allowedSessionIds.add(normalize(row?.id));
						}
					} else {
						allowedSessionIds.add(normalize(row?.id));
					}
				}

				if (allowedSessionIds.size > 0) {
					const groupedMeasurements = new Map();
					for (const measurement of measurementsFirst) {
						const sid = normalize(
							measurement?.tryon_session_id || measurement?.tryonSessionId || "",
						);
						if (!sid || !allowedSessionIds.has(sid)) continue;
						if (!groupedMeasurements.has(sid)) groupedMeasurements.set(sid, []);
						groupedMeasurements.get(sid).push(measurement);
					}

					const combined = [];
					for (const sessionRow of bySessionRows) {
						const sid = normalize(sessionRow?.id || "");
						if (!sid || !allowedSessionIds.has(sid)) continue;
						const measurements = groupedMeasurements.get(sid) || [];
						if (measurements.length === 0) continue;
						const latestMeasurement = measurements[measurements.length - 1];
						combined.push({
							...sessionRow,
							...latestMeasurement,
							created_at:
								sessionRow?.session_start_time ||
								sessionRow?.created_at ||
								latestMeasurement?.created_at ||
								latestMeasurement?.updated_at ||
								null,
							user_measurements: JSON.stringify(latestMeasurement),
							collection_handle:
								latestMeasurement?.collection_handle ||
								latestMeasurement?.collectionHandle ||
								"geral",
						});
					}
					if (combined.length > 0) return combined;
				}
			}
		}
	} catch (_error) {
		// fallback chain below
	}

	// 2) Secondary path: tryon_sessions scoped by user_id + user_measurements join.
	if (userId) {
		try {
			const baseFilter = normalizedSince
				? `&session_start_time=gte.${encodeURIComponent(normalizedSince)}`
				: "";
			const sessions = await supabaseSelectAll(
				`tryon_sessions?user_id=eq.${encodeURIComponent(userId)}&select=*&order=session_start_time.desc&limit=500${baseFilter}`,
			);
			if (Array.isArray(sessions) && sessions.length > 0) {
				const ids = sessions.map((item) => item?.id).filter(Boolean).map((value) => String(value));
				const bySessionMeasurement = new Map();
				for (let index = 0; index < ids.length; index += 100) {
					const chunk = ids.slice(index, index + 100).join(",");
					const rows = await supabaseSelectAll(
						`user_measurements?tryon_session_id=in.(${chunk})&select=*&order=updated_at.desc`,
					).catch(() => []);
					for (const row of rows) {
						const sid = normalize(row?.tryon_session_id || row?.tryonSessionId || "");
						if (sid && !bySessionMeasurement.has(sid)) bySessionMeasurement.set(sid, row);
					}
				}
				const combined = sessions
					.map((sessionRow) => {
						const sid = normalize(sessionRow?.id || "");
						const measurement = bySessionMeasurement.get(sid);
						if (!measurement) return null;
						return {
							...sessionRow,
							...measurement,
							created_at:
								sessionRow?.session_start_time ||
								sessionRow?.created_at ||
								measurement?.created_at ||
								measurement?.updated_at ||
								null,
							user_measurements: JSON.stringify(measurement),
							collection_handle:
								measurement?.collection_handle ||
								measurement?.collectionHandle ||
								"geral",
						};
					})
					.filter(Boolean);
				if (combined.length > 0) return combined;
			}
		} catch (_error) {
			// continue fallback
		}
	}

	// 3) Final fallback: session_analytics by shop_domain candidates (canonical + real store domain).
	const filters = [];
	if (normalizedSince) filters.push(`created_at=gte.${encodeURIComponent(normalizedSince)}`);
	if (userId) filters.unshift(`user_id=eq.${encodeURIComponent(userId)}`);
	for (const candidate of domainCandidates) {
		try {
			const rows = await supabaseSelectAll(
				`session_analytics?shop_domain=eq.${encodeURIComponent(candidate)}&select=*${filters.length ? `&${filters.join("&")}` : ""}&order=created_at.desc&limit=500`,
			);
			if (Array.isArray(rows) && rows.length > 0) return rows;
		} catch (_error) {
			// keep trying candidates
		}
	}
	return [];
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

	let shopRecord = null;
	try {
		shopRecord = await loadLegacyShopRecord(storeId, storeUrl);
	} catch (_error) {
		shopRecord = null;
	}
	const sessions = await loadSessionAnalytics(
		shopKey,
		storeId,
		since.toISOString(),
		shopRecord,
		storeUrl,
	);

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
			connected: Boolean(session?.accessToken || storeRecord?.access_token),
			lastSyncAt: session?.lastSyncAt || storeRecord?.updated_at || null,
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

async function resolveSession(storeId, storeUrl = "") {
	const localSession = getSession(storeId);
	if (localSession?.accessToken) {
		// #region agent log
		fetch("http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b68c2f" },
			body: JSON.stringify({
				sessionId: "b68c2f",
				runId: "billing-identifiers-debug",
				hypothesisId: "H5",
				location: "server.js:1970",
				message: "resolveSession returned local session",
				data: {
					storeId,
					hasAccessToken: Boolean(localSession.accessToken),
					hasBillingConceptCode: Boolean(localSession.billingConceptCode),
					hasBillingServiceId: Boolean(localSession.billingServiceId),
					hasWebhooksSyncedAt: Boolean(localSession.webhooksSyncedAt),
				},
				timestamp: Date.now(),
			}),
		}).catch(() => {});
		// #endregion
		return localSession;
	}
	if (!storeId) return localSession;

	const storeRecord = await loadLegacyShopRecord(storeId, storeUrl);
	const recoveredFromStoreRecord = buildSessionFromStoreRecord(storeId, storeRecord);
	const credentialRecord = recoveredFromStoreRecord?.accessToken
		? null
		: await loadNuvemshopCredential(storeId);
	const recoveredSession =
		recoveredFromStoreRecord ||
		buildSessionFromNuvemshopCredential(storeId, credentialRecord, storeUrl, storeRecord);
	if (!recoveredSession?.accessToken) {
		// #region agent log
		fetch("http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b68c2f" },
			body: JSON.stringify({
				sessionId: "b68c2f",
				runId: "billing-identifiers-debug",
				hypothesisId: "H4",
				location: "server.js:1975",
				message: "resolveSession could not recover session",
				data: {
					storeId,
					storeUrl,
					hasStoreRecord: Boolean(storeRecord),
					hasCredentialRecord: Boolean(credentialRecord),
					hasRecoveredSession: Boolean(recoveredSession),
				},
				timestamp: Date.now(),
			}),
		}).catch(() => {});
		// #endregion
		return localSession;
	}

	// #region agent log
	fetch("http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c", {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b68c2f" },
		body: JSON.stringify({
			sessionId: "b68c2f",
			runId: "billing-identifiers-debug",
			hypothesisId: "H5",
			location: "server.js:1977",
			message: "resolveSession rebuilt session from store record",
			data: {
				storeId,
				storeUrl,
				hasStoreRecord: Boolean(storeRecord),
				recoveredFrom: recoveredFromStoreRecord?.accessToken
					? "store_record"
					: credentialRecord?.access_token
						? "nuvemshop_credentials"
						: "unknown",
				hasRecoveredAccessToken: Boolean(recoveredSession.accessToken),
				hasRecoveredBillingConceptCode: Boolean(recoveredSession.billingConceptCode),
				hasRecoveredBillingServiceId: Boolean(recoveredSession.billingServiceId),
			},
			timestamp: Date.now(),
		}),
	}).catch(() => {});
	// #endregion

	persistSession(recoveredSession);
	return recoveredSession;
}

async function handleApi(req, res, reqUrl) {
	const method = req.method || "GET";
	const pathname = reqUrl.pathname;
	const storeContext = getRequestStoreContext(reqUrl, req);
	const session = await resolveSession(storeContext.storeId, storeContext.storeUrl);

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
		await saveNuvemshopCredential(normalizedSession, storeData);
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

	if (pathname === "/api/widget/logo-upload" && method === "POST") {
		if (!storeContext.storeId) {
			sendJson(res, 400, { error: "store_id is required" });
			return true;
		}
		try {
			const rawBody = await readRequestBody(req);
			const contentType = req.headers["content-type"] || "";
			const request = new Request("http://localhost/api/widget/logo-upload", {
				method: "POST",
				headers: { "Content-Type": contentType },
				body: rawBody,
			});
			const formData = await request.formData();
			const file = formData.get("file");
			if (!(file instanceof File)) {
				sendJson(res, 400, { error: "Arquivo de logo nao enviado." });
				return true;
			}
			const acceptedMime = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
			if (!acceptedMime.includes(file.type)) {
				sendJson(res, 400, { error: "Formato invalido. Use PNG, JPG, WEBP ou SVG." });
				return true;
			}
			if (file.size > 5 * 1024 * 1024) {
				sendJson(res, 400, { error: "Arquivo muito grande. Limite de 5MB." });
				return true;
			}
			const config = getSupabaseConfig();
			if (!config) {
				sendJson(res, 500, { error: "Supabase nao configurado para upload de logo." });
				return true;
			}
			const bucket = "widget-assets";
			await ensureStorageBucket(bucket);
			const extension = (file.name.split(".").pop() || "png").toLowerCase();
			const safeExt = /^[a-z0-9]+$/.test(extension) ? extension : "png";
			const objectPath = `nuvemshop/${encodeURIComponent(
				storeContext.storeId,
			)}/logo-${Date.now()}.${safeExt}`;
			const fileBuffer = Buffer.from(await file.arrayBuffer());
			const uploadResponse = await supabaseStorageRequest(
				`object/${bucket}/${objectPath}`,
				{
					method: "POST",
					headers: {
						"Content-Type": file.type || "application/octet-stream",
						"x-upsert": "true",
					},
					body: fileBuffer,
				},
			);
			if (!uploadResponse.ok) {
				const text = await uploadResponse.text().catch(() => "");
				sendJson(res, 500, {
					error:
						parseSupabaseError(text)?.message || "Nao foi possivel enviar o logo para o storage.",
				});
				return true;
			}
			const publicUrl = `${config.url}/storage/v1/object/public/${bucket}/${objectPath}`;
			sendJson(res, 200, { ok: true, url: publicUrl });
		} catch (error) {
			sendJson(res, 500, { error: error.message || "Nao foi possivel enviar o logo." });
		}
		return true;
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
		let tryonDebug = null;
		try {
			const rawBody = await readRequestBody(req);
			const originalContentType = req.headers["content-type"] || "application/json";
			tryonDebug = await buildTryonDebugSnapshot(rawBody, originalContentType);
			const { body, contentType } = await enrichTryonRequestBody(rawBody, originalContentType);
			const forwarded = await parseTryonDebugInput(body, contentType);
			if (tryonDebug) {
				tryonDebug.forwarded = forwarded;
			}
			const response = await supabaseFunctionRequest("tryon", {
				method: "POST",
				headers: {
					"Content-Type": contentType,
				},
				body,
			});
			const payload = await response.text();
			if (!response.ok) {
				const parsedPayload = parseSupabaseError(payload) || {};
				sendJson(res, response.status, {
					...((parsedPayload && typeof parsedPayload === "object") ? parsedPayload : {}),
					error:
						parsedPayload?.error ||
						parsedPayload?.message ||
						String(payload || "Nao foi possivel processar o try-on."),
					debug: {
						...(tryonDebug || {}),
						responseStatus: response.status,
						responseBody: String(payload || "").slice(0, 500),
					},
				});
				return true;
			}
			const parsedPayload = parseSupabaseError(payload) || {};
			if (parsedPayload?.fal_request_id) {
				rememberTryonJob(parsedPayload.fal_request_id, {
					storeId: forwarded.storeId || tryonDebug?.incoming?.storeId || "",
					storeUrl: forwarded.shopDomain || tryonDebug?.incoming?.shopDomain || "",
				});
			}
			sendJson(res, response.status, parsedPayload);
		} catch (error) {
			sendJson(res, 500, {
				error: error.message || "Nao foi possivel processar o try-on.",
				debug: tryonDebug,
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
			const parsedPayload = parseSupabaseError(payload) || {};
			if (
				response.ok &&
				parsedPayload?.status === "completed" &&
				parsedPayload?.output
			) {
				const tryonJob = getTryonJob(predictionId);
				if (tryonJob?.storeId) {
					await recordCompletedTryonUsage(
						tryonJob.storeId,
						tryonJob.storeUrl || "",
						predictionId,
					).catch(() => null);
				}
				forgetTryonJob(predictionId);
			}
			sendJson(res, response.status, parsedPayload);
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
			const record = await saveBillingPlan(
				storeContext.storeId,
				payload.planId,
				storeContext.storeUrl,
			);
			const reloadedByStoreUrl = await loadLegacyShopRecord(
				storeContext.storeId,
				storeContext.storeUrl,
			).catch(() => null);
			const reloadedByShopKey = await loadLegacyShopRecord(storeContext.storeId, "").catch(
				() => null,
			);
			sendJson(res, 200, {
				ok: true,
				record,
				debug: {
					requestedPlanId: String(payload.planId || ""),
					requestStoreUrl: storeContext.storeUrl,
					savedRecordPlan: String(record?.plan || ""),
					savedRecordShopDomain: String(record?.shop_domain || ""),
					reloadedByStoreUrlPlan: String(reloadedByStoreUrl?.plan || ""),
					reloadedByStoreUrlShopDomain: String(reloadedByStoreUrl?.shop_domain || ""),
					reloadedByShopKeyPlan: String(reloadedByShopKey?.plan || ""),
					reloadedByShopKeyShopDomain: String(reloadedByShopKey?.shop_domain || ""),
				},
			});
		} catch (error) {
			sendJson(res, 500, {
				error: error.message || "Nao foi possivel atualizar o plano.",
				debug:
					error?.debug ||
					(await buildBillingDebugSnapshot(
						storeContext.storeId,
						storeContext.storeUrl,
					).catch(() => null)),
			});
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
		let parsedForAudit = {};
		try {
			parsedForAudit = JSON.parse(rawBody.toString("utf8") || "{}");
		} catch (_error) {
			parsedForAudit = {};
		}
		const signatureValid = verifyWebhookSignature(rawBody, signature);
		appendWebhookAudit({
			event: String(parsedForAudit?.event || ""),
			storeId: String(parsedForAudit?.store_id || ""),
			signatureValid,
			hasConceptCode: Boolean(parsedForAudit?.concept_code),
			hasServiceId: Boolean(parsedForAudit?.service_id),
		});
		if (!signatureValid) {
			let invalidPayload = {};
			try {
				invalidPayload = JSON.parse(rawBody.toString("utf8") || "{}");
			} catch (_error) {
				invalidPayload = {};
			}
			// #region agent log
			fetch("http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c", {
				method: "POST",
				headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b68c2f" },
				body: JSON.stringify({
					sessionId: "b68c2f",
					runId: "billing-identifiers-debug",
					hypothesisId: "H2",
					location: "server.js:2321",
					message: "webhook rejected by signature verification",
					data: {
						event: String(invalidPayload?.event || ""),
						storeId: String(invalidPayload?.store_id || ""),
						hasSignature: Boolean(signature),
					},
					timestamp: Date.now(),
				}),
			}).catch(() => {});
			// #endregion
			sendJson(res, 401, { error: "Invalid webhook signature" });
			return true;
		}
		const payload = JSON.parse(rawBody.toString("utf8") || "{}");
		const storeId = String(payload.store_id || "").trim();
		// #region agent log
		fetch("http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b68c2f" },
			body: JSON.stringify({
				sessionId: "b68c2f",
				runId: "billing-identifiers-debug",
				hypothesisId: "H1,H3",
				location: "server.js:2326",
				message: "webhook accepted by server",
				data: {
					event: String(payload.event || ""),
					storeId,
					hasConceptCode: Boolean(payload.concept_code),
					hasServiceId: Boolean(payload.service_id),
				},
				timestamp: Date.now(),
			}),
		}).catch(() => {});
		// #endregion
		if (payload.event === "app/uninstalled" && storeId) {
			deleteSession(storeId);
			await deleteNuvemshopCredential(storeId);
		}
		if (payload.event === "subscription/updated" && storeId) {
			const currentSession = getSession(storeId);
			const persistedSession = persistSession({
				...(currentSession || { storeId }),
				billingConceptCode: String(payload.concept_code || "").trim(),
				billingServiceId: String(payload.service_id || getNuvemshopAppId() || "").trim(),
			});
			await saveNuvemshopCredential(persistedSession || currentSession || { storeId }).catch(
				() => null,
			);
			try {
				const conceptCode = String(payload.concept_code || "").trim();
				const serviceId = String(payload.service_id || getNuvemshopAppId() || "").trim();
				if (conceptCode && serviceId) {
					const subscription = await getNuvemshopSubscription(conceptCode, serviceId);
					const syncedSession = persistSession({
						...(getSession(storeId) || { storeId }),
						billingConceptCode: conceptCode,
						billingServiceId: serviceId,
						billingNextExecution: subscription?.next_execution || null,
					});
					await saveNuvemshopCredential(syncedSession || { storeId }).catch(() => null);
					await syncBillingStateFromSubscription(
						storeId,
						currentSession?.store?.url || "",
						subscription,
						subscription?.plan?.external_reference || "",
					);
					// #region agent log
					fetch("http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c", {
						method: "POST",
						headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b68c2f" },
						body: JSON.stringify({
							sessionId: "b68c2f",
							runId: "billing-identifiers-debug",
							hypothesisId: "H1,H3",
							location: "server.js:2348",
							message: "subscription webhook synced identifiers",
							data: {
								storeId,
								hasConceptCode: Boolean(conceptCode),
								hasServiceId: Boolean(serviceId),
								hasNextExecution: Boolean(subscription?.next_execution),
								planExternalReference: String(
									subscription?.plan?.external_reference || "",
								),
							},
							timestamp: Date.now(),
						}),
					}).catch(() => {});
					// #endregion
				}
			} catch (error) {
				// #region agent log
				fetch("http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c", {
					method: "POST",
					headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b68c2f" },
					body: JSON.stringify({
						sessionId: "b68c2f",
						runId: "billing-identifiers-debug",
						hypothesisId: "H3",
						location: "server.js:2355",
						message: "subscription webhook sync failed",
						data: {
							storeId,
							error: String(error?.message || "unknown"),
						},
						timestamp: Date.now(),
					}),
				}).catch(() => {});
				// #endregion
				// best effort sync
			}
		}
		if (payload.event === "app/resumed" && storeId) {
			const activeSession = getSession(storeId);
			if (activeSession) {
				await upsertStoreRecord(activeSession, {
					...activeSession.store,
					id: storeId,
					billing_status: "active",
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
			await saveNuvemshopCredential(baseSession, { id: storeId });
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
			await saveNuvemshopCredential(session, storeData);
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

