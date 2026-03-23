import type { NubeSDK, NubeSDKState } from "@tiendanube/nube-sdk-types";
import { describe, expect, it, vi } from "vitest";
import { App } from "./main";

describe("App", () => {
	it("should register storefront widget on initialization", () => {
		vi.stubGlobal("self", globalThis);
		(globalThis as typeof globalThis & {
			__APP_DATA__?: { id: string; script: string };
		}).__APP_DATA__ = { id: "test-app", script: "main" };
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					config: {
						link_text: "Ver meu tamanho ideal",
						widget_enabled: true,
						excluded_collections: [],
						primary_color: "#810707",
					},
					widgetUrl: "https://omafit-nuvem-production.up.railway.app/widget.html",
				}),
			}),
		);

		const mockNube: Partial<NubeSDK> = {
			on: vi.fn(),
			render: vi.fn(),
			clearSlot: vi.fn(),
			getState: vi.fn(
				() =>
					({
						store: {
							id: 123,
							name: "Loja Teste",
							domain: "lojateste.nuvemshop.com.br",
							currency: "BRL",
							language: "pt",
						},
						location: {
							page: {
								type: "product",
								data: {
									product: {
										id: 99,
										name: { pt: "Vestido" },
										handle: { pt: "vestido" },
										categories: [1],
										variants: [{ id: 456 }],
									},
								},
							},
						},
					}) as NubeSDKState,
			),
		};

		App(mockNube as NubeSDK);

		expect(mockNube.on).toHaveBeenCalledWith("page:loaded", expect.any(Function));
		expect(mockNube.on).toHaveBeenCalledWith("location:updated", expect.any(Function));
	});
});
