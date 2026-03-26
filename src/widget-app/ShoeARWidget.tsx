import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Camera, Footprints } from "lucide-react";
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

/** Resposta da edge `validate-footwear-chat` (mesmo contrato do widget Shopify). */
type FootwearChatResponse = {
	success?: boolean;
	data?: { explicacao?: string };
	interaction_count?: number;
	message?: string;
};

function buildFootwearFallbackMessage(
	resolvedSize: string,
	language: WidgetLanguage,
	productName: string,
	storeName: string,
	descriptionNorm: string,
	customMessage?: string,
): string {
	void language;
	const itemName = productName || "este calçado";
	const brandName = storeName || "Omafit";
	const hasQuestion = Boolean(customMessage?.trim());
	if (hasQuestion && descriptionNorm) {
		return `${itemName} da ${brandName}: ${descriptionNorm} O tamanho ${resolvedSize} é o ideal. Adicione ao carrinho para continuar sua compra.`;
	}
	return `${brandName} recomenda ${resolvedSize} para ${itemName}. Vai ficar muito bom. Adicione ao carrinho para continuar sua compra.`;
}

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
	productDescription?: string;
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
		privacyNote: "Sua foto é usada só para estimar o tamanho e não é compartilhada.",
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

/** Formato interno alinhado a `ShoeARWidget.tsx` do omafit-widget. */
type ShoeSizeChartEntry = {
	size: string;
	measurements: Record<string, number | string>;
	measurement_labels?: string[];
};

function mapShoeChartToEntries(chart: ShoeChart | null): ShoeSizeChartEntry[] {
	if (!chart?.sizes?.length) return [];
	const labels = chart.measurement_refs || [];
	return chart.sizes.map((row) => {
		const measurements: Record<string, number | string> = {};
		for (const [key, value] of Object.entries(row)) {
			if (key === "size") continue;
			measurements[key] = value;
		}
		return {
			size: String(row.size || ""),
			measurements,
			measurement_labels: labels.length ? labels : undefined,
		};
	});
}

function getChartLengthBounds(sizeChart: ShoeSizeChartEntry[]) {
	const lengths = sizeChart
		.map((entry) => getShoeLengthCmFromEntry(entry))
		.filter((value) => value > 0)
		.sort((a, b) => a - b);
	if (!lengths.length) return null;
	return { min: lengths[0], max: lengths[lengths.length - 1] };
}

function detectFootShapeMetrics(image: HTMLImageElement) {
	const maxDimension = 640;
	const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight, 1));
	const width = Math.max(1, Math.round(image.naturalWidth * scale));
	const height = Math.max(1, Math.round(image.naturalHeight * scale));

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;

	ctx.drawImage(image, 0, 0, width, height);
	const imageData = ctx.getImageData(0, 0, width, height);
	const pixels = imageData.data;

	const sampleBorder = () => {
		let r = 0;
		let g = 0;
		let b = 0;
		let count = 0;
		const step = Math.max(1, Math.floor(Math.min(width, height) / 40));
		const addPixel = (x: number, y: number) => {
			const idx = (y * width + x) * 4;
			r += pixels[idx];
			g += pixels[idx + 1];
			b += pixels[idx + 2];
			count += 1;
		};
		for (let x = 0; x < width; x += step) {
			addPixel(x, 0);
			addPixel(x, height - 1);
		}
		for (let y = 0; y < height; y += step) {
			addPixel(0, y);
			addPixel(width - 1, y);
		}
		if (!count) return { r: 240, g: 240, b: 240 };
		return { r: r / count, g: g / count, b: b / count };
	};

	const background = sampleBorder();
	const visited = new Uint8Array(width * height);

	type Component = {
		area: number;
		minX: number;
		minY: number;
		maxX: number;
		maxY: number;
	};

	const isForeground = (x: number, y: number) => {
		const idx = (y * width + x) * 4;
		const pr = pixels[idx];
		const pg = pixels[idx + 1];
		const pb = pixels[idx + 2];
		const colorDistance = Math.sqrt(
			(pr - background.r) ** 2 + (pg - background.g) ** 2 + (pb - background.b) ** 2,
		);
		const luminance = 0.299 * pr + 0.587 * pg + 0.114 * pb;
		const backgroundLuminance = 0.299 * background.r + 0.587 * background.g + 0.114 * background.b;
		return colorDistance > 42 || Math.abs(luminance - backgroundLuminance) > 28;
	};

	let bestComponent: Component | null = null;
	const queueX = new Int32Array(width * height);
	const queueY = new Int32Array(width * height);

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const startIndex = y * width + x;
			if (visited[startIndex]) continue;
			visited[startIndex] = 1;
			if (!isForeground(x, y)) continue;

			let head = 0;
			let tail = 0;
			queueX[tail] = x;
			queueY[tail] = y;
			tail += 1;

			const component: Component = {
				area: 0,
				minX: x,
				minY: y,
				maxX: x,
				maxY: y,
			};

			while (head < tail) {
				const currentX = queueX[head];
				const currentY = queueY[head];
				head += 1;

				component.area += 1;
				component.minX = Math.min(component.minX, currentX);
				component.minY = Math.min(component.minY, currentY);
				component.maxX = Math.max(component.maxX, currentX);
				component.maxY = Math.max(component.maxY, currentY);

				const neighbors = [
					[currentX + 1, currentY],
					[currentX - 1, currentY],
					[currentX, currentY + 1],
					[currentX, currentY - 1],
				];

				for (const [nextX, nextY] of neighbors) {
					if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
					const nextIndex = nextY * width + nextX;
					if (visited[nextIndex]) continue;
					visited[nextIndex] = 1;
					if (!isForeground(nextX, nextY)) continue;
					queueX[tail] = nextX;
					queueY[tail] = nextY;
					tail += 1;
				}
			}

			if (!bestComponent || component.area > bestComponent.area) {
				bestComponent = component;
			}
		}
	}

	if (!bestComponent) return null;

	const boxWidth = bestComponent.maxX - bestComponent.minX + 1;
	const boxHeight = bestComponent.maxY - bestComponent.minY + 1;
	const longestSide = Math.max(boxWidth, boxHeight);
	const shortestSide = Math.max(1, Math.min(boxWidth, boxHeight));
	const fillRatio = bestComponent.area / Math.max(1, boxWidth * boxHeight);

	if (bestComponent.area < width * height * 0.015) return null;

	return {
		longestSideRatio: longestSide / Math.max(width, height),
		aspectRatio: longestSide / shortestSide,
		fillRatio,
	};
}

function estimateFootLengthCm(
	image: HTMLImageElement,
	sizeChart: ShoeSizeChartEntry[],
	hasLandmarks: boolean,
) {
	const contour = detectFootShapeMetrics(image);
	const chartBounds = getChartLengthBounds(sizeChart);

	if (contour && chartBounds) {
		const normalizedCoverage = clamp((contour.longestSideRatio - 0.35) / 0.45, 0, 1);
		const coverageEstimate = chartBounds.min + normalizedCoverage * (chartBounds.max - chartBounds.min);
		const shapeAdjustment = clamp((contour.aspectRatio - 2.4) * 0.35, -0.5, 0.7);
		const fillAdjustment = clamp((contour.fillRatio - 0.45) * 1.5, -0.4, 0.4);
		const landmarkAdjustment = hasLandmarks ? -0.15 : 0;

		return clamp(
			coverageEstimate + shapeAdjustment + fillAdjustment + landmarkAdjustment,
			chartBounds.min - 0.6,
			chartBounds.max + 0.6,
		);
	}

	const aspectRatio = image.naturalWidth / Math.max(image.naturalHeight, 1);
	const coverageBase = hasLandmarks ? 24.8 : 25.4;
	const aspectAdjustment = clamp((aspectRatio - 0.7) * 4.5, -1.2, 1.4);
	return clamp(coverageBase + aspectAdjustment, 22.0, 30.5);
}

function footLengthToBrSize(footLengthCm: number) {
	return clamp(Math.round((footLengthCm + 1.5) * 1.5) - 2, 34, 45);
}

function getMeasurementFromEntry(entry: ShoeSizeChartEntry, keys: string[]) {
	const measurements = entry.measurements || {};
	for (const key of keys) {
		if (measurements[key] !== undefined && measurements[key] !== null) {
			return parseMeasurementValue(measurements[key]);
		}
	}
	for (const [key, value] of Object.entries(measurements)) {
		if (keys.some((candidate) => key.toLowerCase() === candidate.toLowerCase())) {
			return parseMeasurementValue(value);
		}
	}
	return 0;
}

function getShoeLengthCmFromEntry(entry: ShoeSizeChartEntry) {
	const measurements = entry.measurements || {};
	const labels = Array.isArray(entry.measurement_labels) ? entry.measurement_labels : [];

	if (labels.length > 0) {
		for (let index = 0; index < labels.length; index += 1) {
			const normalizedLabel = String(labels[index] || "")
				.trim()
				.toLowerCase();
			const isFootLengthLabel =
				normalizedLabel.includes("comprimento") ||
				normalizedLabel.includes("pe") ||
				normalizedLabel.includes("pé") ||
				normalizedLabel.includes("foot") ||
				normalizedLabel.includes("length");
			if (!isFootLengthLabel) continue;
			const keyedMeasurement = parseMeasurementValue(measurements[`medida${index + 1}`]);
			if (keyedMeasurement > 0) return keyedMeasurement;
		}
	}

	const directMeasurement = getMeasurementFromEntry(entry, [
		"medida1",
		"medida_1",
		"comprimento",
		"comprimento_pe",
		"comprimento_do_pe",
		"length",
		"pe",
		"pé",
		"foot",
		"foot_length",
	]);
	if (directMeasurement > 0) return directMeasurement;

	const legacyMeasurement = getMeasurementFromEntry(entry, ["bust", "chest", "waist", "hips", "hip"]);
	if (legacyMeasurement > 0) return legacyMeasurement;

	const fallbackMeasurement = Object.values(measurements)
		.map((value) => parseMeasurementValue(value))
		.find((value) => value > 0);
	return fallbackMeasurement || 0;
}

function calculateRecommendedShoeSizeFromChart(
	footLengthCm: number,
	sizeChart: ShoeSizeChartEntry[],
): { size: string; measuredLength: number } | null {
	if (!sizeChart.length) return null;
	const scored = sizeChart
		.map((entry) => {
			const measuredLength = getShoeLengthCmFromEntry(entry);
			if (!measuredLength) return null;
			return {
				size: entry.size,
				measuredLength,
				diff: Math.abs(measuredLength - footLengthCm),
			};
		})
		.filter(Boolean) as Array<{ size: string; measuredLength: number; diff: number }>;
	if (!scored.length) return null;
	scored.sort((a, b) => a.diff - b.diff);
	return { size: scored[0].size, measuredLength: scored[0].measuredLength };
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
		productHandle = "",
		productDescription = "",
	} = props;
	const ui = copy[language] ?? copy.pt;
	const t = useMemo(() => getT(language), [language]);
	const hoverColor = useMemo(() => darkenColor(primaryColor, 16), [primaryColor]);
	const normalizedProductDescription = useMemo(
		() =>
			String(productDescription || "")
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, 2000),
		[productDescription],
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
	const { detectPose } = useMediaPipePose({
		useWorker: false,
		silentNoPose: true,
		footPhotoMode: true,
	});

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

	async function requestFootwearChat(customMessage?: string) {
		if (interactionCount >= GPT_INTERACTION_LIMIT) return;
		if (!recommendedSizeLabel) return;

		const trimmed = String(customMessage || "").trim();
		setGptLoading(true);
		try {
			const response = await fetch("/api/widget/validate-footwear-chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					recommended_size: recommendedSizeLabel,
					intent: trimmed ? "custom_message" : "initial_result",
					user_message: trimmed,
					session_id: sessionIdRef.current,
					interaction_count: interactionCountRef.current,
					shop_name: storeName,
					shop_domain: storeDomain,
					language,
					product_name: productName,
					product_description: normalizedProductDescription,
					collection_handle: productHandle || "",
				}),
			});

			const result = (await response.json().catch(() => ({}))) as FootwearChatResponse;
			const explanation =
				result?.data?.explicacao ||
				buildFootwearFallbackMessage(
					recommendedSizeLabel,
					language,
					productName,
					storeName,
					normalizedProductDescription,
					trimmed,
				);

			if (!response.ok) {
				throw new Error(result.message || t("processingError"));
			}

			setChatMessages((current) => [
				...current,
				{ role: "assistant", content: explanation, timestamp: Date.now() },
			]);

			setInteractionCount((prev) => Number(result.interaction_count ?? prev + 1));
		} catch (_error) {
			const fallback = buildFootwearFallbackMessage(
				recommendedSizeLabel,
				language,
				productName,
				storeName,
				normalizedProductDescription,
				trimmed,
			);
			setChatMessages((current) => [
				...current,
				{ role: "assistant", content: fallback, timestamp: Date.now() },
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
		void requestFootwearChat();
	}, [step, chatMessages.length, gptLoading, recommendedSizeLabel]);

	function handleChatSubmit() {
		const message = chatInput.trim();
		if (!message || gptLoading || interactionCount >= GPT_INTERACTION_LIMIT) return;

		setChatMessages((current) => [
			...current,
			{ role: "user", content: message, timestamp: Date.now() },
		]);
		setChatInput("");
		void requestFootwearChat(message);
	}

	async function runFootAnalysis(preview: string) {
		if (!preview) return;
		initialGptRequestedRef.current = false;
		setStep("processing");
		setIsAnalyzing(true);
		setError("");
		const chartEntries = mapShoeChartToEntries(chart);
		try {
			const image = await loadImage(preview);
			const poseResult = await detectPose(image);
			const hasLandmarks = Boolean(poseResult?.landmarks?.length);
			const lengthCm = estimateFootLengthCm(image, chartEntries, hasLandmarks);
			const chartRecommendation = calculateRecommendedShoeSizeFromChart(lengthCm, chartEntries);
			const fallbackSize = footLengthToBrSize(lengthCm);
			const resolvedSizeLabel = chartRecommendation?.size ?? `BR ${fallbackSize}`;

			setFootLengthCm(Number(lengthCm.toFixed(1)));
			setRecommendedSizeLabel(resolvedSizeLabel);
			setChatMessages([]);
			setInteractionCount(0);
			setStep("measure-result");
		} catch (_err) {
			const fallbackLength = 25.2;
			const fallbackSize = footLengthToBrSize(fallbackLength);
			setFootLengthCm(fallbackLength);
			setRecommendedSizeLabel(`BR ${fallbackSize}`);
			setChatMessages([]);
			setInteractionCount(0);
			setStep("measure-result");
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
						<div className="text-center space-y-3">
							<h3 className="text-2xl md:text-3xl font-semibold text-primary mb-2">
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
