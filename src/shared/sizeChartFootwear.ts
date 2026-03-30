/**
 * Identifica tabela de calçados no admin: tipo explícito ou legado (só ref `tamanho_pe`).
 * Manter alinhado com `isFootwearSizeChartRow` em `server.js`.
 */
export function isFootwearSizeChart(chart: {
	collection_type?: string;
	measurement_refs?: unknown[];
}): boolean {
	const t = String(chart?.collection_type || "")
		.toLowerCase()
		.trim();
	if (t === "footwear") return true;
	const refs = Array.isArray(chart?.measurement_refs)
		? chart.measurement_refs.map((r) => String(r || "").trim())
		: [];
	if (refs.length === 1 && refs[0] === "tamanho_pe") return true;
	return false;
}
