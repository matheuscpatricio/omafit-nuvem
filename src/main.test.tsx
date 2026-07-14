import type { NubeSDK, NubeSDKState } from "@tiendanube/nube-sdk-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./main";

function createProductState(): NubeSDKState {
	return {
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
	} as NubeSDKState;
}

function createMockNube(fetchMock: ReturnType<typeof vi.fn>) {
	const handlers = new Map<string, () => void>();
	const mockNube: Partial<NubeSDK> = {
		on: vi.fn((event: string, handler: () => void) => {
			handlers.set(event, handler);
		}),
		render: vi.fn(),
		clearSlot: vi.fn(),
		send: vi.fn(),
		getBrowserAPIs: vi.fn(() => ({
			postMessageToIframe: vi.fn(),
		})),
		getState: vi.fn(() => createProductState()),
	};

	vi.stubGlobal("fetch", fetchMock);

	App(mockNube as NubeSDK);

	return {
		mockNube,
		triggerPageLoaded: async () => {
			const handler = handlers.get("page:loaded");
			if (!handler) throw new Error("page:loaded handler not registered");
			await handler();
		},
	};
}

describe("App", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("should register storefront widget on initialization", () => {
		const { mockNube } = createMockNube(
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
					storefront_sdk_enabled: true,
				}),
			}),
		);

		expect(mockNube.on).toHaveBeenCalledWith("page:loaded", expect.any(Function));
		expect(mockNube.on).toHaveBeenCalledWith("location:updated", expect.any(Function));
		expect(mockNube.on).toHaveBeenCalledWith("cart:add:success", expect.any(Function));
		expect(mockNube.on).toHaveBeenCalledWith("cart:add:fail", expect.any(Function));
		expect(mockNube.clearSlot).toHaveBeenCalledWith("before_product_detail_add_to_cart");
		expect(mockNube.clearSlot).toHaveBeenCalledWith("after_product_detail_add_to_cart");
		expect(mockNube.clearSlot).toHaveBeenCalledWith("modal_content");
	});

	it("clears slots and skips SDK CTA when storefront_sdk_enabled is false", async () => {
		const { mockNube, triggerPageLoaded } = createMockNube(
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					config: {
						link_text: "Ver meu tamanho ideal",
						widget_enabled: true,
						excluded_collections: [],
					},
					widgetUrl: "https://omafit-nuvem-production.up.railway.app/widget.html",
					storefront_sdk_enabled: false,
				}),
			}),
		);

		await triggerPageLoaded();

		expect(mockNube.render).not.toHaveBeenCalled();
		expect(mockNube.clearSlot).toHaveBeenCalledWith("before_product_detail_add_to_cart");
		expect(mockNube.clearSlot).toHaveBeenCalledWith("after_product_detail_add_to_cart");
		expect(mockNube.clearSlot).toHaveBeenCalledWith("modal_content");
	});
});
