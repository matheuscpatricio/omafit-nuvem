export const OMAFIT_APP_BASE_URL_DEFAULT = "https://omafit-nuvem-production.up.railway.app";

const NUVEMSHOP_PROXY_SCRIPT_HOSTS = [
	"apps-scripts.tiendanube.com",
	"apps-scripts.nuvemshop.com.br",
];

export function isNuvemshopProxyScriptOrigin(origin: string): boolean {
	try {
		const host = new URL(origin).hostname.toLowerCase();
		return NUVEMSHOP_PROXY_SCRIPT_HOSTS.some(
			(suffix) => host === suffix || host.endsWith(`.${suffix}`),
		);
	} catch {
		return false;
	}
}

function readBuildTimeAppBaseUrl(): string {
	return String(
		typeof import.meta !== "undefined" && import.meta.env?.VITE_OMAFIT_APP_URL
			? import.meta.env.VITE_OMAFIT_APP_URL
			: "",
	)
		.trim()
		.replace(/\/$/, "");
}

function readWindowAppBaseUrl(): string {
	if (typeof window === "undefined") return "";
	return String((window as Window & { OMAFIT_APP_URL?: string }).OMAFIT_APP_URL || "")
		.trim()
		.replace(/\/$/, "");
}

export function resolveOmafitAppBaseUrl(scriptSrc?: string | null): string {
	const fromBuild = readBuildTimeAppBaseUrl();
	if (fromBuild) return fromBuild;

	const fromWindow = readWindowAppBaseUrl();
	if (fromWindow) return fromWindow;

	if (scriptSrc) {
		try {
			const origin = new URL(scriptSrc).origin;
			if (!isNuvemshopProxyScriptOrigin(origin)) {
				return origin.replace(/\/$/, "");
			}
		} catch {
			// ignore invalid script URL
		}
	}

	return OMAFIT_APP_BASE_URL_DEFAULT;
}

function isStorefrontScriptSrc(src: string): boolean {
	return (
		src.includes("main.min.js") ||
		src.includes("storefront-legacy.min.js") ||
		src.includes("storefront-legacy-footwear.min.js") ||
		src.includes("storefront-legacy-loader.min.js") ||
		src.includes("legacy-storefront.min.js") ||
		src.includes("/omafit/omafit/") ||
		/apps-scripts\.(tiendanube|nuvemshop)/i.test(src)
	);
}

export function findStorefrontScriptSrc(): string | null {
	if (typeof document === "undefined") return null;
	const current = document.currentScript as HTMLScriptElement | null;
	if (current?.src && isStorefrontScriptSrc(current.src)) return current.src;
	const script = Array.from(document.scripts).find((item) => {
		const src = (item as HTMLScriptElement).src || "";
		return isStorefrontScriptSrc(src);
	}) as HTMLScriptElement | undefined;
	return script?.src || null;
}

/** @deprecated Use findStorefrontScriptSrc */
export function findLegacyStorefrontScriptSrc(): string | null {
	return findStorefrontScriptSrc();
}

export function getStorefrontAppBaseUrl(): string {
	return resolveOmafitAppBaseUrl(findStorefrontScriptSrc());
}

export function getLegacyStorefrontAppBaseUrl(): string {
	return getStorefrontAppBaseUrl();
}
