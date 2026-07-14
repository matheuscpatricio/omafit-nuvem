/** @jsxImportSource @tiendanube/nube-sdk-jsx */
import type { NubeSDK } from "@tiendanube/nube-sdk-types";
import { Button, Column, Iframe, Text } from "@tiendanube/nube-sdk-jsx";
import {
	buildWidgetUrl,
	findVariantByRecommendedSize,
	getCurrentProduct,
	getProductHandle,
	getStorefrontCtaSlot,
	isProductExcluded,
	loadStorefrontBootstrap,
	resolveCollectionHandleFromNube,
	resolveWidgetBaseUrl,
	type StorefrontBootstrap,
	type StorefrontConfig,
} from "./shared/nuvemshopStorefront";

type IframeMessageEvent = {
	value?: Record<string, unknown>;
};

let activeIframe: ReturnType<typeof Iframe> | null = null;
let pendingCartReply:
	| ((ok: boolean, message: string) => void)
	| null = null;

function replyToIframe(nube: NubeSDK, ok: boolean, message: string) {
	if (!activeIframe) return;
	nube.getBrowserAPIs().postMessageToIframe(activeIframe, {
		type: "omafit-add-to-cart-result",
		ok,
		message,
	});
}

function handleIframeMessage(nube: NubeSDK, event: IframeMessageEvent) {
	const payload = event.value || {};
	if (payload.type !== "omafit-add-to-cart-request") return;

	const product = getCurrentProduct(nube);
	if (!product?.id) {
		replyToIframe(nube, false, "Produto indisponivel nesta pagina.");
		return;
	}

	const desiredSize = String(
		(payload.selection as { recommended_size?: string } | undefined)?.recommended_size || "",
	).trim();
	const variant =
		findVariantByRecommendedSize(product, desiredSize) || product.variants?.[0] || null;
	if (!variant?.id) {
		replyToIframe(nube, false, "Nao foi possivel identificar a variante do produto.");
		return;
	}

	pendingCartReply = (ok, message) => replyToIframe(nube, ok, message);
	nube.send("cart:add", () => ({
		cart: {
			items: [
				{
					variant_id: Number(variant.id),
					product_id: Number(product.id),
					quantity: 1,
					properties: {
						_source: "omafit_tryon",
					},
				},
			],
		},
	}));
}

function pushWidgetContext(nube: NubeSDK, bootstrap: StorefrontBootstrap, widgetUrl: string) {
	if (!activeIframe) return;
	const product = getCurrentProduct(nube);
	if (!product) return;
	const state = nube.getState();
	const productHandle = getProductHandle(nube, product);
	const collectionHandle = resolveCollectionHandleFromNube(
		nube,
		bootstrap.footwearCollectionHandles,
		productHandle,
	);
	const tryonLayout =
		bootstrap.config.tryon_layout === "hero" || bootstrap.config.tryon_layout === "sidebar"
			? bootstrap.config.tryon_layout
			: "default";
	const contextPayload = {
		type: "omafit-context",
		language: state.store.language || "pt",
		locale: state.store.language || "pt",
		storeLanguage: state.store.language || "pt",
		shopDomain: `nuvemshop/${state.store.id}`,
		publicId: bootstrap.publicId,
		productHandle,
		product_handle: productHandle,
		collectionHandle,
		collectionHandles: collectionHandle ? [collectionHandle] : [],
		tryon_layout: tryonLayout,
		tryonLayout,
		billing_plan: bootstrap.billingPlan || null,
		billingPlan: bootstrap.billingPlan || null,
		stylist_mode_enabled: bootstrap.stylistModeEnabled,
		stylistModeEnabled: bootstrap.stylistModeEnabled,
		primaryColor: bootstrap.config.primary_color || "#810707",
		widgetUrl,
	};
	nube.getBrowserAPIs().postMessageToIframe(activeIframe, contextPayload);
	nube.getBrowserAPIs().postMessageToIframe(activeIframe, {
		type: "omafit-config-update",
		...contextPayload,
	});
}

function clearProductSlots(nube: NubeSDK) {
	nube.clearSlot("before_product_detail_add_to_cart");
	nube.clearSlot("after_product_detail_add_to_cart");
	nube.clearSlot("modal_content");
}

function renderStorefrontWidget(
	nube: NubeSDK,
	config: StorefrontConfig,
	bootstrap: StorefrontBootstrap,
) {
	const product = getCurrentProduct(nube);
	const ctaSlot = getStorefrontCtaSlot(config);
	clearProductSlots(nube);

	if (config.widget_enabled === false) return;
	if (!product) return;
	if (isProductExcluded(product, config)) return;

	const productHandle = getProductHandle(nube, product);
	const collectionHandle = resolveCollectionHandleFromNube(
		nube,
		bootstrap.footwearCollectionHandles,
		productHandle,
	);
	const resolvedBaseUrl = resolveWidgetBaseUrl(
		bootstrap.widgetUrl,
		collectionHandle,
		productHandle,
		bootstrap.footwearCollectionHandles,
	);
	const widgetUrl = buildWidgetUrl(
		resolvedBaseUrl,
		nube,
		config,
		collectionHandle,
		bootstrap.publicId,
		bootstrap.billingPlan,
		bootstrap.stylistModeEnabled,
	);

	nube.render(
		ctaSlot,
		<Button
			variant={config.cta_type === "button" ? "primary" : "link"}
			onClick={() => {
				activeIframe = (
					<Iframe
						src={widgetUrl as `https://${string}`}
						height="640px"
						onMessage={(event) => handleIframeMessage(nube, event)}
					/>
				);
				nube.render(
					"modal_content",
					<Column padding="16px" gap="16px">
						<Text>Descubra o tamanho ideal com base no contexto real deste produto.</Text>
						{activeIframe}
						<Button
							variant="secondary"
							onClick={() => {
								activeIframe = null;
								nube.clearSlot("modal_content");
							}}
						>
							Fechar
						</Button>
					</Column>,
				);
				pushWidgetContext(nube, bootstrap, widgetUrl);
			}}
		>
			{config.link_text || "Ver meu tamanho ideal"}
		</Button>,
	);
}

export function App(nube: NubeSDK) {
	let bootToken = 0;
	clearProductSlots(nube);

	const boot = async () => {
		const token = ++bootToken;
		const state = nube.getState();
		if (state.location.page.type !== "product") {
			clearProductSlots(nube);
			return;
		}

		const bootstrap = await loadStorefrontBootstrap(state.store.id, state.store.domain);
		if (token !== bootToken) return;
		if (!bootstrap.ready || bootstrap.storefront_sdk_enabled === false) {
			clearProductSlots(nube);
			return;
		}
		renderStorefrontWidget(nube, bootstrap.config, bootstrap);
	};

	nube.on("cart:add:success", () => {
		if (!pendingCartReply) return;
		const reply = pendingCartReply;
		pendingCartReply = null;
		reply(
			true,
			"Produto adicionado ao carrinho com o tamanho recomendado pelo Omafit.",
		);
	});

	nube.on("cart:add:fail", () => {
		if (!pendingCartReply) return;
		const reply = pendingCartReply;
		pendingCartReply = null;
		reply(false, "Nao foi possivel adicionar o produto ao carrinho.");
	});

	nube.on("page:loaded", () => {
		void boot();
	});
	nube.on("location:updated", () => {
		void boot();
	});
}
