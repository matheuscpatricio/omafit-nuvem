import {
	breadcrumbHandleFromHref,
	mergeCategoryTokens,
	tokensFromCategoryEntry,
} from "../../lib/category-exclusion.js";

const BREADCRUMB_LINK_SELECTOR = [
	".breadcrumbs a.crumb",
	".breadcrumbs a",
	".js-breadcrumbs a",
	"[data-store='page-title'] .breadcrumbs a",
	"nav.breadcrumb a",
	".breadcrumb a",
].join(", ");

function pushText(tokens: Set<string>, value: string | null | undefined) {
	const text = String(value || "").trim();
	if (text) tokens.add(text);
}

/**
 * Categorias visíveis na PDP. No Morelia o breadcrumb é `/{handle}/`
 * (ex.: `/acessorios/`) e `LS.product` não traz `categories`.
 * Não varre o menu inteiro: um link de navegação não é a categoria do produto.
 */
export function readStorefrontCategoryTokensFromDom(): string[] {
	if (typeof document === "undefined") return [];
	const tokens = new Set<string>();
	const lsCategories = (
		window as Window & {
			LS?: { product?: { categories?: unknown[] } };
		}
	).LS?.product?.categories;
	if (Array.isArray(lsCategories)) {
		for (const entry of lsCategories) {
			for (const token of tokensFromCategoryEntry(entry))
				pushText(tokens, token);
		}
	}

	for (const element of Array.from(
		document.querySelectorAll("[data-product-category-id],[data-category-id]"),
	)) {
		const raw =
			element.getAttribute("data-product-category-id") ||
			element.getAttribute("data-category-id");
		for (const part of String(raw || "").split(",")) pushText(tokens, part);
	}

	for (const link of Array.from(
		document.querySelectorAll<HTMLAnchorElement>(BREADCRUMB_LINK_SELECTOR),
	)) {
		const handle = breadcrumbHandleFromHref(
			link.getAttribute("href") || link.href || "",
		);
		pushText(tokens, handle);
		pushText(tokens, link.getAttribute("title"));
		pushText(tokens, link.textContent);
	}

	return mergeCategoryTokens(Array.from(tokens));
}
