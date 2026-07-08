import type { NubeSDK, ProductDetails } from "@tiendanube/nube-sdk-types";
import { normalizeChartHandle, shouldUseFootwearWidget } from "./widgetFootwearRouting";
import { getStorefrontFontFamily, sanitizeFontFamilyForCss } from "./storeFont";

export type StorefrontConfig = {
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

export type StorefrontBootstrap = {
	ready: boolean;
	config: StorefrontConfig;
	widgetUrl: string;
	publicId: string;
	footwearCollectionHandles: string[];
	billingPlan: string;
	stylistModeEnabled: boolean;
};

type StorefrontApiResponse = {
	config?: StorefrontConfig | null;
	widgetUrl?: string | null;
	publicId?: string | null;
	footwear_collection_handles?: string[];
	billing_plan?: string | null;
	stylist_mode_enabled?: boolean;
};

const DEFAULT_CONFIG: StorefrontConfig = {
	link_text: "Ver meu tamanho ideal",
	widget_enabled: true,
	excluded_collections: [],
	primary_color: "#810707",
};

export function getOmafitAppBaseUrl(): string {
	const fromEnv = String(import.meta.env.VITE_OMAFIT_APP_URL || "").trim();
	return fromEnv ? fromEnv.replace(/\/$/, "") : "";
}

export function buildStorefrontConfigEndpoint(storeId: number, storeDomain?: string): string {
	const query = `store_id=${encodeURIComponent(String(storeId))}&store_domain=${encodeURIComponent(storeDomain || "")}`;
	const base = getOmafitAppBaseUrl();
	return base
		? `${base}/api/storefront/widget-config?${query}`
		: `/api/storefront/widget-config?${query}`;
}

export function collectionHandleFromUrl(url: string): string {
	try {
		const match = new URL(url).pathname.match(/\/collections\/([^/]+)/i);
		if (!match?.[1]) return "";
		return decodeURIComponent(match[1]).trim().toLowerCase();
	} catch {
		return "";
	}
}

export function resolveStorefrontPageUrl(nube: NubeSDK): string {
	const state = nube.getState();
	return typeof state.location?.url === "string" ? state.location.url : "";
}

export function resolveCollectionHandleFromNube(
	nube: NubeSDK,
	footwearHandles: string[],
	productHandle: string,
): string {
	const fromUrl = collectionHandleFromUrl(resolveStorefrontPageUrl(nube));
	if (fromUrl) return fromUrl;
	const normalizedProduct = normalizeChartHandle(productHandle);
	if (!normalizedProduct || !footwearHandles.length) return "";
	const footwearSet = new Set(
		footwearHandles.map((handle) => normalizeChartHandle(handle)).filter(Boolean),
	);
	return footwearSet.has(normalizedProduct) ? normalizedProduct : "";
}

export function getCurrentProduct(nube: NubeSDK): ProductDetails | null {
	const page = nube.getState().location.page;
	if (page.type !== "product") return null;
	return page.data.product;
}

export function getProductHandle(nube: NubeSDK, product: ProductDetails): string {
	const language = nube.getState().store.language;
	return (
		product.handle?.[language] ||
		product.handle?.pt ||
		product.handle?.es ||
		product.handle?.en ||
		""
	);
}

export function shouldHideForProduct(product: ProductDetails | null, config: StorefrontConfig) {
	if (config.widget_enabled === false) return true;
	if (!product) return false;
	const categoryIds = (product.categories || []).map((categoryId) => String(categoryId));
	return categoryIds.some((categoryId) => config.excluded_collections.includes(categoryId));
}

export function isProductExcluded(product: ProductDetails, config: StorefrontConfig) {
	const categoryIds = (product.categories || []).map((categoryId) => String(categoryId));
	return categoryIds.some((categoryId) => config.excluded_collections.includes(categoryId));
}

export function resolveWidgetBaseUrl(
	baseUrl: string,
	collectionHandle: string,
	productHandle: string,
	footwearHandles: string[],
) {
	try {
		const resolved = new URL(baseUrl);
		resolved.pathname = shouldUseFootwearWidget(collectionHandle, productHandle, footwearHandles)
			? "/widget-footwear.html"
			: "/widget.html";
		return resolved.toString();
	} catch {
		return baseUrl;
	}
}

function normalizeSizeText(value: string) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim();
}

function variantSizeCandidates(variant: Record<string, unknown>): string[] {
	const values: string[] = [];
	const push = (value: unknown) => {
		const text = String(value || "").trim();
		if (text) values.push(text);
	};
	push(variant.variant_values);
	push(variant.name);
	push(variant.title);
	push(variant.sku);
	const valuesField = variant.values;
	if (Array.isArray(valuesField)) {
		for (const entry of valuesField) {
			if (typeof entry === "string") push(entry);
			if (entry && typeof entry === "object") {
				const record = entry as Record<string, unknown>;
				push(record.pt);
				push(record.es);
				push(record.en);
				push(record.value);
			}
		}
	}
	return values;
}

export function findVariantByRecommendedSize(product: ProductDetails, recommendedSize: string) {
	const desired = normalizeSizeText(recommendedSize);
	if (!desired) return null;
	const variants = Array.isArray(product.variants) ? product.variants : [];
	for (const variant of variants) {
		const record = variant as Record<string, unknown>;
		const matches = variantSizeCandidates(record).some(
			(candidate) => normalizeSizeText(candidate) === desired,
		);
		if (matches) return variant;
	}
	return null;
}

function resolveLocalizedText(
	value: string | Record<string, string> | undefined,
	language: string,
) {
	if (!value) return "";
	if (typeof value === "string") return value;
	return value[language] || value.pt || value.es || value.en || "";
}

function resolveImageUrls(product: ProductDetails, language: string) {
	const rawImages = Array.isArray(
		(product as ProductDetails & { images?: Array<{ src?: unknown }> }).images,
	)
		? (product as ProductDetails & { images?: Array<{ src?: unknown }> }).images
		: [];
	return rawImages
		.map((image) => {
			const source = image?.src;
			if (typeof source === "string") return source;
			if (source && typeof source === "object") {
				const localized = source as Record<string, string | undefined>;
				return localized[language] || localized.pt || localized.es || localized.en || "";
			}
			return "";
		})
		.filter(Boolean);
}

export function buildWidgetUrl(
	baseUrl: string,
	nube: NubeSDK,
	config: StorefrontConfig,
	collectionHandle: string,
	publicId: string,
	billingPlan: string,
	stylistModeEnabled: boolean,
) {
	const state = nube.getState();
	const product = getCurrentProduct(nube);
	if (!product) return baseUrl;

	const selectedVariant = product.variants?.[0] || null;
	const imageUrls = resolveImageUrls(product, state.store.language);
	const productName = resolveLocalizedText(product.name, state.store.language);
	const productHandle = getProductHandle(nube, product);
	const tryonLayout =
		config.tryon_layout === "hero" || config.tryon_layout === "sidebar"
			? config.tryon_layout
			: "default";
	const storeFont = sanitizeFontFamilyForCss(
		String(config.font_family || "").trim() || getStorefrontFontFamily(),
	);
	const shopDomain = `nuvemshop/${state.store.id}`;
	const storeName = String(state.store.name || state.store.domain || "Omafit");

	const widgetUrl = new URL(baseUrl);
	widgetUrl.searchParams.set("platform", "nuvemshop");
	widgetUrl.searchParams.set("store_id", String(state.store.id));
	widgetUrl.searchParams.set("store_domain", state.store.domain);
	widgetUrl.searchParams.set("shopDomain", shopDomain);
	widgetUrl.searchParams.set("product_id", String(product.id));
	widgetUrl.searchParams.set("product_name", productName);
	widgetUrl.searchParams.set("product_handle", productHandle);
	widgetUrl.searchParams.set("language", state.store.language || "pt");
	widgetUrl.searchParams.set("locale", state.store.language || "pt");
	widgetUrl.searchParams.set("currency", state.store.currency);
	widgetUrl.searchParams.set("tryon_layout", tryonLayout);
	widgetUrl.searchParams.set("tryonLayout", tryonLayout);

	if (collectionHandle) {
		widgetUrl.searchParams.set("collection_handle", collectionHandle);
		widgetUrl.searchParams.set("collectionHandle", collectionHandle);
	}
	if (selectedVariant?.id) {
		widgetUrl.searchParams.set("variant_id", String(selectedVariant.id));
	}
	if (imageUrls[0]) {
		widgetUrl.searchParams.set("product_image", imageUrls[0]);
		widgetUrl.searchParams.set("productImage", imageUrls[0]);
	}
	if (imageUrls.length) {
		widgetUrl.searchParams.set("product_images", JSON.stringify(imageUrls));
	}
	if (config.store_logo && widgetUrl.toString().length < 2400) {
		widgetUrl.searchParams.set("store_logo", String(config.store_logo));
		widgetUrl.searchParams.set("storeLogo", String(config.store_logo));
	}
	if (config.primary_color) {
		widgetUrl.searchParams.set("primary_color", String(config.primary_color));
		widgetUrl.searchParams.set("primaryColor", String(config.primary_color));
	}
	if (storeName) {
		widgetUrl.searchParams.set("shopName", storeName);
		widgetUrl.searchParams.set("storeName", storeName);
	}
	if (storeFont) {
		widgetUrl.searchParams.set("store_font", storeFont);
		widgetUrl.searchParams.set("fontFamily", storeFont);
	}
	if (config.tryon_layout_background_image && widgetUrl.toString().length < 2400) {
		widgetUrl.searchParams.set(
			"tryon_layout_background_image",
			String(config.tryon_layout_background_image),
		);
	}
	if (publicId) widgetUrl.searchParams.set("public_id", publicId);
	if (billingPlan) {
		widgetUrl.searchParams.set("billing_plan", billingPlan);
		widgetUrl.searchParams.set("billingPlan", billingPlan);
	}
	if (stylistModeEnabled) {
		widgetUrl.searchParams.set("stylist_mode_enabled", "1");
		widgetUrl.searchParams.set("stylistModeEnabled", "1");
	}

	return widgetUrl.toString();
}

export async function loadStorefrontBootstrap(
	storeId: number,
	storeDomain?: string,
): Promise<StorefrontBootstrap> {
	const endpoint = buildStorefrontConfigEndpoint(storeId, storeDomain);
	try {
		const response = await fetch(endpoint);
		if (!response.ok) throw new Error("request failed");
		const data = (await response.json()) as StorefrontApiResponse;
		const footwearHandles = Array.isArray(data.footwear_collection_handles)
			? data.footwear_collection_handles.map((handle) => String(handle || "").trim()).filter(Boolean)
			: [];
		return {
			ready: true,
			config: {
				...DEFAULT_CONFIG,
				...(data.config || {}),
			},
			widgetUrl: String(data.widgetUrl || "/widget.html"),
			publicId: String(data.publicId || ""),
			footwearCollectionHandles: footwearHandles,
			billingPlan: String(data.billing_plan || ""),
			stylistModeEnabled: Boolean(data.stylist_mode_enabled),
		};
	} catch {
		return {
			ready: false,
			config: DEFAULT_CONFIG,
			widgetUrl: getOmafitAppBaseUrl()
				? `${getOmafitAppBaseUrl()}/widget.html`
				: "/widget.html",
			publicId: "",
			footwearCollectionHandles: [],
			billingPlan: "",
			stylistModeEnabled: false,
		};
	}
}

export function getStorefrontCtaSlot(config: StorefrontConfig) {
	return config.embed_position === "above_buy_buttons"
		? "before_product_detail_add_to_cart"
		: "after_product_detail_add_to_cart";
}
