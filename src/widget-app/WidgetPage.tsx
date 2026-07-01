import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TryOnWidget } from "./TryOnWidget";
import { parseTryonLayoutFromLocation, type TryonLayoutMode } from "./utils/parseTryonLayoutFromUrl";
import { readWidgetSearchBootstrap } from "./utils/readWidgetSearchBootstrap";
import { TryonLayoutPendingSplash } from "./tryon/TryonLayoutPendingSplash";
import { fetchOmafitProductByHandle } from "./utils/omafitCatalogClient";
import { getOmafitCatalogRuntimeConfig } from "./utils/omafitEnv";
import { detectWidgetLanguage } from "./widget-translations";
import { OMAFIT_WIDGET_FONT_FALLBACK, sanitizeFontFamilyForCss } from "../shared/storeFont";

type ProductCatalog = {
	sizes: string[];
	colors: string[];
	variants: Array<Record<string, unknown>>;
};

function decodeValue(value: string | null) {
	if (!value) return "";
	try {
		return decodeURIComponent(value);
	} catch {
		return value || "";
	}
}

function deriveStoreName(domain: string) {
	const normalized = String(domain || "").replace(/^https?:\/\//, "").split(".")[0] || "Omafit";
	return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function parseListParam(value: string | null) {
	if (!value) return [];
	try {
		const parsed = JSON.parse(decodeValue(value));
		return Array.isArray(parsed) ? parsed.map((entry) => String(entry || "")).filter(Boolean) : [];
	} catch {
		return [];
	}
}

export function WidgetPage() {
	const sb = useMemo(() => readWidgetSearchBootstrap(), []);
	const params = useMemo(() => new URLSearchParams(window.location.search), []);

	const storeId = decodeValue(params.get("store_id"));
	const storeDomain = decodeValue(params.get("store_domain")) || window.location.hostname;
	const shopDomain = storeId ? `nuvemshop/${storeId}` : storeDomain;

	const [productImage, setProductImage] = useState(sb.productImage);
	const [productImages, setProductImages] = useState<string[]>(sb.productImages);
	const [productId, setProductId] = useState(decodeValue(params.get("product_id")));
	const [productHandle, setProductHandle] = useState(
		decodeValue(params.get("product_handle")) || sb.productHandle || "",
	);
	const [productName, setProductName] = useState(decodeValue(params.get("product_name")));
	const [storeName, setStoreName] = useState(
		decodeValue(params.get("store_name")) || deriveStoreName(storeDomain),
	);
	const [storeLogo, setStoreLogo] = useState(decodeValue(params.get("store_logo")));
	const [primaryColor, setPrimaryColor] = useState(
		decodeValue(params.get("primary_color")) || "#810707",
	);
	const [fontFamily, setFontFamily] = useState(
		sanitizeFontFamilyForCss(decodeValue(params.get("store_font")) || OMAFIT_WIDGET_FONT_FALLBACK),
	);
	const [publicId, setPublicId] = useState(
		decodeValue(params.get("public_id")) || decodeValue(params.get("publicId")),
	);
	const [collectionHandle, setCollectionHandle] = useState(
		decodeValue(params.get("collection_handle")) || decodeValue(params.get("collectionHandle")),
	);
	const [collectionHandlesList, setCollectionHandlesList] = useState<string[]>(() => {
		const csv = decodeValue(params.get("collection_handles") || params.get("collectionHandles"));
		return csv ? csv.split(",").map((h) => h.trim()).filter(Boolean) : [];
	});
	const [stylistModeEnabled, setStylistModeEnabled] = useState(false);
	const [tryonLayoutOverride, setTryonLayoutOverride] = useState<TryonLayoutMode | undefined>(
		parseTryonLayoutFromLocation() || undefined,
	);
	const [productCatalog, setProductCatalog] = useState<ProductCatalog>({
		sizes: [],
		colors: [],
		variants: [],
	});
	const [ready, setReady] = useState(false);
	const [tryonSidebarChrome, setTryonSidebarChrome] = useState(() => {
		const layout = parseTryonLayoutFromLocation();
		return layout === "hero" || layout === "sidebar";
	});

	const handleTryonLayoutChange = useCallback((layout: TryonLayoutMode) => {
		setTryonSidebarChrome(layout === "sidebar" || layout === "hero");
	}, []);

	useEffect(() => {
		const name = decodeValue(params.get("product_name"));
		if (name) setProductName(name);
		const handle = decodeValue(params.get("product_handle"));
		if (handle) setProductHandle(handle);
		const singleImage = decodeValue(params.get("product_image"));
		if (singleImage) {
			setProductImage(singleImage);
			setProductImages((current) => (current.length ? current : [singleImage]));
		}
		const images = parseListParam(params.get("product_images"));
		if (images.length) {
			setProductImages(images);
			setProductImage(images[0]);
		}
	}, [params]);

	useEffect(() => {
		if (!storeId) {
			setReady(true);
			return;
		}
		const query = new URLSearchParams({
			store_id: storeId,
			store_url: storeDomain,
		});
		fetch(`/api/storefront/widget-config?${query.toString()}`)
			.then((res) => res.json())
			.then((json) => {
				const config = json?.config || {};
				if (config.store_logo) setStoreLogo(String(config.store_logo));
				if (config.primary_color) setPrimaryColor(String(config.primary_color));
				if (json?.publicId) setPublicId(String(json.publicId));
				if (json?.stylist_mode_enabled) setStylistModeEnabled(Boolean(json.stylist_mode_enabled));
				if (!tryonLayoutOverride && config.tryon_layout) {
					setTryonLayoutOverride(String(config.tryon_layout) as TryonLayoutMode);
				}
			})
			.catch(() => null)
			.finally(() => setReady(true));
	}, [storeId, storeDomain, tryonLayoutOverride]);

	useEffect(() => {
		if (!productHandle || !publicId) return;
		const runtime = getOmafitCatalogRuntimeConfig();
		if (!runtime.isReady) return;
		fetchOmafitProductByHandle({
			shopDomain,
			publicId,
			handle: productHandle,
		})
			.then((result) => {
				const catalog = result?.product?.catalog;
				if (catalog) {
					setProductCatalog({
						sizes: Array.isArray(catalog.sizes) ? catalog.sizes.map(String) : [],
						colors: Array.isArray(catalog.colors) ? catalog.colors.map(String) : [],
						variants: Array.isArray(catalog.variants) ? catalog.variants : [],
					});
				}
				if (result?.product?.collection_handles?.length) {
					setCollectionHandlesList(result.product.collection_handles.map(String));
				}
			})
			.catch(() => null);
	}, [productHandle, publicId, shopDomain]);

	if (!ready || !productImage) {
		return (
			<div
				className={
					tryonSidebarChrome
						? "flex h-dvh min-h-0 flex-col overflow-hidden bg-transparent p-0"
						: "flex min-h-screen items-center justify-center bg-transparent p-4"
				}
				style={{ fontFamily }}
			>
				{tryonSidebarChrome ? (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
						<TryonLayoutPendingSplash primaryColor={primaryColor} label="Carregando produto..." />
					</div>
				) : (
					<div className="rounded-2xl bg-white p-8 max-w-md text-center shadow-lg">
						<div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-[#810707]" />
						<p className="text-gray-600">Carregando produto...</p>
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			className={
				tryonSidebarChrome
					? "flex h-dvh min-h-0 flex-col overflow-hidden bg-transparent p-0"
					: "flex min-h-screen items-center justify-center bg-transparent px-2 py-4 sm:p-4"
			}
			style={{ fontFamily }}
			onContextMenu={(e) => e.preventDefault()}
		>
			<div
				className={
					tryonSidebarChrome
						? "flex min-h-0 w-full flex-1 flex-col overflow-hidden"
						: `flex w-full min-h-0 max-h-[85vh] flex-col overflow-hidden ${
								tryonSidebarChrome ? "sm:max-w-6xl" : "sm:max-w-2xl"
							}`
				}
			>
				<TryOnWidget
					garmentImage={productImage}
					productImages={productImages}
					productId={productId}
					productHandle={productHandle}
					productName={productName}
					storeName={storeName}
					storeLogo={storeLogo}
					primaryColor={primaryColor}
					fontFamily={fontFamily}
					publicId={publicId}
					shopDomain={shopDomain}
					collectionHandle={collectionHandle}
					collectionHandles={collectionHandlesList}
					language={detectWidgetLanguage(params.get("language") || params.get("lang"))}
					productCatalog={productCatalog}
					tryonLayoutOverride={tryonLayoutOverride}
					onTryonLayoutChange={handleTryonLayoutChange}
					stylistModeEnabled={stylistModeEnabled}
				/>
			</div>
		</div>
	);
}
