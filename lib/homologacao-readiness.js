const DEMO_STORE_ID = "6994912";
const DEMO_STORE_URL = "arrascaneta.lojavirtualnuvem.com.br";
const DEMO_STORE_THEME = "Morelia";
const PRIVACY_URL = "https://omafit.co/privacidade";

export function buildHomologacaoReadinessReport({
	baseUrl,
	storeId = DEMO_STORE_ID,
	storeUrl = DEMO_STORE_URL,
	storeTheme = DEMO_STORE_THEME,
	health = {},
	billingSnapshot = null,
	widgetConfig = null,
	widgetConfigError = null,
}) {
	const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");
	const backendReady =
		health.ok === true &&
		health.hasOAuthConfig === true &&
		health.hasSupabase === true;
	const webhooksReady = billingSnapshot?.checks?.webhooksReady === true;
	const selfBillingReady = billingSnapshot?.checks?.selfBillingReady === true;
	const hasStoreRecord = billingSnapshot?.hasStoreRecord === true;
	const storefrontSdkReady =
		widgetConfig?.storefront_sdk_enabled === true &&
		widgetConfig?.config?.widget_enabled !== false;
	const widgetUrl = String(widgetConfig?.widgetUrl || "");
	const widgetUrlOk = widgetUrl.startsWith(normalizedBase);

	const manualSteps = [
		"Manter loja demo no tema Morelia (Patagonia nao instala mais em lojas novas)",
		"Remover script legado do HTML personalizado do tema",
		"Partner Portal: script storefront = main.min.js + Uses NubeSDK ativo",
		"Publicar nova versao do app no Partner Portal",
		"Reinstalar app na loja demo e Sincronizar loja no admin Omafit",
		"Validar PDP Morelia: botao via NubeSDK, modal, try-on e cart:add",
		"Gravar video e anexar screenshots no Partner Portal",
	];

	const blockers = [];
	if (!backendReady) blockers.push("Backend incompleto (/api/health)");
	if (!webhooksReady) blockers.push("Webhooks nao registrados");
	if (!hasStoreRecord) blockers.push("Loja demo sem registro — Sincronizar loja");
	if (!selfBillingReady) {
		blockers.push(
			"Schema billing proprio incompleto — executar supabase/migrations/20260720120000_nuvemshop_self_billing.sql",
		);
	}
	if (widgetConfigError) {
		blockers.push(`widget-config (${storeTheme}): ${widgetConfigError}`);
	} else if (!storefrontSdkReady) {
		blockers.push(
			`storefront_sdk_enabled=false ou widget desativado para theme=${storeTheme}`,
		);
	}
	if (widgetConfig && !widgetUrlOk) {
		blockers.push("widgetUrl da API nao aponta para o dominio do app");
	}
	blockers.push("Artefatos Partner Portal: video, screenshots, FAQs");

	return {
		app: "Omafit Nuvemshop",
		demoStoreId: storeId,
		demoStoreUrl: storeUrl,
		demoStoreTheme: storeTheme,
		baseUrl: normalizedBase,
		readyForHomologation: blockers.filter((item) => !item.includes("Artefatos")).length === 0,
		checks: {
			backendReady,
			webhooksReady,
			hasStoreRecord,
			selfBillingReady,
			widgetConfigReady: Boolean(widgetConfig && !widgetConfigError),
			storefrontSdkEnabled: storefrontSdkReady,
			widgetEnabled: widgetConfig?.config?.widget_enabled !== false,
			widgetUrlOk,
			privacyUrl: PRIVACY_URL,
		},
		partnerPortal: {
			appUrl: `${normalizedBase}/app.html`,
			redirectUrl: `${normalizedBase}/auth/callback`,
			storefrontScript: `${normalizedBase}/main.min.js`,
			legacyLoaderScript: `${normalizedBase}/storefront-legacy-loader.min.js`,
			usesNubeSdk: true,
			privacyUrl: PRIVACY_URL,
		},
		widgetConfigPreview: widgetConfig
			? {
					widgetUrl: widgetConfig.widgetUrl,
					storefront_sdk_enabled: widgetConfig.storefront_sdk_enabled,
					widget_enabled: widgetConfig.config?.widget_enabled,
				}
			: null,
		blockers,
		manualSteps,
		validatedAt: new Date().toISOString(),
	};
}

export async function fetchStorefrontWidgetConfig(
	baseUrl,
	storeId,
	storeUrl,
	theme = DEMO_STORE_THEME,
) {
	const endpoint = `${String(baseUrl).replace(/\/+$/, "")}/api/storefront/widget-config?${new URLSearchParams(
		{
			store_id: String(storeId),
			store_domain: storeUrl,
			theme,
		},
	).toString()}`;
	const response = await fetch(endpoint);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	return response.json();
}

/** @deprecated Use fetchStorefrontWidgetConfig */
export async function fetchPatagoniaWidgetConfig(baseUrl, storeId, storeUrl) {
	return fetchStorefrontWidgetConfig(baseUrl, storeId, storeUrl, "Patagonia");
}
