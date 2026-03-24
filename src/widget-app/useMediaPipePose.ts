import { useCallback, useEffect, useRef, useState } from "react";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";

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
	confidence: number;
	source: "frontend_mediapipe";
}

export interface UseMediaPipePoseOptions {
	enabled?: boolean;
	silentNoPose?: boolean;
	/**
	 * Fotos de pé/perna (ângulo de cima): o modelo costuma não ver ombros — valida só quadril/joelho/tornozelo
	 * e usa limiares de detecção mais baixos, como no fluxo dedicado a calçados.
	 */
	footPhotoMode?: boolean;
}

type MainThreadLandmarker = {
	detect: (img: HTMLImageElement) => Promise<PoseLandmarkerResult>;
	close: () => void;
};

export function useMediaPipePose(options?: UseMediaPipePoseOptions) {
	const enabled = options?.enabled ?? true;
	const silentNoPose = options?.silentNoPose ?? false;
	const footPhotoMode = options?.footPhotoMode ?? false;
	const MIN_LANDMARK_VISIBILITY = 0.3;
	const FOOT_MIN_LANDMARK_VISIBILITY = 0.18;
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

			const confidence = footPhotoMode ? 0.28 : 0.5;
			const landmarker = await PoseLandmarker.createFromOptions(vision, {
				baseOptions: {
					modelAssetPath:
						"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
					delegate: "CPU",
				},
				runningMode: "IMAGE",
				numPoses: 1,
				minPoseDetectionConfidence: confidence,
				minPosePresenceConfidence: confidence,
				minTrackingConfidence: confidence,
			});

			mainThreadPoseLandmarkerRef.current = {
				detect: async (img: HTMLImageElement) => landmarker.detect(img),
				close: () => landmarker.close(),
			};
		})();

		mainThreadInitPromiseRef.current = initPromise;
		try {
			await initPromise;
			setError(null);
		} finally {
			mainThreadInitPromiseRef.current = null;
			setIsLoading(false);
		}
	}, [footPhotoMode]);

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

	const hasGoodFootPhotoLandmarkVisibility = useCallback((landmarks: PoseLandmark[] | undefined): boolean => {
		if (!landmarks || landmarks.length < 29) return false;
		const hipL = landmarks[23];
		const hipR = landmarks[24];
		const kneeL = landmarks[25];
		const kneeR = landmarks[26];
		const ankleL = landmarks[27];
		const ankleR = landmarks[28];
		const ankles = [ankleL, ankleR].filter(Boolean);
		const knees = [kneeL, kneeR].filter(Boolean);
		const anyAnkle = ankles.some((point) => (point.visibility ?? 0) >= FOOT_MIN_LANDMARK_VISIBILITY);
		const anyKnee = knees.some((point) => (point.visibility ?? 0) >= FOOT_MIN_LANDMARK_VISIBILITY);
		if (anyAnkle || anyKnee) return true;
		const lower = [hipL, hipR, kneeL, kneeR, ankleL, ankleR].filter(Boolean);
		if (lower.length < 2) return false;
		const avgVisibility =
			lower.reduce((sum, point) => sum + (point.visibility ?? 0), 0) / lower.length;
		return avgVisibility >= 0.14;
	}, []);

	const detectPose = useCallback(
		async (imageElement: HTMLImageElement): Promise<PoseLandmarkerResult | null> => {
			try {
				await initializeMainThreadPoseLandmarker();
				const result = (await mainThreadPoseLandmarkerRef.current?.detect(imageElement)) || null;

				if (!result?.landmarks?.length) {
					if (!silentNoPose) {
						console.warn("MediaPipe não detectou pose na imagem.");
					}
					return null;
				}

				const poseLandmarks = result.landmarks[0] as unknown as PoseLandmark[];
				const fullBodyOk = hasGoodLandmarkVisibility(poseLandmarks);
				const footPhotoOk = footPhotoMode && hasGoodFootPhotoLandmarkVisibility(poseLandmarks);

				if (!fullBodyOk && !footPhotoOk) {
					if (!silentNoPose) {
						console.warn(
							footPhotoMode
								? "MediaPipe: pose insuficiente para foto de pé (tornozelos/joelhos pouco visíveis)."
								: "MediaPipe detectou pose com baixa visibilidade; ignorando medições.",
						);
					}
					return null;
				}

				return result;
			} catch (caughtError) {
				console.error("Erro ao detectar pose com MediaPipe:", caughtError);
				setError(caughtError instanceof Error ? caughtError.message : "MediaPipe detection failed");
				return null;
			}
		},
		[
			footPhotoMode,
			hasGoodFootPhotoLandmarkVisibility,
			hasGoodLandmarkVisibility,
			initializeMainThreadPoseLandmarker,
			silentNoPose,
		],
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
			const nose = landmarks[0];
			const leftEye = landmarks[2];
			const rightEye = landmarks[5];
			const leftEar = landmarks[7];
			const rightEar = landmarks[8];
			const leftShoulder = landmarks[11];
			const rightShoulder = landmarks[12];
			const leftElbow = landmarks[13];
			const rightElbow = landmarks[14];
			const leftWrist = landmarks[15];
			const rightWrist = landmarks[16];
			const leftHip = landmarks[23];
			const rightHip = landmarks[24];
			const leftKnee = landmarks[25];
			const rightKnee = landmarks[26];
			const leftAnkle = landmarks[27];
			const rightAnkle = landmarks[28];

			const headLandmarks = [nose, leftEye, rightEye, leftEar, rightEar];
			const headY = Math.min(...headLandmarks.map((landmark) => landmark.y));
			const footY = Math.max(leftAnkle.y, rightAnkle.y);

			const shoulderAngle =
				(Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x) *
					180) /
				Math.PI;
			const hipAngle =
				(Math.atan2(rightHip.y - leftHip.y, rightHip.x - leftHip.x) * 180) / Math.PI;
			const avgTilt = (Math.abs(shoulderAngle) + Math.abs(hipAngle)) / 2;

			let tiltPenalty = 1;
			if (avgTilt > 15) tiltPenalty = 0.6;
			else if (avgTilt > 10) tiltPenalty = 0.8;

			const shoulderSymmetry = Math.abs(leftShoulder.y - rightShoulder.y);
			const hipSymmetry = Math.abs(leftHip.y - rightHip.y);

			let symmetryPenalty = 1;
			if (shoulderSymmetry > 0.05 || hipSymmetry > 0.05) symmetryPenalty = 0.7;
			else if (shoulderSymmetry > 0.03 || hipSymmetry > 0.03) symmetryPenalty = 0.85;

			const shoulderHipAlignment = Math.abs(
				(leftShoulder.x + rightShoulder.x) / 2 - (leftHip.x + rightHip.x) / 2,
			);
			const hipKneeAlignment = Math.abs(
				(leftHip.x + rightHip.x) / 2 - (leftKnee.x + rightKnee.x) / 2,
			);

			let posturePenalty = 1;
			if (shoulderHipAlignment > 0.08 || hipKneeAlignment > 0.08) posturePenalty = 0.7;
			else if (shoulderHipAlignment > 0.05 || hipKneeAlignment > 0.05) posturePenalty = 0.85;

			const distance = (pointA: PoseLandmark, pointB: PoseLandmark) => {
				const dx = (pointB.x - pointA.x) * imageWidth;
				const dy = (pointB.y - pointA.y) * imageHeight;
				return Math.sqrt(dx * dx + dy * dy);
			};

			const bodyHeightPx = Math.abs(footY - headY) * imageHeight;
			const referenceHeightCm = userHeight || 170;
			const pixelToCmRatio = referenceHeightCm / bodyHeightPx;
			const pixelToCm = (pixels: number) => pixels * pixelToCmRatio;

			const shoulderWidthPx = distance(leftShoulder, rightShoulder);
			const hipWidthPx = distance(leftHip, rightHip);
			const shoulderWidthCm = pixelToCm(shoulderWidthPx);
			const hipWidthCm = pixelToCm(hipWidthPx);

			const shoulderToHeightRatio = shoulderWidthCm / referenceHeightCm;
			let perspectivePenalty = 1;
			if (shoulderToHeightRatio > 0.35 || shoulderToHeightRatio < 0.2) perspectivePenalty = 0.6;
			else if (shoulderToHeightRatio > 0.32 || shoulderToHeightRatio < 0.22) {
				perspectivePenalty = 0.8;
			}

			const isPlausible =
				shoulderWidthCm >= 30 &&
				shoulderWidthCm <= 70 &&
				hipWidthCm >= 25 &&
				hipWidthCm <= 60;

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

			type MeasurementRange = {
				expected: number;
				min: number;
				max: number;
			};

			let chestRange: MeasurementRange;
			let waistRange: MeasurementRange;
			let hipRange: MeasurementRange;

			if (gender === "male") {
				const baseChest = referenceHeightCm * 0.53 + bmiAdjustmentFactor * 2.0;
				const baseWaist = referenceHeightCm * 0.46 + bmiAdjustmentFactor * 2.2;
				const baseHip = referenceHeightCm * 0.54 + bmiAdjustmentFactor * 1.8;
				chestRange = { expected: baseChest, min: baseChest - 10, max: baseChest + 10 };
				waistRange = { expected: baseWaist, min: baseWaist - 8, max: baseWaist + 12 };
				hipRange = { expected: baseHip, min: baseHip - 10, max: baseHip + 10 };
			} else {
				const baseChest = referenceHeightCm * 0.52 + bmiAdjustmentFactor * 1.8;
				const baseWaist = referenceHeightCm * 0.42 + bmiAdjustmentFactor * 1.5;
				const baseHip = referenceHeightCm * 0.56 + bmiAdjustmentFactor * 2.0;
				chestRange = { expected: baseChest, min: baseChest - 10, max: baseChest + 10 };
				waistRange = { expected: baseWaist, min: baseWaist - 8, max: baseWaist + 12 };
				hipRange = { expected: baseHip, min: baseHip - 10, max: baseHip + 10 };
			}

			const clampToRange = (measured: number, range: MeasurementRange) => {
				if (measured < range.min || measured > range.max) return range.expected;
				return measured;
			};

			chestCircumference = clampToRange(chestCircumference, chestRange);
			waistCircumference = clampToRange(waistCircumference, waistRange);
			hipCircumference = clampToRange(hipCircumference, hipRange);

			if (hipCircumference < waistCircumference) {
				hipCircumference = waistCircumference + 5;
			}

			if (gender === "female" && hipCircumference < waistCircumference * 1.08) {
				hipCircumference = waistCircumference * 1.08;
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

			const _armLengthPx =
				(distance(leftShoulder, leftElbow) +
					distance(leftElbow, leftWrist) +
					distance(rightShoulder, rightElbow) +
					distance(rightElbow, rightWrist)) /
				2;
			const _legLengthPx =
				(distance(leftHip, leftKnee) +
					distance(leftKnee, leftAnkle) +
					distance(rightHip, rightKnee) +
					distance(rightKnee, rightAnkle)) /
				2;

			const armLength = Math.round(referenceHeightCm * armRatio);
			const legLength = Math.round(referenceHeightCm * legRatio);

			const anthropometricMethodConfidence = 0.65;
			const globalConfidence = Math.min(
				tiltPenalty,
				symmetryPenalty,
				posturePenalty,
				perspectivePenalty,
				isPlausible ? 1 : 0.3,
				anthropometricMethodConfidence,
			);

			return {
				shoulder_width: Math.round(shoulderWidthCm),
				chest: Math.round(chestCircumference),
				waist: Math.round(waistCircumference),
				hip: Math.round(hipCircumference),
				height: Math.round(referenceHeightCm),
				armLength,
				legLength,
				confidence: Number(globalConfidence.toFixed(2)),
				source: "frontend_mediapipe",
			};
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
