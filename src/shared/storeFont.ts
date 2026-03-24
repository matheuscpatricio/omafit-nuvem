/**
 * Lê a fonte efetiva da vitrine (página do produto / tema) para replicar no iframe do widget.
 */
export function getStorefrontFontFamily(): string {
	const readFrom = (el: Element | null | undefined): string => {
		if (!el || !(el instanceof HTMLElement)) return "";
		try {
			const value = getComputedStyle(el).fontFamily;
			return value?.trim() || "";
		} catch {
			return "";
		}
	};

	const selectors = [
		"body",
		"main",
		".js-product-page",
		"#wrapper",
		".container",
		".product-form",
	];

	for (const selector of selectors) {
		const font = readFrom(document.querySelector(selector));
		if (font) return font;
	}

	try {
		const parentBody = window.parent?.document?.body;
		const font = readFrom(parentBody);
		if (font) return font;
	} catch {
		// origem cruzada
	}

	try {
		const topBody = window.top?.document?.body;
		if (topBody && topBody !== document.body) {
			const font = readFrom(topBody);
			if (font) return font;
		}
	} catch {
		// origem cruzada
	}

	return "";
}

/**
 * Evita injeção via query string ou postMessage (apenas valor de font-family).
 */
export function sanitizeFontFamilyForCss(value: string): string {
	const trimmed = String(value || "")
		.trim()
		.slice(0, 800);
	if (!trimmed) return "";
	if (/[;{}<>]|url\s*\(|expression\s*\(|javascript:/i.test(trimmed)) return "";
	return trimmed;
}

export const OMAFIT_WIDGET_FONT_FALLBACK =
	'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
