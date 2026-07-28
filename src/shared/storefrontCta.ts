export const OMAFIT_LEGACY_CTA_WRAPPER_ID = "omafit-legacy-wrapper";
export const OMAFIT_LEGACY_CTA_BUTTON_ID = "omafit-legacy-button";
const LEGACY_CTA_GUARD_STYLE_ID = "omafit-legacy-guard-style";
const LEGACY_CTA_CACHE_PREFIX = "omafit_legacy_cta_v1:";
const LEGACY_CTA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LegacyCtaCacheEntry = {
	link_text: string;
	store_logo?: string | null;
	primary_color?: string;
	cta_type?: string;
	cta_button_border_radius?: number;
	embed_position?: string;
	tryon_layout?: string;
	tryon_layout_background_image?: string | null;
	widget_enabled: boolean;
	savedAt: number;
};

let legacyCtaFlashGuardStarted = false;

function hideUnreadyLegacyWrapper(node: Element): void {
	if (!(node instanceof HTMLElement)) return;
	if (node.id !== OMAFIT_LEGACY_CTA_WRAPPER_ID) return;
	if (!node.classList.contains("omafit-legacy-ready")) {
		node.classList.remove("omafit-legacy-ready");
	}
}

export function markLegacyCtaReady(wrapper: HTMLElement): void {
	wrapper.style.removeProperty("display");
	wrapper.classList.add("omafit-legacy-ready");
}

export function injectLegacyCtaGuardStyles(): void {
	if (typeof document === "undefined") return;
	if (document.getElementById(LEGACY_CTA_GUARD_STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = LEGACY_CTA_GUARD_STYLE_ID;
	style.textContent = `
#${OMAFIT_LEGACY_CTA_WRAPPER_ID}:not(.omafit-legacy-ready) {
  display: none !important;
}
#${OMAFIT_LEGACY_CTA_WRAPPER_ID}.omafit-legacy-ready {
  display: block;
  width: 100%;
}
`;
	const parent = document.head || document.documentElement;
	parent.appendChild(style);
	hideUnreadyLegacyWrapper(document.getElementById(OMAFIT_LEGACY_CTA_WRAPPER_ID) || document.body);
}

export function startLegacyCtaFlashGuard(): void {
	if (typeof document === "undefined" || legacyCtaFlashGuardStarted) return;
	legacyCtaFlashGuardStarted = true;
	injectLegacyCtaGuardStyles();
	const existing = document.getElementById(OMAFIT_LEGACY_CTA_WRAPPER_ID);
	if (existing) hideUnreadyLegacyWrapper(existing);
	if (typeof MutationObserver === "undefined") return;
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (!(node instanceof HTMLElement)) continue;
				if (node.id === OMAFIT_LEGACY_CTA_WRAPPER_ID) hideUnreadyLegacyWrapper(node);
				node.querySelectorAll(`#${OMAFIT_LEGACY_CTA_WRAPPER_ID}`).forEach(hideUnreadyLegacyWrapper);
			}
		}
	});
	const root = document.documentElement || document.body;
	if (root) observer.observe(root, { childList: true, subtree: true });
}

export function legacyCtaCacheKey(storeId: string): string {
	return `${LEGACY_CTA_CACHE_PREFIX}${String(storeId || "").trim()}`;
}

export function readLegacyCtaCache(storeId: string): LegacyCtaCacheEntry | null {
	if (typeof sessionStorage === "undefined") return null;
	const key = legacyCtaCacheKey(storeId);
	try {
		const raw = sessionStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as LegacyCtaCacheEntry;
		const linkText = String(parsed?.link_text || "").trim();
		if (!linkText) return null;
		const savedAt = Number(parsed?.savedAt || 0);
		if (!savedAt || Date.now() - savedAt > LEGACY_CTA_CACHE_TTL_MS) return null;
		return {
			...parsed,
			link_text: linkText,
			widget_enabled: parsed.widget_enabled !== false,
			savedAt,
		};
	} catch {
		return null;
	}
}

export function writeLegacyCtaCache(
	storeId: string,
	config: {
		link_text?: string;
		store_logo?: string | null;
		primary_color?: string;
		cta_type?: string;
		cta_button_border_radius?: number;
		embed_position?: string;
		tryon_layout?: string;
		tryon_layout_background_image?: string | null;
		widget_enabled?: boolean;
	},
): void {
	if (typeof sessionStorage === "undefined") return;
	const linkText = String(config?.link_text || "").trim();
	if (!linkText) return;
	const entry: LegacyCtaCacheEntry = {
		link_text: linkText,
		store_logo: config.store_logo ?? null,
		primary_color: config.primary_color,
		cta_type: config.cta_type,
		cta_button_border_radius: config.cta_button_border_radius,
		embed_position: config.embed_position,
		tryon_layout: config.tryon_layout,
		tryon_layout_background_image: config.tryon_layout_background_image ?? null,
		widget_enabled: config.widget_enabled !== false,
		savedAt: Date.now(),
	};
	try {
		sessionStorage.setItem(legacyCtaCacheKey(storeId), JSON.stringify(entry));
	} catch {
		// ignore quota / private mode
	}
}

export function removeLegacyStorefrontCta(): void {
	if (typeof document === "undefined") return;
	document.getElementById(OMAFIT_LEGACY_CTA_WRAPPER_ID)?.remove();
}
