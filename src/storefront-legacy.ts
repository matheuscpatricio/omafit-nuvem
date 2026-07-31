import { getStorefrontFontFamily, sanitizeFontFamilyForCss } from "./shared/storeFont";
import {
	OMAFIT_LEGACY_CTA_BUTTON_ID,
	OMAFIT_LEGACY_CTA_WRAPPER_ID,
	readLegacyCtaCache,
	startLegacyCtaFlashGuard,
	markLegacyCtaReady,
	writeLegacyCtaCache,
} from "./shared/storefrontCta";
import { resolveCollectionHandleForStorefront, shouldUseFootwearWidget } from "./shared/widgetFootwearRouting";
import { getOrCreateShopperDeviceId } from "./shared/shopperDeviceId";
import { getLegacyStorefrontAppBaseUrl } from "./shared/omafitAppBaseUrl";
import { isCategoryExcluded, mergeCategoryTokens } from "./shared/categoryExclusion";

startLegacyCtaFlashGuard();

type LegacyStorefrontConfig = {
	link_text: string;
	store_logo?: string | null;
	primary_color?: string;
	widget_enabled: boolean;
	excluded_collections: string[];
	embed_position?: string;
	cta_type?: string;
	cta_button_border_radius?: number;
	tryon_layout?: string;
	tryon_layout_background_image?: string | null;
	tryon_enabled?: boolean;
	font_family?: string | null;
};

type LegacyStorefrontResponse = {
	config?: LegacyStorefrontConfig | null;
	widgetUrl?: string | null;
	publicId?: string | null;
	footwear_collection_handles?: string[];
	size_charts_count?: number;
	footwear_rows_count?: number;
	footwear_rows_missing_handle?: boolean;
	billing_plan?: string | null;
	stylist_mode_enabled?: boolean;
	storefront_sdk_enabled?: boolean;
};

type LegacyStoreContext = {
	id: string;
	domain: string;
};

type LegacyProductContext = {
	name: string;
	handle: string;
	productId: string;
	variantId: string;
	imageUrl: string;
	imageUrls: string[];
};

declare global {
	interface Window {
		LS?: {
			store?: {
				id?: number | string;
				url?: string;
				custom_url?: string;
			};
			theme?: {
				name?: string;
			};
			product?: {
				id?: number | string;
				categories?: Array<number | string | { id?: number | string }>;
				variants?: Array<Record<string, unknown>>;
			};
		};
		OMAFIT_COLLECTION_HANDLE?: string;
	}
}

const CTA_WRAPPER_ID = OMAFIT_LEGACY_CTA_WRAPPER_ID;
const CTA_BUTTON_ID = OMAFIT_LEGACY_CTA_BUTTON_ID;
const MODAL_ID = "omafit-legacy-modal";
const STYLE_ID = "omafit-legacy-style";

type LegacyRenderSnapshot = {
	store: LegacyStoreContext;
	config: LegacyStorefrontConfig;
	widgetBaseUrl: string;
	publicId: string;
	footwearCollectionHandles: string[];
	billingPlan: string;
	stylistModeEnabled: boolean;
};

let lastLegacyRenderSnapshot: LegacyRenderSnapshot | null = null;
let legacyInitChain: Promise<void> = Promise.resolve();
let legacyRemountTimer: number | null = null;
let legacyPersistenceStarted = false;
const legacyProductCategoryCache = new Map<string, string[]>();

function readProductCategoryIdsFromDom(): string[] {
	const ids = new Set<string>();
	const lsCategories = window.LS?.product?.categories;
	if (Array.isArray(lsCategories)) {
		for (const entry of lsCategories) {
			if (typeof entry === "number" || typeof entry === "string") {
				const text = String(entry).trim();
				if (text) ids.add(text);
				continue;
			}
			if (entry && typeof entry === "object" && entry.id != null) {
				const text = String(entry.id).trim();
				if (text) ids.add(text);
			}
		}
	}

	for (const element of Array.from(
		document.querySelectorAll("[data-product-category-id],[data-category-id]"),
	)) {
		const raw =
			element.getAttribute("data-product-category-id") || element.getAttribute("data-category-id");
		for (const part of String(raw || "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean)) {
			ids.add(part);
		}
	}

	return Array.from(ids);
}

function readProductCategoryHandlesFromDom(): string[] {
	const handles = new Set<string>();
	for (const link of Array.from(document.querySelectorAll("a[href]"))) {
		const href = String(link.getAttribute("href") || "");
		const match = href.match(/\/categorias?\/([^/?#]+)/i);
		if (!match?.[1]) continue;
		try {
			const handle = decodeURIComponent(match[1]).trim();
			if (handle) handles.add(handle);
		} catch {
			const handle = match[1].trim();
			if (handle) handles.add(handle);
		}
	}
	return Array.from(handles);
}

async function resolveLegacyProductCategoryTokens(
	store: LegacyStoreContext,
	productHandle: string,
): Promise<string[]> {
	const cacheKey = `${store.id}:${productHandle}`;
	if (legacyProductCategoryCache.has(cacheKey)) {
		return legacyProductCategoryCache.get(cacheKey) || [];
	}

	const domTokens = mergeCategoryTokens(
		readProductCategoryIdsFromDom(),
		readProductCategoryHandlesFromDom(),
	);

	let apiTokens: string[] = [];
	try {
		const endpoint = `${getAppBaseUrl()}/api/storefront/product-categories?store_id=${encodeURIComponent(store.id)}&product_handle=${encodeURIComponent(productHandle)}`;
		const response = await fetch(endpoint, { mode: "cors" });
		if (response.ok) {
			const data = (await response.json()) as {
				category_tokens?: string[];
				category_ids?: string[];
				category_handles?: string[];
			};
			apiTokens = Array.isArray(data.category_tokens)
				? data.category_tokens.map((value) => String(value)).filter(Boolean)
				: mergeCategoryTokens(data.category_ids, data.category_handles);
		}
	} catch {
		apiTokens = [];
	}

	const tokens = mergeCategoryTokens(domTokens, apiTokens);
	legacyProductCategoryCache.set(cacheKey, tokens);
	return tokens;
}

function shouldHideLegacyProduct(
	categoryTokens: string[],
	config: LegacyStorefrontConfig | null | undefined,
): boolean {
	if (!config || config.widget_enabled === false) return true;
	return isCategoryExcluded(categoryTokens, config.excluded_collections);
}

function debugLog(message: string, data: Record<string, unknown>, hypothesisId: string) {
	console.info("[Omafit Legacy Debug]", hypothesisId, message, data);
}

function getAppBaseUrl(): string {
	return getLegacyStorefrontAppBaseUrl();
}

function getStoreContext(): LegacyStoreContext | null {
	const store = window.LS?.store;
	const id = String(store?.id || "").trim();
	const domain = String(store?.custom_url || store?.url || window.location.hostname).trim();
	if (!id || !domain) return null;
	return { id, domain };
}

function getProductContext(): LegacyProductContext | null {
	const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || window.location.href;
	const handle = canonical.split("/produtos/")[1]?.replace(/\/+$/, "") || "";
	const name =
		document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ||
		document.querySelector("h1")?.textContent?.trim() ||
		document.title;
	const variantId =
		document.querySelector<HTMLInputElement>('input[name="add_to_cart"]')?.value?.trim() || "";
	const productId =
		document.querySelector<HTMLFormElement>('[data-store^="product-form-"]')
			?.getAttribute("data-store")
			?.replace("product-form-", "")
			?.trim() || variantId;
	const imageCandidates = Array.from(
		new Set(
			[
				document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || "",
				...Array.from(document.querySelectorAll<HTMLImageElement>("img")).map(
					(image) =>
						image.currentSrc ||
						image.src ||
						image.getAttribute("data-src") ||
						image.getAttribute("data-zoom") ||
						"",
				),
			]
				.map((value) => String(value || "").trim())
				.filter((value) => /^https?:\/\//.test(value)),
		),
	).slice(0, 8);
	if (!handle || !name) return null;
	return {
		name,
		handle,
		productId,
		variantId,
		imageUrl: imageCandidates[0] || "",
		imageUrls: imageCandidates,
	};
}

async function loadConfig(appBaseUrl: string, storeId: string) {
	const store = getStoreContext();
	const themeName = String(window.LS?.theme?.name || "").trim();
	const themeQuery = themeName ? `&theme=${encodeURIComponent(themeName)}` : "";
	const endpoint = `${appBaseUrl}/api/storefront/widget-config?store_id=${encodeURIComponent(storeId)}&store_domain=${encodeURIComponent(store?.domain || "")}${themeQuery}`;
	try {
		debugLog("load_config_start", { endpoint, storeId }, "L1");
		const response = await fetch(endpoint, { mode: "cors" });
		if (!response.ok) throw new Error(`request failed: ${response.status}`);
		const data = (await response.json()) as LegacyStorefrontResponse;
		const config = data.config;
		if (!config) {
			return {
				config: null,
				configLoaded: true,
				widgetUrl: String(data.widgetUrl || `${appBaseUrl}/widget.html`),
				publicId: String(data.publicId || ""),
				footwearCollectionHandles: [] as string[],
				billingPlan: String(data.billing_plan || ""),
				stylistModeEnabled: Boolean(data.stylist_mode_enabled),
				storefrontSdkEnabled: data.storefront_sdk_enabled === true,
			};
		}
		const footwearHandles = Array.isArray(data.footwear_collection_handles)
			? data.footwear_collection_handles.map((h) => String(h || "").trim()).filter(Boolean)
			: [];
		const sizeChartsCount = Number(data.size_charts_count ?? 0) || 0;
		const footwearRowsCount = Number(data.footwear_rows_count ?? 0) || 0;
		const footwearRowsMissingHandle = Boolean(data.footwear_rows_missing_handle);
		debugLog(
			"load_config_success",
			{
				storeId,
				widgetEnabled: config.widget_enabled,
				widgetUrl: String(data.widgetUrl || `${appBaseUrl}/widget.html`),
				footwearHandlesCount: footwearHandles.length,
				footwearHandlesSample: footwearHandles.slice(0, 12),
				sizeChartsCount,
				footwearRowsCount,
				footwearRowsMissingHandle,
				...(footwearRowsMissingHandle
					? {
							hint:
								"No admin Omafit, abra a tabela de cal├ºados e preencha o handle da cole├º├úo com o mesmo slug da URL na Nuvemshop (ex.: tenis-classico).",
						}
					: {}),
			},
			"L1",
		);
		return {
			config,
			configLoaded: true,
			widgetUrl: String(data.widgetUrl || `${appBaseUrl}/widget.html`),
			publicId: String(data.publicId || ""),
			footwearCollectionHandles: footwearHandles,
			billingPlan: String(data.billing_plan || ""),
			stylistModeEnabled: Boolean(data.stylist_mode_enabled),
			storefrontSdkEnabled: data.storefront_sdk_enabled === true,
		};
	} catch (error) {
		debugLog(
			"load_config_error",
			{
				storeId,
				error: error instanceof Error ? error.message : String(error),
			},
			"L1",
		);
		return {
			config: null,
			configLoaded: false,
			widgetUrl: `${appBaseUrl}/widget.html`,
			publicId: "",
			footwearCollectionHandles: [] as string[],
			billingPlan: "",
			stylistModeEnabled: false,
			storefrontSdkEnabled: false,
		};
	}
}

function resolveWidgetBaseUrl(
	baseUrl: string,
	collectionHandle: string,
	productHandle: string,
	footwearHandles: string[],
) {
	try {
		const resolved = new URL(baseUrl);
		const useFootwear = shouldUseFootwearWidget(collectionHandle, productHandle, footwearHandles);
		resolved.pathname = useFootwear
			? "/widget-footwear.html"
			: "/widget.html";
		return resolved.toString();
	} catch {
		return baseUrl;
	}
}

function deriveStoreDisplayName(domain: string) {
	const normalized = String(domain || "")
		.replace(/^https?:\/\//, "")
		.split(".")[0];
	if (!normalized) return "Omafit";
	return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildProductVariantCatalog() {
	const form = findProductForm();
	const sizes = new Set<string>();
	const colors = new Set<string>();
	const variants: Array<Record<string, unknown>> = [];
	const lsProduct = window.LS?.product;
	const currencyCode = String(
		(window as Window & { LS?: { currency?: { code?: string } } }).LS?.currency?.code || "BRL",
	).trim();

	if (form) {
		for (const select of Array.from(form.querySelectorAll<HTMLSelectElement>("select"))) {
			const label =
				select.getAttribute("aria-label") ||
				select.closest("label")?.textContent ||
				select.name ||
				"";
			const normalizedLabel = normalizeText(label);
			for (const option of Array.from(select.options)) {
				const value = String(option.value || option.text || "").trim();
				if (!value || value === "0") continue;
				if (normalizedLabel.includes("tamanho") || normalizedLabel.includes("size")) {
					sizes.add(value);
				} else if (
					normalizedLabel.includes("cor") ||
					normalizedLabel.includes("color") ||
					normalizedLabel.includes("colour")
				) {
					colors.add(value);
				}
			}
		}
	}

	if (Array.isArray(lsProduct?.variants)) {
		for (const variant of lsProduct.variants) {
			const values = Array.isArray(variant.values)
				? variant.values.map((value) => String(value || "").trim()).filter(Boolean)
				: [];
			for (const value of values) {
				if (/^\d+$/.test(value) || /^[a-z]{1,3}$/i.test(value)) {
					sizes.add(value);
				} else if (value) {
					colors.add(value);
				}
			}
		}
	}

	const variantId = getCurrentVariantId();
	if (variantId) {
		const lsVariant = Array.isArray(lsProduct?.variants)
			? lsProduct!.variants!.find((v) => String(v?.id ?? "").trim() === variantId)
			: null;
		const priceRaw = lsVariant?.price_number ?? lsVariant?.price;
		const priceAmount =
			priceRaw != null && Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : null;
		variants.push({
			id: variantId,
			available: true,
			...(priceAmount != null ? { price_amount: priceAmount, currency_code: currencyCode } : {}),
		});
	}

	return {
		sizes: Array.from(sizes),
		colors: Array.from(colors),
		variants,
	};
}

function getProductDescriptionText() {
	const meta =
		document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ||
		document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ||
		"";
	return String(meta || "").trim();
}

type WidgetIframeContext = {
	store: LegacyStoreContext;
	product: LegacyProductContext;
	config: LegacyStorefrontConfig;
	publicId: string;
	collectionHandle: string;
	billingPlan: string;
	stylistModeEnabled: boolean;
	widgetOrigin: string;
};

let lastWidgetIframeContext: WidgetIframeContext | null = null;

function postWidgetContextToIframe(iframe: HTMLIFrameElement, ctx: WidgetIframeContext) {
	if (!iframe.contentWindow) return;
	const { store, product, config, publicId, collectionHandle, billingPlan, stylistModeEnabled, widgetOrigin } =
		ctx;
	const shopDomain = `nuvemshop/${store.id}`;
	const storeName = deriveStoreDisplayName(store.domain);
	const fontFamily = sanitizeFontFamilyForCss(getStorefrontFontFamily());
	const tryonLayout =
		config.tryon_layout === "hero" || config.tryon_layout === "sidebar"
			? config.tryon_layout
			: "default";
	const tryonLayoutBackground = String(config.tryon_layout_background_image || "").trim();
	const productCatalog = buildProductVariantCatalog();
	const selectedVariantId = getCurrentVariantId();
	const productDescription = getProductDescriptionText();
	const sharedWidgetData = {
		productDescription,
		product_description: productDescription,
		selectedImage: product.imageUrl || "",
		selected_image: product.imageUrl || "",
		productImage: product.imageUrl || "",
		product_image: product.imageUrl || "",
		productImages: product.imageUrls,
		product_images: product.imageUrls,
		productHandle: product.handle,
		product_handle: product.handle,
		productId: product.productId,
		product_id: product.productId,
		productCatalog,
		product_catalog: productCatalog,
		selectedVariantId,
		selected_variant_id: selectedVariantId,
	};

	const sendPayloads = () => {
		if (!iframe.contentWindow) return;
		iframe.contentWindow.postMessage(
			{
				type: "omafit-context",
				language: "pt",
				locale: "pt",
				storeLanguage: "pt",
				shopName: storeName,
				shop_name: storeName,
				storeName,
				store_name: storeName,
				productName: product.name,
				product_name: product.name,
				shopDomain,
				publicId,
				...sharedWidgetData,
				collectionHandle,
				collectionHandles: collectionHandle ? [collectionHandle] : [],
				tryon_layout: tryonLayout,
				tryonLayout,
				tryon_layout_background_image: tryonLayoutBackground,
				tryonLayoutBackgroundImage: tryonLayoutBackground,
				billing_plan: billingPlan || null,
				billingPlan: billingPlan || null,
				stylist_mode_enabled: stylistModeEnabled,
				stylistModeEnabled,
				primaryColor: config.primary_color || "#810707",
				fontFamily: fontFamily || "",
			},
			widgetOrigin,
		);

		iframe.contentWindow.postMessage(
			{
				type: "omafit-product-images",
				images: product.imageUrls,
				productImage: product.imageUrl || "",
				product_image: product.imageUrl || "",
			},
			widgetOrigin,
		);

		if (config.store_logo) {
			iframe.contentWindow.postMessage(
				{
					type: "omafit-store-logo",
					logo: config.store_logo,
				},
				widgetOrigin,
			);
		}

		iframe.contentWindow.postMessage(
			{
				type: "omafit-config-update",
				language: "pt",
				locale: "pt",
				storeLanguage: "pt",
				primaryColor: config.primary_color || "#810707",
				storeName,
				store_name: storeName,
				shopName: storeName,
				shop_name: storeName,
				storeLogo: config.store_logo || "",
				fontFamily: fontFamily || "",
				shopDomain,
				publicId,
				...sharedWidgetData,
				collectionHandle,
				collectionHandles: collectionHandle ? [collectionHandle] : [],
				tryon_layout: tryonLayout,
				tryonLayout,
				tryon_layout_background_image: tryonLayoutBackground,
				tryonLayoutBackgroundImage: tryonLayoutBackground,
				billing_plan: billingPlan || null,
				billingPlan: billingPlan || null,
				stylist_mode_enabled: stylistModeEnabled,
				stylistModeEnabled,
			},
			widgetOrigin,
		);

		if (fontFamily) {
			iframe.contentWindow.postMessage({ type: "omafit-store-font", fontFamily }, widgetOrigin);
		}
	};

	sendPayloads();
	window.setTimeout(sendPayloads, 120);
	window.setTimeout(sendPayloads, 480);
}

function buildWidgetUrl(
	baseUrl: string,
	store: LegacyStoreContext,
	product: LegacyProductContext,
	config: LegacyStorefrontConfig,
	publicId: string | null | undefined,
	collectionHandle: string,
) {
	const widgetUrl = new URL(baseUrl);
	const shopDomain = `nuvemshop/${store.id}`;
	const storeName = deriveStoreDisplayName(store.domain);
	const shopperDeviceId = getOrCreateShopperDeviceId();
	const tryonLayout =
		config.tryon_layout === "hero" || config.tryon_layout === "sidebar"
			? config.tryon_layout
			: "default";
	const fontFamily = sanitizeFontFamilyForCss(getStorefrontFontFamily());

	widgetUrl.searchParams.set("platform", "nuvemshop");
	widgetUrl.searchParams.set("store_id", store.id);
	widgetUrl.searchParams.set("store_domain", store.domain);
	widgetUrl.searchParams.set("shopDomain", shopDomain);
	widgetUrl.searchParams.set("productImage", product.imageUrl || "");
	widgetUrl.searchParams.set("productId", product.productId || product.variantId || product.handle);
	widgetUrl.searchParams.set("productName", product.name);
	widgetUrl.searchParams.set("productHandle", product.handle);
	widgetUrl.searchParams.set("publicId", publicId || "");
	widgetUrl.searchParams.set("language", "pt");
	widgetUrl.searchParams.set("locale", "pt");
	widgetUrl.searchParams.set("tryon_layout", tryonLayout);
	widgetUrl.searchParams.set("tryonLayout", tryonLayout);

	if (collectionHandle) {
		widgetUrl.searchParams.set("collectionHandle", collectionHandle);
		widgetUrl.searchParams.set("collection_handle", collectionHandle);
	}
	if (config.store_logo && widgetUrl.toString().length < 2400) {
		widgetUrl.searchParams.set("storeLogo", String(config.store_logo));
	}
	if (config.primary_color) {
		widgetUrl.searchParams.set("primaryColor", String(config.primary_color));
	}
	if (storeName) {
		widgetUrl.searchParams.set("shopName", storeName);
		widgetUrl.searchParams.set("storeName", storeName);
	}
	if (fontFamily) {
		widgetUrl.searchParams.set("fontFamily", fontFamily);
	}
	if (config.tryon_layout_background_image && widgetUrl.toString().length < 2400) {
		widgetUrl.searchParams.set(
			"tryon_layout_background_image",
			String(config.tryon_layout_background_image),
		);
	}

	// Compatibilidade com par├ómetros legados Nuvemshop.
	widgetUrl.searchParams.set("product_id", product.productId || product.variantId || product.handle);
	widgetUrl.searchParams.set("variant_id", product.variantId || "");
	widgetUrl.searchParams.set("product_name", product.name);
	widgetUrl.searchParams.set("product_handle", product.handle);
	if (product.imageUrl) widgetUrl.searchParams.set("product_image", product.imageUrl);
	if (product.imageUrls.length) {
		widgetUrl.searchParams.set("product_images", JSON.stringify(product.imageUrls));
	}
	if (publicId) widgetUrl.searchParams.set("public_id", publicId);
	if (config.store_logo) widgetUrl.searchParams.set("store_logo", String(config.store_logo));
	if (config.primary_color) widgetUrl.searchParams.set("primary_color", String(config.primary_color));
	if (fontFamily) widgetUrl.searchParams.set("store_font", fontFamily);
	if (shopperDeviceId) {
		widgetUrl.searchParams.set("omafit_device_id", shopperDeviceId);
		widgetUrl.searchParams.set("shopperDeviceId", shopperDeviceId);
	}

	return widgetUrl.toString();
}

function getCurrentVariantId() {
	return document.querySelector<HTMLInputElement>('input[name="add_to_cart"]')?.value?.trim() || "";
}

function normalizeText(value: string) {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim();
}

function findProductForm() {
	return (
		document.querySelector<HTMLFormElement>(".js-product-form") ||
		document.querySelector<HTMLFormElement>('[data-store^="product-form-"]')
	);
}

function trySelectSizeOption(desiredSize: string) {
	const normalizedDesiredSize = normalizeText(desiredSize);
	if (!normalizedDesiredSize) return false;
	const form = findProductForm();
	if (!form) return false;

	const selects = Array.from(form.querySelectorAll<HTMLSelectElement>("select"));
	for (const select of selects) {
		const option = Array.from(select.options).find((item) => {
			const haystack = normalizeText(`${item.label} ${item.text} ${item.value}`);
			return haystack === normalizedDesiredSize;
		});
		if (option) {
			select.value = option.value;
			select.dispatchEvent(new Event("change", { bubbles: true }));
			return true;
		}
	}

	const clickables = Array.from(
		form.querySelectorAll<HTMLElement>(
			'input[type="radio"], button, a, label, [data-value], [data-option-value]',
		),
	);
	for (const element of clickables) {
		const haystack = normalizeText(
			[
				element.getAttribute("value"),
				element.getAttribute("data-value"),
				element.getAttribute("data-option-value"),
				element.getAttribute("aria-label"),
				element.textContent,
			]
				.filter(Boolean)
				.join(" "),
		);
		if (haystack === normalizedDesiredSize) {
			element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			return true;
		}
	}

	return false;
}

function postCartResult(ok: boolean, message: string) {
	const iframe = document.querySelector<HTMLIFrameElement>(`#${MODAL_ID} iframe`);
	if (!iframe?.contentWindow) return;
	iframe.contentWindow.postMessage(
		{
			type: "omafit-add-to-cart-result",
			ok,
			message,
		},
		"*",
	);
}

function attachMessageBridge() {
	if ((window as Window & { __omafitBridgeAttached?: boolean }).__omafitBridgeAttached) return;
	(window as Window & { __omafitBridgeAttached?: boolean }).__omafitBridgeAttached = true;

	window.addEventListener("message", (event) => {
		if (event.data?.type !== "omafit-add-to-cart-request") return;
		const desiredSize = String(event.data?.selection?.recommended_size || "").trim();
		const sizeMatched = desiredSize ? trySelectSizeOption(desiredSize) : false;
		const form = findProductForm();
		const submitButton =
			form?.querySelector<HTMLElement>(".js-prod-submit-form") ||
			form?.querySelector<HTMLElement>('button[type="submit"]') ||
			form?.querySelector<HTMLElement>('input[type="submit"]');
		const beforeVariantId = getCurrentVariantId();

	window.setTimeout(() => {
			const noteField =
				form?.querySelector<HTMLTextAreaElement>('textarea[name="note"]') ||
				form?.querySelector<HTMLInputElement>('input[name="note"]');
			if (noteField) {
				const marker = "_source=omafit_tryon";
				const current = String(noteField.value || "").trim();
				if (!current.includes(marker)) {
					noteField.value = current ? `${current} | ${marker}` : marker;
				}
			}
			if (submitButton) {
				submitButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				postCartResult(
					true,
					sizeMatched
						? "Produto adicionado ao carrinho com o tamanho recomendado."
						: beforeVariantId
							? "Produto adicionado ao carrinho com a sele├º├úo atual da p├ígina."
							: "Omafit enviou a solicita├º├úo para o carrinho.",
				);
				return;
			}
			if (form) {
				form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
				postCartResult(true, "Omafit enviou a solicita├º├úo para o carrinho.");
				return;
			}
			postCartResult(false, "Nao foi possivel localizar o formulario de compra.");
		}, sizeMatched ? 500 : 120);
	});
}

function ensureStyles(primaryColor: string) {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = `
#${CTA_WRAPPER_ID} {
  width: 100%;
}
#${CTA_BUTTON_ID} {
  width: 100%;
  border: 1px solid ${primaryColor || "#810707"};
  background: transparent;
  color: ${primaryColor || "#810707"};
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
#${CTA_BUTTON_ID} img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  border-radius: 4px;
}
#${CTA_BUTTON_ID}:hover {
  opacity: 0.9;
}
#${MODAL_ID} {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 99999;
}
#${MODAL_ID}[hidden] {
  display: none;
}
#${MODAL_ID} .omafit-modal-card {
  width: min(960px, 100%);
  height: min(760px, 100%);
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
}
#${MODAL_ID} .omafit-modal-close {
  position: absolute;
  top: 10px;
  right: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.92);
  width: 36px;
  height: 36px;
  border-radius: 999px;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  z-index: 3;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}
#${MODAL_ID} iframe {
  width: 100%;
  height: 100%;
  border: 0;
}
@media (max-width: 768px) {
  #${MODAL_ID} {
    padding: 0;
    background: #fff;
  }
  #${MODAL_ID} .omafit-modal-card {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
  }
  #${MODAL_ID} .omafit-modal-close {
    top: 12px;
    right: 12px;
  }
}
`;
	document.head.appendChild(style);
}

const BUY_CONTAINER_SELECTORS = [
	".js-buy-button-container",
	".js-product-buy-container",
	'[data-store="product-buy-button"]',
	".product-buy-container",
];

function getEmbedMount() {
	let buyContainer: HTMLElement | null = null;
	for (const selector of BUY_CONTAINER_SELECTORS) {
		buyContainer = document.querySelector<HTMLElement>(selector);
		if (buyContainer) break;
	}
	if (!buyContainer) {
		const productForm =
			document.querySelector<HTMLElement>(".js-product-form") ||
			document.querySelector<HTMLElement>('[data-store^="product-form-"]');
		if (!productForm) return null;
		return {
			buyContainer: productForm,
			row: productForm.closest(".row") || productForm,
		};
	}
	const row = buyContainer.closest(".row") || buyContainer;
	return { buyContainer, row };
}

function isLegacyCtaReady() {
	const wrapper = document.getElementById(CTA_WRAPPER_ID);
	return Boolean(
		wrapper?.isConnected &&
			wrapper.classList.contains("omafit-legacy-ready") &&
			wrapper.querySelector(`#${CTA_BUTTON_ID}`),
	);
}

function rememberLegacyRenderSnapshot(
	store: LegacyStoreContext,
	config: LegacyStorefrontConfig,
	widgetBaseUrl: string,
	publicId: string | null | undefined,
	footwearCollectionHandles: string[],
	billingPlan: string,
	stylistModeEnabled: boolean,
) {
	lastLegacyRenderSnapshot = {
		store,
		config,
		widgetBaseUrl,
		publicId: String(publicId || ""),
		footwearCollectionHandles,
		billingPlan,
		stylistModeEnabled,
	};
}

function remountLegacyCtaFromSnapshot(reason: string) {
	const snapshot = lastLegacyRenderSnapshot;
	if (!snapshot) return false;
	const product = getProductContext();
	if (!product) return false;
	if (snapshot.config.widget_enabled === false) return false;
	const categoryTokens = legacyProductCategoryCache.get(`${snapshot.store.id}:${product.handle}`) || [];
	if (shouldHideLegacyProduct(categoryTokens, snapshot.config)) {
		removeLegacyCtaIfPresent();
		return false;
	}
	debugLog("legacy_cta_remount", { reason, productHandle: product.handle }, "L4");
	return renderButton(
		snapshot.store,
		product,
		snapshot.config,
		snapshot.widgetBaseUrl,
		snapshot.publicId,
		snapshot.footwearCollectionHandles,
		snapshot.billingPlan,
		snapshot.stylistModeEnabled,
		categoryTokens,
	);
}

function scheduleLegacyRemount(reason: string) {
	if (!lastLegacyRenderSnapshot) return;
	if (legacyRemountTimer != null) {
		window.clearTimeout(legacyRemountTimer);
	}
	legacyRemountTimer = window.setTimeout(() => {
		legacyRemountTimer = null;
		if (isLegacyCtaReady()) return;
		remountLegacyCtaFromSnapshot(reason);
	}, 150);
}

function startLegacyCtaPersistence() {
	if (legacyPersistenceStarted) return;
	legacyPersistenceStarted = true;

	const root =
		document.querySelector(".js-product-container") ||
		document.querySelector(".js-product-form") ||
		document.querySelector('[data-store^="product-form-"]') ||
		document.body;

	if (typeof MutationObserver !== "undefined" && root) {
		const observer = new MutationObserver(() => {
			if (!getProductContext() || !lastLegacyRenderSnapshot) return;
			if (!isLegacyCtaReady()) {
				scheduleLegacyRemount("dom_mutation");
			}
		});
		observer.observe(root, { childList: true, subtree: true });
	}

	window.setInterval(() => {
		if (!getProductContext() || !lastLegacyRenderSnapshot) return;
		if (!isLegacyCtaReady()) {
			scheduleLegacyRemount("interval_check");
		}
	}, 2000);

	document.addEventListener(
		"change",
		(event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			if (
				target.closest(".js-product-form") ||
				target.closest(".js-product-variants-group") ||
				target.closest('[data-store^="product-form-"]') ||
				target.closest(".js-buy-button-container")
			) {
				scheduleLegacyRemount("product_form_change");
			}
		},
		true,
	);
}

function applyCtaWrapperSpacing(wrapper: HTMLElement, embedPosition?: string) {
	const above = embedPosition === "above_buy_buttons";
	if (above) {
		wrapper.style.marginTop = "0";
		wrapper.style.marginBottom = "16px";
	} else {
		wrapper.style.marginTop = "16px";
		wrapper.style.marginBottom = "0";
	}
}

function removeLegacyCtaIfPresent() {
	document.getElementById(CTA_WRAPPER_ID)?.remove();
}

function mountCtaWrapper(wrapper: HTMLElement, embedPosition?: string) {
	const mount = getEmbedMount();
	if (!mount) return false;
	if (wrapper.parentElement) {
		wrapper.remove();
	}
	applyCtaWrapperSpacing(wrapper, embedPosition);
	const above = embedPosition === "above_buy_buttons";
	if (above) {
		mount.buyContainer.insertAdjacentElement("beforebegin", wrapper);
	} else {
		mount.buyContainer.insertAdjacentElement("afterend", wrapper);
	}
	return true;
}

function createStorefrontCta(config: LegacyStorefrontConfig, onOpen: () => void) {
	const primaryColor = config.primary_color || "#810707";
	const label = String(config.link_text || "").trim();
	if (!label) return null;
	const isButton = config.cta_type === "button";
	const radius = Number.isFinite(Number(config.cta_button_border_radius))
		? Math.max(0, Math.min(40, Number(config.cta_button_border_radius)))
		: 40;

	if (isButton) {
		const button = document.createElement("button");
		button.id = CTA_BUTTON_ID;
		button.type = "button";
		button.style.width = "100%";
		button.style.display = "inline-flex";
		button.style.alignItems = "center";
		button.style.justifyContent = "center";
		button.style.gap = "10px";
		button.style.padding = "12px 22px";
		button.style.borderRadius = `${radius}px`;
		button.style.border = `2px solid ${primaryColor}`;
		button.style.background = "#ffffff";
		button.style.color = primaryColor;
		button.style.cursor = "pointer";
		button.style.fontSize = "15px";
		button.style.fontWeight = "600";
		button.style.lineHeight = "1.25";
		button.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
		const span = document.createElement("span");
		span.textContent = label;
		button.appendChild(span);
		button.addEventListener("click", (event) => {
			event.preventDefault();
			onOpen();
		});
		return button;
	}

	const link = document.createElement("a");
	link.id = CTA_BUTTON_ID;
	link.href = "#";
	link.textContent = label;
	link.style.color = primaryColor;
	link.style.textDecoration = "underline";
	link.style.textUnderlineOffset = "3px";
	link.style.fontWeight = "600";
	link.style.display = "inline-block";
	link.addEventListener("click", (event) => {
		event.preventDefault();
		onOpen();
	});
	return link;
}

function ensureModal(widgetUrl: string, iframeContext?: WidgetIframeContext | null) {
	let modal = document.getElementById(MODAL_ID);
	if (!modal) {
		modal = document.createElement("div");
		modal.id = MODAL_ID;
		modal.hidden = true;
		modal.innerHTML = `
      <div class="omafit-modal-card" role="dialog" aria-modal="true" aria-label="Omafit">
        <button type="button" class="omafit-modal-close" aria-label="Fechar">├ù</button>
        <iframe title="Omafit" src=""></iframe>
      </div>
    `;
		document.body.appendChild(modal);
		modal.addEventListener("click", (event) => {
			if (event.target === modal) {
				modal.hidden = true;
			}
		});
		modal.querySelector(".omafit-modal-close")?.addEventListener("click", () => {
			modal.hidden = true;
		});
	}
	const iframe = modal.querySelector("iframe");
	if (iframe instanceof HTMLIFrameElement) {
		if (iframe.src !== widgetUrl) {
			iframe.src = "about:blank";
		}
		iframe.src = widgetUrl;
		if (iframeContext) {
			lastWidgetIframeContext = iframeContext;
			const onLoad = () => {
				if (lastWidgetIframeContext) {
					postWidgetContextToIframe(iframe, lastWidgetIframeContext);
				}
			};
			iframe.addEventListener("load", onLoad, { once: true });
		}
	}
	return modal;
}

function renderButton(
	store: LegacyStoreContext,
	product: LegacyProductContext,
	config: LegacyStorefrontConfig,
	widgetBaseUrl: string,
	publicId: string | null | undefined,
	footwearCollectionHandles: string[],
	billingPlan: string,
	stylistModeEnabled: boolean,
	categoryTokens: string[] = [],
): boolean {
	if (config.widget_enabled === false) {
		debugLog("render_skipped_disabled", { storeId: store.id }, "L2");
		lastLegacyRenderSnapshot = null;
		removeLegacyCtaIfPresent();
		return false;
	}
	if (shouldHideLegacyProduct(categoryTokens, config)) {
		debugLog(
			"render_skipped_excluded_category",
			{ storeId: store.id, productHandle: product.handle, categoryTokens },
			"L2",
		);
		lastLegacyRenderSnapshot = null;
		removeLegacyCtaIfPresent();
		return false;
	}
	const currentCollectionHandle = resolveCollectionHandleForStorefront(
		footwearCollectionHandles,
		product.handle,
	);
	const isFootwearContext = shouldUseFootwearWidget(
		currentCollectionHandle,
		product.handle,
		footwearCollectionHandles,
	);
	debugLog(
		"render_decision_context",
		{
			storeId: store.id,
			productHandle: product.handle,
			currentCollectionHandle,
			footwearHandlesCount: footwearCollectionHandles.length,
			footwearHandlesSample: footwearCollectionHandles.slice(0, 8),
			isFootwearContext,
		},
		"L2",
	);
	const mount = getEmbedMount();
	if (!mount) {
		debugLog(
			"render_missing_mount",
			{ selectors: BUY_CONTAINER_SELECTORS },
			"L2",
		);
		return false;
	}
	const resolvedBaseUrl = resolveWidgetBaseUrl(
		widgetBaseUrl,
		currentCollectionHandle,
		product.handle,
		footwearCollectionHandles,
	);
	debugLog(
		"render_route_selected",
		{
			storeId: store.id,
			productHandle: product.handle,
			collectionHandle: currentCollectionHandle,
			isFootwearContext,
			pathname: (() => {
				try {
					return new URL(resolvedBaseUrl).pathname;
				} catch {
					return "";
				}
			})(),
		},
		"L2",
	);
	const widgetUrl = buildWidgetUrl(resolvedBaseUrl, store, product, config, publicId, currentCollectionHandle);
	const widgetOrigin = (() => {
		try {
			return new URL(widgetUrl).origin;
		} catch {
			return "*";
		}
	})();
	const iframeContext: WidgetIframeContext = {
		store,
		product,
		config,
		publicId: String(publicId || ""),
		collectionHandle: currentCollectionHandle,
		billingPlan,
		stylistModeEnabled,
		widgetOrigin,
	};
	ensureStyles(config.primary_color || "#810707");
	const openWidget = () => {
		const modal = ensureModal(widgetUrl, iframeContext);
		modal.hidden = false;
	};
	const ctaNode = createStorefrontCta(config, openWidget);
	if (!ctaNode) {
		if (isLegacyCtaReady()) {
			debugLog("render_kept_existing_cta", { storeId: store.id }, "L2");
			return true;
		}
		removeLegacyCtaIfPresent();
		return false;
	}
	let wrapper = document.getElementById(CTA_WRAPPER_ID);
	if (!wrapper) {
		wrapper = document.createElement("div");
		wrapper.id = CTA_WRAPPER_ID;
		wrapper.style.width = "100%";
	}
	wrapper.replaceChildren(ctaNode);
	if (!mountCtaWrapper(wrapper, config.embed_position)) {
		debugLog("render_mount_failed", { storeId: store.id }, "L2");
		return isLegacyCtaReady();
	}
	markLegacyCtaReady(wrapper);
	rememberLegacyRenderSnapshot(
		store,
		config,
		widgetBaseUrl,
		publicId,
		footwearCollectionHandles,
		billingPlan,
		stylistModeEnabled,
	);
	debugLog(
		"render_button_complete",
		{
			storeId: store.id,
			productHandle: product.handle,
			mountFound: true,
			widgetUrl,
		},
		"L2",
	);
	return true;
}

async function init() {
	const store = getStoreContext();
	const product = getProductContext();
	debugLog(
		"legacy_init",
		{
			href: window.location.href,
			storeId: store?.id || null,
			storeDomain: store?.domain || null,
			productHandle: product?.handle || null,
			themeName: String(window.LS?.theme?.name || "").trim() || null,
			appBaseUrl: getAppBaseUrl(),
			hasProductForm: Boolean(document.querySelector(".js-product-form")),
			hasBuyContainer: Boolean(document.querySelector(".js-buy-button-container")),
		},
		"L0",
	);
	if (!store || !product) return;
	const categoryTokens = await resolveLegacyProductCategoryTokens(store, product.handle);
	const appBaseUrl = getAppBaseUrl();
	const {
		config,
		configLoaded,
		widgetUrl,
		publicId,
		footwearCollectionHandles,
		billingPlan,
		stylistModeEnabled,
		storefrontSdkEnabled,
	} = await loadConfig(appBaseUrl, store.id);
	if (storefrontSdkEnabled) {
		lastLegacyRenderSnapshot = null;
		removeLegacyCtaIfPresent();
		debugLog(
			"legacy_init_skipped_sdk_enabled",
			{ storeId: store.id, themeName: String(window.LS?.theme?.name || "").trim() || null },
			"L0",
		);
		return;
	}
	attachMessageBridge();
	if (config && shouldHideLegacyProduct(categoryTokens, config)) {
		lastLegacyRenderSnapshot = null;
		removeLegacyCtaIfPresent();
		debugLog(
			"legacy_init_excluded_category",
			{ storeId: store.id, productHandle: product.handle, categoryTokens },
			"L0",
		);
		return;
	}
	const cachedConfig = readLegacyCtaCache(store.id);
	let renderedFromCache = false;
	if (cachedConfig?.widget_enabled && config) {
		renderedFromCache = renderButton(
			store,
			product,
			{
				link_text: cachedConfig.link_text,
				store_logo: cachedConfig.store_logo,
				primary_color: cachedConfig.primary_color,
				widget_enabled: true,
				excluded_collections: config.excluded_collections || [],
				embed_position: cachedConfig.embed_position,
				cta_type: cachedConfig.cta_type,
				cta_button_border_radius: cachedConfig.cta_button_border_radius,
				tryon_layout: cachedConfig.tryon_layout,
				tryon_layout_background_image: cachedConfig.tryon_layout_background_image,
			},
			`${appBaseUrl}/widget.html`,
			publicId,
			footwearCollectionHandles,
			billingPlan,
			stylistModeEnabled,
			categoryTokens,
		);
	}
	if (!configLoaded) {
		if (!renderedFromCache && !isLegacyCtaReady() && !lastLegacyRenderSnapshot) {
			removeLegacyCtaIfPresent();
		} else {
			scheduleLegacyRemount("config_unavailable");
		}
		debugLog("legacy_init_config_unavailable", { storeId: store.id }, "L0");
		return;
	}
	if (!config) {
		if (isLegacyCtaReady() || lastLegacyRenderSnapshot) {
			scheduleLegacyRemount("config_missing");
		} else {
			removeLegacyCtaIfPresent();
		}
		debugLog("legacy_init_config_missing", { storeId: store.id }, "L0");
		return;
	}
	if (config.widget_enabled === false) {
		lastLegacyRenderSnapshot = null;
		removeLegacyCtaIfPresent();
		debugLog("legacy_init_widget_disabled", { storeId: store.id }, "L0");
		return;
	}
	writeLegacyCtaCache(store.id, config);
	renderButton(
		store,
		product,
		config,
		widgetUrl,
		publicId,
		footwearCollectionHandles,
		billingPlan,
		stylistModeEnabled,
		categoryTokens,
	);
}

function enqueueLegacyInit(attempt = 0) {
	legacyInitChain = legacyInitChain
		.then(async () => {
			await init();
			if (getProductContext() && !isLegacyCtaReady() && attempt < 24) {
				await new Promise<void>((resolve) => {
					window.setTimeout(resolve, 250);
				});
				enqueueLegacyInit(attempt + 1);
			}
		})
		.catch((error) => {
			debugLog(
				"legacy_init_chain_error",
				{ error: error instanceof Error ? error.message : String(error) },
				"L0",
			);
		});
}

if (!(window as Window & { __omafitLegacyInit?: boolean }).__omafitLegacyInit) {
	(window as Window & { __omafitLegacyInit?: boolean }).__omafitLegacyInit = true;
	startLegacyCtaPersistence();
	const bootstrap = () => {
		enqueueLegacyInit(0);
	};
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
	} else {
		bootstrap();
	}
}
