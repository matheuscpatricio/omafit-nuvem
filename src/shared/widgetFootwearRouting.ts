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
	];
	for (const sel of selectors) {
		document.querySelectorAll(sel).forEach((node) => {
			const a = node as HTMLAnchorElement;
			const text = a.textContent?.trim();
			if (text) out.push(text);
			const href = a.getAttribute("href") || "";
			const m = href.match(/\/collections\/([^/?#]+)/i);
			if (m?.[1]) {
				try {
					out.push(decodeURIComponent(m[1]));
				} catch {
					out.push(m[1]);
				}
			}
		});
	}
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
	try {
		const scripts = document.querySelectorAll('script[type="application/ld+json"]');
		for (const s of scripts) {
			const j = JSON.parse(s.textContent || "{}");
			const cat = j.category || (Array.isArray(j["@graph"]) && j["@graph"][0]?.category);
			if (typeof cat === "string") out.push(cat);
		}
	} catch {
		/* ignore */
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

/** Tema manual → `/collections/` na URL → referrer → inferência DOM com lista footwear da API. */
export function resolveCollectionHandleForStorefront(footwearHandlesNormalized: string[]): string {
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
	return inferFootwearCollectionHandleFromDom(footwearHandlesNormalized);
}
