export function isCategoryExcluded(
	categoryIds: string[],
	excludedCollections: string[] | undefined | null,
): boolean {
	if (!Array.isArray(excludedCollections) || excludedCollections.length === 0) return false;
	const normalizedIds = (categoryIds || []).map((categoryId) => String(categoryId)).filter(Boolean);
	if (normalizedIds.length === 0) return false;
	const excluded = new Set(excludedCollections.map((value) => String(value)));
	return normalizedIds.some((categoryId) => excluded.has(categoryId));
}
