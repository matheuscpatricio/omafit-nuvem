/**
 * Paridade com `calculateRecommendedSize` em `omafit-widget/src/components/TryOnWidget.tsx`
 * (lógica extraída como função pura — sem setState).
 */

import type { CollectionType } from "./tryonParity";

export type TryOnChartRow = {
	size: string;
	peito?: string;
	chest?: string;
	busto?: string;
	cintura?: string;
	waist?: string;
	quadril?: string;
	hip?: string;
	comprimento?: string;
	length?: string;
	ombro?: string;
	shoulder?: string;
};

export type TryOnMeasurementsInput = {
	height: number;
	weight: number;
	bodyTypeIndex: number;
	fitIndex: number;
	gender: string;
	chest?: number;
	waist?: number;
	hip?: number;
	shoulder?: number;
	legLength?: number;
};

export type TryOnRecommendedSizeResult = {
	size: string;
	measurements: {
		chest: number;
		waist: number;
		hip: number;
		shoulder: number;
	};
	matchScore: number;
	finalConfidence: number;
	confidenceLevel: "high" | "medium" | "low";
};

type ApiChartLike = {
	collection_type: CollectionType;
	collection_elasticity: "structured" | "light_flex" | "flexible" | "high_elasticity" | "";
	measurement_refs: string[];
	sizes: Array<{ size: string; [key: string]: string }>;
};

function mapElasticityForTryOn(
	value: ApiChartLike["collection_elasticity"] | undefined,
): "structured" | "light" | "flexible" | "high" {
	if (value === "structured") return "structured";
	if (value === "flexible") return "flexible";
	if (value === "high_elasticity") return "high";
	return "light";
}

/** Converte linhas da API Nuvemshop para o formato esperado pelo parser do TryOnWidget. */
export function mapApiChartToTryOnRows(chart: ApiChartLike): TryOnChartRow[] {
	return chart.sizes.map((row) => {
		const entry: TryOnChartRow = { size: String(row.size || "") };
		const refs = chart.measurement_refs || [];

		const assignByRef = (ref: string, raw: string) => {
			const key = ref.trim().toLowerCase();
			if (key === "peito" || key === "busto" || key === "chest") {
				entry.peito = raw;
				entry.chest = raw;
				entry.busto = raw;
			} else if (key === "cintura" || key === "waist") {
				entry.cintura = raw;
				entry.waist = raw;
			} else if (key === "quadril" || key === "hip" || key === "hips") {
				entry.quadril = raw;
				entry.hip = raw;
			} else if (key === "ombro" || key === "shoulder") {
				entry.ombro = raw;
				entry.shoulder = raw;
			} else if (key === "comprimento" || key === "length") {
				entry.comprimento = raw;
				entry.length = raw;
			}
		};

		for (let i = 0; i < refs.length; i += 1) {
			const ref = refs[i];
			const direct = row[ref];
			const indexed = row[`medida${i + 1}`] ?? row[`medida_${i + 1}`];
			const raw = direct !== undefined && direct !== "" ? String(direct) : String(indexed ?? "");
			if (raw.trim() !== "") assignByRef(ref, raw);
		}

		for (const key of Object.keys(row)) {
			if (key === "size") continue;
			const lower = key.toLowerCase();
			const val = String(row[key] ?? "");
			if (!val.trim()) continue;
			assignByRef(lower, val);
		}

		return entry;
	});
}

function parseMeasurementValue(value: unknown): number {
	if (value === null || value === undefined) return 0;
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const normalized = String(value).trim().replace(",", ".").replace(/[^0-9.-]/g, "");
	const parsed = Number.parseFloat(normalized);
	return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Mesmo critério de tamanho do TryOnWidget Shopify.
 */
export function calculateTryOnRecommendedSize(
	measurements: TryOnMeasurementsInput,
	chart: TryOnChartRow[],
	options: {
		collectionType: CollectionType;
		collectionElasticity: ApiChartLike["collection_elasticity"];
		measurementWeights: Record<string, number>;
	},
): TryOnRecommendedSizeResult | null {
	if (!chart?.length) return null;

	const {
		height,
		weight,
		bodyTypeIndex,
		fitIndex,
		gender,
		chest: realChest,
		waist: realWaist,
		hip: realHip,
		shoulder: realShoulder,
		legLength: realLegLength,
	} = measurements;

	const localCollectionType = options.collectionType || "upper";
	const measurementWeights = options.measurementWeights || {};
	const elasticityLevel = mapElasticityForTryOn(options.collectionElasticity);

	const bodyTypeProfiles = {
		mannequin1: {
			chestFactor: 1.0,
			waistFactor: 1.0,
			hipFactor: 1.0,
			shoulderFactor: 1.0,
			expectedBMI: 22,
			description: "Balanceado",
		},
		mannequin2: {
			chestFactor: 1.04,
			waistFactor: 1.0,
			hipFactor: 1.0,
			shoulderFactor: 1.03,
			expectedBMI: 23,
			description: "Busto desenvolvido",
		},
		mannequin3: {
			chestFactor: 1.05,
			waistFactor: 1.04,
			hipFactor: 1.02,
			shoulderFactor: 1.04,
			expectedBMI: 25,
			description: "Tronco superior largo",
		},
		mannequin4: {
			chestFactor: 1.06,
			waistFactor: 1.02,
			hipFactor: 1.01,
			shoulderFactor: 1.05,
			expectedBMI: 26,
			description: "Busto bem desenvolvido",
		},
		mannequin5: {
			chestFactor: 1.03,
			waistFactor: 1.07,
			hipFactor: 1.06,
			shoulderFactor: 1.02,
			expectedBMI: 29,
			description: "Corpo arredondado",
		},
	} as const;

	const bodyTypeNames = ["mannequin1", "mannequin2", "mannequin3", "mannequin4", "mannequin5"] as const;
	const safeBodyTypeIndex = Math.min(Math.max(0, bodyTypeIndex || 0), bodyTypeNames.length - 1);
	const selectedBodyType = bodyTypeProfiles[bodyTypeNames[safeBodyTypeIndex]] || bodyTypeProfiles.mannequin1;

	const heightInMeters = height / 100;
	const bmi = weight / (heightInMeters * heightInMeters);
	const bmiDifference = bmi - selectedBodyType.expectedBMI;
	let bmiAdjustment = 1.0 + bmiDifference * 0.012;
	bmiAdjustment = Math.max(0.92, Math.min(1.08, bmiAdjustment));

	let baseChestRatio: number;
	let baseWaistRatio: number;
	let baseHipRatio: number;
	if (gender === "male") {
		baseChestRatio = 0.52;
		baseWaistRatio = 0.46;
		baseHipRatio = 0.52;
	} else {
		baseChestRatio = 0.5;
		baseWaistRatio = 0.4;
		baseHipRatio = 0.55;
	}

	const hasRealMeasurements = [realChest, realWaist, realHip].every(
		(value) => typeof value === "number" && Number.isFinite(value) && value > 0,
	);

	let bodyChest: number;
	let bodyWaist: number;
	let bodyHip: number;
	let bodyShoulder: number;
	let bodyLengthReference: number;

	if (hasRealMeasurements) {
		bodyChest = realChest as number;
		bodyWaist = realWaist as number;
		bodyHip = realHip as number;
		bodyShoulder =
			typeof realShoulder === "number" && Number.isFinite(realShoulder) && realShoulder > 0
				? realShoulder
				: height * 0.25;

		const headLength = height * 0.13;
		const fallbackLegLength = gender === "female" ? height * 0.49 : height * 0.47;
		const legLength =
			typeof realLegLength === "number" && Number.isFinite(realLegLength) && realLegLength > 0
				? realLegLength
				: fallbackLegLength;
		const trunkWithoutHead = Math.max(height - legLength - headLength, height * 0.3);

		if (localCollectionType === "lower") {
			bodyLengthReference = legLength;
		} else if (localCollectionType === "upper") {
			bodyLengthReference = trunkWithoutHead;
		} else {
			bodyLengthReference = height - headLength;
		}
	} else {
		bodyChest = height * baseChestRatio * selectedBodyType.chestFactor * bmiAdjustment;
		bodyWaist = height * baseWaistRatio * selectedBodyType.waistFactor * bmiAdjustment;
		bodyHip = height * baseHipRatio * selectedBodyType.hipFactor * bmiAdjustment;
		bodyShoulder = height * 0.25 * selectedBodyType.shoulderFactor;
		const estimatedLegLength = gender === "female" ? height * 0.49 : height * 0.47;
		const estimatedHeadLength = height * 0.13;
		const estimatedTrunkWithoutHead = Math.max(
			height - estimatedLegLength - estimatedHeadLength,
			height * 0.3,
		);

		if (localCollectionType === "lower") {
			bodyLengthReference = estimatedLegLength;
		} else if (localCollectionType === "upper") {
			bodyLengthReference = estimatedTrunkWithoutHead;
		} else {
			bodyLengthReference = height - estimatedHeadLength;
		}
	}

	const hasWeights = measurementWeights && Object.keys(measurementWeights).length > 0;
	let normalizedWeights: Record<string, number> = {};
	if (hasWeights) {
		const weightSum = Object.values(measurementWeights).reduce((sum, w) => sum + w, 0);
		if (weightSum > 0) {
			for (const key of Object.keys(measurementWeights)) {
				normalizedWeights[key] = measurementWeights[key] / weightSum;
			}
		} else {
			normalizedWeights = {};
		}
	}

	const ELASTICITY_TOLERANCE: Record<string, number> = {
		structured: 1.5,
		light: 2.5,
		flexible: 4.0,
		high: 6.0,
	};

	const ELASTICITY_PROFILE: Record<string, Record<string, number>> = {
		structured: { chest: 1.5, waist: 1.5, hip: 1.5, shoulder: 1.0 },
		light: { chest: 2.5, waist: 2.0, hip: 2.5, shoulder: 1.5 },
		flexible: { chest: 4.0, waist: 3.5, hip: 4.0, shoulder: 2.5 },
		high: { chest: 6.0, waist: 5.0, hip: 6.0, shoulder: 4.0 },
	};

	const ASYMMETRIC_PENALTY: Record<string, number> = {
		structured: 1.7,
		light: 1.4,
		flexible: 1.2,
		high: 1.05,
	};

	const baseTolerance = ELASTICITY_TOLERANCE[elasticityLevel] || 2.5;
	const toleranceProfile = ELASTICITY_PROFILE[elasticityLevel] || ELASTICITY_PROFILE.light;
	const asymmetricPenalty = ASYMMETRIC_PENALTY[elasticityLevel] || 1.3;

	const fitFactors = [0.94, 1.0, 1.06];
	const safeFitIndex = Math.min(Math.max(0, fitIndex ?? 1), fitFactors.length - 1);
	const fitMultiplier = fitFactors[safeFitIndex] || 1.0;

	const sizeScores: Array<{ size: string; score: number }> = [];

	const lengthTolerance =
		typeof (toleranceProfile as Record<string, number>).length === "number"
			? (toleranceProfile as Record<string, number>).length
			: baseTolerance + 1.5;

	chart.forEach((sizeData) => {
		const chest = parseMeasurementValue(sizeData.peito || sizeData.chest || sizeData.busto);
		const waist = parseMeasurementValue(sizeData.cintura || sizeData.waist);
		const hip = parseMeasurementValue(sizeData.quadril || sizeData.hip);
		const shoulder = parseMeasurementValue(sizeData.ombro || sizeData.shoulder);
		const length = parseMeasurementValue(sizeData.comprimento || sizeData.length);

		const weightedDifferences: number[] = [];

		if (chest > 0) {
			const weight = hasWeights ? normalizedWeights.Peito || normalizedWeights.Busto || 1.0 : 1.0;
			const bodyMeasurement = bodyChest * fitMultiplier;
			const rawDiff = Math.abs(bodyMeasurement - chest);
			const tolerance = toleranceProfile.chest;
			let normalizedError = rawDiff / tolerance;
			const isGarmentTooSmall = bodyMeasurement > chest;
			if (isGarmentTooSmall) normalizedError *= asymmetricPenalty;
			weightedDifferences.push(normalizedError ** 2 * weight);
		}

		if (waist > 0) {
			const weight = hasWeights ? normalizedWeights.Cintura || 1.0 : 1.0;
			const bodyMeasurement = bodyWaist * fitMultiplier;
			const rawDiff = Math.abs(bodyMeasurement - waist);
			const tolerance = toleranceProfile.waist;
			let normalizedError = rawDiff / tolerance;
			const isGarmentTooSmall = bodyMeasurement > waist;
			if (isGarmentTooSmall) normalizedError *= asymmetricPenalty;
			weightedDifferences.push(normalizedError ** 2 * weight);
		}

		if (hip > 0) {
			const weight = hasWeights ? normalizedWeights.Quadril || 1.0 : 1.0;
			const bodyMeasurement = bodyHip * fitMultiplier;
			const rawDiff = Math.abs(bodyMeasurement - hip);
			const tolerance = toleranceProfile.hip;
			let normalizedError = rawDiff / tolerance;
			const isGarmentTooSmall = bodyMeasurement > hip;
			if (isGarmentTooSmall) normalizedError *= asymmetricPenalty;
			weightedDifferences.push(normalizedError ** 2 * weight);
		}

		if (shoulder > 0) {
			const weight = hasWeights ? normalizedWeights.Ombro || 1.0 : 1.0;
			const bodyMeasurement = bodyShoulder * fitMultiplier;
			const rawDiff = Math.abs(bodyMeasurement - shoulder);
			const tolerance = toleranceProfile.shoulder;
			let normalizedError = rawDiff / tolerance;
			const isGarmentTooSmall = bodyMeasurement > shoulder;
			if (isGarmentTooSmall) normalizedError *= asymmetricPenalty;
			weightedDifferences.push(normalizedError ** 2 * weight);
		}

		if (length > 0 && bodyLengthReference > 0) {
			const weight = hasWeights
				? normalizedWeights.Comprimento || normalizedWeights.Length || 0.9
				: 0.9;
			const bodyMeasurement = bodyLengthReference * fitMultiplier;
			const rawDiff = Math.abs(bodyMeasurement - length);
			const tolerance = lengthTolerance;
			let normalizedError = rawDiff / tolerance;
			const isGarmentTooShort = bodyMeasurement > length;
			if (isGarmentTooShort) {
				normalizedError *= Math.max(1.0, asymmetricPenalty - 0.25);
			}
			weightedDifferences.push(normalizedError ** 2 * weight);
		}

		if (weightedDifferences.length === 0) return;

		const score = Math.sqrt(weightedDifferences.reduce((sum, diff) => sum + diff, 0));
		sizeScores.push({ size: sizeData.size, score });
	});

	if (sizeScores.length === 0) return null;

	sizeScores.sort((a, b) => a.score - b.score);
	const bestMatch = sizeScores[0];
	const secondBest = sizeScores[1];

	let baseConfidence = 0;
	if (bestMatch.score < 1.0) baseConfidence = 100;
	else if (bestMatch.score < 2.0) baseConfidence = 70;
	else if (bestMatch.score < 3.0) baseConfidence = 40;
	else baseConfidence = 20;

	let dominanceBonus = 0;
	if (secondBest) {
		const scoreDiff = secondBest.score - bestMatch.score;
		const scoreFloor = Math.max(bestMatch.score, 0.5);
		const dominance = scoreDiff / scoreFloor;
		if (dominance > 0.3) dominanceBonus = 20;
		else if (dominance > 0.15) dominanceBonus = 10;
	} else {
		dominanceBonus = -20;
	}

	const ELASTICITY_CONFIDENCE_BONUS: Record<string, number> = {
		structured: -10,
		light: 0,
		flexible: 5,
		high: 10,
	};
	const elasticityBonus = ELASTICITY_CONFIDENCE_BONUS[elasticityLevel] || 0;
	const finalConfidence = Math.max(0, Math.min(100, baseConfidence + dominanceBonus + elasticityBonus));

	let confidenceLevel: "high" | "medium" | "low";
	if (finalConfidence >= 75) confidenceLevel = "high";
	else if (finalConfidence >= 50) confidenceLevel = "medium";
	else confidenceLevel = "low";

	return {
		size: bestMatch.size,
		measurements: {
			chest: bodyChest,
			waist: bodyWaist,
			hip: bodyHip,
			shoulder: bodyShoulder,
		},
		matchScore: bestMatch.score,
		finalConfidence,
		confidenceLevel,
	};
}
