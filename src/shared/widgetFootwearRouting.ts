/** Mesmo critério de `normalizeChartHandle` em `WidgetPage.tsx` (match com tabelas no admin). */
export function normalizeChartHandle(value: string): string {
	return String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{M}/gu, "");
}

/**
 * Mostra `widget-footwear.html` somente quando o slug da coleção atual bate com uma
 * tabela `collection_type === "footwear"` cadastrada no admin.
 */
export function shouldUseFootwearWidget(
	collectionHandle: string,
	productHandle: string,
	footwearHandlesNormalized: string[],
): boolean {
	void productHandle;
	if (!footwearHandlesNormalized.length) return false;
	const nc = normalizeChartHandle(collectionHandle);
	if (nc && footwearHandlesNormalized.includes(nc)) return true;
	return false;
}
