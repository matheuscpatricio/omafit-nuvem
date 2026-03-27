/** @jsxImportSource @tiendanube/nube-sdk-jsx */
import type { NubeSDK, ProductDetails } from "@tiendanube/nube-sdk-types";
import { Button, Column, Iframe, Text } from "@tiendanube/nube-sdk-jsx";
import { getStorefrontFontFamily, sanitizeFontFamilyForCss } from "./shared/storeFont";
import { shouldUseFootwearWidget } from "./shared/widgetFootwearRouting";

type StorefrontConfig = {
	link_text: string;
	store_logo?: string | null;
	primary_color?: string;
	widget_enabled: boolean;
	excluded_collections: string[];
};

function debugLog(message: string, data: Record<string, unknown>, hypothesisId: string) {
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

/** Slug da coleção quando a página do produto está em `/collections/{slug}/products/...`. */
function collectionHandleFromStorefrontUrl(url: string): string {
	try {
		const m = new URL(url).pathname.match(/\/collections\/([^/]+)/i);
		if (!m?.[1]) return "";
		return decodeURIComponent(m[1]).trim().toLowerCase();
	} catch {
		return "";
	}
}

/** Prefere URL que já contenha `/collections/` (SDK por vezes difere do `window.location` do browser). */
function resolveStorefrontPageUrl(nube: NubeSDK): string {
	const state = nube.getState();
	const fromState = typeof state.location?.url === "string" ? state.location.url : "";
	const fromWindow =
		typeof globalThis.location?.href === "string" ? globalThis.location.href : "";
	const tryHasCollections = (u: string) => {
		try {
			return new URL(u).pathname.includes("/collections/") ? u : "";
		} catch {
			return "";
		}
	};
	return tryHasCollections(fromState) || tryHasCollections(fromWindow) || fromState || fromWindow;
}

function buildWidgetUrl(baseUrl: string, nube: NubeSDK, config: StorefrontConfig) {
	const state = nube.getState();
	const product = getCurrentProduct(nube);
	if (!product) return baseUrl;

	const selectedVariant = product.variants?.[0] || null;
	const rawImages = Array.isArray((product as ProductDetails & { images?: Array<{ src?: unknown }> }).images)
		? (product as ProductDetails & { images?: Array<{ src?: unknown }> }).images
		: [];
	const imageUrls = rawImages
		.map((image) => {
			const source = image?.src;
			if (typeof source === "string") return source;
			if (source && typeof source === "object") {
				return (
					(source as Record<string, string | undefined>)[state.store.language] ||
					(source as Record<string, string | undefined>).pt ||
					(source as Record<string, string | undefined>).es ||
					(source as Record<string, string | undefined>).en ||
					""
				);
			}
			return "";
		})
		.filter(Boolean);
	const widgetUrl = new URL(
		baseUrl,
		typeof globalThis.location?.href === "string"
			? globalThis.location.href
			: "https://omafit-nuvem-production.up.railway.app/widget.html",
	);
	widgetUrl.searchParams.set("platform", "nuvemshop");
	widgetUrl.searchParams.set("store_id", String(state.store.id));
	widgetUrl.searchParams.set("store_domain", state.store.domain);
	widgetUrl.searchParams.set("product_id", String(product.id));
	widgetUrl.searchParams.set("product_name", product.name?.[state.store.language] || product.name?.pt || "");
	widgetUrl.searchParams.set("product_handle", product.handle?.[state.store.language] || product.handle?.pt || "");
	const resolvedPageUrl = resolveStorefrontPageUrl(nube);
	const collectionHandle = collectionHandleFromStorefrontUrl(resolvedPageUrl);
	if (collectionHandle) {
		widgetUrl.searchParams.set("collection_handle", collectionHandle);
	}
	// #region agent log
	const ph =
		product.handle?.[state.store.language] || product.handle?.pt || "";
	fetch("http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c", {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b68c2f" },
		body: JSON.stringify({
			sessionId: "b68c2f",
			runId: "pre-fix",
			location: "main.tsx:buildWidgetUrl",
			message: "iframe_query_collections",
			data: {
				resolvedPageUrl,
				fromStateUrl: state.location?.url,
				windowHref:
					typeof globalThis.location?.href === "string"
						? globalThis.location.href
						: "",
				collectionHandleSet: Boolean(collectionHandle),
				collectionHandle,
				productHandle: ph,
			},
			timestamp: Date.now(),
			hypothesisId: "H1",
		}),
	}).catch(() => {});
	// #endregion
	widgetUrl.searchParams.set("currency", state.store.currency);
	if (selectedVariant?.id) {
		widgetUrl.searchParams.set("variant_id", String(selectedVariant.id));
	}
	if (imageUrls[0]) {
		widgetUrl.searchParams.set("product_image", imageUrls[0]);
	}
	if (imageUrls.length) {
		widgetUrl.searchParams.set("product_images", JSON.stringify(imageUrls));
	}
	if (config.store_logo) {
		widgetUrl.searchParams.set("store_logo", config.store_logo);
	}
	if (config.primary_color) {
		widgetUrl.searchParams.set("primary_color", config.primary_color);
	}
	const storeFont = sanitizeFontFamilyForCss(getStorefrontFontFamily());
	if (storeFont) {
		widgetUrl.searchParams.set("store_font", storeFont);
	}
	return widgetUrl.toString();
}

function shouldHideForProduct(product: ProductDetails | null, config: StorefrontConfig) {
	if (!product || config.widget_enabled === false) return true;
	const categoryIds = (product.categories || []).map((categoryId) => String(categoryId));
	return categoryIds.some((categoryId) => config.excluded_collections.includes(categoryId));
}

function resolveWidgetBaseUrl(
	baseUrl: string,
	collectionHandle: string,
	productHandle: string,
	footwearHandles: string[],
) {
	try {
		const resolved = new URL(
			baseUrl,
			typeof globalThis.location?.href === "string" ? globalThis.location.href : undefined,
		);
		resolved.pathname = shouldUseFootwearWidget(collectionHandle, productHandle, footwearHandles)
			? "/widget-footwear.html"
			: "/widget.html";
		return resolved.toString();
	} catch {
		return baseUrl;
	}
}

async function loadStorefrontConfig(storeId: number, storeDomain?: string) {
	try {
		debugLog("load_config_start", { storeId, storeDomain: storeDomain || null }, "H2");
		const response = await fetch(
			`/api/storefront/widget-config?store_id=${encodeURIComponent(String(storeId))}&store_domain=${encodeURIComponent(storeDomain || "")}`,
		);
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
				widgetUrl: String(data?.widgetUrl || "/widget.html"),
				publicId: String(data?.publicId || ""),
			},
			"H2",
		);
		const footwearHandles = Array.isArray(data?.footwear_collection_handles)
			? (data.footwear_collection_handles as unknown[]).map((h) => String(h || "").trim()).filter(Boolean)
			: [];
		return {
			config: (data?.config || {
				link_text: "Ver meu tamanho ideal",
				widget_enabled: true,
				excluded_collections: [],
				primary_color: "#810707",
			}) as StorefrontConfig,
			widgetUrl: String(data?.widgetUrl || "/widget.html"),
			publicId: String(data?.publicId || ""),
			footwearCollectionHandles: footwearHandles,
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
			widgetUrl: "/widget.html",
			publicId: "",
			footwearCollectionHandles: [] as string[],
		};
	}
}

function renderWidget(
	nube: NubeSDK,
	config: StorefrontConfig,
	widgetBaseUrl: string,
	publicId: string | undefined,
	footwearCollectionHandles: string[],
) {
	const product = getCurrentProduct(nube);
	const state = nube.getState();
	const page = state.location.page;
	const collectionHandle = collectionHandleFromStorefrontUrl(resolveStorefrontPageUrl(nube));
	const productHandle =
		product?.handle?.[state.store.language] || product?.handle?.pt || "";
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
				collectionHandle,
				categoryIds,
				excludedCollections: config.excluded_collections,
			},
			"H4",
		);
		renderDebugMessage(nube, `Diagnóstico Omafit: ${reason}`);
		nube.clearSlot("after_product_detail_add_to_cart");
		return;
	}

	const resolvedBaseUrl = resolveWidgetBaseUrl(
		widgetBaseUrl,
		collectionHandle,
		productHandle,
		footwearCollectionHandles,
	);
	const widgetUrl = new URL(buildWidgetUrl(resolvedBaseUrl, nube, config));
	if (publicId) {
		widgetUrl.searchParams.set("public_id", publicId);
	}
	debugLog(
		"render_widget_visible",
		{
			productId: product?.id || null,
			widgetUrl: widgetUrl.toString(),
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
						<Iframe src={widgetUrl.toString() as `https://${string}`} height="640px" />
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
		const { config, widgetUrl, publicId, footwearCollectionHandles } = await loadStorefrontConfig(
			state.store.id,
			state.store.domain,
		);
		renderWidget(nube, config, widgetUrl, publicId, footwearCollectionHandles);
	};

	void boot();
	nube.on("page:loaded", () => {
		void boot();
	});
	nube.on("location:updated", () => {
		void boot();
	});
}
