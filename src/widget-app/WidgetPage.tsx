import React, { useEffect, useMemo, useRef, useState } from "react";
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

const PHOTO_INSTRUCTIONS: Array<{
	titleKey: WidgetTranslationKey;
	descKey: WidgetTranslationKey;
}> = [
	{ titleKey: "fullBody", descKey: "fullBodyDesc" },
	{ titleKey: "frontFacing", descKey: "frontFacingDesc" },
	{ titleKey: "noObstacles", descKey: "noObstaclesDesc" },
	{ titleKey: "goodLighting", descKey: "goodLightingDesc" },
	{ titleKey: "neutralBackground", descKey: "neutralBackgroundDesc" },
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
	const language =
		detectWidgetLanguage(
			decodeValue(search.get("language")) ||
				decodeValue(search.get("admin_locale")) ||
				decodeValue(search.get("lang")),
		);

	return {
		storeId: decodeValue(search.get("store_id")),
		storeDomain,
		storeName: decodeValue(search.get("store_name")) || deriveStoreName(storeDomain),
		productId: decodeValue(search.get("product_id")),
		productName: decodeValue(search.get("product_name")),
		productHandle: decodeValue(search.get("product_handle")),
		variantId: decodeValue(search.get("variant_id")),
		productImage,
		productImages,
		storeLogo: decodeValue(search.get("store_logo")),
		primaryColor: decodeValue(search.get("primary_color")) || "#810707",
		language,
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
	const handleMatch = charts.find(
		(chart) =>
			String(chart.collection_handle || "").trim().toLowerCase() === normalizedHandle &&
			(chart.gender === gender || chart.gender === "unisex"),
	);
	if (handleMatch) return handleMatch;
	return (
		charts.find((chart) => chart.gender === gender) ||
		charts.find((chart) => chart.gender === "unisex") ||
		charts[0] ||
		null
	);
}

function buttonStyle(primaryColor: string, filled = true): React.CSSProperties {
	return {
		width: "100%",
		borderRadius: 14,
		padding: "14px 18px",
		fontSize: 15,
		fontWeight: 700,
		cursor: "pointer",
		border: `1px solid ${primaryColor}`,
		background: filled ? primaryColor : "#fff",
		color: filled ? "#fff" : primaryColor,
	};
}

function getFitLabelKey(index: number): WidgetTranslationKey {
	return FIT_OPTIONS[index]?.labelKey || "fitRegular";
}

function getBodyTypes(gender: "male" | "female") {
	return BODY_TYPES[gender];
}

function pollDelay(attempt: number) {
	if (attempt < 2) return 800;
	if (attempt < 5) return 1800;
	return 3000;
}

function getT(
	language: WidgetLanguage,
): (key: WidgetTranslationKey, replacements?: Record<string, string>) => string {
	return (key, replacements) => {
		let value = widgetTranslations[language][key] || widgetTranslations.en[key] || key;
		if (replacements) {
			for (const [token, replacement] of Object.entries(replacements)) {
				value = value.replace(`{${token}}`, replacement);
			}
		}
		return value;
	};
}

export function WidgetPage() {
	const params = useMemo(() => getParams(), []);
	const [config, setConfig] = useState<WidgetConfig | null>(null);
	const [charts, setCharts] = useState<ApiChart[]>([]);
	const [step, setStep] = useState<Step>("info");
	const [language, setLanguage] = useState<WidgetLanguage>(params.language);
	const [primaryColor, setPrimaryColor] = useState(params.primaryColor);
	const [storeLogo, setStoreLogo] = useState(params.storeLogo);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [processingMessageKey, setProcessingMessageKey] =
		useState<WidgetTranslationKey>("creatingTryOn");
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
	const [addToCartFeedback, setAddToCartFeedback] = useState("");
	const [isAddingToCart, setIsAddingToCart] = useState(false);
	const [currentProductImage, setCurrentProductImage] = useState(0);
	const pollingTimerRef = useRef<number | null>(null);
	const sessionIdRef = useRef(`widget_${Date.now().toString(36)}`);

	const t = useMemo(() => getT(language), [language]);
	const productImages = params.productImages.length
		? params.productImages
		: params.productImage
			? [params.productImage]
			: [];

	useEffect(() => {
		const fetchBootstrap = async () => {
			if (!params.storeId) return;
			try {
				const [configResponse, chartResponse] = await Promise.all([
					fetch(`/api/storefront/widget-config?store_id=${encodeURIComponent(params.storeId)}`),
					fetch(`/api/size-charts?store_id=${encodeURIComponent(params.storeId)}`),
				]);
				const configPayload = await configResponse.json().catch(() => ({}));
				const chartPayload = await chartResponse.json().catch(() => ({}));

				if (configPayload?.config) {
					setConfig(configPayload.config);
					if (configPayload.config.primary_color) {
						setPrimaryColor(configPayload.config.primary_color);
					}
					if (configPayload.config.store_logo) {
						setStoreLogo(configPayload.config.store_logo);
					}
					if (configPayload.config.admin_locale) {
						setLanguage(detectWidgetLanguage(configPayload.config.admin_locale));
					}
				}
				if (Array.isArray(chartPayload?.charts)) {
					setCharts(chartPayload.charts);
				}
			} catch (_error) {
				// Best effort only: the widget still works with defaults.
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
			if (pollingTimerRef.current) {
				window.clearTimeout(pollingTimerRef.current);
			}
			if (photoPreview) {
				URL.revokeObjectURL(photoPreview);
			}
		};
	}, [photoPreview]);

	const selectedChart = useMemo(
		() => chooseChart(charts, sizeData?.gender || gender, params.productHandle),
		[charts, sizeData?.gender, gender, params.productHandle],
	);

	const currentProductImageUrl = productImages[currentProductImage] || params.productImage;

	function buildSizeData(): SizeData | null {
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

		const bodyTypes = getBodyTypes(gender);
		return {
			gender,
			height: parsedHeight,
			weight: parsedWeight,
			bodyTypeIndex,
			bodyType: bodyTypes[bodyTypeIndex].factor,
			fitIndex,
			fit: FIT_OPTIONS[fitIndex].factor,
		};
	}

	function handleCalculatorContinue() {
		const nextSizeData = buildSizeData();
		if (!nextSizeData) return;
		setError("");
		setSizeData(nextSizeData);
		setStep("photo");
	}

	function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
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
				setLoading(false);
				setStep("result");
				return;
			}

			if (data.status === "failed" || data.status === "error" || data.status === "not_found") {
				setLoading(false);
				setStep("result");
				return;
			}
		} catch (_error) {
			setLoading(false);
			setStep("result");
			return;
		}

		setProcessingMessageKey(PROCESSING_MESSAGES[Math.min(attempt + 1, PROCESSING_MESSAGES.length - 1)]);
		pollingTimerRef.current = window.setTimeout(() => {
			void startPolling(predictionId, attempt + 1);
		}, pollDelay(attempt));
	}

	async function handleProcess() {
		if (!sizeData) {
			setError(t("requiredBodyData"));
			return;
		}
		if (!photoFile) {
			setError(t("selectProductAndPhoto"));
			return;
		}

		setError("");
		setLoading(true);
		setResultImage("");
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
		formData.append("shop_domain", params.storeDomain);
		formData.append("garment_image", currentProductImageUrl || "");
		formData.append("product_name", params.productName);
		formData.append("product_id", params.productId);
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
				throw new Error(result.error || t("processingError"));
			}
			setProcessingMessageKey("generating");
			void startPolling(result.fal_request_id);
		} catch (caughtError) {
			setLoading(false);
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
		if (pollingTimerRef.current) {
			window.clearTimeout(pollingTimerRef.current);
		}
		setLoading(false);
		setError("");
		setResultImage("");
		setRecommendedSize("");
		setAddToCartFeedback("");
		setIsAddingToCart(false);
		setSizeData(null);
		setPhotoFile(null);
		if (photoPreview) URL.revokeObjectURL(photoPreview);
		setPhotoPreview("");
		setHeight("");
		setWeight("");
		setBodyTypeIndex(null);
		setFitIndex(1);
		setStep("info");
	}

	const cardStyle: React.CSSProperties = {
		background: "#fff",
		borderRadius: 24,
		boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
		padding: 24,
		display: "grid",
		gap: 18,
	};

	const titleStyle: React.CSSProperties = {
		fontSize: 28,
		fontWeight: 800,
		margin: 0,
		color: "#111827",
	};

	return (
		<div
			style={{
				minHeight: "100vh",
				background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
				padding: 16,
				fontFamily:
					"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
				color: "#111827",
			}}
		>
			<div style={{ width: "min(860px, 100%)", margin: "0 auto" }}>
				<div style={cardStyle}>
					<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
						{storeLogo ? (
							<img
								src={storeLogo}
								alt={t("storeLogoAlt")}
								style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 12 }}
							/>
						) : (
							<div
								style={{
									width: 48,
									height: 48,
									borderRadius: 12,
									background: primaryColor,
									display: "grid",
									placeItems: "center",
									color: "#fff",
									fontWeight: 800,
								}}
							>
								O
							</div>
						)}
						<div>
							<p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>Omafit</p>
							<h1 style={{ ...titleStyle, fontSize: 24 }}>{params.productName || t("loadingProduct")}</h1>
						</div>
					</div>

					{error ? (
						<div
							style={{
								borderRadius: 14,
								background: "#fef2f2",
								border: "1px solid #fecaca",
								color: "#991b1b",
								padding: "12px 14px",
								fontSize: 14,
							}}
						>
							{error}
						</div>
					) : null}

					{step === "info" ? (
						<>
							<div style={{ display: "grid", gap: 12 }}>
								<h2 style={titleStyle}>{t("visualExperience", { storeName: params.storeName })}</h2>
								<p style={{ margin: 0, fontSize: 16, color: "#4b5563" }}>
									{t("visualExperienceDesc")}
								</p>
								<p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>{t("howItWorksDesc")}</p>
							</div>

							<div
								style={{
									display: "grid",
									gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
									gap: 12,
								}}
							>
								{PHOTO_INSTRUCTIONS.map((instruction) => (
									<div
										key={instruction.titleKey}
										style={{
											border: "1px solid #e5e7eb",
											borderRadius: 16,
											padding: 14,
											background: "#f9fafb",
										}}
									>
										<div style={{ fontWeight: 700, marginBottom: 6 }}>{t(instruction.titleKey)}</div>
										<div style={{ fontSize: 13, color: "#6b7280" }}>{t(instruction.descKey)}</div>
									</div>
								))}
							</div>

							<div style={{ display: "grid", gap: 14 }}>
								<p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>{t("privacyNote")}</p>
								<button style={buttonStyle(primaryColor)} onClick={() => setStep("calculator")}>
									{config?.link_text || t("startNow")}
								</button>
							</div>
						</>
					) : null}

					{step === "calculator" ? (
						<>
							<div>
								<h2 style={titleStyle}>{t("sizeCalculatorTitle")}</h2>
								<p style={{ margin: "8px 0 0", color: "#6b7280" }}>{t("howItWorks")}</p>
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
								{(["female", "male"] as const).map((value) => (
									<button
										key={value}
										style={{
											...buttonStyle(primaryColor, gender === value),
											padding: "12px 14px",
										}}
										onClick={() => {
											setGender(value);
											setBodyTypeIndex(null);
										}}
									>
										{value === "female" ? t("female") : t("male")}
									</button>
								))}
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
								<input
									value={height}
									onChange={(event) => setHeight(event.target.value)}
									placeholder={t("heightPlaceholder")}
									type="number"
									style={inputStyle}
								/>
								<input
									value={weight}
									onChange={(event) => setWeight(event.target.value)}
									placeholder={t("weightPlaceholder")}
									type="number"
									style={inputStyle}
								/>
							</div>

							<div style={{ display: "grid", gap: 10 }}>
								<div style={{ fontWeight: 700 }}>{t("bodyTypeQuestion")}</div>
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
										gap: 12,
									}}
								>
									{getBodyTypes(gender).map((type, index) => (
										<button
											key={type.image}
											onClick={() => setBodyTypeIndex(index)}
											style={{
												borderRadius: 18,
												border:
													bodyTypeIndex === index
														? `2px solid ${primaryColor}`
														: "1px solid #e5e7eb",
												padding: 8,
												background: "#fff",
												cursor: "pointer",
												display: "grid",
												gap: 8,
											}}
										>
											<img
												src={type.image}
												alt={t(type.labelKey)}
												style={{
													width: "100%",
													aspectRatio: "3 / 4",
													objectFit: "cover",
													borderRadius: 12,
												}}
											/>
											<div style={{ fontSize: 13, fontWeight: 700 }}>{t(type.labelKey)}</div>
											<div style={{ fontSize: 12, color: "#6b7280" }}>{t(type.descriptionKey)}</div>
										</button>
									))}
								</div>
							</div>

							<div style={{ display: "grid", gap: 10 }}>
								<div style={{ fontWeight: 700 }}>{t("fitPreferenceLabel")}</div>
								<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
									{FIT_OPTIONS.map((option, index) => (
										<button
											key={option.labelKey}
											onClick={() => setFitIndex(index)}
											style={{
												...buttonStyle(primaryColor, fitIndex === index),
												padding: "12px 10px",
												fontSize: 14,
											}}
										>
											{t(option.labelKey)}
										</button>
									))}
								</div>
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
								<button style={buttonStyle(primaryColor, false)} onClick={() => setStep("info")}>
									{t("back")}
								</button>
								<button style={buttonStyle(primaryColor)} onClick={handleCalculatorContinue}>
									{t("continue")}
								</button>
							</div>
						</>
					) : null}

					{step === "photo" ? (
						<>
							<div>
								<h2 style={titleStyle}>{t("yourPhoto")}</h2>
								<p style={{ margin: "8px 0 0", color: "#6b7280" }}>{t("betterResults")}</p>
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
								<div style={mediaCardStyle}>
									<div style={mediaCardLabelStyle}>{t("productImage")}</div>
									{currentProductImageUrl ? (
										<>
											<img src={currentProductImageUrl} alt={params.productName} style={mediaImageStyle} />
											{productImages.length > 1 ? (
												<div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
													<button
														style={miniButtonStyle(primaryColor)}
														onClick={() =>
															setCurrentProductImage((current) =>
																(current - 1 + productImages.length) % productImages.length,
															)
														}
													>
														{t("back")}
													</button>
													<button
														style={miniButtonStyle(primaryColor)}
														onClick={() =>
															setCurrentProductImage((current) => (current + 1) % productImages.length)
														}
													>
														{t("continue")}
													</button>
												</div>
											) : null}
										</>
									) : (
										<div style={emptyMediaStyle}>{t("noImage")}</div>
									)}
								</div>

								<div style={mediaCardStyle}>
									<div style={mediaCardLabelStyle}>{t("yourPhoto")}</div>
									<label
										style={{
											...emptyMediaStyle,
											borderStyle: "dashed",
											cursor: "pointer",
											background: photoPreview ? "#fff" : "#f9fafb",
										}}
									>
										<input type="file" accept="image/*" hidden onChange={handleFileSelection} />
										{photoPreview ? (
											<img src={photoPreview} alt={t("yourPhoto")} style={mediaImageStyle} />
										) : (
											<div style={{ textAlign: "center" }}>
												<div style={{ fontWeight: 700 }}>{t("clickToUpload")}</div>
												<div style={{ fontSize: 13, color: "#6b7280" }}>{t("imageFormats")}</div>
											</div>
										)}
									</label>
								</div>
							</div>

							<div style={{ display: "grid", gap: 10 }}>
								<div style={{ fontWeight: 700 }}>{t("photoInstructions")}</div>
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
										gap: 12,
									}}
								>
									{PHOTO_INSTRUCTIONS.map((instruction) => (
										<div key={instruction.titleKey} style={instructionCardStyle}>
											<div style={{ fontWeight: 700 }}>{t(instruction.titleKey)}</div>
											<div style={{ fontSize: 13, color: "#6b7280" }}>{t(instruction.descKey)}</div>
										</div>
									))}
								</div>
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
								<button style={buttonStyle(primaryColor, false)} onClick={() => setStep("calculator")}>
									{t("back")}
								</button>
								<button style={buttonStyle(primaryColor)} onClick={goToConfirm}>
									{t("continue")}
								</button>
							</div>
						</>
					) : null}

					{step === "confirm" ? (
						<>
							<div>
								<h2 style={titleStyle}>{t("confirmData")}</h2>
								<p style={{ margin: "8px 0 0", color: "#6b7280" }}>{t("verifyBeforeProcess")}</p>
							</div>

							<div style={{ display: "grid", gap: 14 }}>
								<div style={summaryCardStyle}>
									<strong>{t("product")}</strong> {params.productName}
								</div>
								<div style={summaryCardStyle}>
									<strong>{t("yourPhotoLabel")}</strong>{" "}
									{photoPreview ? (
										<img src={photoPreview} alt={t("yourPhoto")} style={{ width: 92, borderRadius: 12 }} />
									) : (
										t("noImage")
									)}
								</div>
								<div style={summaryCardStyle}>
									<strong>{t("genderLabel")}</strong> {sizeData?.gender === "female" ? t("female") : t("male")}
								</div>
								<div style={summaryCardStyle}>
									<strong>{t("heightLabel")}</strong> {sizeData?.height}cm
								</div>
								<div style={summaryCardStyle}>
									<strong>{t("weightLabel")}</strong> {sizeData?.weight}kg
								</div>
								<div style={summaryCardStyle}>
									<strong>{t("fitPreferenceLabel")}</strong> {t(getFitLabelKey(sizeData?.fitIndex || 1))}
								</div>
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
								<button style={buttonStyle(primaryColor, false)} onClick={() => setStep("photo")}>
									{t("change")}
								</button>
								<button style={buttonStyle(primaryColor)} onClick={() => void handleProcess()}>
									{t("process")}
								</button>
							</div>
						</>
					) : null}

					{step === "processing" ? (
						<div style={{ display: "grid", gap: 18, textAlign: "center", padding: "20px 0" }}>
							<div
								style={{
									width: 74,
									height: 74,
									borderRadius: "50%",
									border: `6px solid ${primaryColor}22`,
									borderTopColor: primaryColor,
									margin: "0 auto",
									animation: "omafit-spin 1s linear infinite",
								}}
							/>
							<h2 style={titleStyle}>{t("generating")}</h2>
							<p style={{ margin: 0, color: "#6b7280" }}>{t(processingMessageKey)}</p>
							<p style={{ margin: 0, color: "#9ca3af", fontSize: 14 }}>{t("estimatedTime")}</p>
						</div>
					) : null}

					{step === "result" ? (
						<>
							<div>
								<h2 style={titleStyle}>{t("yourPreview")}</h2>
								<p style={{ margin: "8px 0 0", color: "#6b7280" }}>{t("congratsMessage")}</p>
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
								<div style={mediaCardStyle}>
									<div style={mediaCardLabelStyle}>{t("yourPreview")}</div>
									{resultImage ? (
										<img src={resultImage} alt={t("yourPreview")} style={mediaImageStyle} />
									) : (
										<div style={emptyMediaStyle}>{t("noPreviewYet")}</div>
									)}
								</div>
								<div style={resultAsideStyle}>
									<div
										style={{
											padding: 18,
											borderRadius: 18,
											background: `${primaryColor}10`,
											border: `1px solid ${primaryColor}20`,
										}}
									>
										<div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
											{t("recommendedSize")}
										</div>
										<div style={{ fontSize: 42, fontWeight: 900, color: primaryColor }}>
											{recommendedSize || "-"}
										</div>
									</div>

									<button style={buttonStyle(primaryColor)} onClick={handleAddToCart} disabled={isAddingToCart}>
										{isAddingToCart ? `${t("addToCart")}...` : t("addToCart")}
									</button>
									<button style={buttonStyle(primaryColor, false)} onClick={resetWidget}>
										{t("newTryOn")}
									</button>
									{addToCartFeedback ? (
										<div style={{ color: addToCartFeedback === t("addToCartSuccess") ? "#166534" : "#991b1b", fontSize: 14 }}>
											{addToCartFeedback}
										</div>
									) : null}
								</div>
							</div>
						</>
					) : null}
				</div>
			</div>

			<style>{`
				@keyframes omafit-spin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}
			`}</style>
		</div>
	);
}

const inputStyle: React.CSSProperties = {
	width: "100%",
	borderRadius: 14,
	border: "1px solid #d1d5db",
	padding: "14px 16px",
	fontSize: 15,
	boxSizing: "border-box",
};

const mediaCardStyle: React.CSSProperties = {
	border: "1px solid #e5e7eb",
	borderRadius: 20,
	padding: 14,
	display: "grid",
	gap: 12,
	alignContent: "start",
};

const mediaCardLabelStyle: React.CSSProperties = {
	fontWeight: 800,
	fontSize: 15,
};

const mediaImageStyle: React.CSSProperties = {
	width: "100%",
	borderRadius: 16,
	objectFit: "cover",
	maxHeight: 460,
};

const emptyMediaStyle: React.CSSProperties = {
	minHeight: 240,
	border: "1px solid #d1d5db",
	borderRadius: 16,
	display: "grid",
	placeItems: "center",
	padding: 16,
	color: "#6b7280",
};

const instructionCardStyle: React.CSSProperties = {
	borderRadius: 16,
	padding: 14,
	background: "#f9fafb",
	border: "1px solid #e5e7eb",
	display: "grid",
	gap: 6,
};

const miniButtonStyle = (primaryColor: string): React.CSSProperties => ({
	borderRadius: 999,
	border: `1px solid ${primaryColor}55`,
	background: "#fff",
	color: primaryColor,
	fontWeight: 700,
	padding: "8px 12px",
	cursor: "pointer",
});

const summaryCardStyle: React.CSSProperties = {
	borderRadius: 16,
	border: "1px solid #e5e7eb",
	padding: 14,
	display: "flex",
	alignItems: "center",
	gap: 10,
	flexWrap: "wrap",
};

const resultAsideStyle: React.CSSProperties = {
	display: "grid",
	alignContent: "start",
	gap: 12,
};
