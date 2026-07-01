export function resolveShopifyProductIdFromPage(fallbackId?: string) {
	if (typeof window === "undefined") return fallbackId || "";
	const params = new URLSearchParams(window.location.search);
	return (
		params.get("product_id") ||
		params.get("productId") ||
		fallbackId ||
		""
	);
}
