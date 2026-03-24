import type { WidgetLanguage } from "./translations";
import type { PoseLandmark } from "./useMediaPipePose";

export type CollectionType = "upper" | "lower" | "full" | "footwear";

export function getOptimizedRemoteTryOnImageUrl(rawUrl: string): string {
	if (!rawUrl) return "";
	try {
		const url = new URL(rawUrl);
		const ext = url.pathname.split(".").pop()?.toLowerCase();
		if (ext && ["jpg", "jpeg", "png", "webp"].includes(ext)) {
			url.searchParams.set("width", "1200");
			url.searchParams.set("quality", "90");
		}
		return url.toString();
	} catch {
		return rawUrl;
	}
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Falha ao carregar a imagem para análise"));
		image.src = src;
	});
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92) {
	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error("Falha ao gerar blob otimizado"));
				return;
			}
			resolve(blob);
		}, type, quality);
	});
}

export async function optimizeTryOnImage(file: File) {
	const sourceUrl = URL.createObjectURL(file);
	try {
		const image = await loadImageElement(sourceUrl);
		const maxDimension = 1600;
		const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
		const width = Math.max(1, Math.round(image.naturalWidth * scale));
		const height = Math.max(1, Math.round(image.naturalHeight * scale));

		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Falha ao preparar canvas da foto");

		context.drawImage(image, 0, 0, width, height);
		const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
		const previewUrl = URL.createObjectURL(blob);

		return { blob, previewUrl, width, height };
	} finally {
		URL.revokeObjectURL(sourceUrl);
	}
}

export function getDefaultMeasurementWeights(collectionType: CollectionType) {
	const defaultWeights = {
		upper: { Busto: 2.0, Peito: 2.0, Cintura: 1.0, Quadril: 1.0, Comprimento: 1.0, Ombro: 1.0 },
		lower: { Busto: 1.0, Peito: 1.0, Cintura: 2.0, Quadril: 2.0, Comprimento: 1.0, Tornozelo: 1.0 },
		full: { Busto: 1.0, Peito: 1.0, Cintura: 1.0, Quadril: 1.0, Comprimento: 1.0, Ombro: 1.0 },
		footwear: { Comprimento: 2.0, Tornozelo: 1.0 },
	} as const;

	return { ...defaultWeights[collectionType] };
}

export function validatePhotoForCollection(
	landmarks: PoseLandmark[],
	collectionType: CollectionType,
	language: WidgetLanguage,
): { valid: boolean; message?: string } {
	const getPoint = (index: number) => landmarks[index];
	const hasPoint = (index: number, minVisibility = 0.25) =>
		!!getPoint(index) && (getPoint(index).visibility ?? 0) >= minVisibility;

	const noPoseMessage = {
		pt: "Não conseguimos detectar seu corpo na foto. Envie outra imagem com melhor iluminação e enquadramento.",
		es: "No pudimos detectar tu cuerpo en la foto. Envía otra imagen con mejor iluminación y encuadre.",
		en: "We could not detect your body in the photo. Please upload another image with better lighting and framing.",
	};

	if (!landmarks || landmarks.length < 29) {
		return { valid: false, message: noPoseMessage[language] };
	}

	const nose = getPoint(0);
	const leftShoulder = getPoint(11);
	const rightShoulder = getPoint(12);
	const leftHip = getPoint(23);
	const rightHip = getPoint(24);
	const leftKnee = getPoint(25);
	const rightKnee = getPoint(26);
	const leftAnkle = getPoint(27);
	const rightAnkle = getPoint(28);

	const avgShoulderY = ((leftShoulder?.y ?? 0) + (rightShoulder?.y ?? 0)) / 2;
	const avgHipY = ((leftHip?.y ?? 0) + (rightHip?.y ?? 0)) / 2;
	const avgAnkleY = ((leftAnkle?.y ?? 0) + (rightAnkle?.y ?? 0)) / 2;

	const messagesByType = {
		upper: {
			pt: "Para peças superiores, envie uma foto frontal com cabeça, ombros e tronco visíveis (até a cintura/quadril).",
			es: "Para prendas superiores, envía una foto frontal con cabeza, hombros y torso visibles (hasta cintura/cadera).",
			en: "For upper garments, upload a front-facing photo with head, shoulders, and torso visible (down to waist/hips).",
		},
		lower: {
			pt: "Para peças inferiores, envie uma foto frontal mostrando quadril, joelhos e pernas completas até os tornozelos/pés.",
			es: "Para prendas inferiores, envía una foto frontal mostrando cadera, rodillas y piernas completas hasta tobillos/pies.",
			en: "For lower garments, upload a front-facing photo showing hips, knees, and full legs down to ankles/feet.",
		},
		full: {
			pt: "Para peças de corpo inteiro, envie uma foto frontal de corpo inteiro (da cabeça aos pés).",
			es: "Para prendas de cuerpo completo, envía una foto frontal de cuerpo entero (de la cabeza a los pies).",
			en: "For full-body garments, upload a full front-facing body photo (head to feet).",
		},
		footwear: {
			pt: "Para calçados, envie uma foto com pernas e pés bem visíveis.",
			es: "Para calzado, envía una foto con piernas y pies bien visibles.",
			en: "For footwear, upload a photo with legs and feet clearly visible.",
		},
	};

	if (collectionType === "upper") {
		const requiredPointsVisible =
			hasPoint(0, 0.2) &&
			hasPoint(11, 0.2) &&
			hasPoint(12, 0.2) &&
			hasPoint(23, 0.2) &&
			hasPoint(24, 0.2);
		const torsoSpan = avgHipY - avgShoulderY;
		const torsoLooksValid = torsoSpan > 0.05 && avgShoulderY < avgHipY + 0.1;

		if (!requiredPointsVisible || !torsoLooksValid) {
			return { valid: false, message: messagesByType.upper[language] };
		}
	} else if (collectionType === "lower" || collectionType === "footwear") {
		const requiredPointsVisible =
			hasPoint(23, 0.2) &&
			hasPoint(24, 0.2) &&
			hasPoint(25, 0.2) &&
			hasPoint(26, 0.2) &&
			hasPoint(27, 0.2) &&
			hasPoint(28, 0.2);
		const legSpan = avgAnkleY - avgHipY;
		const legLooksValid = legSpan > 0.1 && avgHipY < avgAnkleY + 0.15;

		if (!requiredPointsVisible || !legLooksValid) {
			return { valid: false, message: messagesByType[collectionType][language] };
		}
	} else {
		const requiredPointsVisible =
			hasPoint(0, 0.2) &&
			hasPoint(11, 0.2) &&
			hasPoint(12, 0.2) &&
			hasPoint(23, 0.2) &&
			hasPoint(24, 0.2) &&
			hasPoint(27, 0.2) &&
			hasPoint(28, 0.2);
		const fullSpan = avgAnkleY - (nose?.y ?? 0);
		const fullBodyLooksValid = fullSpan > 0.3 && (nose?.y ?? 1) < avgAnkleY + 0.2;

		if (!requiredPointsVisible || !fullBodyLooksValid) {
			return { valid: false, message: messagesByType.full[language] };
		}
	}

	return { valid: true };
}
