import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Camera, Footprints, Sparkles } from "lucide-react";
import { useMediaPipePose } from "./useMediaPipePose";
import { type WidgetLanguage, type WidgetTranslationKey, widgetTranslations } from "./translations";

type SizeRow = { size: string; [key: string]: string };
type ShoeChart = {
	measurement_refs: string[];
	sizes: SizeRow[];
};

type ChatMessage = {
	role: "assistant" | "user";
	content: string;
	timestamp: number;
};

type Step = "info" | "measure-capture" | "processing" | "measure-result";

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

type ShoeARWidgetProps = {
	productImage: string;
	productName: string;
	storeName: string;
	storeLogo?: string;
	primaryColor: string;
	language: WidgetLanguage;
	chart: ShoeChart | null;
	productId: string;
	storeDomain: string;
	variantId: string;
	storeId?: string;
	productHandle?: string;
	collectionElasticity?: string;
	publicId?: string;
};

const GPT_INTERACTION_LIMIT = 5;

const copy = {
	pt: {
		welcomeTitle: "O assistente inteligente da {storeName} para calçados",
		infoBody:
			"Indicamos o número ideal a partir de uma foto do seu pé e um assistente responde dúvidas sobre o modelo.",
		sizeButton: "Descobrir meu número na {storeName}",
		photoInstructions: "Instruções para a foto do pé",
		importantBadge: "IMPORTANTE",
		measureTip1: "Ângulo de cima",
		measureTip2: "Um palmo abaixo do joelho",
		measureTip3: "Pé descalço",
		measureTip4: "Boa iluminação",
		measureTip1Desc: "foto feita de cima para baixo",
		measureTip2Desc: "mostrando a perna e o pé no enquadramento",
		measureTip3Desc: "sem meia e sem nada cobrindo o pé",
		measureTip4Desc: "ambiente bem iluminado",
		photoInstructionWarning: "Fotos fora dessas instruções podem gerar resultado incorreto.",
		captureButton: "Clique para enviar a foto do pé",
		imageFormats: "JPG, PNG ou WEBP (máx. 5MB)",
		analyzing: "Analisando sua foto...",
		footPhotoLabel: "Foto do pé",
		recommendedSizeTitle: "Número recomendado",
		privacyNote: "Sua foto é usada só para estimar o tamanho e não é compartilhada.",
	},
	es: {
		welcomeTitle: "El asistente inteligente de {storeName} para calzado",
		infoBody:
			"Indicamos tu talla ideal con una foto del pie y un asistente responde dudas sobre el modelo.",
		sizeButton: "Descubrir mi talla en {storeName}",
		photoInstructions: "Instrucciones para la foto del pie",
		importantBadge: "IMPORTANTE",
		measureTip1: "Ángulo superior",
		measureTip2: "Un palmo debajo de la rodilla",
		measureTip3: "Pie descalzo",
		measureTip4: "Buena iluminación",
		measureTip1Desc: "foto tomada de arriba hacia abajo",
		measureTip2Desc: "mostrando la pierna y el pie en el encuadre",
		measureTip3Desc: "sin media y sin nada cubriendo el pie",
		measureTip4Desc: "ambiente bien iluminado",
		photoInstructionWarning: "Fotos fuera de estas instrucciones pueden generar resultados incorrectos.",
		captureButton: "Haz clic para subir la foto del pie",
		imageFormats: "JPG, PNG o WEBP (máx. 5MB)",
		analyzing: "Analizando tu foto...",
		footPhotoLabel: "Foto del pie",
		recommendedSizeTitle: "Talla recomendada",
		privacyNote: "Tu foto solo se usa para estimar la talla y no se comparte.",
	},
	en: {
		welcomeTitle: "{storeName}'s intelligent footwear assistant",
		infoBody:
			"We suggest your best size from a foot photo, and an assistant answers questions about this model.",
		sizeButton: "Find my size at {storeName}",
		photoInstructions: "Foot photo instructions",
		importantBadge: "IMPORTANT",
		measureTip1: "Top angle",
		measureTip2: "One palm below the knee",
		measureTip3: "Barefoot",
		measureTip4: "Good lighting",
		measureTip1Desc: "take the photo from above",
		measureTip2Desc: "showing leg and foot in frame",
		measureTip3Desc: "without socks and nothing covering the foot",
		measureTip4Desc: "well-lit environment",
		photoInstructionWarning: "Photos outside these instructions can lead to incorrect results.",
		captureButton: "Click to upload foot photo",
		imageFormats: "JPG, PNG or WEBP (max. 5MB)",
		analyzing: "Analyzing your photo...",
		footPhotoLabel: "Foot photo",
		recommendedSizeTitle: "Recommended size",
		privacyNote: "Your photo is only used to estimate size and is not shared.",
	},
} as const;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function darkenColor(hex: string, amount = 20) {
	const value = hex.replace("#", "");
	if (value.length !== 6) return hex;
	const clampChannel = (part: string) => Math.max(0, Number.parseInt(part, 16) - amount);
	return `#${[value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)]
		.map((part) => clampChannel(part).toString(16).padStart(2, "0"))
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

function parseMeasurementValue(value: unknown): number {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	if (value === null || value === undefined) return 0;
	const normalized = String(value).trim().replace(",", ".").replace(/[^0-9.-]/g, "");
	const parsed = Number.parseFloat(normalized);
	return Number.isFinite(parsed) ? parsed : 0;
}

function getShoeLengthCmFromRow(row: SizeRow, refs: string[]) {
	const refCandidates = refs.length ? refs : ["tamanho_pe", "comprimento", "pe", "pé", "foot_length"];
	for (const key of refCandidates) {
		const value = parseMeasurementValue(row[key]);
		if (value > 0) return value;
	}
	const fallback = Object.values(row)
		.map((value) => parseMeasurementValue(value))
		.find((value) => value > 0);
	return fallback || 0;
}

function calculateRecommendedShoeSizeFromChart(footLengthCm: number, chart: ShoeChart | null) {
	if (!chart?.sizes?.length) return null;
	const scored = chart.sizes
		.map((row) => {
			const measuredLength = getShoeLengthCmFromRow(row, chart.measurement_refs || []);
			if (!measuredLength) return null;
			return { size: String(row.size || ""), diff: Math.abs(measuredLength - footLengthCm) };
		})
		.filter(Boolean) as Array<{ size: string; diff: number }>;
	if (!scored.length) return null;
	scored.sort((a, b) => a.diff - b.diff);
	return scored[0].size;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

function estimateFootLengthCm(image: HTMLImageElement, hasLandmarks: boolean) {
	const aspectRatio = image.naturalWidth / Math.max(image.naturalHeight, 1);
	const coverageBase = hasLandmarks ? 24.8 : 25.4;
	const aspectAdjustment = clamp((aspectRatio - 0.7) * 4.5, -1.2, 1.4);
	return clamp(coverageBase + aspectAdjustment, 22.0, 30.5);
}

function replaceStoreName(template: string, storeName: string) {
	return template.replace("{storeName}", storeName || "Omafit");
}

export function ShoeARWidget(props: ShoeARWidgetProps) {
	const {
		productImage,
		productName,
		storeName,
		storeLogo,
		primaryColor,
		language,
		chart,
		productId,
		storeDomain,
		variantId,
		storeId = "",
		productHandle = "",
		collectionElasticity = "structured",
		publicId = "",
	} = props;
	const ui = copy[language] ?? copy.pt;
	const t = useMemo(() => getT(language), [language]);
	const hoverColor = useMemo(() => darkenColor(primaryColor, 16), [primaryColor]);
	const availableSizes = useMemo(
		() => (chart?.sizes || []).map((row) => String(row.size || "")).filter(Boolean),
		[chart],
	);

	const [step, setStep] = useState<Step>("info");
	const [footPhotoPreview, setFootPhotoPreview] = useState("");
	const [recommendedSizeLabel, setRecommendedSizeLabel] = useState<string | null>(null);
	const [footLengthCm, setFootLengthCm] = useState<number | null>(null);
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [chatInput, setChatInput] = useState("");
	const [gptLoading, setGptLoading] = useState(false);
	const [interactionCount, setInteractionCount] = useState(0);
	const interactionCountRef = useRef(0);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [isAddingToCart, setIsAddingToCart] = useState(false);
	const [addToCartFeedback, setAddToCartFeedback] = useState("");
	const [error, setError] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const chatEndRef = useRef<HTMLDivElement | null>(null);
	const sessionIdRef = useRef(`shoe_${Date.now().toString(36)}`);
	const initialGptRequestedRef = useRef(false);
	const { detectPose } = useMediaPipePose({ useWorker: false, silentNoPose: true });

	useEffect(() => {
		interactionCountRef.current = interactionCount;
	}, [interactionCount]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.data?.type !== "omafit-add-to-cart-result") return;
			setIsAddingToCart(false);
			setAddToCartFeedback(
				event.data?.ok ? t("addToCartSuccess") : event.data?.message || t("addToCartError"),
			);
		};
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [t]);

	useEffect(() => {
		if (chatEndRef.current) {
			chatEndRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [chatMessages, gptLoading]);

	async function callShoeGPTAssistant(intention: "add_to_cart" | "custom_message", customMessage?: string) {
		if (interactionCount >= GPT_INTERACTION_LIMIT) return;
		if (!recommendedSizeLabel) return;

		setGptLoading(true);
		try {
			const response = await fetch("/api/widget/validate-size", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					altura_cm: 170,
					peso_kg: 70,
					peito_cm: 90,
					cintura_cm: 75,
					quadril_cm: 95,
					tipo_corpo: "regular",
					ajuste_preferido: "regular",
					genero: "unisex",
					elasticidade: collectionElasticity || "structured",
					categoria: "footwear",
					tamanho_calculado_algoritmo: recommendedSizeLabel,
					intencao_usuario:
						intention === "custom_message" ? "custom_message" : "induzir_adicionar_carrinho",
					custom_message: customMessage,
					session_id: sessionIdRef.current,
					interaction_count: interactionCountRef.current,
					shop_name: storeName,
					shop_domain: storeDomain,
					store_id: storeId || undefined,
					language,
					product_name: productName,
					product_handle: productHandle || undefined,
					available_sizes: availableSizes,
					available_colors: [],
					selected_image: productImage,
					selected_color: "",
					variant_catalog: [],
					comprimento_pe_cm: footLengthCm != null ? Number(footLengthCm.toFixed(1)) : undefined,
					public_id: publicId || undefined,
				}),
			});

			const result = (await response.json().catch(() => ({}))) as ValidateSizeResponse;
			if (!response.ok || !result.success || !result.data?.explicacao) {
				throw new Error(result.message || t("processingError"));
			}

			if (result.data.tamanho_final) {
				setRecommendedSizeLabel(String(result.data.tamanho_final));
			}

			setChatMessages((current) => [
				...current,
				{
					role: "assistant",
					content: String(result.data?.explicacao || ""),
					timestamp: Date.now(),
				},
			]);

			setInteractionCount((prev) =>
				result.data?.should_end_conversation
					? GPT_INTERACTION_LIMIT
					: Number(result.interaction_count ?? prev + 1),
			);
		} catch (_error) {
			setChatMessages((current) => [
				...current,
				{
					role: "assistant",
					content: `${productName || t("product")}: ${recommendedSizeLabel}. ${t("addToCart")}.`,
					timestamp: Date.now(),
				},
			]);
			setInteractionCount((c) => c + 1);
		} finally {
			setGptLoading(false);
		}
	}

	useEffect(() => {
		if (step !== "measure-result" || chatMessages.length > 0 || gptLoading || !recommendedSizeLabel) {
			return;
		}
		if (initialGptRequestedRef.current) return;
		initialGptRequestedRef.current = true;
		void callShoeGPTAssistant("add_to_cart");
	}, [step, chatMessages.length, gptLoading, recommendedSizeLabel]);

	function handleChatSubmit() {
		const message = chatInput.trim();
		if (!message || gptLoading || interactionCount >= GPT_INTERACTION_LIMIT) return;

		setChatMessages((current) => [
			...current,
			{ role: "user", content: message, timestamp: Date.now() },
		]);
		setChatInput("");
		void callShoeGPTAssistant("custom_message", message);
	}

	async function runFootAnalysis(preview: string) {
		if (!preview) return;
		initialGptRequestedRef.current = false;
		setStep("processing");
		setIsAnalyzing(true);
		setError("");
		try {
			const image = await loadImage(preview);
			const poseResult = await detectPose(image);
			const hasLandmarks = Boolean(poseResult?.landmarks?.length);
			const lengthCm = estimateFootLengthCm(image, hasLandmarks);
			const chartSize = calculateRecommendedShoeSizeFromChart(lengthCm, chart);
			const fallbackSize = `BR ${Math.round((lengthCm + 1.5) * 1.5) - 2}`;
			const resolvedSize = chartSize || fallbackSize;
			setFootLengthCm(lengthCm);
			setRecommendedSizeLabel(resolvedSize);
			setChatMessages([]);
			setInteractionCount(0);
			setStep("measure-result");
		} catch (_err) {
			setError(
				language === "pt"
					? "Erro ao analisar a foto."
					: language === "es"
						? "Error al analizar la foto."
						: "Error analyzing photo.",
			);
			setStep("measure-capture");
		} finally {
			setIsAnalyzing(false);
		}
	}

	function handleSelectFootPhoto(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onloadend = () => {
			const preview = String(reader.result || "");
			setFootPhotoPreview(preview);
			void runFootAnalysis(preview);
		};
		reader.readAsDataURL(file);
		event.target.value = "";
	}

	function handleAddToCart() {
		if (isAddingToCart) return;
		setIsAddingToCart(true);
		setAddToCartFeedback("");
		window.parent.postMessage(
			{
				type: "omafit-add-to-cart-request",
				requestId: `cart_${sessionIdRef.current}_${Date.now()}`,
				source: "omafit-shoe-widget-nuvemshop",
				product: { id: productId, name: productName },
				selection: {
					recommended_size: recommendedSizeLabel,
					recommended_size_label: recommendedSizeLabel,
					variant_option_name: "Tamanho",
					selected_options: recommendedSizeLabel ? { Tamanho: recommendedSizeLabel } : {},
					selected_variant_id: variantId || null,
				},
				quantity: 1,
				shop_domain: storeDomain,
				metadata: {
					session_id: sessionIdRef.current,
					language,
					recommended_size_label: recommendedSizeLabel,
					selected_variant_id: variantId || null,
					foot_length_cm: footLengthCm,
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

	function goBack() {
		if (step === "measure-result") {
			setChatMessages([]);
			setInteractionCount(0);
			initialGptRequestedRef.current = false;
			setRecommendedSizeLabel(null);
			setFootLengthCm(null);
			setStep("measure-capture");
			return;
		}
		if (step === "measure-capture") {
			setError("");
			setFootPhotoPreview("");
			setStep("info");
		}
	}

	const displayImage = productImage;

	return (
		<div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in">
			<style>{`
				* { font-family: var(--omafit-store-font, system-ui, -apple-system, sans-serif) !important; }
				.bg-primary { background-color: ${primaryColor} !important; }
				.text-primary { color: ${primaryColor} !important; }
				.border-primary { border-color: ${primaryColor} !important; }
				.hover\\:bg-primary-dark:hover { background-color: ${hoverColor} !important; }
				.animate-fade-in { animation: omafitShoeFadeIn 220ms ease-out; }
				@keyframes omafitShoeFadeIn {
					from { opacity: 0; transform: translateY(8px); }
					to { opacity: 1; transform: translateY(0); }
				}
			`}</style>

			<div className="flex items-center justify-between p-4 border-b border-primary">
				{step !== "info" && step !== "processing" ? (
					<button
						type="button"
						onClick={goBack}
						className="text-gray-500 hover:text-gray-700 transition-colors"
						aria-label={t("back")}
					>
						<ArrowLeft className="w-6 h-6" />
					</button>
				) : (
					<div className="w-6" />
				)}
				<div className="flex-1 flex justify-center">
					{storeLogo ? (
						<img src={storeLogo} alt={storeName} className="h-10 w-auto object-contain" />
					) : (
						<Footprints className="w-6 h-6 text-primary" />
					)}
				</div>
				<div className="w-6" />
			</div>

			{step === "info" ? (
				<div className="flex-1 flex flex-col md:flex-row overflow-hidden">
					<div className="hidden md:flex md:w-1/2 bg-gray-50 p-8 items-center justify-center">
						<div className="w-full max-w-md rounded-2xl overflow-hidden bg-gray-100 shadow-inner">
							{displayImage ? (
								<img src={displayImage} alt={productName} className="w-full h-auto object-contain" />
							) : (
								<div className="h-72 flex items-center justify-center text-gray-400">
									<Footprints className="w-16 h-16" />
								</div>
							)}
						</div>
					</div>
					<div className="flex-1 p-4 md:p-8 overflow-y-auto flex flex-col justify-center">
						<div className="md:hidden bg-gray-50 rounded-xl p-3 mb-4">
							<div className="w-full rounded-2xl overflow-hidden bg-gray-100">
								{displayImage ? (
									<img src={displayImage} alt={productName} className="w-full h-auto object-contain" />
								) : (
									<div className="h-56 flex items-center justify-center text-gray-400">
										<Footprints className="w-12 h-12" />
									</div>
								)}
							</div>
						</div>
						<div className="text-center md:text-left space-y-3">
							<div className="inline-flex items-center justify-center gap-2 text-primary mb-1">
								<Sparkles className="w-6 h-6" />
								<span className="text-sm font-semibold uppercase tracking-wide">AR</span>
							</div>
							<h3 className="text-2xl md:text-3xl font-semibold text-primary">
								{replaceStoreName(ui.welcomeTitle, storeName)}
							</h3>
							<p className="text-gray-700 text-lg md:text-xl leading-relaxed">{ui.infoBody}</p>
							<p className="text-sm text-gray-500">{ui.privacyNote}</p>
						</div>
						<button
							type="button"
							onClick={() => setStep("measure-capture")}
							className="mt-8 w-full md:max-w-md bg-primary hover:bg-primary-dark text-white py-3.5 rounded-xl font-medium text-lg transition-all"
						>
							{replaceStoreName(ui.sizeButton, storeName)}
						</button>
					</div>
				</div>
			) : null}

			{step === "measure-capture" ? (
				<div className="flex-1 p-4 overflow-y-auto space-y-4">
					{error ? (
						<div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
							<AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
							<p className="text-red-700 text-sm">{error}</p>
						</div>
					) : null}
					<div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-400 rounded-xl p-4 shadow-md">
						<h4 className="font-bold text-blue-900 mb-2 text-base flex items-center gap-2 flex-wrap">
							{ui.photoInstructions}
							<span className="text-xs bg-blue-800 text-white px-2 py-0.5 rounded-full font-semibold">
								{ui.importantBadge}
							</span>
						</h4>
						<ul className="text-base text-blue-900 space-y-1.5 mb-3">
							<li>
								• <strong>{ui.measureTip1}</strong> — {ui.measureTip1Desc}
							</li>
							<li>
								• <strong>{ui.measureTip2}</strong> — {ui.measureTip2Desc}
							</li>
							<li>
								• <strong>{ui.measureTip3}</strong> — {ui.measureTip3Desc}
							</li>
							<li>
								• <strong>{ui.measureTip4}</strong> — {ui.measureTip4Desc}
							</li>
						</ul>
						<div className="bg-blue-100 border-l-4 border-blue-700 p-2 rounded">
							<p className="text-sm text-blue-900 font-semibold">{ui.photoInstructionWarning}</p>
						</div>
					</div>
					<div>
						<h3 className="text-xl font-semibold mb-3 text-gray-900">{ui.footPhotoLabel}</h3>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className="flex min-h-[300px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-center cursor-pointer hover:bg-slate-50 transition-colors"
						>
							{footPhotoPreview ? (
								<img src={footPhotoPreview} alt={ui.footPhotoLabel} className="h-[300px] w-full object-cover rounded-lg" />
							) : (
								<>
									<Camera className="mb-3 h-10 w-10 text-gray-500" />
									<span className="text-gray-700 mb-2 text-lg">{ui.captureButton}</span>
									<span className="text-base text-gray-500">{ui.imageFormats}</span>
								</>
							)}
						</button>
						<input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleSelectFootPhoto} className="hidden" />
					</div>
				</div>
			) : null}

			{step === "processing" ? (
				<div className="flex-1 flex items-center justify-center p-6">
					<div className="text-center">
						<div className="flex items-center justify-center gap-2 mb-4">
							<span
								className="inline-block w-3 h-3 rounded-full animate-bounce bg-primary"
								style={{ animationDelay: "0ms", animationDuration: "1.4s" }}
							/>
							<span
								className="inline-block w-3 h-3 rounded-full animate-bounce bg-primary"
								style={{ animationDelay: "200ms", animationDuration: "1.4s" }}
							/>
							<span
								className="inline-block w-3 h-3 rounded-full animate-bounce bg-primary"
								style={{ animationDelay: "400ms", animationDuration: "1.4s" }}
							/>
						</div>
						<p className="text-lg text-gray-700">{isAnalyzing ? ui.analyzing : "…"}</p>
					</div>
				</div>
			) : null}

			{step === "measure-result" ? (
				<div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
					<div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
						<div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm">
							<p className="text-sm font-medium text-gray-500 uppercase tracking-wide">{ui.recommendedSizeTitle}</p>
							<p className="text-3xl font-bold text-primary mt-1">{recommendedSizeLabel || "—"}</p>
							{footLengthCm != null ? (
								<p className="text-sm text-gray-600 mt-2">
									{t("recommendedFootLength")}: {footLengthCm.toFixed(1)} cm
								</p>
							) : null}
						</div>

						<div className="flex justify-start">
							<div className="max-w-[65%] md:max-w-[30%]">
								{footPhotoPreview ? (
									<img src={footPhotoPreview} alt={ui.footPhotoLabel} className="w-full rounded-2xl shadow-md" />
								) : null}
							</div>
						</div>

						{chatMessages.map((message, index) => (
							<div
								key={`${message.timestamp}-${index}`}
								className={`flex gap-2 ${message.role === "assistant" ? "justify-start" : "justify-end"}`}
							>
								{message.role === "assistant" && storeLogo ? (
									<div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-white shadow-sm flex items-center justify-center p-1">
										<img src={storeLogo} alt={storeName} className="w-full h-full object-contain" />
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
										<img src={storeLogo} alt={storeName} className="w-full h-full object-contain" />
									</div>
								) : null}
								<div className="max-w-[80%] rounded-2xl p-4 bg-gray-100">
									<div className="flex items-center gap-1">
										<span
											className="inline-block w-2 h-2 rounded-full animate-bounce bg-primary"
											style={{ animationDelay: "0ms", animationDuration: "1.4s" }}
										/>
										<span
											className="inline-block w-2 h-2 rounded-full animate-bounce bg-primary"
											style={{ animationDelay: "200ms", animationDuration: "1.4s" }}
										/>
										<span
											className="inline-block w-2 h-2 rounded-full animate-bounce bg-primary"
											style={{ animationDelay: "400ms", animationDuration: "1.4s" }}
										/>
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
							{addToCartFeedback ? <p className="text-xs text-center text-gray-600 mb-3">{addToCartFeedback}</p> : null}
							{chatMessages.length === 1 && chatMessages[0]?.role === "assistant" ? (
								<p className="text-sm text-gray-600 text-center mb-3">{t("askAboutFootwear")}</p>
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
									{t("assistantThanks", { storeName })}
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
			) : null}
		</div>
	);
}
