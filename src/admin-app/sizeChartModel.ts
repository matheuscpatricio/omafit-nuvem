import type { OmafitSizeChart, OmafitSizeRow } from "../shared/models";

export const DEFAULT_REFS = ["peito", "cintura", "quadril"];
export const FOOTWEAR_REFS = ["tamanho_pe"];
export const DEFAULT_COLLECTION_TYPE: OmafitSizeChart["collection_type"] = "upper";
export const FOOTWEAR_COLLECTION_TYPE = "footwear" as const;
export const DEFAULT_COLLECTION_ELASTICITY = "structured";
const ALL_COLLECTION_TYPES: OmafitSizeChart["collection_type"][] = [
	"upper",
	"lower",
	"full",
	FOOTWEAR_COLLECTION_TYPE,
];

export type GenderKey = "male" | "female" | "unisex";
export type ScopeKey = "collection" | "product";

export type GenderChartState = {
	enabled: boolean;
	measurementRefs: string[];
	sizes: OmafitSizeRow[];
};

export type HandleChartsState = {
	collectionType: OmafitSizeChart["collection_type"];
	collectionElasticity: OmafitSizeChart["collection_elasticity"];
	genderScope: NonNullable<OmafitSizeChart["gender_scope"]>;
	male: GenderChartState;
	female: GenderChartState;
	unisex: GenderChartState;
};

export type ScopedChartsState = {
	collection: Record<string, HandleChartsState>;
	product: Record<string, HandleChartsState>;
};

export function isFootwearCollectionType(type: string) {
	return type === FOOTWEAR_COLLECTION_TYPE;
}

export function getMeasurementRefsForCollectionType(type: string) {
	return isFootwearCollectionType(type) ? FOOTWEAR_REFS.slice() : DEFAULT_REFS.slice();
}

export function getExpectedMeasurementCount(type: string) {
	return isFootwearCollectionType(type) ? 1 : 3;
}

export function normalizeMeasurementRefsForType(refs: string[] | undefined, type: string) {
	const expectedCount = getExpectedMeasurementCount(type);
	if (Array.isArray(refs) && refs.length === expectedCount) {
		return refs.slice();
	}
	return getMeasurementRefsForCollectionType(type);
}

export function getDefaultSizesForRefs(refs: string[]) {
	return refs.reduce<OmafitSizeRow>((acc, key) => ({ ...acc, [key]: "" }), { size: "" });
}

export function createEmptyCollectionCharts(): HandleChartsState {
	const refs = getMeasurementRefsForCollectionType(DEFAULT_COLLECTION_TYPE);
	const emptyGender = (): GenderChartState => ({
		enabled: false,
		measurementRefs: refs.slice(),
		sizes: [],
	});
	return {
		collectionType: DEFAULT_COLLECTION_TYPE,
		collectionElasticity: DEFAULT_COLLECTION_ELASTICITY,
		genderScope: "both",
		male: emptyGender(),
		female: emptyGender(),
		unisex: emptyGender(),
	};
}

export function normalizeGenderScope(value: unknown): HandleChartsState["genderScope"] {
	const raw = String(value || "").trim().toLowerCase();
	if (raw === "male" || raw === "female") return raw;
	return "both";
}

export function chartsFromApiRows(rows: OmafitSizeChart[]): ScopedChartsState {
	const byScope: ScopedChartsState = { collection: {}, product: {} };
	for (const row of rows) {
		const productHandle = String(row.product_handle || "").trim();
		const handle = productHandle || (row.collection_handle ?? "");
		const scope: ScopeKey = productHandle ? "product" : "collection";
		if (!byScope[scope][handle]) {
			byScope[scope][handle] = createEmptyCollectionCharts();
		}
		const bucket = byScope[scope][handle];
		if (row.collection_type && ALL_COLLECTION_TYPES.includes(row.collection_type)) {
			bucket.collectionType = row.collection_type;
		}
		if (
			row.collection_elasticity &&
			["structured", "light_flex", "flexible", "high_elasticity"].includes(row.collection_elasticity)
		) {
			bucket.collectionElasticity = row.collection_elasticity;
		}
		if (row.gender_scope !== undefined && row.gender_scope !== null) {
			bucket.genderScope = normalizeGenderScope(row.gender_scope);
		}
		const refs = normalizeMeasurementRefsForType(row.measurement_refs, row.collection_type);
		bucket[row.gender] = {
			enabled: true,
			measurementRefs: refs,
			sizes: Array.isArray(row.sizes) ? row.sizes : [],
		};
	}
	return byScope;
}

export function chartsToApiRows(charts: ScopedChartsState): OmafitSizeChart[] {
	const toSave: OmafitSizeChart[] = [];
	for (const scope of ["collection", "product"] as ScopeKey[]) {
		for (const [handle, byGender] of Object.entries(charts[scope] || {})) {
			if (scope === "product" && !handle) continue;
			const collectionType = byGender.collectionType || DEFAULT_COLLECTION_TYPE;
			const genderScope = normalizeGenderScope(byGender.genderScope);
			const expectedMeasurementCount = getExpectedMeasurementCount(collectionType);
			const collectionElasticity = isFootwearCollectionType(collectionType)
				? ""
				: byGender.collectionElasticity || DEFAULT_COLLECTION_ELASTICITY;
			for (const gender of ["male", "female", "unisex"] as GenderKey[]) {
				const chart = byGender[gender];
				if (
					chart.enabled &&
					chart.sizes.length > 0 &&
					chart.measurementRefs.length === expectedMeasurementCount
				) {
					toSave.push({
						collection_handle: scope === "product" ? "" : handle,
						product_handle: scope === "product" ? handle : "",
						gender,
						gender_scope: genderScope,
						collection_type: collectionType,
						collection_elasticity: collectionElasticity,
						measurement_refs: chart.measurementRefs,
						sizes: chart.sizes,
					});
				}
			}
		}
	}
	return toSave;
}
