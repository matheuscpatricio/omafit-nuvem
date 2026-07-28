import { describe, expect, it } from "vitest";
import {
	isNuvemshopProxyScriptOrigin,
	OMAFIT_APP_BASE_URL_DEFAULT,
	resolveOmafitAppBaseUrl,
} from "./omafitAppBaseUrl";

describe("omafitAppBaseUrl", () => {
	it("detects Nuvemshop proxy script hosts", () => {
		expect(isNuvemshopProxyScriptOrigin("https://apps-scripts.tiendanube.com")).toBe(true);
		expect(isNuvemshopProxyScriptOrigin("https://apps-scripts.nuvemshop.com.br")).toBe(true);
		expect(isNuvemshopProxyScriptOrigin("https://omafit-nuvem-production.up.railway.app")).toBe(
			false,
		);
	});

	it("falls back to Railway when script is served from Nuvemshop CDN", () => {
		const base = resolveOmafitAppBaseUrl(
			"https://apps-scripts.tiendanube.com/2.js?versionId=abc&store=6994912",
		);
		expect(base).toBe(OMAFIT_APP_BASE_URL_DEFAULT);
	});

	it("uses a direct Railway script origin when not proxied", () => {
		const base = resolveOmafitAppBaseUrl(
			"https://omafit-nuvem-production.up.railway.app/storefront-legacy.min.js",
		);
		expect(base).toBe("https://omafit-nuvem-production.up.railway.app");
	});

	it("falls back to Railway for proxied NubeSDK main.min.js", () => {
		const base = resolveOmafitAppBaseUrl(
			"https://apps-scripts.tiendanube.com/2.js?versionId=abc&store=6994912",
		);
		expect(base).toBe(OMAFIT_APP_BASE_URL_DEFAULT);
	});
});
