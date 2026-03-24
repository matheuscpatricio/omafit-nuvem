import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";

/**
 * Paridade com `omafit-widget/src/hooks/useMediaPipePose.ts` no caminho usado em produção:
 * TryOnWidget e ShoeARWidget passam `useWorker: false` (MediaPipe só no main thread).
 * Worker não é empacotado no bundle tsup deste app; `useWorker: true` cai no mesmo fluxo.
 */

export interface PoseLandmark {
	x: number;
	y: number;
	z: number;
	visibility: number;
}

export interface BodyMeasurements {
	shoulder_width: number;
	chest: number;
	waist: number;
	hip: number;
	height: number;
	armLength: number;
	legLength: number;
}

export interface UseMediaPipePoseOptions {
	enabled?: boolean;
	/** Ignorado: bundle sem worker; sempre main thread (igual `useWorker: false` no widget). */
	useWorker?: boolean;
	silentNoPose?: boolean;
}

type MainThreadLandmarker = {
	detect: (img: HTMLImageElement) => Promise<PoseLandmarkerResult>;
	close: () => void;
};

export function useMediaPipePose(options?: UseMediaPipePoseOptions) {
	const enabled = options?.enabled ?? true;
	const silentNoPose = options?.silentNoPose ?? false;
	const MIN_LANDMARK_VISIBILITY = 0.3;
	const mainThreadPoseLandmarkerRef = useRef<MainThreadLandmarker | null>(null);
	const mainThreadInitPromiseRef = useRef<Promise<void> | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const initializeMainThreadPoseLandmarker = useCallback(async () => {
		if (mainThreadPoseLandmarkerRef.current) return;
		if (mainThreadInitPromiseRef.current) {
			await mainThreadInitPromiseRef.current;
			return;
		}

		setIsLoading(true);
		const initPromise = (async () => {
			const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
			const vision = await FilesetResolver.forVisionTasks(
				"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm",
			);

			const landmarker = await PoseLandmarker.createFromOptions(vision, {
				baseOptions: {
					modelAssetPath:
						"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
					delegate: "CPU",
				},
				runningMode: "IMAGE",
				numPoses: 1,
				minPoseDetectionConfidence: 0.5,
				minPosePresenceConfidence: 0.5,
				minTrackingConfidence: 0.5,
			});
			mainThreadPoseLandmarkerRef.current = {
				detect: (img: HTMLImageElement) => landmarker.detect(img),
				close: () => landmarker.close(),
			};
		})();

		mainThreadInitPromiseRef.current = initPromise;
		try {
			await initPromise;
		} finally {
			mainThreadInitPromiseRef.current = null;
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!enabled) return;
		void initializeMainThreadPoseLandmarker();
		return () => {
			mainThreadPoseLandmarkerRef.current?.close?.();
			mainThreadPoseLandmarkerRef.current = null;
		};
	}, [enabled, initializeMainThreadPoseLandmarker]);

	const hasGoodLandmarkVisibility = useCallback((landmarks: PoseLandmark[] | undefined): boolean => {
		if (!landmarks || landmarks.length === 0) return false;

		const keyPoints = [
			landmarks[11],
			landmarks[12],
			landmarks[23],
			landmarks[24],
			landmarks[25],
			landmarks[26],
			landmarks[27],
			landmarks[28],
		].filter(Boolean);

		if (keyPoints.length === 0) return false;

		const avgVisibility =
			keyPoints.reduce((sum, point) => sum + (point.visibility ?? 0), 0) / keyPoints.length;
		return avgVisibility >= MIN_LANDMARK_VISIBILITY;
	}, []);

	const detectPose = useCallback(
		async (imageElement: HTMLImageElement): Promise<PoseLandmarkerResult | null> => {
			try {
				await initializeMainThreadPoseLandmarker();
				const result = (await mainThreadPoseLandmarkerRef.current?.detect(imageElement)) || null;
				if (!result?.landmarks?.length) {
					if (!silentNoPose) {
						console.warn("⚠️ [MainThreadFallback] Nenhuma pose detectada na imagem");
					}
					return null;
				}
				if (!hasGoodLandmarkVisibility(result.landmarks[0] as unknown as PoseLandmark[])) {
					if (!silentNoPose) {
						console.warn(
							"⚠️ [MainThreadFallback] Pose detectada com baixa visibilidade. Ignorando para evitar medida imprecisa.",
						);
					}
					return null;
				}
				return result;
			} catch (err) {
				console.error("❌ [MainThreadFallback] Falha na detecção:", err);
				setError(err instanceof Error ? err.message : "Main thread fallback failed");
				return null;
			}
		},
		[hasGoodLandmarkVisibility, initializeMainThreadPoseLandmarker, silentNoPose],
	);

	const calculateBodyMeasurements = useCallback(
		(
			landmarks: PoseLandmark[],
			imageWidth: number,
			imageHeight: number,
			userHeight?: number,
			userWeight?: number,
			userGender?: string,
		): BodyMeasurements => {
			const startTime = performance.now();

			const nose = landmarks[0];
			const leftEye = landmarks[2];
			const rightEye = landmarks[5];
			const leftEar = landmarks[7];
			const rightEar = landmarks[8];
			const leftShoulder = landmarks[11];
			const rightShoulder = landmarks[12];
			const leftHip = landmarks[23];
			const rightHip = landmarks[24];
			const leftKnee = landmarks[25];
			const rightKnee = landmarks[26];
			const leftAnkle = landmarks[27];
			const rightAnkle = landmarks[28];

			const headLandmarks = [nose, leftEye, rightEye, leftEar, rightEar];
			const headY = Math.min(...headLandmarks.map((l) => l.y));
			const footY = Math.max(leftAnkle.y, rightAnkle.y);

			const shoulderAngle =
				(Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x) * 180) /
				Math.PI;
			const hipAngle =
				(Math.atan2(rightHip.y - leftHip.y, rightHip.x - leftHip.x) * 180) / Math.PI;
			const avgTilt = (Math.abs(shoulderAngle) + Math.abs(hipAngle)) / 2;

			let tiltPenalty = 1.0;
			if (avgTilt > 15) {
				tiltPenalty = 0.6;
				console.warn("   ⚠️ Inclinação excessiva detectada (>15°)");
			} else if (avgTilt > 10) {
				tiltPenalty = 0.8;
				console.warn("   ⚠️ Inclinação moderada detectada (>10°)");
			}

			const shoulderSymmetry = Math.abs(leftShoulder.y - rightShoulder.y);
			const hipSymmetry = Math.abs(leftHip.y - rightHip.y);
			let symmetryPenalty = 1.0;
			if (shoulderSymmetry > 0.05 || hipSymmetry > 0.05) {
				symmetryPenalty = 0.7;
				console.warn("   ⚠️ Assimetria corporal detectada");
			} else if (shoulderSymmetry > 0.03 || hipSymmetry > 0.03) {
				symmetryPenalty = 0.85;
			}

			const shoulderHipAlignment = Math.abs(
				(leftShoulder.x + rightShoulder.x) / 2 - (leftHip.x + rightHip.x) / 2,
			);
			const hipKneeAlignment = Math.abs(
				(leftHip.x + rightHip.x) / 2 - (leftKnee.x + rightKnee.x) / 2,
			);
			let posturePenalty = 1.0;
			if (shoulderHipAlignment > 0.08 || hipKneeAlignment > 0.08) {
				posturePenalty = 0.7;
				console.warn("   ⚠️ Postura desalinhada detectada");
			} else if (shoulderHipAlignment > 0.05 || hipKneeAlignment > 0.05) {
				posturePenalty = 0.85;
			}

			const distance = (p1: PoseLandmark, p2: PoseLandmark): number => {
				const dx = (p2.x - p1.x) * imageWidth;
				const dy = (p2.y - p1.y) * imageHeight;
				return Math.sqrt(dx * dx + dy * dy);
			};

			const bodyHeightPx = Math.abs(footY - headY) * imageHeight;
			const referenceHeightCm = userHeight || 170;
			const pixelToCmRatio = referenceHeightCm / bodyHeightPx;
			const pixelToCm = (pixels: number): number => pixels * pixelToCmRatio;

			const shoulderWidthPx = distance(leftShoulder, rightShoulder);
			const hipWidthPx = distance(leftHip, rightHip);
			const shoulderWidthCm = pixelToCm(shoulderWidthPx);
			const hipWidthCm = pixelToCm(hipWidthPx);

			const shoulderToHeightRatio = shoulderWidthCm / referenceHeightCm;
			let perspectivePenalty = 1.0;
			if (shoulderToHeightRatio > 0.35 || shoulderToHeightRatio < 0.2) {
				perspectivePenalty = 0.6;
				console.warn(
					"   ⚠️ Distorção de perspectiva detectada (ratio:",
					shoulderToHeightRatio.toFixed(2),
					")",
				);
			} else if (shoulderToHeightRatio > 0.32 || shoulderToHeightRatio < 0.22) {
				perspectivePenalty = 0.8;
			}

			const isPlausible =
				shoulderWidthCm >= 30 && shoulderWidthCm <= 70 && hipWidthCm >= 25 && hipWidthCm <= 60;
			if (!isPlausible) {
				console.error("   ❌ MEDIDAS FORA DA FAIXA HUMANA PLAUSÍVEL");
				console.error("   • Ombros:", shoulderWidthCm, "cm (esperado: 30-70cm)");
				console.error("   • Quadril:", hipWidthCm, "cm (esperado: 25-60cm)");
			}

			const heightM = referenceHeightCm / 100;
			const weightKg = userWeight || 70;
			const bmi = weightKg / (heightM * heightM);
			const gender = userGender || "male";
			const bmiAdjustmentFactor = bmi - (gender === "male" ? 22 : 21);

			let chestCircumference: number;
			let waistCircumference: number;
			let hipCircumference: number;

			if (gender === "male") {
				chestCircumference = referenceHeightCm * 0.53 + bmiAdjustmentFactor * 2.0;
				waistCircumference = referenceHeightCm * 0.46 + bmiAdjustmentFactor * 2.2;
				hipCircumference = referenceHeightCm * 0.54 + bmiAdjustmentFactor * 1.8;
			} else {
				chestCircumference = referenceHeightCm * 0.52 + bmiAdjustmentFactor * 1.8;
				waistCircumference = referenceHeightCm * 0.42 + bmiAdjustmentFactor * 1.5;
				hipCircumference = referenceHeightCm * 0.56 + bmiAdjustmentFactor * 2.0;
			}

			type MeasurementRange = { expected: number; min: number; max: number };

			const bmiAdjustmentFactorValidation = bmi - (gender === "male" ? 22 : 21);

			let chestRange: MeasurementRange;
			let waistRange: MeasurementRange;
			let hipRange: MeasurementRange;

			if (gender === "male") {
				const baseChest = referenceHeightCm * 0.53 + bmiAdjustmentFactorValidation * 2.0;
				const baseWaist = referenceHeightCm * 0.46 + bmiAdjustmentFactorValidation * 2.2;
				const baseHip = referenceHeightCm * 0.54 + bmiAdjustmentFactorValidation * 1.8;
				chestRange = { expected: baseChest, min: baseChest - 10, max: baseChest + 10 };
				waistRange = { expected: baseWaist, min: baseWaist - 8, max: baseWaist + 12 };
				hipRange = { expected: baseHip, min: baseHip - 10, max: baseHip + 10 };
			} else {
				const baseChest = referenceHeightCm * 0.52 + bmiAdjustmentFactorValidation * 1.8;
				const baseWaist = referenceHeightCm * 0.42 + bmiAdjustmentFactorValidation * 1.5;
				const baseHip = referenceHeightCm * 0.56 + bmiAdjustmentFactorValidation * 2.0;
				chestRange = { expected: baseChest, min: baseChest - 10, max: baseChest + 10 };
				waistRange = { expected: baseWaist, min: baseWaist - 8, max: baseWaist + 12 };
				hipRange = { expected: baseHip, min: baseHip - 10, max: baseHip + 10 };
			}

			const clampToRange = (measured: number, range: MeasurementRange, label: string): number => {
				if (measured < range.min) {
					console.warn(`   ⚠️ ${label} ABAIXO do mínimo:`, measured.toFixed(1), "cm");
					return range.expected;
				}
				if (measured > range.max) {
					console.warn(`   ⚠️ ${label} ACIMA do máximo:`, measured.toFixed(1), "cm");
					return range.expected;
				}
				return measured;
			};

			chestCircumference = clampToRange(chestCircumference, chestRange, "Peito");
			waistCircumference = clampToRange(waistCircumference, waistRange, "Cintura");
			hipCircumference = clampToRange(hipCircumference, hipRange, "Quadril");

			if (hipCircumference < waistCircumference) {
				hipCircumference = waistCircumference + 5;
			}

			if (gender === "female" && hipCircumference < waistCircumference * 1.08) {
				const minHip = waistCircumference * 1.08;
				hipCircumference = minHip;
			}

			const chestHipRatio = chestCircumference / hipCircumference;
			if (chestHipRatio > 1.25 && bmi < 30) {
				chestCircumference = hipCircumference * 1.1;
			}

			if (waistCircumference > chestCircumference && bmi < 32) {
				waistCircumference = chestCircumference * 0.88;
			}

			let armRatio = 0.38;
			let legRatio = 0.47;
			if (gender === "female") {
				legRatio = 0.49;
				armRatio = 0.37;
			}
			if (bmi > 27) {
				armRatio *= 0.95;
				legRatio *= 0.95;
			} else if (bmi < 20) {
				armRatio *= 1.02;
				legRatio *= 1.02;
			}

			const armLength = Math.round(referenceHeightCm * armRatio);
			const legLength = Math.round(referenceHeightCm * legRatio);

			const anthropometricMethodConfidence = 0.65;
			const globalConfidence = Math.min(
				tiltPenalty,
				symmetryPenalty,
				posturePenalty,
				perspectivePenalty,
				isPlausible ? 1.0 : 0.3,
				anthropometricMethodConfidence,
			);

			const measurements = {
				shoulder_width: Math.round(shoulderWidthCm),
				chest: Math.round(chestCircumference),
				waist: Math.round(waistCircumference),
				hip: Math.round(hipCircumference),
				height: Math.round(referenceHeightCm),
				armLength,
				legLength,
			};

			console.log("✅ Medidas calculadas (PREMIUM):");
			console.log("   • Confiança global:", (globalConfidence * 100).toFixed(0), "%");
			console.log(`⏱️ Tempo de cálculo: ${(performance.now() - startTime).toFixed(2)}ms`);

			return measurements;
		},
		[],
	);

	return {
		isLoading,
		error,
		detectPose,
		calculateBodyMeasurements,
	};
}
