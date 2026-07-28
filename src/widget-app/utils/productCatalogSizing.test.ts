import { describe, expect, it } from "vitest";
import {
	catalogHasNamedSizeGrade,
	guardAssistantSizeClaims,
	resolveAlgorithmSizeForCatalog,
} from "./productCatalogSizing";

describe("productCatalogSizing", () => {
	it("detects named size grades", () => {
		expect(catalogHasNamedSizeGrade({ sizes: ["P", "M", "G"] })).toBe(true);
		expect(catalogHasNamedSizeGrade({ sizes: ["Único"] })).toBe(false);
		expect(catalogHasNamedSizeGrade({ sizes: [] })).toBe(false);
	});

	it("suppresses algorithm size for single-size products", () => {
		expect(resolveAlgorithmSizeForCatalog("G", { sizes: [] })).toBeNull();
		expect(resolveAlgorithmSizeForCatalog("G", { sizes: ["Único"] })).toBeNull();
	});

	it("keeps algorithm size when it exists in the catalog", () => {
		expect(resolveAlgorithmSizeForCatalog("g", { sizes: ["P", "M", "G"] })).toBe("G");
	});

	it("replaces assistant claims for single-size products", () => {
		const guarded = guardAssistantSizeClaims({
			tamanhoFinal: "G",
			explicacao: "Tamanho G disponível.",
			catalog: { sizes: [] },
			language: "pt",
		});
		expect(guarded.tamanhoFinal).toBe("");
		expect(guarded.explicacao).toContain("tamanho único");
	});
});
