import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Camera, Sparkles } from "lucide-react";
import {
	calculateIdealSize,
	type ElasticityLevel,
	type SizeChartEntry,
} from "./sizeCalculation";
import {
	detectWidgetLanguage,
	type WidgetLanguage,
	type WidgetTranslationKey,
	widgetTranslations,
} from "./translations";

type Step = "info" | "calculator" | "photo" | "confirm" | "processing" | "result";

type WidgetConfig = {
	link_text?: string;
	store_logo?: string | null;
	primary_color?: string;
	widget_enabled?: boolean;
	admin_locale?: string;
};

type SizeRow = {
	size: string;
	[key: string]: string;
};

type ApiChart = {
	collection_handle: string;
	gender: "male" | "female" | "unisex";
	collection_type: "upper" | "lower" | "full" | "footwear";
	collection_elasticity: "structured" | "light_flex" | "flexible" | "high_elasticity" | "";
	measurement_refs: string[];
	sizes: SizeRow[];
};

type SizeData = {
	gender: "male" | "female";
	height: number;
	weight: number;
	bodyType: number;
	fit: number;
	bodyTypeIndex: number;
	fitIndex: number;
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
	productImages: string[];
	storeLogo: string;
	primaryColor: string;
	language: WidgetLanguage;
};

type TryOnStartResponse = {
	success?: boolean;
	fal_request_id?: string;
	error?: string;
	debug?: Record<string, unknown>;
};

type TryOnStatusResponse = {
	status?: string;
	output?: string | string[];
	error?: string;
};

const BODY_TYPES = {
	male: [
		{
			labelKey: "bodyTypeLabelBalanced",
			descriptionKey: "bodyTypeDescBalanced",
			factor: 1,
			image:
				"https://lhkgnirolvbmomeduoaj.supabase.co/storage/v1/object/public/Manequins/Manequim%20Levemente%20Magro.jpg",
		},
		{
			labelKey: "bodyTypeLabelWiderChest",
			descriptionKey: "bodyTypeDescWiderChest",
			factor: 1.04,
			image:
				"https://lhkgnirolvbmomeduoaj.supabase.co/storage/v1/object/public/Manequins/manequimmasatletico.jpg",
		},
		{
			labelKey: "bodyTypeLabelWideTorso",
			descriptionKey: "bodyTypeDescWideTorso",
			factor: 1.06,
			image:
				"https://lhkgnirolvbmomeduoaj.supabase.co/storage/v1/object/public/Manequins/manequimmasgordinho.jpg",
		},
		{
			labelKey: "bodyTypeLabelVeryWideChest",
			descriptionKey: "bodyTypeDescVeryWideChest",
			factor: 1.1,
			image:
				"https://lhkgnirolvbmomeduoaj.supabase.co/storage/v1/object/public/Manequins/manequimmasforte.jpg",
		},
		{
			labelKey: "bodyTypeLabelWideWaist",
			descriptionKey: "bodyTypeDescWideWaist",
			factor: 1.15,
			image:
				"https://lhkgnirolvbmomeduoaj.supabase.co/storage/v1/object/public/Manequins/manequimmasgordo.jpg",
		},
	],
	female: [
		{
			labelKey: "bodyTypeLabelBalanced",
			descriptionKey: "bodyTypeDescBalanced",
			factor: 1,
			image:
				"https://lhkgnirolvbmomeduoaj.supabase.co/storage/v1/object/public/Manequins/manequimfemmagra.jpg",
		},
		{
			labelKey: "bodyTypeLabelWiderChest",
			descriptionKey: "bodyTypeDescWiderChest",
			factor: 1.04,
			image:
				"https://lhkgnirolvbmomeduoaj.supabase.co/storage/v1/object/public/Manequins/manequimfemombrolargo.jpg",
		},
		{
			labelKey: "bodyTypeLabelWideTorso",
			descriptionKey: "bodyTypeDescWideTorso",
			factor: 1.06,
			image:
				"https://lhkgnirolvbmomeduoaj.supabase.co/storage/v1/object/public/Manequins/manequimfemquadrillargo.jpg",
		},
		{
			labelKey: "bodyTypeLabelVeryWideChest",
			descriptionKey: "bodyTypeDescVeryWideChest",
			factor: 1.1,
			image:
				"https://lhkgnirolvbmomeduoaj.supabase.co/storage/v1/object/public/Manequins/manequimfemcinturalarga.jpg",
		},
		{
			labelKey: "bodyTypeLabelWideWaist",
			descriptionKey: "bodyTypeDescWideWaist",
			factor: 1.15,
			image:
				"https://lhkgnirolvbmomeduoaj.supabase.co/storage/v1/object/public/Manequins/manequimfembustolargo.jpg",
		},
	],
} as const;

const FIT_OPTIONS = [
	{ labelKey: "fitTight", factor: 0.97 },
	{ labelKey: "fitRegular", factor: 1 },
	{ labelKey: "fitLoose", factor: 1.03 },
] as const;

const PROCESSING_MESSAGES: WidgetTranslationKey[] = [
	"creatingTryOn",
	"sendingImages",
	"scanningBody",
	"applyingProduct",
	"refiningDetails",
	"finalizingResult",
];

function deriveStoreName(domain: string) {
	const normalized = String(domain || "").replace(/^https?:\/\//, "").split(".")[0] || "Omafit";
	return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function decodeValue(value: string | null) {
	if (!value) return "";
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function formatTryonDebug(debug?: Record<string, unknown>) {
	if (!debug) return "";
	const incoming = (debug.incoming as Record<string, unknown> | undefined) || {};
	const widgetKey = (debug.widgetKey as Record<string, unknown> | undefined) || {};
	const requestShop = (debug.requestShop as Record<string, unknown> | undefined) || {};
	const widgetShop = (debug.widgetShop as Record<string, unknown> | undefined) || {};
	const forwarded = (debug.forwarded as Record<string, unknown> | undefined) || {};
	const parts = [
		`reqDomain=${String(incoming.shopDomain || "")}`,
		`resolvedPublicId=${String(debug.resolvedPublicId || "")}`,
		`widgetDomain=${String(widgetKey.shopDomain || widgetKey.domain || "")}`,
		`requestShop=${requestShop.shopDomain ? "ok" : "missing"}`,
		`widgetShop=${widgetShop.shopDomain ? "ok" : "missing"}`,
		`forwardedPublicId=${String(forwarded.publicId || "")}`,
	];
	return ` [debug: ${parts.join(" | ")}]`;
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
		publicId:
			decodeValue(search.get("public_id")) || decodeValue(search.get("publicId")),
		productImage,
		productImages,
		storeLogo: decodeValue(search.get("store_logo")),
		primaryColor: decodeValue(search.get("primary_color")) || "#810707",
		language: detectWidgetLanguage(
			decodeValue(search.get("language")) ||
				decodeValue(search.get("admin_locale")) ||
				decodeValue(search.get("lang")),
		),
	};
}

function normalizeElasticity(value: ApiChart["collection_elasticity"]): ElasticityLevel {
	if (value === "structured") return "structured";
	if (value === "flexible") return "flexible";
	if (value === "high_elasticity") return "high";
	return "light";
}

function normalizeMeasurementLabel(value: string) {
	switch (value.toLowerCase()) {
		case "peito":
		case "busto":
			return "Busto";
		case "cintura":
			return "Cintura";
		case "quadril":
			return "Quadril";
		case "ombro":
			return "Ombro";
		case "comprimento":
			return "Comprimento";
		default:
			return value.charAt(0).toUpperCase() + value.slice(1);
	}
}

function mapChart(chart: ApiChart): SizeChartEntry[] {
	return chart.sizes.map((row, index) => {
		const measurements: Record<string, number> = {};
		for (const key of chart.measurement_refs) {
			const numeric = Number(row[key]);
			if (Number.isFinite(numeric)) {
				measurements[key.toLowerCase()] = numeric;
				if (key === "peito") measurements.bust = numeric;
				if (key === "cintura") measurements.waist = numeric;
				if (key === "quadril") measurements.hips = numeric;
			}
		}
		return {
			size_name: row.size,
			order: index,
			measurements,
			measurement_labels: chart.measurement_refs.map(normalizeMeasurementLabel),
		};
	});
}

function chooseChart(charts: ApiChart[], gender: "male" | "female", handle: string) {
	const normalizedHandle = String(handle || "").trim().toLowerCase();
	return (
		charts.find(
			(chart) =>
				String(chart.collection_handle || "").trim().toLowerCase() === normalizedHandle &&
				(chart.gender === gender || chart.gender === "unisex"),
		) ||
		charts.find((chart) => chart.gender === gender) ||
		charts.find((chart) => chart.gender === "unisex") ||
		charts[0] ||
		null
	);
}

function darkenColor(hex: string, amount = 20) {
	const value = hex.replace("#", "");
	if (value.length !== 6) return hex;
	const clamp = (part: string) => Math.max(0, Number.parseInt(part, 16) - amount);
	return `#${[value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)]
		.map((part) => clamp(part).toString(16).padStart(2, "0"))
		.join("")}`;
}

function getT(language: WidgetLanguage) {
	return (key: WidgetTranslationKey, replacements?: Record<string, string>) => {
		let value = widgetTranslations[language][key] || widgetTranslations.en[key] || key;
		if (replacements) {
			for (const [token, replacement] of Object.entries(replacements)) {
				value = value.replace(`{${token}}`, replacement);
			}
		}
		return value;
	};
}

function pollDelay(attempt: number) {
	if (attempt < 2) return 800;
	if (attempt < 5) return 1800;
	return 3000;
}

export function WidgetPage() {
	const params = useMemo(() => getParams(), []);
	const [config, setConfig] = useState<WidgetConfig | null>(null);
	const [charts, setCharts] = useState<ApiChart[]>([]);
	const [publicId, setPublicId] = useState(params.publicId);
	const [step, setStep] = useState<Step>("info");
	const [language, setLanguage] = useState<WidgetLanguage>(params.language);
	const [primaryColor, setPrimaryColor] = useState(params.primaryColor);
	const [storeLogo, setStoreLogo] = useState(params.storeLogo);
	const [error, setError] = useState("");
	const [sizeData, setSizeData] = useState<SizeData | null>(null);
	const [gender, setGender] = useState<"male" | "female">("female");
	const [height, setHeight] = useState("");
	const [weight, setWeight] = useState("");
	const [bodyTypeIndex, setBodyTypeIndex] = useState<number | null>(null);
	const [fitIndex, setFitIndex] = useState(1);
	const [photoFile, setPhotoFile] = useState<File | null>(null);
	const [photoPreview, setPhotoPreview] = useState("");
	const [recommendedSize, setRecommendedSize] = useState("");
	const [resultImage, setResultImage] = useState("");
	const [processingMessageKey, setProcessingMessageKey] =
		useState<WidgetTranslationKey>("creatingTryOn");
	const [isAddingToCart, setIsAddingToCart] = useState(false);
	const [addToCartFeedback, setAddToCartFeedback] = useState("");
	const [currentImageIndex, setCurrentImageIndex] = useState(0);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const pollingTimerRef = useRef<number | null>(null);
	const sessionIdRef = useRef(`widget_${Date.now().toString(36)}`);

	const productImages = params.productImages.length
		? params.productImages
		: params.productImage
			? [params.productImage]
			: [];
	const selectedProductImage = productImages[currentImageIndex] || params.productImage;
	const displayImage = step === "photo" ? selectedProductImage : params.productImage || selectedProductImage;
	const t = useMemo(() => getT(language), [language]);
	const hoverColor = useMemo(() => darkenColor(primaryColor, 16), [primaryColor]);
	const selectedChart = useMemo(
		() => chooseChart(charts, sizeData?.gender || gender, params.productHandle),
		[charts, sizeData?.gender, gender, params.productHandle],
	);

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
					setConfig(configPayload.config);
					if (configPayload.config.primary_color) setPrimaryColor(configPayload.config.primary_color);
					if (configPayload.config.store_logo) setStoreLogo(configPayload.config.store_logo);
					if (configPayload.config.admin_locale) {
						setLanguage(detectWidgetLanguage(configPayload.config.admin_locale));
					}
				}
				if (configPayload?.publicId) {
					setPublicId(String(configPayload.publicId));
				}
				if (Array.isArray(chartPayload?.charts)) {
					setCharts(chartPayload.charts);
				}
			} catch (_error) {
				// silent fallback
			}
		};
		void fetchBootstrap();
	}, [params.storeId]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.data?.type === "omafit-add-to-cart-result") {
				setIsAddingToCart(false);
				setAddToCartFeedback(
					event.data?.ok ? t("addToCartSuccess") : event.data?.message || t("addToCartError"),
				);
			}
		};
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [t]);

	useEffect(() => {
		return () => {
			if (pollingTimerRef.current) window.clearTimeout(pollingTimerRef.current);
			if (photoPreview) URL.revokeObjectURL(photoPreview);
		};
	}, [photoPreview]);

	function goBack() {
		if (step === "calculator") setStep("info");
		if (step === "photo") setStep("calculator");
		if (step === "confirm") setStep("photo");
	}

	function buildSizeData() {
		if (!height || !weight || bodyTypeIndex === null) {
			setError(t("fillAllFields"));
			return null;
		}
		const parsedHeight = Number(height);
		const parsedWeight = Number(weight);
		if (parsedHeight < 100 || parsedHeight > 250) {
			setError(t("invalidHeight"));
			return null;
		}
		if (parsedWeight < 30 || parsedWeight > 300) {
			setError(t("invalidWeight"));
			return null;
		}
		const bodyTypes = BODY_TYPES[gender];
		return {
			gender,
			height: parsedHeight,
			weight: parsedWeight,
			bodyTypeIndex,
			bodyType: bodyTypes[bodyTypeIndex].factor,
			fitIndex,
			fit: FIT_OPTIONS[fitIndex].factor,
		} satisfies SizeData;
	}

	function handleCalculatorContinue() {
		const nextData = buildSizeData();
		if (!nextData) return;
		setError("");
		setSizeData(nextData);
		setStep("photo");
	}

	function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			setError(t("onlyImages"));
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			setError(t("maxFileSize"));
			return;
		}
		if (photoPreview) URL.revokeObjectURL(photoPreview);
		setPhotoFile(file);
		setPhotoPreview(URL.createObjectURL(file));
		setError("");
	}

	function goToConfirm() {
		if (!photoFile) {
			setError(t("selectProductAndPhoto"));
			return;
		}
		setError("");
		setStep("confirm");
	}

	async function startPolling(predictionId: string, attempt = 0) {
		try {
			const response = await fetch(`/api/widget/tryon-status/${encodeURIComponent(predictionId)}`);
			const data = (await response.json().catch(() => ({}))) as TryOnStatusResponse;
			if (data.status === "completed" && data.output) {
				setResultImage(Array.isArray(data.output) ? data.output[0] : data.output);
				setStep("result");
				return;
			}
			if (data.status === "failed" || data.status === "error" || data.status === "not_found") {
				setStep("result");
				return;
			}
		} catch (_error) {
			setStep("result");
			return;
		}
		setProcessingMessageKey(PROCESSING_MESSAGES[Math.min(attempt + 1, PROCESSING_MESSAGES.length - 1)]);
		pollingTimerRef.current = window.setTimeout(() => {
			void startPolling(predictionId, attempt + 1);
		}, pollDelay(attempt));
	}

	async function handleSubmit() {
		if (!sizeData) {
			setError(t("requiredBodyData"));
			return;
		}
		if (!photoFile) {
			setError(t("selectProductAndPhoto"));
			return;
		}

		setError("");
		setProcessingMessageKey("creatingTryOn");
		setStep("processing");

		let provisionalSize = recommendedSize;
		if (selectedChart) {
			const mappedChart = mapChart(selectedChart);
			const recommendation = calculateIdealSize(
				sizeData.height,
				sizeData.weight,
				sizeData.bodyType,
				sizeData.fit,
				mappedChart,
				selectedChart.measurement_refs.map(normalizeMeasurementLabel),
				undefined,
				null,
				normalizeElasticity(selectedChart.collection_elasticity),
			);
			if (recommendation?.size) {
				provisionalSize = recommendation.size;
				setRecommendedSize(recommendation.size);
			}
		}

		const formData = new FormData();
		formData.append("model_image_file", photoFile, photoFile.name || "tryon-model.jpg");
		formData.append("store_id", params.storeId);
		formData.append("shop_domain", params.storeDomain);
		formData.append("garment_image", selectedProductImage || "");
		formData.append("product_name", params.productName);
		formData.append("product_id", params.productId);
		formData.append("public_id", publicId || "");
		formData.append(
			"user_measurements",
			JSON.stringify({
				gender: sizeData.gender,
				height: sizeData.height,
				weight: sizeData.weight,
				body_type_index: sizeData.bodyTypeIndex,
				fit_preference_index: sizeData.fitIndex,
				recommended_size: provisionalSize || "",
			}),
		);

		try {
			const response = await fetch("/api/widget/tryon", {
				method: "POST",
				body: formData,
			});
			const result = (await response.json().catch(() => ({}))) as TryOnStartResponse;
			if (!response.ok || !result.success || !result.fal_request_id) {
				throw new Error((result.error || t("processingError")) + formatTryonDebug(result.debug));
			}
			setProcessingMessageKey("generating");
			void startPolling(result.fal_request_id);
		} catch (caughtError) {
			setStep("confirm");
			setError(caughtError instanceof Error ? caughtError.message : t("processingError"));
		}
	}

	function handleAddToCart() {
		if (isAddingToCart) return;
		setIsAddingToCart(true);
		setAddToCartFeedback("");
		window.parent.postMessage(
			{
				type: "omafit-add-to-cart-request",
				requestId: `cart_${sessionIdRef.current}_${Date.now()}`,
				source: "omafit-widget-nuvemshop",
				product: {
					id: params.productId,
					name: params.productName,
				},
				selection: {
					recommended_size: recommendedSize || null,
					recommended_size_label: recommendedSize || null,
					variant_option_name: "Tamanho",
					selected_options: recommendedSize ? { Tamanho: recommendedSize } : {},
					selected_variant_id: params.variantId || null,
				},
				quantity: 1,
				shop_domain: params.storeDomain,
				metadata: {
					session_id: sessionIdRef.current,
					language,
					recommended_size_label: recommendedSize || null,
					selected_variant_id: params.variantId || null,
				},
			},
			"*",
		);
		window.setTimeout(() => {
			setIsAddingToCart((current) => {
				if (!current) return current;
				setAddToCartFeedback(t("addToCartError"));
				return false;
			});
		}, 8000);
	}

	function resetWidget() {
		if (pollingTimerRef.current) window.clearTimeout(pollingTimerRef.current);
		setError("");
		setPhotoFile(null);
		if (photoPreview) URL.revokeObjectURL(photoPreview);
		setPhotoPreview("");
		setSizeData(null);
		setRecommendedSize("");
		setResultImage("");
		setAddToCartFeedback("");
		setIsAddingToCart(false);
		setHeight("");
		setWeight("");
		setBodyTypeIndex(null);
		setFitIndex(1);
		setCurrentImageIndex(0);
		setStep("info");
	}

	if (!params.productName) {
		return (
			<div className="w-full h-full bg-white flex items-center justify-center rounded-2xl">
				<div className="text-center">
					<div className="flex items-center justify-center gap-1 mb-4">
						<span className="inline-block w-2 h-2 rounded-full animate-bounce bg-primary" style={{ animationDelay: "0ms", animationDuration: "1.4s" }} />
						<span className="inline-block w-2 h-2 rounded-full animate-bounce bg-primary" style={{ animationDelay: "200ms", animationDuration: "1.4s" }} />
						<span className="inline-block w-2 h-2 rounded-full animate-bounce bg-primary" style={{ animationDelay: "400ms", animationDuration: "1.4s" }} />
					</div>
					<p className="text-gray-700 text-base">{t("loadingProduct")}</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<style>{`
				* { font-family: 'Inter', sans-serif; }
				.bg-primary { background-color: ${primaryColor} !important; }
				.text-primary { color: ${primaryColor} !important; }
				.border-primary { border-color: ${primaryColor} !important; }
				.hover\\:bg-primary-dark:hover { background-color: ${hoverColor} !important; }
				.hover\\:border-primary:hover { border-color: ${primaryColor} !important; }
				.animate-fade-in { animation: omafitFadeIn 220ms ease-out; }
				@keyframes omafitFadeIn {
					from { opacity: 0; transform: translateY(8px); }
					to { opacity: 1; transform: translateY(0); }
				}
			`}</style>

			{step === "result" ? (
				<div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in">
					<div className="flex items-center justify-between p-4 border-b border-primary">
						<button onClick={resetWidget} className="text-gray-500 hover:text-gray-700 transition-colors">
							<ArrowLeft className="w-6 h-6" />
						</button>
						<div className="flex-1 flex justify-center">
							{storeLogo ? (
								<img src={storeLogo} alt={params.storeName} className="h-12 w-auto object-contain" />
							) : (
								<div className="h-12 flex items-center font-bold text-primary">{params.storeName}</div>
							)}
						</div>
						<div className="w-10" />
					</div>

					<div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
						<div className="flex justify-start">
							<div className="max-w-[65%] md:max-w-[30%]">
								{resultImage ? (
									<img src={resultImage} alt="Try-on result" className="w-full rounded-2xl shadow-md" />
								) : (
									<div className="w-full min-h-[220px] rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center text-sm text-gray-500 p-4 text-center">
										{t("noPreviewYet")}
									</div>
								)}
							</div>
						</div>

						<div className="flex gap-2 justify-start">
							{storeLogo ? (
								<div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-white shadow-sm flex items-center justify-center p-1">
									<img src={storeLogo} alt={params.storeName} className="w-full h-full object-contain" />
								</div>
							) : null}
							<div className="max-w-[80%] rounded-2xl p-4 bg-gray-100 text-gray-900">
								<p className="text-sm md:text-base whitespace-pre-line">
									{`${t("recommendedSize")} ${recommendedSize || "-"}. ${t("congratsMessage")}`}
								</p>
							</div>
						</div>
					</div>

					<div className="p-4 border-t bg-gray-50">
						<button
							type="button"
							onClick={handleAddToCart}
							disabled={isAddingToCart}
							className="w-full mb-3 px-4 py-3 rounded-xl font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed bg-primary hover:bg-primary-dark text-white"
						>
							{isAddingToCart ? `${t("addToCart")}...` : t("addToCart")}
						</button>
						{addToCartFeedback ? (
							<p className="text-xs text-center text-gray-600 mb-3">{addToCartFeedback}</p>
						) : null}
						<button
							type="button"
							onClick={resetWidget}
							className="w-full px-4 py-3 rounded-xl font-semibold border border-primary text-primary bg-white hover:border-primary"
						>
							{t("newTryOn")}
						</button>
					</div>
				</div>
			) : (
				<div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in">
					<div className="flex items-center justify-between p-4 border-b border-primary">
						{step !== "info" && step !== "processing" ? (
							<button onClick={goBack} className="text-gray-500 hover:text-gray-700 transition-colors">
								<ArrowLeft className="w-6 h-6" />
							</button>
						) : (
							<div className="w-6" />
						)}

						<div className="flex-1 flex justify-center">
							{storeLogo ? (
								<img src={storeLogo} alt={params.storeName} className="h-12 w-auto object-contain" />
							) : (
								<div className="h-12 flex items-center font-bold text-primary">{params.storeName}</div>
							)}
						</div>
						<div className="w-6" />
					</div>

					<div className="flex-1 flex flex-col md:flex-row overflow-hidden">
						{step === "info" ? (
							<div className="hidden md:flex md:w-1/2 bg-gray-50 p-8 items-center justify-center">
								<div className="w-full max-w-md rounded-2xl overflow-hidden bg-gray-100">
									<img src={displayImage} alt={params.productName} className="w-full h-auto object-contain" />
								</div>
							</div>
						) : null}

						<div className={`flex-1 p-2 md:p-4 overflow-y-auto ${step !== "info" ? "md:w-full" : ""}`}>
							{error ? (
								<div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2 animate-fade-in">
									<AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
									<p className="text-red-700 text-base">{error}</p>
								</div>
							) : null}

							{step === "info" ? (
								<div className="space-y-4 animate-fade-in md:flex md:flex-col md:justify-center md:h-full">
									<div className="md:hidden bg-gray-50 rounded-xl p-3">
										<div className="w-full rounded-2xl overflow-hidden bg-gray-100">
											<img src={displayImage} alt={params.productName} className="w-full h-auto object-contain" />
										</div>
									</div>
									<div className="text-center">
										<h3 className="text-2xl md:text-3xl font-semibold mb-2 text-primary">
											{t("visualExperience", { storeName: params.storeName })}
										</h3>
										<p className="text-gray-700 text-lg md:text-xl">{t("visualExperienceDesc")}</p>
									</div>
									<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
										<div className="text-center">
											<h4 className="font-medium text-blue-800 mb-2 text-base md:text-lg">{t("howItWorks")}</h4>
											<p className="text-base md:text-lg text-blue-700">{t("howItWorksDesc")}</p>
										</div>
									</div>
									<button
										onClick={() => setStep("calculator")}
										className="w-full bg-primary text-white py-3.5 md:py-4 rounded-lg hover:bg-primary-dark transition-all flex items-center justify-center gap-2 font-medium text-lg md:text-xl"
									>
										{config?.link_text || t("startNow")}
										<ArrowRight className="w-5 h-5 md:w-6 md:h-6" />
									</button>
									<p className="text-sm md:text-base text-center text-gray-500">{t("privacyNote")}</p>
								</div>
							) : null}

							{step === "calculator" ? (
								<div className="animate-fade-in max-w-4xl mx-auto">
									<div className="flex flex-col h-full">
										<div className="flex-1 overflow-y-auto px-2 md:px-6 py-4">
											<h2 className="text-xl font-bold text-gray-900 mb-4">{t("sizeCalculatorTitle")}</h2>
											<div className="space-y-5">
												<div>
													<label className="block text-sm font-medium text-gray-700 mb-2">{t("genderLabel")}</label>
													<div className="grid grid-cols-2 gap-2">
														<button
															onClick={() => {
																setGender("female");
																setBodyTypeIndex(null);
															}}
															className={`py-2 px-4 rounded-lg font-medium transition-colors ${gender === "female" ? "text-white bg-primary" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
														>
															{t("female")}
														</button>
														<button
															onClick={() => {
																setGender("male");
																setBodyTypeIndex(null);
															}}
															className={`py-2 px-4 rounded-lg font-medium transition-colors ${gender === "male" ? "text-white bg-primary" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
														>
															{t("male")}
														</button>
													</div>
												</div>

												<div className="grid grid-cols-2 gap-3">
													<input
														type="number"
														value={height}
														onChange={(event) => setHeight(event.target.value)}
														placeholder={t("heightPlaceholder")}
														className="w-full px-3 py-2 border border-gray-300 rounded-lg transition-all"
													/>
													<input
														type="number"
														value={weight}
														onChange={(event) => setWeight(event.target.value)}
														placeholder={t("weightPlaceholder")}
														className="w-full px-3 py-2 border border-gray-300 rounded-lg transition-all"
													/>
												</div>

												<div>
													<label className="block text-sm font-medium text-gray-700 mb-2">{t("bodyTypeQuestion")}</label>
													<div className="flex flex-col gap-2">
														<div className="grid grid-cols-3 gap-2 md:hidden">
															{BODY_TYPES[gender].slice(0, 3).map((type, index) => (
																<button
																	key={type.image}
																	onClick={() => setBodyTypeIndex(index)}
																	className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all ${bodyTypeIndex === index ? "border-primary" : "border-gray-200 hover:border-gray-300"}`}
																>
																	<img src={type.image} alt={t(type.labelKey)} className="w-full h-full object-cover object-top" />
																</button>
															))}
														</div>
														<div className="flex justify-center gap-2 md:hidden" style={{ marginLeft: "calc((100% / 3 + 0.5rem) / 2)", marginRight: "calc((100% / 3 + 0.5rem) / 2)" }}>
															{BODY_TYPES[gender].slice(3, 5).map((type, index) => (
																<button
																	key={type.image}
																	onClick={() => setBodyTypeIndex(index + 3)}
																	style={{ width: "calc(50% - 0.25rem)" }}
																	className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all ${bodyTypeIndex === index + 3 ? "border-primary" : "border-gray-200 hover:border-gray-300"}`}
																>
																	<img src={type.image} alt={t(type.labelKey)} className="w-full h-full object-cover object-top" />
																</button>
															))}
														</div>
														<div className="hidden md:grid grid-cols-5 gap-2">
															{BODY_TYPES[gender].map((type, index) => (
																<button
																	key={type.image}
																	onClick={() => setBodyTypeIndex(index)}
																	className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all ${bodyTypeIndex === index ? "border-primary" : "border-gray-200 hover:border-gray-300"}`}
																>
																	<img src={type.image} alt={t(type.labelKey)} className="w-full h-full object-cover object-top" />
																</button>
															))}
														</div>
													</div>
												</div>

												<div>
													<label className="block text-sm font-medium text-gray-700 mb-4">{t("fitPreferenceLabel")}</label>
													<div className="grid grid-cols-3 gap-2">
														{FIT_OPTIONS.map((option, index) => (
															<button
																key={option.labelKey}
																onClick={() => setFitIndex(index)}
																className={`py-2 px-4 rounded-lg font-medium transition-colors ${fitIndex === index ? "text-white bg-primary" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
															>
																{t(option.labelKey)}
															</button>
														))}
													</div>
												</div>
											</div>
										</div>
										<div className="grid grid-cols-2 gap-3 p-2 md:px-6 md:pb-4">
											<button onClick={() => setStep("info")} className="w-full bg-gray-100 text-gray-700 border border-gray-300 py-3 rounded-lg hover:bg-gray-200 transition-all font-medium">
												{t("back")}
											</button>
											<button onClick={handleCalculatorContinue} className="w-full bg-primary text-white py-3 rounded-lg hover:bg-primary-dark transition-all font-medium">
												{t("continue")}
											</button>
										</div>
									</div>
								</div>
							) : null}

							{step === "photo" ? (
								<div className="space-y-4 animate-fade-in">
									<div className="md:hidden space-y-4">
										<div className="mb-4">
											<div className="text-center mb-3">
												<h4 className="text-lg font-semibold text-gray-900">{t("productImage")}</h4>
												{productImages.length > 1 ? (
													<p className="text-base text-gray-600">{t("chooseImageNote")}</p>
												) : null}
											</div>
											<div className="relative">
												<div className="aspect-[2/3] bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
													<img src={selectedProductImage} alt="Produto" className="w-full h-full object-cover" />
												</div>
												{productImages.length > 1 ? (
													<>
														<button onClick={() => setCurrentImageIndex((value) => (value - 1 + productImages.length) % productImages.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg transition-all">
															<ArrowLeft className="w-5 h-5" />
														</button>
														<button onClick={() => setCurrentImageIndex((value) => (value + 1) % productImages.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg transition-all">
															<ArrowRight className="w-5 h-5" />
														</button>
													</>
												) : null}
											</div>
										</div>

										<div className="text-center mb-3">
											<h3 className="text-2xl font-semibold text-primary mb-2">{t("yourPhoto")}</h3>
											<p className="text-gray-700 text-base">{t("betterResults")}</p>
										</div>

										<div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-400 rounded-lg p-4 mb-3 shadow-md">
											<h4 className="font-bold text-blue-900 mb-2 text-base flex items-center gap-2">
												{t("photoInstructions")}
												<span className="text-xs bg-blue-800 text-white px-2 py-0.5 rounded-full font-semibold">
													{t("importantBadge")}
												</span>
											</h4>
											<ul className="text-base text-blue-900 space-y-1.5 mb-3">
												<li>• <strong>{t("fullBody")}</strong> - {t("fullBodyDesc")}</li>
												<li>• <strong>{t("frontFacing")}</strong> - {t("frontFacingDesc")}</li>
												<li>• <strong>{t("noObstacles")}</strong> - {t("noObstaclesDesc")}</li>
												<li>• <strong>{t("goodLighting")}</strong> - {t("goodLightingDesc")}</li>
												<li>• <strong>{t("neutralBackground")}</strong> - {t("neutralBackgroundDesc")}</li>
											</ul>
											<div className="bg-blue-100 border-l-4 border-blue-700 p-2 rounded mt-2">
												<p className="text-sm text-blue-900 font-semibold">{t("photoInstructionWarning")}</p>
											</div>
										</div>

										<div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-all duration-300 ease-in-out">
											{photoPreview ? (
												<img src={photoPreview} alt={t("yourPhoto")} className="w-full max-h-[420px] object-cover rounded-lg" />
											) : (
												<>
													<Camera className="w-12 h-12 text-gray-400 mx-auto mb-4" />
													<p className="text-gray-700 mb-2 text-lg">{t("clickToUpload")}</p>
													<p className="text-base text-gray-500">{t("imageFormats")}</p>
												</>
											)}
											<input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
										</div>
									</div>

									<div className="hidden md:flex md:gap-6">
										<div className="md:w-1/2">
											<div className="text-center mb-3">
												<h4 className="text-xl font-semibold text-gray-900">{t("productImage")}</h4>
												{productImages.length > 1 ? <p className="text-base text-gray-600">{t("chooseImageNote")}</p> : null}
											</div>
											<div className="relative">
												<div className="aspect-[2/3] bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
													<img src={selectedProductImage} alt="Produto" className="w-full h-full object-cover" />
												</div>
												{productImages.length > 1 ? (
													<>
														<button onClick={() => setCurrentImageIndex((value) => (value - 1 + productImages.length) % productImages.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg transition-all">
															<ArrowLeft className="w-5 h-5" />
														</button>
														<button onClick={() => setCurrentImageIndex((value) => (value + 1) % productImages.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg transition-all">
															<ArrowRight className="w-5 h-5" />
														</button>
													</>
												) : null}
											</div>
										</div>

										<div className="md:w-1/2 flex flex-col justify-center">
											<div className="text-center mb-3">
												<h3 className="text-2xl font-semibold text-primary mb-1">{t("yourPhoto")}</h3>
												<p className="text-gray-700 text-base">{t("betterResults")}</p>
											</div>
											<div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-400 rounded-lg p-3 mb-3 shadow-md">
												<h4 className="font-bold text-blue-900 mb-1.5 text-sm flex items-center gap-2">
													{t("photoInstructions")}
													<span className="text-xs bg-blue-800 text-white px-2 py-0.5 rounded-full font-semibold">
														{t("importantBadge")}
													</span>
												</h4>
												<ul className="text-sm text-blue-900 space-y-0.5 mb-2">
													<li>• <strong>{t("fullBody")}</strong> - {t("fullBodyDesc")}</li>
													<li>• <strong>{t("frontFacing")}</strong> - {t("frontFacingDesc")}</li>
													<li>• <strong>{t("noObstacles")}</strong> - {t("noObstaclesDesc")}</li>
													<li>• <strong>{t("goodLighting")}</strong> - {t("goodLightingDesc")}</li>
													<li>• <strong>{t("neutralBackground")}</strong> - {t("neutralBackgroundDesc")}</li>
												</ul>
												<div className="bg-blue-100 border-l-4 border-blue-700 p-2 rounded mt-2">
													<p className="text-sm text-blue-900 font-semibold">{t("photoInstructionWarning")}</p>
												</div>
											</div>
											<div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-all duration-300 ease-in-out">
												{photoPreview ? (
													<img src={photoPreview} alt={t("yourPhoto")} className="w-full max-h-[420px] object-cover rounded-lg" />
												) : (
													<>
														<Camera className="w-12 h-12 text-gray-400 mx-auto mb-3" />
														<p className="text-gray-700 mb-1 text-lg">{t("clickToUpload")}</p>
														<p className="text-base text-gray-500">{t("imageFormats")}</p>
													</>
												)}
												<input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
											</div>
										</div>
									</div>

									<div className="grid grid-cols-2 gap-3">
										<button onClick={() => setStep("calculator")} className="w-full bg-gray-100 text-gray-700 border border-gray-300 py-3 rounded-lg hover:bg-gray-200 transition-all font-medium">
											{t("back")}
										</button>
										<button onClick={goToConfirm} className="w-full bg-primary text-white py-3 rounded-lg hover:bg-primary-dark transition-all font-medium">
											{t("continue")}
										</button>
									</div>
								</div>
							) : null}

							{step === "confirm" ? (
								<div className="space-y-4 animate-fade-in">
									<div className="text-center mb-3 md:mb-4">
										<h3 className="text-2xl md:text-3xl font-semibold mb-1 md:mb-2 text-primary">{t("confirmData")}</h3>
										<p className="text-gray-700 text-base md:text-lg">{t("verifyBeforeProcess")}</p>
									</div>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
										<div className="bg-gray-50 border border-gray-200 rounded-lg p-4 md:p-5">
											<h4 className="font-medium mb-3 text-center text-base md:text-lg text-primary">{t("product")}</h4>
											<div className="w-full aspect-[2/3] rounded-lg overflow-hidden bg-white">
												{selectedProductImage ? (
													<img src={selectedProductImage} alt="Produto" className="w-full h-full object-cover" />
												) : (
													<div className="w-full h-full flex items-center justify-center text-gray-400">{t("noImage")}</div>
												)}
											</div>
										</div>
										<div className="bg-gray-50 border border-gray-200 rounded-lg p-4 md:p-5">
											<h4 className="font-medium mb-3 text-center text-base md:text-lg text-primary">{t("yourPhotoLabel")}</h4>
											<div className="w-full aspect-[2/3] rounded-lg overflow-hidden bg-white">
												{photoPreview ? (
													<img src={photoPreview} alt="Sua foto" className="w-full h-full object-cover" />
												) : (
													<div className="w-full h-full flex items-center justify-center text-gray-400">{t("noImage")}</div>
												)}
											</div>
										</div>
									</div>
									<div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-700">
										<div className="bg-gray-50 border border-gray-200 rounded-lg p-3"><strong>{t("genderLabel")}:</strong> {sizeData?.gender === "female" ? t("female") : t("male")}</div>
										<div className="bg-gray-50 border border-gray-200 rounded-lg p-3"><strong>{t("heightLabel")}:</strong> {sizeData?.height}cm</div>
										<div className="bg-gray-50 border border-gray-200 rounded-lg p-3"><strong>{t("weightLabel")}:</strong> {sizeData?.weight}kg</div>
									</div>
									<div className="flex gap-3">
										<button
											onClick={() => {
												setStep("photo");
												setPhotoFile(null);
												if (photoPreview) URL.revokeObjectURL(photoPreview);
												setPhotoPreview("");
											}}
											className="flex-1 bg-gray-100 text-gray-700 border border-gray-300 py-3 md:py-3.5 text-lg rounded-lg hover:bg-gray-200 transition-all font-medium"
										>
											{t("change")}
										</button>
										<button
											onClick={() => void handleSubmit()}
											className="flex-1 text-white py-3 md:py-3.5 text-lg rounded-lg transition-all flex items-center justify-center gap-2 font-medium bg-primary hover:bg-primary-dark"
										>
											<Sparkles className="w-5 h-5" />
											{t("process")}
										</button>
									</div>
								</div>
							) : null}

							{step === "processing" ? (
								<div className="text-center py-10 md:py-12 animate-fade-in">
									<div className="flex items-center justify-center gap-2 mb-6">
										<span className="inline-block w-3 h-3 md:w-4 md:h-4 rounded-full animate-bounce bg-primary" style={{ animationDelay: "0ms", animationDuration: "1.4s" }} />
										<span className="inline-block w-3 h-3 md:w-4 md:h-4 rounded-full animate-bounce bg-primary" style={{ animationDelay: "200ms", animationDuration: "1.4s" }} />
										<span className="inline-block w-3 h-3 md:w-4 md:h-4 rounded-full animate-bounce bg-primary" style={{ animationDelay: "400ms", animationDuration: "1.4s" }} />
									</div>
									<h3 className="text-2xl md:text-3xl font-semibold text-primary mb-3">{t(processingMessageKey)}</h3>
									<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 md:p-4">
										<p className="text-yellow-800 text-base md:text-lg">{t("estimatedTime")}</p>
									</div>
								</div>
							) : null}
						</div>
					</div>
				</div>
			)}
		</>
	);
}
