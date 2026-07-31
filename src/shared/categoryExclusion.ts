function normalizeCategoryToken(value: unknown): string {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

export function isCategoryExcluded(
	categoryTokens: string[],
	excludedCollections: string[] | undefined | null,
): boolean {
	if (!Array.isArray(excludedCollections) || excludedCollections.length === 0) return false;
	const normalizedProductTokens = (categoryTokens || [])
		.map((token) => normalizeCategoryToken(token))
		.filter(Boolean);
	if (normalizedProductTokens.length === 0) return false;
	const excluded = new Set(
		excludedCollections.map((value) => normalizeCategoryToken(value)).filter(Boolean),
	);
	return normalizedProductTokens.some((token) => excluded.has(token));
}

export function mergeCategoryTokens(
	...groups: Array<string[] | undefined | null>
): string[] {
	const merged = new Set<string>();
	for (const group of groups) {
		if (!Array.isArray(group)) continue;
		for (const token of group) {
			const normalized = String(token || "").trim();
			if (normalized) merged.add(normalized);
		}
	}
	return Array.from(merged);
}
