import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ShoeARWidget } from "./ShoeARWidget";
import { detectWidgetLanguage, type WidgetLanguage } from "./translations";
import { OMAFIT_WIDGET_FONT_FALLBACK, sanitizeFontFamilyForCss } from "../shared/storeFont";

type WidgetConfig = {
	store_logo?: string | null;
	primary_color?: string;
	admin_locale?: string;
};

type SizeRow = {
	size: string;
	[key: string]: string;
};

type ApiChart = {
	collection_handle: string;
	collection_type: "upper" | "lower" | "full" | "footwear";
	collection_elasticity: "structured" | "light_flex" | "flexible" | "high_elasticity" | "";
	measurement_refs: string[];
	sizes: SizeRow[];
};

type ParsedParams = {
	storeId: string;
	storeDomain: string;
	storeName: string;
	productId: string;
	productName: string;
	productHandle: string;
	variantId: string;
	publicId: string;
	productImage: string;
	storeLogo: string;
	primaryColor: string;
	language: WidgetLanguage;
	storeFont: string;
	productDescription: string;
	collectionHandle: string;
};

function decodeValue(value: string | null) {
	if (!value) return "";
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
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

function deriveStoreName(domain: string): string {
	const normalized = String(domain || "")
		.replace(/^https?:\/\//i, "")
		.replace(/^www\./i, "")
		.split("/")[0]
		.split(":")[0]
		.split(".")[0];
	if (!normalized) return "Omafit";
	return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeHandle(value: string): string {
	return String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{M}/gu, "");
}

function getParams(): ParsedParams {
	const search = new URLSearchParams(window.location.search);
	const storeDomain = decodeValue(search.get("store_domain")) || window.location.hostname;
	const productImages = parseListParam(search.get("product_images"));
	const productImage = decodeValue(search.get("product_image")) || productImages[0] || "";
	return {
		storeId: decodeValue(search.get("store_id")),
		storeDomain,
		storeName: decodeValue(search.get("store_name")) || deriveStoreName(storeDomain),
		productId: decodeValue(search.get("product_id")),
		productName: decodeValue(search.get("product_name")),
		productHandle: decodeValue(search.get("product_handle")),
		variantId: decodeValue(search.get("variant_id")),
		publicId: decodeValue(search.get("public_id")) || decodeValue(search.get("publicId")),
		productImage,
		storeLogo: decodeValue(search.get("store_logo")),
		primaryColor: decodeValue(search.get("primary_color")) || "#810707",
		language: detectWidgetLanguage(
			decodeValue(search.get("language")) ||
				decodeValue(search.get("admin_locale")) ||
				decodeValue(search.get("lang")),
		),
		storeFont: decodeValue(search.get("store_font")),
		productDescription: decodeValue(search.get("product_description")),
		collectionHandle: decodeValue(search.get("collection_handle")),
	};
}

function pickFootwearChart(
	charts: ApiChart[],
	collectionHandle: string,
	productHandle: string,
): ApiChart | null {
	const footwearCharts = charts.filter((chart) => chart.collection_type === "footwear");
	if (!footwearCharts.length) return null;

	const targetCollection = normalizeHandle(collectionHandle);
	if (targetCollection) {
		const fromCollection = footwearCharts.find(
			(chart) => normalizeHandle(chart.collection_handle) === targetCollection,
		);
		if (fromCollection) return fromCollection;
	}

	const targetProduct = normalizeHandle(productHandle);
	if (targetProduct) {
		const fromProduct = footwearCharts.find(
			(chart) => normalizeHandle(chart.collection_handle) === targetProduct,
		);
		if (fromProduct) return fromProduct;
	}

	return footwearCharts[0] ?? null;
}

export function FootwearWidgetPage() {
	const params = useMemo(() => getParams(), []);
	const [charts, setCharts] = useState<ApiChart[]>([]);
	const [publicId, setPublicId] = useState(params.publicId);
	const [storeLogo, setStoreLogo] = useState(params.storeLogo);
	const [primaryColor, setPrimaryColor] = useState(params.primaryColor);
	const [language, setLanguage] = useState<WidgetLanguage>(params.language);
	const [storeFontFamily, setStoreFontFamily] = useState(
		sanitizeFontFamilyForCss(params.storeFont) || "",
	);

	useLayoutEffect(() => {
		const stack = storeFontFamily ? storeFontFamily : OMAFIT_WIDGET_FONT_FALLBACK;
		document.documentElement.style.setProperty("--omafit-store-font", stack);
	}, [storeFontFamily]);

	useEffect(() => {
		const fetchBootstrap = async () => {
			if (!params.storeId) return;
			try {
				const [configResponse, chartResponse] = await Promise.all([
					fetch(
						`/api/storefront/widget-config?store_id=${encodeURIComponent(params.storeId)}&store_domain=${encodeURIComponent(params.storeDomain)}`,
					),
					fetch(`/api/size-charts?store_id=${encodeURIComponent(params.storeId)}`),
				]);
				const configPayload = await configResponse.json().catch(() => ({}));
				const chartPayload = await chartResponse.json().catch(() => ({}));

				if (configPayload?.config) {
					const config = configPayload.config as WidgetConfig;
					if (config.primary_color) setPrimaryColor(String(config.primary_color));
					const resolvedStoreLogo = config.store_logo || configPayload?.config?.modal_config?.storeLogo || "";
					if (resolvedStoreLogo) setStoreLogo(String(resolvedStoreLogo));
					if (config.admin_locale) {
						setLanguage(detectWidgetLanguage(String(config.admin_locale)));
					}
				}
				if (configPayload?.publicId) {
					setPublicId(String(configPayload.publicId));
				}
				if (Array.isArray(chartPayload?.charts)) {
					setCharts(chartPayload.charts as ApiChart[]);
				}
			} catch {
				// silent fallback
			}
		};
		void fetchBootstrap();
	}, [params.storeDomain, params.storeId]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.data?.type !== "omafit-store-font") return;
			const next = sanitizeFontFamilyForCss(String(event.data.fontFamily || ""));
			if (next) setStoreFontFamily(next);
		};
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, []);

	const selectedChart = useMemo(
		() => pickFootwearChart(charts, params.collectionHandle, params.productHandle),
		[charts, params.collectionHandle, params.productHandle],
	);

	return (
		<ShoeARWidget
			productImage={params.productImage}
			productName={params.productName}
			storeName={params.storeName}
			storeLogo={storeLogo}
			primaryColor={primaryColor}
			language={language}
			chart={selectedChart}
			productId={params.productId}
			storeDomain={params.storeDomain}
			variantId={params.variantId}
			storeId={params.storeId}
			productHandle={params.productHandle}
			collectionElasticity={selectedChart?.collection_elasticity}
			publicId={publicId}
			productDescription={params.productDescription}
		/>
	);
}
