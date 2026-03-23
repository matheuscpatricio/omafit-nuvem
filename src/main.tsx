/** @jsxImportSource @tiendanube/nube-sdk-jsx */
import type { NubeSDK, ProductDetails } from "@tiendanube/nube-sdk-types";
import { Button, Column, Iframe, Text } from "@tiendanube/nube-sdk-jsx";

type StorefrontConfig = {
	link_text: string;
	store_logo?: string | null;
	primary_color?: string;
	widget_enabled: boolean;
	excluded_collections: string[];
};

function markScriptExecution() {
	console.info("[Omafit Storefront Debug] script_loaded", {
		href: typeof window !== "undefined" ? window.location.href : "",
	});
	if (typeof document === "undefined") return;
	if (document.getElementById("omafit-storefront-marker")) return;
	const marker = document.createElement("div");
	marker.id = "omafit-storefront-marker";
	marker.textContent = "Omafit script carregado";
	marker.style.position = "fixed";
	marker.style.right = "12px";
	marker.style.bottom = "12px";
	marker.style.zIndex = "99999";
	marker.style.padding = "8px 10px";
	marker.style.borderRadius = "8px";
	marker.style.background = "#111827";
	marker.style.color = "#ffffff";
	marker.style.fontSize = "12px";
	marker.style.fontFamily = "Arial, sans-serif";
	document.body.appendChild(marker);
}

function debugLog(message: string, data: Record<string, unknown>, hypothesisId: string) {
	// #region agent log
	fetch('http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b68c2f'},body:JSON.stringify({sessionId:'b68c2f',runId:'storefront-debug',hypothesisId,location:'src/main.tsx',message,data,timestamp:Date.now()})}).catch(()=>{});
	// #endregion
	console.info("[Omafit Storefront Debug]", hypothesisId, message, data);
}

function renderDebugMessage(nube: NubeSDK, message: string) {
	nube.render(
		"after_product_detail_name",
		<Text>
			{message}
		</Text>,
	);
}

function getCurrentProduct(nube: NubeSDK): ProductDetails | null {
	const page = nube.getState().location.page;
	if (page.type !== "product") return null;
	return page.data.product;
}

function buildWidgetUrl(baseUrl: string, nube: NubeSDK, config: StorefrontConfig) {
	const state = nube.getState();
	const product = getCurrentProduct(nube);
	if (!product) return baseUrl;

	const selectedVariant = product.variants?.[0] || null;
	const widgetUrl = new URL(baseUrl);
	widgetUrl.searchParams.set("platform", "nuvemshop");
	widgetUrl.searchParams.set("store_id", String(state.store.id));
	widgetUrl.searchParams.set("store_domain", state.store.domain);
	widgetUrl.searchParams.set("product_id", String(product.id));
	widgetUrl.searchParams.set("product_name", product.name?.[state.store.language] || product.name?.pt || "");
	widgetUrl.searchParams.set("product_handle", product.handle?.[state.store.language] || product.handle?.pt || "");
	widgetUrl.searchParams.set("currency", state.store.currency);
	if (selectedVariant?.id) {
		widgetUrl.searchParams.set("variant_id", String(selectedVariant.id));
	}
	if (config.store_logo) {
		widgetUrl.searchParams.set("store_logo", config.store_logo);
	}
	if (config.primary_color) {
		widgetUrl.searchParams.set("primary_color", config.primary_color);
	}
	return widgetUrl.toString();
}

function shouldHideForProduct(product: ProductDetails | null, config: StorefrontConfig) {
	if (!product || config.widget_enabled === false) return true;
	const categoryIds = (product.categories || []).map((categoryId) => String(categoryId));
	return categoryIds.some((categoryId) => config.excluded_collections.includes(categoryId));
}

async function loadStorefrontConfig(storeId: number) {
	try {
		debugLog("load_config_start", { storeId }, "H2");
		const response = await fetch(`/api/storefront/widget-config?store_id=${encodeURIComponent(String(storeId))}`);
		if (!response.ok) throw new Error("request failed");
		const data = await response.json();
		debugLog(
			"load_config_success",
			{
				storeId,
				hasConfig: Boolean(data?.config),
				widgetEnabled: data?.config?.widget_enabled ?? true,
				excludedCollections: Array.isArray(data?.config?.excluded_collections)
					? data.config.excluded_collections
					: [],
				widgetUrl: String(data?.widgetUrl || "https://omafit.netlify.app"),
			},
			"H2",
		);
		return {
			config: (data?.config || {
				link_text: "Ver meu tamanho ideal",
				widget_enabled: true,
				excluded_collections: [],
				primary_color: "#810707",
			}) as StorefrontConfig,
			widgetUrl: String(data?.widgetUrl || "https://omafit.netlify.app"),
		};
	} catch (error) {
		debugLog(
			"load_config_error",
			{
				storeId,
				error: error instanceof Error ? error.message : String(error),
			},
			"H2",
		);
		return {
			config: {
				link_text: "Ver meu tamanho ideal",
				widget_enabled: true,
				excluded_collections: [],
				primary_color: "#810707",
			} as StorefrontConfig,
			widgetUrl: "https://omafit.netlify.app",
		};
	}
}

function renderWidget(nube: NubeSDK, config: StorefrontConfig, widgetBaseUrl: string) {
	const product = getCurrentProduct(nube);
	const page = nube.getState().location.page;
	const categoryIds = (product?.categories || []).map((categoryId) => String(categoryId));
	debugLog(
		"render_widget_start",
		{
			pageType: page.type,
			hasProduct: Boolean(product),
			productId: product?.id || null,
			categoryIds,
			widgetEnabled: config.widget_enabled,
			excludedCollections: config.excluded_collections,
			widgetBaseUrl,
		},
		"H3",
	);
	if (shouldHideForProduct(product, config)) {
		const reason = !product
			? "Sem contexto de produto nesta página."
			: config.widget_enabled === false
				? "Widget desativado na configuração."
				: "Produto pertence a uma categoria excluída.";
		debugLog(
			"render_widget_hidden",
			{
				productId: product?.id || null,
				reason,
				categoryIds,
				excludedCollections: config.excluded_collections,
			},
			"H4",
		);
		renderDebugMessage(nube, `Diagnóstico Omafit: ${reason}`);
		nube.clearSlot("after_product_detail_add_to_cart");
		return;
	}

	const widgetUrl = buildWidgetUrl(widgetBaseUrl, nube, config);
	debugLog(
		"render_widget_visible",
		{
			productId: product?.id || null,
			widgetUrl,
		},
		"H5",
	);
	nube.render(
		"after_product_detail_name",
		<Text>
			Omafit ativo para este produto.
		</Text>,
	);

	nube.render(
		"after_product_detail_add_to_cart",
		<Button
			variant="link"
			onClick={() => {
				nube.render(
					"modal_content",
					<Column padding="16px" gap="16px">
						<Text>
							Descubra o tamanho ideal com base no contexto real deste produto.
						</Text>
						<Iframe src={widgetUrl as `https://${string}`} height="640px" />
						<Button
							variant="secondary"
							onClick={() => {
								nube.clearSlot("modal_content");
							}}
						>
							Fechar
						</Button>
					</Column>,
				);
			}}
		>
			{config.link_text || "Ver meu tamanho ideal"}
		</Button>,
	);
	debugLog(
		"render_widget_complete",
		{
			productId: product?.id || null,
			slot: "after_product_detail_add_to_cart",
		},
		"H5",
	);
}

export function App(nube: NubeSDK) {
	const boot = async () => {
		const state = nube.getState();
		debugLog(
			"app_boot",
			{
				storeId: state.store.id,
				storeDomain: state.store.domain,
				pageType: state.location.page.type,
			},
			"H1",
		);
		if (state.location.page.type === "product") {
			nube.render(
				"after_product_detail_name",
				<Text>
					Omafit carregado na página do produto.
				</Text>,
			);
		}
		const { config, widgetUrl } = await loadStorefrontConfig(state.store.id);
		renderWidget(nube, config, widgetUrl);
	};

	void boot();
	nube.on("page:loaded", () => {
		void boot();
	});
	nube.on("location:updated", () => {
		void boot();
	});
}

const storefrontGlobal = globalThis as typeof globalThis & {
	App?: typeof App;
};

markScriptExecution();
storefrontGlobal.App = App;
