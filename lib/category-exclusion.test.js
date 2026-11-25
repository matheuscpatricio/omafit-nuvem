import { describe, expect, it } from "vitest";
import {
	breadcrumbHandleFromHref,
	expandExcludedCategorySet,
	expandProductCategoryTokens,
	isCategoryExcluded,
} from "./category-exclusion.js";

const tree = [
	{
		id: 10,
		handle: "acessorios",
		title: "Acessórios",
		parent: null,
		subcategories: [11, 12],
	},
	{ id: 11, handle: "bolsas", title: "Bolsas", parent: 10 },
	{ id: 12, handle: "cintos", title: "Cintos", parent: 10 },
	{ id: 20, handle: "sueteres", title: "Suéteres", parent: null },
];

describe("category exclusion tree", () => {
	it("matches names with accents against unaccented handles", () => {
		expect(isCategoryExcluded(["acessorios"], ["Acessórios"])).toBe(true);
		expect(isCategoryExcluded(["Suéteres"], ["sueteres"])).toBe(true);
		expect(isCategoryExcluded(["sueteres"], ["acessorios"])).toBe(false);
	});

	it("expands an excluded parent to subcategory ids and handles", () => {
		const excluded = expandExcludedCategorySet(["10"], tree);
		expect(excluded).toEqual(
			expect.arrayContaining([
				"10",
				"acessorios",
				"Acessórios",
				"11",
				"bolsas",
				"12",
				"cintos",
			]),
		);
		expect(isCategoryExcluded(["11"], excluded)).toBe(true);
		expect(isCategoryExcluded(["bolsas"], excluded)).toBe(true);
		expect(isCategoryExcluded(["sueteres"], excluded)).toBe(false);
	});

	it("expands a product leaf with its parent category", () => {
		const tokens = expandProductCategoryTokens(["11"], tree);
		expect(isCategoryExcluded(tokens, ["acessorios"])).toBe(true);
		expect(isCategoryExcluded(tokens, ["Acessórios"])).toBe(true);
		expect(isCategoryExcluded(tokens, ["sueteres"])).toBe(false);
	});

	it("reads category objects instead of stringifying them", () => {
		expect(
			isCategoryExcluded(
				[{ id: 10, handle: { pt: "acessorios" }, name: { pt: "Acessórios" } }],
				["10"],
			),
		).toBe(true);
	});

	it("reads Morelia breadcrumb hrefs and ignores product and nav noise", () => {
		expect(breadcrumbHandleFromHref("/acessorios/")).toBe("acessorios");
		expect(
			breadcrumbHandleFromHref(
				"https://loja.lojavirtualnuvem.com.br/sueteres/",
			),
		).toBe("sueteres");
		expect(breadcrumbHandleFromHref("/categorias/acessorios/")).toBe(
			"acessorios",
		);
		expect(breadcrumbHandleFromHref("/produtos/sueter-preto-de-la/")).toBe("");
		expect(breadcrumbHandleFromHref("/contato/")).toBe("");
		expect(breadcrumbHandleFromHref("/")).toBe("");
	});
});
