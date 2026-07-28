export type CatalogSizingInput = {
	sizes?: string[];
	variants?: unknown[];
};

function normalizeSizeToken(value: unknown): string {
	return String(value ?? "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\s+/g, "")
		.trim();
}

function normalizeSizeList(sizes?: string[]): string[] {
	return (sizes || []).map((value) => String(value || "").trim()).filter(Boolean);
}

/** Produto com grade de tamanho nomeada (mais de um tamanho no catálogo). */
export function catalogHasNamedSizeGrade(catalog: CatalogSizingInput): boolean {
	return normalizeSizeList(catalog.sizes).length > 1;
}

/** Ajusta tamanho algorítmico ao catálogo real; null se produto sem grade de tamanho. */
export function resolveAlgorithmSizeForCatalog(
	algorithmSize: string | null | undefined,
	catalog: CatalogSizingInput,
): string | null {
	if (!catalogHasNamedSizeGrade(catalog)) return null;
	const size = String(algorithmSize || "").trim();
	if (!size) return null;
	const sizes = normalizeSizeList(catalog.sizes);
	const token = normalizeSizeToken(size);
	const exact = sizes.find((label) => normalizeSizeToken(label) === token);
	if (exact) return exact;
	const partial = sizes.find(
		(label) =>
			normalizeSizeToken(label).includes(token) || token.includes(normalizeSizeToken(label)),
	);
	return partial || null;
}

export function sizeExistsInCatalog(
	sizeLabel: string | null | undefined,
	catalog: CatalogSizingInput,
): boolean {
	const token = normalizeSizeToken(sizeLabel);
	if (!token) return false;
	return normalizeSizeList(catalog.sizes).some((label) => normalizeSizeToken(label) === token);
}

type GuardLanguage = "pt" | "es" | "en";

const SINGLE_SIZE_MESSAGES: Record<GuardLanguage, string> = {
	pt: "Este produto é vendido em tamanho único, sem grade de tamanhos (por exemplo P, M ou G). Não há variação de tamanho para consultar na loja.",
	es: "Este producto se vende en talla única, sin tabla de tallas (por ejemplo S, M o L). No hay variación de talla en la tienda.",
	en: "This product is sold in one size only, with no size range (such as S, M, or L). There is no size variation to check in the store.",
};

const SIZE_NOT_AVAILABLE_MESSAGES: Record<GuardLanguage, (size: string, available: string) => string> = {
	pt: (size, available) =>
		`O tamanho ${size} não está disponível neste produto. Os tamanhos disponíveis na loja são: ${available}.`,
	es: (size, available) =>
		`La talla ${size} no está disponible en este producto. Las tallas disponibles en la tienda son: ${available}.`,
	en: (size, available) =>
		`Size ${size} is not available for this product. Available sizes in the store are: ${available}.`,
};

export function guardAssistantSizeClaims(params: {
	tamanhoFinal: string;
	explicacao: string;
	catalog: CatalogSizingInput;
	language: GuardLanguage;
}): { tamanhoFinal: string; explicacao: string } {
	const { catalog, language } = params;
	let tamanhoFinal = String(params.tamanhoFinal || "").trim();
	let explicacao = String(params.explicacao || "").trim();

	if (!catalogHasNamedSizeGrade(catalog)) {
		return {
			tamanhoFinal: "",
			explicacao: SINGLE_SIZE_MESSAGES[language] || SINGLE_SIZE_MESSAGES.en,
		};
	}

	const sizes = normalizeSizeList(catalog.sizes);
	if (tamanhoFinal && !sizeExistsInCatalog(tamanhoFinal, catalog)) {
		const available = sizes.join(", ");
		const correction = SIZE_NOT_AVAILABLE_MESSAGES[language] || SIZE_NOT_AVAILABLE_MESSAGES.en;
		explicacao = correction(tamanhoFinal, available);
		tamanhoFinal = "";
	}

	return { tamanhoFinal, explicacao };
}
