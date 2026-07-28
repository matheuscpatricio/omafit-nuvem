import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import {
	legacyCtaCacheKey,
	readLegacyCtaCache,
	writeLegacyCtaCache,
} from "./storefrontCta";

function createSessionStorageMock() {
	const store = new Map<string, string>();
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
		clear: () => {
			store.clear();
		},
	};
}

describe("storefrontCta cache", () => {
	beforeEach(() => {
		vi.stubGlobal("sessionStorage", createSessionStorageMock());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("round-trips CTA config in sessionStorage", () => {
		writeLegacyCtaCache("6994912", {
			link_text: "Assistente inteligente",
			cta_type: "button",
			widget_enabled: true,
		});
		const cached = readLegacyCtaCache("6994912");
		expect(cached?.link_text).toBe("Assistente inteligente");
		expect(legacyCtaCacheKey("6994912")).toContain("6994912");
	});

	it("ignores cache entries without link_text", () => {
		sessionStorage.setItem(
			legacyCtaCacheKey("1"),
			JSON.stringify({ widget_enabled: true, savedAt: Date.now() }),
		);
		expect(readLegacyCtaCache("1")).toBeNull();
	});
});
