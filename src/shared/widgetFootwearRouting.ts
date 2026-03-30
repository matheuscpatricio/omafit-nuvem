/** Mesmo critério de `normalizeChartHandle` em `WidgetPage.tsx` (match com tabelas no admin). */
export function normalizeChartHandle(value: string): string {
	return String(value || "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{M}/gu, "");
}

/**
 * Contexto de calçados: slug de coleção **ou** handle de produto igual ao `collection_handle`
 * de uma tabela `footwear` no admin (ambos normalizados como no servidor).
 */
export function shouldUseFootwearWidget(
	collectionHandle: string,
	productHandle: string,
	footwearHandlesNormalized: string[],
): boolean {
	if (!footwearHandlesNormalized.length) return false;
	const set = new Set(footwearHandlesNormalized.map((h) => normalizeChartHandle(h)).filter(Boolean));
	const nc = normalizeChartHandle(collectionHandle);
	if (nc && set.has(nc)) return true;
	const np = normalizeChartHandle(productHandle);
	if (np && set.has(np)) return true;
	return false;
}

function pushCollectionSlugFromHref(href: string, out: string[]) {
	const m = href.match(/\/collections\/([^/?#]+)/i);
	if (!m?.[1]) return;
	try {
		out.push(decodeURIComponent(m[1]));
	} catch {
		out.push(m[1]);
	}
}

/** Texto + slugs em hrefs `/collections/{slug}/` para cruzar com handles do admin. */
function gatherFootwearMatchCandidatesFromDom(): string[] {
	if (typeof document === "undefined") return [];
	const out: string[] = [];
	const selectors = [
		".breadcrumb a",
		".breadcrumbs a",
		'[class*="breadcrumb"] a',
		'nav[aria-label="breadcrumb"] a',
		'[itemtype*="BreadcrumbList"] a',
		".js-breadcrumb a",
		".product-breadcrumb a",
		"[itemprop='itemListElement'] a",
		".product-header .breadcrumb a",
	];
	for (const sel of selectors) {
		document.querySelectorAll(sel).forEach((node) => {
			const a = node as HTMLAnchorElement;
			const text = a.textContent?.trim();
			if (text) out.push(text);
			pushCollectionSlugFromHref(a.getAttribute("href") || "", out);
		});
	}
	/** Temas Nuvemshop: qualquer link para coleção na página (limitado). */
	document.querySelectorAll('a[href*="/collections/"]').forEach((node, index) => {
		if (index > 40) return;
		const a = node as HTMLAnchorElement;
		const text = a.textContent?.trim();
		if (text) out.push(text);
		pushCollectionSlugFromHref(a.getAttribute("href") || "", out);
	});
	const dataSelectors = [
		"[data-collection-handle]",
		"[data-product-collection]",
		"[data-category-handle]",
	];
	for (const sel of dataSelectors) {
		document.querySelectorAll(sel).forEach((el) => {
			const v =
				el.getAttribute("data-collection-handle") ||
				el.getAttribute("data-product-collection") ||
				el.getAttribute("data-category-handle");
			if (v) out.push(v);
		});
	}
	const scripts = document.querySelectorAll('script[type="application/ld+json"]');
	for (const s of scripts) {
		try {
			const j = JSON.parse(s.textContent || "{}");
			const cat = j.category || (Array.isArray(j["@graph"]) && j["@graph"][0]?.category);
			if (typeof cat === "string") out.push(cat);
			if (Array.isArray(j["@graph"])) {
				for (const node of j["@graph"]) {
					const c = node?.category;
					if (typeof c === "string") out.push(c);
				}
			}
		} catch {
			/* ignore invalid JSON-LD */
		}
	}
	return [...new Set(out.map((s) => String(s || "").trim()).filter(Boolean))];
}

/**
 * Quando a URL é só `/produtos/...`, tenta achar qual coleção footwear se aplica
 * comparando breadcrumb/hrefs com os handles cadastrados no admin (API).
 */
export function inferFootwearCollectionHandleFromDom(footwearHandlesNormalized: string[]): string {
	if (!footwearHandlesNormalized.length || typeof document === "undefined") return "";
	const set = new Set(footwearHandlesNormalized.map((h) => normalizeChartHandle(h)).filter(Boolean));
	for (const raw of gatherFootwearMatchCandidatesFromDom()) {
		const n = normalizeChartHandle(raw);
		if (n && set.has(n)) return n;
	}
	return "";
}

/**
 * Tema manual → `/collections/` na URL → referrer → inferência DOM → (opcional) handle do produto
 * se for igual a um `collection_handle` footwear no admin.
 */
export function resolveCollectionHandleForStorefront(
	footwearHandlesNormalized: string[],
	productHandle?: string,
): string {
	if (typeof window === "undefined") return "";
	const fromWindow = String(window.OMAFIT_COLLECTION_HANDLE || "").trim();
	const fromBody = String(document.body?.getAttribute("data-omafit-collection-handle") || "").trim();
	const fromHtml = String(document.documentElement?.getAttribute("data-omafit-collection-handle") || "").trim();
	const fromTheme = fromWindow || fromBody || fromHtml;
	if (fromTheme) return fromTheme.toLowerCase();

	const fromPath = (pathname: string) => {
		try {
			const m = pathname.match(/\/collections\/([^/]+)/i);
			if (!m?.[1]) return "";
			return decodeURIComponent(m[1]).trim().toLowerCase();
		} catch {
			return "";
		}
	};
	const direct = fromPath(window.location.pathname);
	if (direct) return direct;
	try {
		if (document.referrer) {
			const ref = fromPath(new URL(document.referrer).pathname);
			if (ref) return ref;
		}
	} catch {
		/* ignore */
	}
	const inferred = inferFootwearCollectionHandleFromDom(footwearHandlesNormalized);
	if (inferred) return inferred;
	const np = normalizeChartHandle(productHandle || "");
	if (np && footwearHandlesNormalized.length) {
		const set = new Set(footwearHandlesNormalized.map((h) => normalizeChartHandle(h)).filter(Boolean));
		if (set.has(np)) return np;
	}
	return "";
}
