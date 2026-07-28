import { describe, expect, it } from "vitest";
import { isCategoryExcluded } from "./categoryExclusion";

describe("categoryExclusion", () => {
	it("returns false when no categories or exclusions are configured", () => {
		expect(isCategoryExcluded([], ["1"])).toBe(false);
		expect(isCategoryExcluded(["2"], [])).toBe(false);
	});

	it("matches excluded category ids", () => {
		expect(isCategoryExcluded(["12", "34"], ["99", "34"])).toBe(true);
		expect(isCategoryExcluded(["12"], ["34"])).toBe(false);
	});
});
