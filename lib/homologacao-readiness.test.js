import { describe, expect, it } from "vitest";
import { buildHomologacaoReadinessReport } from "../lib/homologacao-readiness.js";

describe("homologacao readiness", () => {
	it("marks backend ready when health, billing and Patagonia config pass", () => {
		const report = buildHomologacaoReadinessReport({
			baseUrl: "https://omafit-nuvem-production.up.railway.app",
			health: { ok: true, hasOAuthConfig: true, hasSupabase: true },
			billingSnapshot: {
				hasStoreRecord: true,
				checks: { webhooksReady: true, selfBillingReady: true },
			},
			widgetConfig: {
				storefront_sdk_enabled: true,
				widgetUrl: "https://omafit-nuvem-production.up.railway.app/widget.html",
				config: { widget_enabled: true },
			},
		});
		expect(report.readyForHomologation).toBe(true);
		expect(report.checks.storefrontSdkEnabled).toBe(true);
	});
});
