import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Camera, Ruler, Sparkles, User, Weight } from "lucide-react";
import type { ElasticityLevel } from "./sizeCalculation";
import {
	getDefaultMeasurementWeights,
	getOptimizedRemoteTryOnImageUrl,
	loadImageElement,
	optimizeTryOnImage,
	validatePhotoForCollection,
} from "./tryonParity";
import {
	detectWidgetLanguage,
	type WidgetLanguage,
	type WidgetTranslationKey,
	widgetTranslations,
} from "./translations";
import {
	calculateTryOnRecommendedSize,
	mapApiChartToTryOnRows,
	type TryOnRecommendedSizeResult,
} from "./tryOnRecommendedSize";
import { useMediaPipePose } from "./useMediaPipePose";
import { OMAFIT_WIDGET_FONT_FALLBACK, sanitizeFontFamilyForCss } from "../shared/storeFont";
import { isFootwearSizeChart } from "../shared/sizeChartFootwear";

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
	/** Fonte da vitrine (query `store_font`), replicada no iframe */
	storeFont: string;
	productDescription: string;
	/** Slug da coleção na URL da vitrine (`/collections/.../products/...`), quando disponível */
	collectionHandle: string;
};

type TryOnStartResponse = {
	success?: boolean;
	fal_request_id?: string;
	error?: string;
	debug?: Record<string, unknown>;
	body_measurements?: SizeCalculatorMeasurements;
};

type TryOnStatusResponse = {
	status?: string;
	output?: string | string[];
	error?: string;
};

type ChatMessage = {
	role: "assistant" | "user";
	content: string;
	timestamp: number;
};

type ValidateSizeResponse = {
	success?: boolean;
	data?: {
		tamanho_final?: string;
		explicacao?: string;
		should_end_conversation?: boolean;
	};
	interaction_count?: number;
	message?: string;
};

type SizeCalculatorMeasurements = {
	shoulderWidth?: number;
	chestCircumference?: number;
	waistCircumference?: number;
	hipCircumference?: number;
	bodyHeight?: number;
	armLength?: number;
	legLength?: number;
	confidence?: number;
	source?: string;
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

/** Rótulos semânticos para o prompt do GPT (evita enviar fatores numéricos 1.04, 0.97, etc.). */
function gptLabelForBodyType(
	sizeData: SizeData,
	t: (key: WidgetTranslationKey) => string,
): string {
	const list = BODY_TYPES[sizeData.gender === "male" ? "male" : "female"];
	const entry = list?.[sizeData.bodyTypeIndex];
	return entry ? t(entry.labelKey as WidgetTranslationKey) : "regular";
}

function gptLabelForFit(
	sizeData: SizeData,
	t: (key: WidgetTranslationKey) => string,
): string {
	const entry = FIT_OPTIONS[sizeData.fitIndex];
	return entry ? t(entry.labelKey as WidgetTranslationKey) : "regular";
}

const GPT_PRODUCT_DESCRIPTION_MAX = 8000;

const PROCESSING_MESSAGES: WidgetTranslationKey[] = [
	"creatingTryOn",
	"sendingImages",
	"scanningBody",
	"applyingProduct",
	"refiningDetails",
	"finalizingResult",
];

const GPT_INTERACTION_LIMIT = 5;

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
	const resolution = (debug.resolution as Record<string, unknown> | undefined) || {};
	const widgetKey = (debug.widgetKey as Record<string, unknown> | undefined) || {};
	const requestShop = (debug.requestShop as Record<string, unknown> | undefined) || {};
	const widgetShop = (debug.widgetShop as Record<string, unknown> | undefined) || {};
	const forwarded = (debug.forwarded as Record<string, unknown> | undefined) || {};
	const parts = [
		`path=${String(resolution.path || "")}`,
		`skipSync=${String(resolution.wouldSkipCompatSync ?? "")}`,
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
		storeFont: decodeValue(search.get("store_font")),
		productDescription: decodeValue(search.get("product_description")),
		collectionHandle: decodeValue(search.get("collection_handle")),
	};
}

function normalizeElasticity(value: ApiChart["collection_elasticity"]): ElasticityLevel {
	if (value === "structured") return "structured";
	if (value === "flexible") return "flexible";
	if (value === "high_elasticity") return "high";
	return "light";
}

function normalizeChartHandle(value: string) {
	return String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{M}/gu, "");
}

/** Sem match de handle, evita cair na primeira chart da lista se for calçado (ex.: camisa aberta numa URL de coleção). */
function pickChartPreferNonFootwear(candidates: ApiChart[]) {
	if (!candidates.length) return null;
	const nonFoot = candidates.find((c) => !isFootwearSizeChart(c));
	return nonFoot ?? candidates[0] ?? null;
}

function chooseChart(charts: ApiChart[], gender: "male" | "female", handleCandidates: string[]) {
	const clothingCharts = charts.filter((chart) => !isFootwearSizeChart(chart));
	if (!clothingCharts.length) {
		return null;
	}

	const normalizedCandidates = handleCandidates
		.map((h) => normalizeChartHandle(h))
		.filter(Boolean);
	// Mantém ordem mas remove duplicados
	const seen = new Set<string>();
	const uniqueHandles = normalizedCandidates.filter((h) => {
		if (seen.has(h)) return false;
		seen.add(h);
		return true;
	});

	let result: ApiChart | null = null;
	let branch = "none";
	let matchedHandle = "";

	for (const h of uniqueHandles) {
		const exact = clothingCharts.find(
			(c) =>
				normalizeChartHandle(c.collection_handle) === h &&
				(c.gender === gender || c.gender === "unisex"),
		);
		if (exact) {
			result = exact;
			branch = "exact_handle";
			matchedHandle = h;
			break;
		}
	}

	if (!result) {
		// Mesmo critério do match exato: género da loja OU unisex. Separar "só female" e depois "só unisex"
		// fazia escolher calçado feminino antes de uma tabela unisex de roupa.
		const forGenderOrUnisex = clothingCharts.filter(
			(c) => c.gender === gender || c.gender === "unisex",
		);
		const fromPool = pickChartPreferNonFootwear(forGenderOrUnisex);
		if (fromPool) {
			result = fromPool;
			branch = "gender_unisex_pool";
		} else {
			result = pickChartPreferNonFootwear(clothingCharts) ?? clothingCharts[0] ?? null;
			branch = "global_fallback";
		}
	}

	return result;
}

function darkenColor(hex: string, amount = 20) {
	const value = hex.replace("#", "");
	if (value.length !== 6) return hex;
	const clamp = (part: string) => Math.max(0, Number.parseInt(part, 16) - amount);
	return `#${[value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)]
		.map((part) => clamp(part).toString(16).padStart(2, "0"))
		.join("")}`;
}

function estimateBodyMeasurements(sizeData: SizeData | null) {
	if (!sizeData) {
		return { chest: 90, waist: 75, hip: 95 };
	}

	if (sizeData.gender === "female") {
		return {
			chest: Math.round(80 + (sizeData.weight - 50) * 0.5 + (sizeData.bodyTypeIndex || 0) * 5),
			waist: Math.round(60 + (sizeData.weight - 50) * 0.6 + (sizeData.bodyTypeIndex || 0) * 4),
			hip: Math.round(85 + (sizeData.weight - 50) * 0.6 + (sizeData.bodyTypeIndex || 0) * 5),
		};
	}

	return {
		chest: Math.round(90 + (sizeData.weight - 60) * 0.6 + (sizeData.bodyTypeIndex || 0) * 6),
		waist: Math.round(75 + (sizeData.weight - 60) * 0.7 + (sizeData.bodyTypeIndex || 0) * 5),
		hip: Math.round(90 + (sizeData.weight - 60) * 0.6 + (sizeData.bodyTypeIndex || 0) * 5),
	};
}

/** Mescla o modelo corporal do TryOnWidget (pós-recomendação) com medidas do MediaPipe. */
function mergeTryOnBodyIntoMeasurements(
	detected: SizeCalculatorMeasurements | null,
	model: TryOnRecommendedSizeResult["measurements"],
	bodyHeightCm: number,
): SizeCalculatorMeasurements {
	return {
		shoulderWidth: Math.round(model.shoulder),
		chestCircumference: Math.round(model.chest),
		waistCircumference: Math.round(model.waist),
		hipCircumference: Math.round(model.hip),
		bodyHeight: bodyHeightCm,
		armLength: detected?.armLength,
		legLength: detected?.legLength,
		confidence: detected?.confidence ?? 0.65,
		source: "try_on_recommended_size",
	};
}

function mapFrontendMeasurements(
	measurements?: {
		shoulder_width: number;
		chest: number;
		waist: number;
		hip: number;
		height: number;
		armLength: number;
		legLength: number;
		confidence?: number;
		source?: string;
	} | null,
): SizeCalculatorMeasurements | null {
	if (!measurements) return null;
	/** Mesmo `anthropometricMethodConfidence` usado no hook (paridade com omafit-widget). */
	const confidence = measurements.confidence ?? 0.65;
	return {
		shoulderWidth: measurements.shoulder_width,
		chestCircumference: measurements.chest,
		waistCircumference: measurements.waist,
		hipCircumference: measurements.hip,
		bodyHeight: measurements.height,
		armLength: measurements.armLength,
		legLength: measurements.legLength,
		confidence,
		source: measurements.source ?? "frontend_mediapipe",
	};
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
	const [storeFontFamily, setStoreFontFamily] = useState(() =>
		sanitizeFontFamilyForCss(params.storeFont || ""),
	);
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
	const [finalBodyMeasurements, setFinalBodyMeasurements] =
		useState<SizeCalculatorMeasurements | null>(null);
	const [processingMessageKey, setProcessingMessageKey] =
		useState<WidgetTranslationKey>("creatingTryOn");
	const [isAddingToCart, setIsAddingToCart] = useState(false);
	const [addToCartFeedback, setAddToCartFeedback] = useState("");
	const [currentImageIndex, setCurrentImageIndex] = useState(0);
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [interactionCount, setInteractionCount] = useState(0);
	const [gptLoading, setGptLoading] = useState(false);
	const [chatInput, setChatInput] = useState("");
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const weightInputRef = useRef<HTMLInputElement | null>(null);
	const pollingTimerRef = useRef<number | null>(null);
	const sessionIdRef = useRef(`widget_${Date.now().toString(36)}`);
	const interactionCountRef = useRef(0);
	const chatEndRef = useRef<HTMLDivElement | null>(null);
	const { detectPose, calculateBodyMeasurements, error: mediapipeError } = useMediaPipePose({
		enabled: step === "photo" || step === "confirm" || step === "processing",
		useWorker: false,
		silentNoPose: true,
	});

	useLayoutEffect(() => {
		const stack = storeFontFamily ? storeFontFamily : OMAFIT_WIDGET_FONT_FALLBACK;
		document.documentElement.style.setProperty("--omafit-store-font", stack);
	}, [storeFontFamily]);

	const productImages = params.productImages.length
		? params.productImages
		: params.productImage
			? [params.productImage]
			: [];
	const selectedProductImage = productImages[currentImageIndex] || params.productImage;
	const displayImage = step === "photo" ? selectedProductImage : params.productImage || selectedProductImage;
	const t = useMemo(() => getT(language), [language]);
	const hoverColor = useMemo(() => darkenColor(primaryColor, 16), [primaryColor]);
	const chartHandleCandidates = useMemo(
		() => [params.collectionHandle, params.productHandle],
		[params.collectionHandle, params.productHandle],
	);
	const selectedChart = useMemo(
		() => chooseChart(charts, sizeData?.gender || gender, chartHandleCandidates),
		[charts, sizeData?.gender, gender, chartHandleCandidates],
	);
	const availableSizes = useMemo(
		() => (selectedChart?.sizes || []).map((row) => String(row.size || "")).filter(Boolean),
		[selectedChart],
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
					const resolvedStoreLogo =
						configPayload.config.store_logo ||
						configPayload.config?.modal_config?.storeLogo ||
						"";
					if (resolvedStoreLogo) setStoreLogo(String(resolvedStoreLogo));
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
			if (event.data?.type === "omafit-store-font") {
				const next = sanitizeFontFamilyForCss(String(event.data.fontFamily || ""));
				if (next) setStoreFontFamily(next);
				return;
			}
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

	useEffect(() => {
		interactionCountRef.current = interactionCount;
	}, [interactionCount]);

	useEffect(() => {
		if (chatEndRef.current) {
			chatEndRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [chatMessages, gptLoading]);

	useEffect(() => {
		if (step === "result" && sizeData && chatMessages.length === 0 && !gptLoading) {
			void callGPTAssistant("add_to_cart");
		}
	}, [step, sizeData, chatMessages.length, gptLoading]);

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
		setFinalBodyMeasurements(null);
		setError("");
		setStep("confirm");
	}

	function getRecommendation(
		rawMeasurements?: SizeCalculatorMeasurements | null,
	): TryOnRecommendedSizeResult | null {
		if (!sizeData || !selectedChart) return null;

		const tryOnChart = mapApiChartToTryOnRows(selectedChart);
		return calculateTryOnRecommendedSize(
			{
				height: sizeData.height,
				weight: sizeData.weight,
				bodyTypeIndex: sizeData.bodyTypeIndex,
				fitIndex: sizeData.fitIndex,
				gender: sizeData.gender,
				chest: rawMeasurements?.chestCircumference,
				waist: rawMeasurements?.waistCircumference,
				hip: rawMeasurements?.hipCircumference,
				shoulder: rawMeasurements?.shoulderWidth,
				legLength: rawMeasurements?.legLength,
			},
			tryOnChart,
			{
				collectionType: selectedChart.collection_type,
				collectionElasticity: selectedChart.collection_elasticity,
				measurementWeights: getDefaultMeasurementWeights(selectedChart.collection_type),
			},
		);
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
		setChatMessages([]);
		setChatInput("");
		setInteractionCount(0);
		setProcessingMessageKey("creatingTryOn");
		setStep("processing");

		try {
			const optimizedImage = await optimizeTryOnImage(photoFile);
			let detectedLandmarks: Array<{ x: number; y: number; z: number; visibility?: number }> | null =
				null;
			let detectedMeasurements: SizeCalculatorMeasurements | null = null;

			try {
				const analysisImage = await loadImageElement(optimizedImage.previewUrl);
				const poseResult = await detectPose(analysisImage);
				const landmarks = poseResult?.landmarks?.[0];

				if (landmarks?.length) {
					const photoValidation = validatePhotoForCollection(
						landmarks as Array<{ x: number; y: number; z: number; visibility: number }>,
						selectedChart?.collection_type || "upper",
						language,
					);

					if (!photoValidation.valid) {
						URL.revokeObjectURL(optimizedImage.previewUrl);
						setStep("confirm");
						setError(photoValidation.message || t("processingError"));
						return;
					}

					detectedLandmarks = landmarks.map((landmark) => ({
						x: landmark.x,
						y: landmark.y,
						z: landmark.z,
						visibility: landmark.visibility,
					}));

					detectedMeasurements = mapFrontendMeasurements(
						calculateBodyMeasurements(
							landmarks as Array<{ x: number; y: number; z: number; visibility: number }>,
							analysisImage.naturalWidth,
							analysisImage.naturalHeight,
							sizeData.height,
							sizeData.weight,
							sizeData.gender,
						),
					);
				} else if (mediapipeError) {
					console.warn("MediaPipe indisponível no frontend; mantendo fallback do servidor.");
				}
			} finally {
				URL.revokeObjectURL(optimizedImage.previewUrl);
			}

			let provisionalSize = recommendedSize;
			const recommendation = getRecommendation(detectedMeasurements);
			if (recommendation?.size) {
				provisionalSize = recommendation.size;
				setRecommendedSize(recommendation.size);
				setFinalBodyMeasurements(
					mergeTryOnBodyIntoMeasurements(detectedMeasurements, recommendation.measurements, sizeData.height),
				);
			} else if (detectedMeasurements) {
				setFinalBodyMeasurements(detectedMeasurements);
			}

			const formData = new FormData();
			formData.append(
				"model_image_file",
				optimizedImage.blob,
				photoFile.name?.replace(/\.[^.]+$/, "") + ".jpg" || "tryon-model.jpg",
			);
			formData.append("store_id", params.storeId);
			formData.append("shop_domain", params.storeDomain);
			formData.append(
				"garment_image",
				getOptimizedRemoteTryOnImageUrl(selectedProductImage || ""),
			);
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
			formData.append("pose_landmarks", JSON.stringify(detectedLandmarks));
			formData.append("detected_measurements", JSON.stringify(detectedMeasurements));

			const response = await fetch("/api/widget/tryon", {
				method: "POST",
				body: formData,
			});
			const result = (await response.json().catch(() => ({}))) as TryOnStartResponse;
			if (!response.ok || !result.success || !result.fal_request_id) {
				throw new Error((result.error || t("processingError")) + formatTryonDebug(result.debug));
			}

			if (result.body_measurements) {
				const responseRecommendation = getRecommendation(result.body_measurements);
				if (responseRecommendation?.size) {
					setRecommendedSize(responseRecommendation.size);
					setFinalBodyMeasurements(
						mergeTryOnBodyIntoMeasurements(
							result.body_measurements,
							responseRecommendation.measurements,
							sizeData.height,
						),
					);
				} else {
					setFinalBodyMeasurements(result.body_measurements);
				}
			}

			setProcessingMessageKey("generating");
			void startPolling(result.fal_request_id);
		} catch (caughtError) {
			setStep("confirm");
			setError(caughtError instanceof Error ? caughtError.message : t("processingError"));
		}
	}

	async function callGPTAssistant(intention: "add_to_cart" | "custom_message", customMessage?: string) {
		if (!sizeData) return;

		if (interactionCount >= GPT_INTERACTION_LIMIT) {
			return;
		}

		setGptLoading(true);
		try {
			const trimmedDescription = params.productDescription.trim();
			const productDescriptionForGpt = trimmedDescription
				? trimmedDescription.slice(0, GPT_PRODUCT_DESCRIPTION_MAX)
				: undefined;
			const mediaPipeEstimate =
				finalBodyMeasurements &&
				finalBodyMeasurements.chestCircumference &&
				finalBodyMeasurements.waistCircumference &&
				finalBodyMeasurements.hipCircumference
					? {
							chest: Math.round(finalBodyMeasurements.chestCircumference),
							waist: Math.round(finalBodyMeasurements.waistCircumference),
							hip: Math.round(finalBodyMeasurements.hipCircumference),
						}
					: null;
			const estimated = mediaPipeEstimate || estimateBodyMeasurements(sizeData);
			const response = await fetch("/api/widget/validate-size", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					altura_cm: sizeData.height,
					peso_kg: sizeData.weight,
					peito_cm: estimated.chest,
					cintura_cm: estimated.waist,
					quadril_cm: estimated.hip,
					tipo_corpo: gptLabelForBodyType(sizeData, t),
					ajuste_preferido: gptLabelForFit(sizeData, t),
					genero: sizeData.gender || "unisex",
					elasticidade: selectedChart?.collection_elasticity || "light_flex",
					categoria: selectedChart?.collection_type || "upper",
					tamanho_calculado_algoritmo: recommendedSize || "M",
					intencao_usuario:
						intention === "custom_message" ? "custom_message" : "induzir_adicionar_carrinho",
					custom_message: customMessage,
					session_id: sessionIdRef.current,
					interaction_count: interactionCountRef.current,
					shop_name: params.storeName,
					shop_domain: params.storeDomain,
					language,
					product_name: params.productName,
					...(productDescriptionForGpt ? { product_description: productDescriptionForGpt } : {}),
					available_sizes: availableSizes,
					available_colors: [],
					selected_image: selectedProductImage,
					selected_color: "",
					variant_catalog: [],
				}),
			});

			const result = (await response.json().catch(() => ({}))) as ValidateSizeResponse;
			if (!response.ok || !result.success || !result.data?.explicacao) {
				throw new Error(result.message || t("processingError"));
			}

			if (result.data.tamanho_final) {
				setRecommendedSize(String(result.data.tamanho_final));
			}

			setChatMessages((current) => [
				...current,
				{
					role: "assistant",
					content: String(result.data?.explicacao || ""),
					timestamp: Date.now(),
				},
			]);

			setInteractionCount(
				result.data?.should_end_conversation
					? GPT_INTERACTION_LIMIT
					: Number(result.interaction_count || interactionCount + 1),
			);
		} catch (_error) {
			setChatMessages((current) => [
				...current,
				{
					role: "assistant",
					content: `${params.productName || t("product")} combina muito com o seu perfil. ${t("addToCart")}.`,
					timestamp: Date.now(),
				},
			]);
			setInteractionCount((current) => current + 1);
		} finally {
			setGptLoading(false);
		}
	}

	function handleChatSubmit() {
		const message = chatInput.trim();
		if (!message || gptLoading) return;

		setChatMessages((current) => [
			...current,
			{
				role: "user",
				content: message,
				timestamp: Date.now(),
			},
		]);
		setChatInput("");
		void callGPTAssistant("custom_message", message);
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
		setFinalBodyMeasurements(null);
		setResultImage("");
		setAddToCartFeedback("");
		setIsAddingToCart(false);
		setChatMessages([]);
		setInteractionCount(0);
		setGptLoading(false);
		setChatInput("");
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
				* { font-family: var(--omafit-store-font) !important; }
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
								<img src={storeLogo} alt={params.storeName} className="h-10 w-auto object-contain" />
							) : null}
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

						{chatMessages.map((message, index) => (
							<div
								key={`${message.timestamp}-${index}`}
								className={`flex gap-2 ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
							>
								{message.role === "assistant" && storeLogo ? (
									<div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-white shadow-sm flex items-center justify-center p-1">
										<img src={storeLogo} alt={params.storeName} className="w-full h-full object-contain" />
									</div>
								) : null}
								<div
									className={`max-w-[80%] rounded-2xl p-4 ${
										message.role === "assistant" ? "bg-gray-100 text-gray-900" : "text-white"
									}`}
									style={message.role === "user" ? { backgroundColor: primaryColor } : {}}
								>
									<p className="text-sm md:text-base whitespace-pre-line">{message.content}</p>
								</div>
							</div>
						))}

						{gptLoading ? (
							<div className="flex gap-2 justify-start">
								{storeLogo ? (
									<div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-white shadow-sm flex items-center justify-center p-1">
										<img src={storeLogo} alt={params.storeName} className="w-full h-full object-contain" />
									</div>
								) : null}
								<div className="max-w-[80%] rounded-2xl p-4 bg-gray-100">
									<div className="flex items-center gap-1">
										<span className="inline-block w-2 h-2 rounded-full animate-bounce bg-primary" style={{ animationDelay: "0ms", animationDuration: "1.4s" }} />
										<span className="inline-block w-2 h-2 rounded-full animate-bounce bg-primary" style={{ animationDelay: "200ms", animationDuration: "1.4s" }} />
										<span className="inline-block w-2 h-2 rounded-full animate-bounce bg-primary" style={{ animationDelay: "400ms", animationDuration: "1.4s" }} />
									</div>
								</div>
							</div>
						) : null}

						<div ref={chatEndRef} />
					</div>

					{interactionCount < GPT_INTERACTION_LIMIT && chatMessages.length > 0 && !gptLoading ? (
						<div className="p-4 border-t bg-gray-50">
							<button
								type="button"
								onClick={handleAddToCart}
								disabled={isAddingToCart}
								className="w-full mb-3 px-4 py-3 rounded-xl font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed bg-primary hover:bg-primary-dark text-white"
							>
								{isAddingToCart ? t("addingToCart") : t("addToCart")}
							</button>
							{addToCartFeedback ? (
								<p className="text-xs text-center text-gray-600 mb-3">{addToCartFeedback}</p>
							) : null}
							{chatMessages.length === 1 && chatMessages[0]?.role === "assistant" ? (
								<p className="text-sm text-gray-600 text-center mb-3">{t("askAboutGarment")}</p>
							) : null}
							<div className="flex gap-2">
								<input
									type="text"
									value={chatInput}
									onChange={(event) => setChatInput(event.target.value)}
									placeholder={t("typeYourMessage")}
									className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 transition-all"
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											handleChatSubmit();
										}
									}}
								/>
								<button
									type="button"
									onClick={handleChatSubmit}
									className="px-5 py-3 rounded-xl text-white font-medium transition-all hover:shadow-md bg-primary"
								>
									<ArrowRight className="w-5 h-5" />
								</button>
							</div>
						</div>
					) : (
						<div className="p-4 border-t bg-gray-50 space-y-3">
							{interactionCount >= GPT_INTERACTION_LIMIT && chatMessages.length > 0 && !gptLoading ? (
								<p className="text-sm text-gray-600 text-center">
									{t("assistantThanks", { storeName: params.storeName })}
								</p>
							) : null}
							<button
								type="button"
								onClick={handleAddToCart}
								disabled={isAddingToCart}
								className="w-full px-4 py-3 rounded-xl font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed bg-primary hover:bg-primary-dark text-white"
							>
								{isAddingToCart ? t("addingToCart") : t("addToCart")}
							</button>
							{addToCartFeedback ? <p className="text-xs text-center text-gray-600">{addToCartFeedback}</p> : null}
						</div>
					)}
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
								<img src={storeLogo} alt={params.storeName} className="h-10 w-auto object-contain" />
							) : null}
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
													<div>
														<label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
															<Ruler className="w-4 h-4" />
															{t("heightLabel")}
														</label>
														<input
															type="number"
															value={height}
															onChange={(event) => {
																const value = event.target.value;
																setHeight(value);
																if (value.length === 3) {
																	weightInputRef.current?.focus();
																}
															}}
															placeholder={t("heightPlaceholder")}
															className="w-full px-3 py-2 border border-gray-300 rounded-lg transition-all"
														/>
													</div>
													<div>
														<label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
															<Weight className="w-4 h-4" />
															{t("weightLabel")}
														</label>
														<input
															ref={weightInputRef}
															type="number"
															value={weight}
															onChange={(event) => setWeight(event.target.value)}
															placeholder={t("weightPlaceholder")}
															className="w-full px-3 py-2 border border-gray-300 rounded-lg transition-all"
														/>
													</div>
												</div>

												<div>
													<label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
														<User className="w-4 h-4" />
														{t("bodyTypeQuestion")}
													</label>
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
													<div className="px-2">
														<div className="relative">
															<div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 rounded-full -translate-y-1/2" />
															<div
																className="absolute top-1/2 left-0 h-1 rounded-full -translate-y-1/2 transition-all duration-300"
																style={{
																	backgroundColor: primaryColor,
																	width: `${fitIndex * 50}%`,
																}}
															/>
															<div className="relative flex justify-between items-center">
																{FIT_OPTIONS.map((option, index) => (
																	<button
																		key={option.labelKey}
																		onClick={() => setFitIndex(index)}
																		className="flex flex-col items-center gap-2 z-10"
																		type="button"
																	>
																		<div
																			className={`w-6 h-6 rounded-full border-4 transition-all duration-300 ${
																				fitIndex === index
																					? "border-white shadow-lg scale-110"
																					: "border-gray-300 bg-white hover:scale-105"
																			}`}
																			style={fitIndex === index ? { backgroundColor: primaryColor } : {}}
																		/>
																		<span
																			className={`text-sm font-medium transition-colors ${
																				fitIndex === index ? "text-gray-900" : "text-gray-500"
																			}`}
																		>
																			{t(option.labelKey)}
																		</span>
																	</button>
																))}
															</div>
														</div>
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

									<div className="grid grid-cols-1 gap-3">
										<button onClick={() => setStep("calculator")} className="w-full bg-gray-100 text-gray-700 border border-gray-300 py-3 rounded-lg hover:bg-gray-200 transition-all font-medium">
											{t("back")}
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
