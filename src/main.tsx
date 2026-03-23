/** @jsxImportSource @tiendanube/nube-sdk-jsx */
import type { NubeSDK, ProductDetails } from "@tiendanube/nube-sdk-types";
import { Button, Column, Iframe, Text } from "@tiendanube/nube-sdk-jsx";

type StorefrontConfig = {
	link_text: string;
	store_logo?: string | null;
	primary_color?: string;
	widget_enabled: boolean;
	excluded_collections: string[];
};

function getCurrentProduct(nube: NubeSDK): ProductDetails | null {
	const page = nube.getState().location.page;
	if (page.type !== "product") return null;
	return page.data.product;
}

function buildWidgetUrl(baseUrl: string, nube: NubeSDK, config: StorefrontConfig) {
	const state = nube.getState();
	const product = getCurrentProduct(nube);
	if (!product) return baseUrl;

	const selectedVariant = product.variants?.[0] || null;
	const widgetUrl = new URL(baseUrl);
	widgetUrl.searchParams.set("platform", "nuvemshop");
	widgetUrl.searchParams.set("store_id", String(state.store.id));
	widgetUrl.searchParams.set("store_domain", state.store.domain);
	widgetUrl.searchParams.set("product_id", String(product.id));
	widgetUrl.searchParams.set("product_name", product.name?.[state.store.language] || product.name?.pt || "");
	widgetUrl.searchParams.set("product_handle", product.handle?.[state.store.language] || product.handle?.pt || "");
	widgetUrl.searchParams.set("currency", state.store.currency);
	if (selectedVariant?.id) {
		widgetUrl.searchParams.set("variant_id", String(selectedVariant.id));
	}
	if (config.store_logo) {
		widgetUrl.searchParams.set("store_logo", config.store_logo);
	}
	if (config.primary_color) {
		widgetUrl.searchParams.set("primary_color", config.primary_color);
	}
	return widgetUrl.toString();
}

function shouldHideForProduct(product: ProductDetails | null, config: StorefrontConfig) {
	if (!product || config.widget_enabled === false) return true;
	const categoryIds = (product.categories || []).map((categoryId) => String(categoryId));
	return categoryIds.some((categoryId) => config.excluded_collections.includes(categoryId));
}

async function loadStorefrontConfig(storeId: number) {
	try {
		const response = await fetch(`/api/storefront/widget-config?store_id=${encodeURIComponent(String(storeId))}`);
		if (!response.ok) throw new Error("request failed");
		const data = await response.json();
		return {
			config: (data?.config || {
				link_text: "Ver meu tamanho ideal",
				widget_enabled: true,
				excluded_collections: [],
				primary_color: "#810707",
			}) as StorefrontConfig,
			widgetUrl: String(data?.widgetUrl || "https://omafit.netlify.app"),
		};
	} catch (_error) {
		return {
			config: {
				link_text: "Ver meu tamanho ideal",
				widget_enabled: true,
				excluded_collections: [],
				primary_color: "#810707",
			} as StorefrontConfig,
			widgetUrl: "https://omafit.netlify.app",
		};
	}
}

function renderWidget(nube: NubeSDK, config: StorefrontConfig, widgetBaseUrl: string) {
	const product = getCurrentProduct(nube);
	if (shouldHideForProduct(product, config)) {
		nube.clearSlot("after_product_detail_add_to_cart");
		nube.clearSlot("after_product_detail_name");
		return;
	}

	const widgetUrl = buildWidgetUrl(widgetBaseUrl, nube, config);
	nube.render(
		"after_product_detail_name",
		<Text>
			Omafit ativo para este produto.
		</Text>,
	);

	nube.render(
		"after_product_detail_add_to_cart",
		<Button
			variant="link"
			onClick={() => {
				nube.render(
					"modal_content",
					<Column padding="16px" gap="16px">
						<Text>
							Descubra o tamanho ideal com base no contexto real deste produto.
						</Text>
						<Iframe src={widgetUrl as `https://${string}`} height="640px" />
						<Button
							variant="secondary"
							onClick={() => {
								nube.clearSlot("modal_content");
							}}
						>
							Fechar
						</Button>
					</Column>,
				);
			}}
		>
			{config.link_text || "Ver meu tamanho ideal"}
		</Button>,
	);
}

export function App(nube: NubeSDK) {
	const boot = async () => {
		const { config, widgetUrl } = await loadStorefrontConfig(nube.getState().store.id);
		renderWidget(nube, config, widgetUrl);
	};

	void boot();
	nube.on("page:loaded", () => {
		void boot();
	});
	nube.on("location:updated", () => {
		void boot();
	});
}
