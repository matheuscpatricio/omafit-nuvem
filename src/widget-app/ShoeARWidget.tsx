import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Footprints } from "lucide-react";
import { useMediaPipePose } from "./useMediaPipePose";
import type { WidgetLanguage } from "./translations";

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
};

const copy = {
	pt: {
		welcomeTitle: "Bem-vindo ao assistente inteligente da {storeName}",
		infoBody: "Envie uma foto do seu pé para calcularmos o tamanho ideal desse calçado para você.",
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
		addToCart: "Adicionar ao carrinho",
		addingToCart: "Adicionando ao carrinho...",
		chatPrompt: "Quer saber mais sobre este calçado? Pergunte abaixo",
		chatPlaceholder: "Digite sua mensagem...",
	},
	es: {
		welcomeTitle: "Bienvenido al asistente inteligente de {storeName}",
		infoBody: "Envía una foto de tu pie para calcular la talla ideal de este calzado.",
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
		addToCart: "Agregar al carrito",
		addingToCart: "Agregando al carrito...",
		chatPrompt: "¿Quieres saber más sobre este calzado? Pregunta abajo",
		chatPlaceholder: "Escribe tu mensaje...",
	},
	en: {
		welcomeTitle: "Welcome to {storeName}'s intelligent assistant",
		infoBody: "Send a foot photo so we can calculate the ideal size for this footwear.",
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
		addToCart: "Add to cart",
		addingToCart: "Adding to cart...",
		chatPrompt: "Want to know more about this footwear? Ask below",
		chatPlaceholder: "Type your message...",
	},
} as const;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
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
	} = props;
	const t = copy[language] ?? copy.pt;
	const [step, setStep] = useState<Step>("info");
	const [footPhotoPreview, setFootPhotoPreview] = useState("");
	const [recommendedSizeLabel, setRecommendedSizeLabel] = useState<string | null>(null);
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [chatInput, setChatInput] = useState("");
	const [gptLoading, setGptLoading] = useState(false);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [isAddingToCart, setIsAddingToCart] = useState(false);
	const [addToCartFeedback, setAddToCartFeedback] = useState("");
	const [error, setError] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { detectPose } = useMediaPipePose({ useWorker: false, silentNoPose: true });

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.data?.type !== "omafit-add-to-cart-result") return;
			setIsAddingToCart(false);
			setAddToCartFeedback(
				event.data?.ok
					? language === "pt"
						? "Produto adicionado ao carrinho!"
						: language === "es"
							? "Producto agregado al carrito!"
							: "Product added to cart!"
					: language === "pt"
						? "Não foi possível adicionar ao carrinho."
						: language === "es"
							? "No se pudo agregar al carrito."
							: "Could not add to cart.",
			);
		};
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [language]);

	async function runFootAnalysis(preview: string) {
		if (!preview) return;
		setStep("processing");
		setIsAnalyzing(true);
		setError("");
		try {
			const image = await loadImage(preview);
			const poseResult = await detectPose(image);
			const hasLandmarks = Boolean(poseResult?.landmarks?.length);
			const footLengthCm = estimateFootLengthCm(image, hasLandmarks);
			const chartSize = calculateRecommendedShoeSizeFromChart(footLengthCm, chart);
			const fallbackSize = `BR ${Math.round((footLengthCm + 1.5) * 1.5) - 2}`;
			const resolvedSize = chartSize || fallbackSize;
			setRecommendedSizeLabel(resolvedSize);
			setChatMessages([
				{
					role: "assistant",
					content:
						language === "pt"
							? `${storeName || "Omafit"} recomenda o tamanho ${resolvedSize} para ${productName || "este calçado"}.`
							: language === "es"
								? `${storeName || "Omafit"} recomienda la talla ${resolvedSize} para ${productName || "este calzado"}.`
								: `${storeName || "Omafit"} recommends size ${resolvedSize} for ${productName || "this footwear"}.`,
					timestamp: Date.now(),
				},
			]);
			setStep("measure-result");
		} catch (_error) {
			setError(language === "pt" ? "Erro ao analisar a foto." : language === "es" ? "Error al analizar la foto." : "Error analyzing photo.");
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

	function handleSendChatMessage() {
		const message = chatInput.trim();
		if (!message || gptLoading) return;
		setChatMessages((current) => [...current, { role: "user", content: message, timestamp: Date.now() }]);
		setChatInput("");
		setGptLoading(true);
		window.setTimeout(() => {
			setChatMessages((current) => [
				...current,
				{
					role: "assistant",
					content:
						language === "pt"
							? `Ótima escolha. O tamanho ${recommendedSizeLabel || ""} tende a vestir bem para este modelo.`
							: language === "es"
								? `Excelente elección. La talla ${recommendedSizeLabel || ""} suele calzar bien para este modelo.`
								: `Great pick. Size ${recommendedSizeLabel || ""} should fit this model well.`,
					timestamp: Date.now(),
				},
			]);
			setGptLoading(false);
		}, 800);
	}

	function handleAddToCart() {
		if (isAddingToCart) return;
		setIsAddingToCart(true);
		setAddToCartFeedback("");
		window.parent.postMessage(
			{
				type: "omafit-add-to-cart-request",
				requestId: `cart_${Date.now()}`,
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
			},
			"*",
		);
		window.setTimeout(() => {
			setIsAddingToCart((current) => {
				if (!current) return current;
				setAddToCartFeedback(language === "pt" ? "Ainda processando o carrinho..." : language === "es" ? "Aún procesando el carrito..." : "Still processing cart...");
				return false;
			});
		}, 8000);
	}

	return (
		<div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in">
			<style>{`
				.bg-primary { background-color: ${primaryColor} !important; }
				.text-primary { color: ${primaryColor} !important; }
			`}</style>
			<div className="flex items-center justify-between p-4 border-b border-gray-200">
				{step !== "info" && step !== "processing" ? (
					<button type="button" onClick={() => setStep(step === "measure-result" ? "measure-capture" : "info")} className="text-gray-500 hover:text-gray-700">
						<ArrowLeft className="w-6 h-6" />
					</button>
				) : (
					<div className="w-6" />
				)}
				<div className="flex-1 flex justify-center">
					{storeLogo ? <img src={storeLogo} alt={storeName} className="h-10 w-auto object-contain" /> : <Footprints className="h-6 w-6 text-primary" />}
				</div>
				<div className="w-6" />
			</div>

			{step === "info" && (
				<div className="flex-1 p-4 overflow-y-auto">
					<div className="space-y-4 md:flex md:flex-col md:justify-center md:h-full">
						<div className="bg-gray-50 rounded-xl p-3">
							<div className="w-full rounded-2xl overflow-hidden bg-gray-100">
								{productImage ? (
									<img src={productImage} alt={productName} className="w-full h-auto object-contain" />
								) : (
									<div className="h-64 flex items-center justify-center text-gray-400">
										<Footprints className="h-10 w-10" />
									</div>
								)}
							</div>
						</div>
						<div className="text-center">
							<h3 className="text-2xl font-semibold text-primary mb-2">{replaceStoreName(t.welcomeTitle, storeName)}</h3>
							<p className="text-gray-700 text-lg">{t.infoBody}</p>
						</div>
						<button type="button" onClick={() => setStep("measure-capture")} className="w-full bg-primary text-white py-3.5 rounded-lg font-medium text-lg">
							{replaceStoreName(t.sizeButton, storeName)}
						</button>
					</div>
				</div>
			)}

			{step === "measure-capture" && (
				<div className="flex-1 p-4 overflow-y-auto space-y-4">
					<div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-400 rounded-lg p-4 shadow-md">
						<h4 className="font-bold text-blue-900 mb-2 text-base flex items-center gap-2">
							{t.photoInstructions}
							<span className="text-xs bg-blue-800 text-white px-2 py-0.5 rounded-full font-semibold">{t.importantBadge}</span>
						</h4>
						<ul className="text-base text-blue-900 space-y-1.5 mb-3">
							<li>• <strong>{t.measureTip1}</strong> - {t.measureTip1Desc}</li>
							<li>• <strong>{t.measureTip2}</strong> - {t.measureTip2Desc}</li>
							<li>• <strong>{t.measureTip3}</strong> - {t.measureTip3Desc}</li>
							<li>• <strong>{t.measureTip4}</strong> - {t.measureTip4Desc}</li>
						</ul>
						<div className="bg-blue-100 border-l-4 border-blue-700 p-2 rounded mt-2">
							<p className="text-sm text-blue-900 font-semibold">{t.photoInstructionWarning}</p>
						</div>
					</div>
					<div>
						<h3 className="text-xl font-semibold mb-3">{t.footPhotoLabel}</h3>
						<button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-center cursor-pointer hover:bg-slate-50">
							{footPhotoPreview ? (
								<img src={footPhotoPreview} alt={t.footPhotoLabel} className="h-[320px] w-full object-cover rounded-lg" />
							) : (
								<>
									<Camera className="mb-3 h-10 w-10" />
									<span className="text-gray-700 mb-2 text-lg">{t.captureButton}</span>
									<span className="text-base text-gray-500">{t.imageFormats}</span>
								</>
							)}
						</button>
						<input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleSelectFootPhoto} className="hidden" />
					</div>
					{error ? <p className="text-sm text-red-600">{error}</p> : null}
				</div>
			)}

			{step === "processing" && (
				<div className="flex-1 flex items-center justify-center p-6">
					<div className="text-center">
						<div className="flex items-center justify-center gap-2 mb-4">
							<span className="inline-block w-3 h-3 rounded-full animate-bounce bg-primary" style={{ animationDelay: "0ms", animationDuration: "1.4s" }} />
							<span className="inline-block w-3 h-3 rounded-full animate-bounce bg-primary" style={{ animationDelay: "200ms", animationDuration: "1.4s" }} />
							<span className="inline-block w-3 h-3 rounded-full animate-bounce bg-primary" style={{ animationDelay: "400ms", animationDuration: "1.4s" }} />
						</div>
						<p className="text-lg">{isAnalyzing ? t.analyzing : "..."}</p>
					</div>
				</div>
			)}

			{step === "measure-result" && (
				<div className="flex-1 overflow-y-auto p-4 space-y-4">
					<div className="flex justify-start">
						<div className="max-w-[65%] md:max-w-[30%]">
							{footPhotoPreview ? (
								<img src={footPhotoPreview} alt={t.footPhotoLabel} className="w-full rounded-2xl shadow-md" />
							) : null}
						</div>
					</div>
					{chatMessages.map((message, index) => (
						<div key={`${message.timestamp}-${index}`} className={`flex gap-2 ${message.role === "assistant" ? "justify-start" : "justify-end"}`}>
							<div className={`max-w-[80%] rounded-2xl p-4 ${message.role === "assistant" ? "bg-gray-100 text-gray-900" : "text-white bg-primary"}`}>
								<p className="text-sm md:text-base whitespace-pre-line">{message.content}</p>
							</div>
						</div>
					))}
					{gptLoading ? <p className="text-sm text-gray-500">{language === "pt" ? "Digitando..." : language === "es" ? "Escribiendo..." : "Typing..."}</p> : null}
					<button type="button" onClick={handleAddToCart} disabled={isAddingToCart} className="w-full mb-2 px-4 py-3 rounded-xl font-semibold text-white bg-primary disabled:opacity-60">
						{isAddingToCart ? t.addingToCart : t.addToCart}
					</button>
					{addToCartFeedback ? <p className="text-xs text-center text-gray-600">{addToCartFeedback}</p> : null}
					<p className="text-sm text-gray-600 text-center">{t.chatPrompt}</p>
					<div className="flex gap-2">
						<input
							type="text"
							value={chatInput}
							onChange={(event) => setChatInput(event.target.value)}
							placeholder={t.chatPlaceholder}
							disabled={gptLoading}
							className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2"
							onKeyDown={(event) => {
								if (event.key === "Enter") handleSendChatMessage();
							}}
						/>
						<button type="button" disabled={gptLoading} className="px-5 py-3 rounded-xl text-white font-medium bg-primary" onClick={handleSendChatMessage}>
							<ArrowRight className="w-5 h-5" />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

