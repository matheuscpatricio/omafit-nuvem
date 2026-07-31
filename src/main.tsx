/** @jsxImportSource @tiendanube/nube-sdk-jsx */
import type { NubeSDK } from "@tiendanube/nube-sdk-types";
import { Button, Column, Iframe, Link, Text } from "@tiendanube/nube-sdk-jsx";
import {
	buildWidgetUrl,
	findVariantByRecommendedSize,
	getCurrentProduct,
	getProductHandle,
	getStorefrontCtaSlot,
	getStorefrontThemeName,
	loadStorefrontBootstrap,
	shouldUseStorefrontSdk,
	shouldHideProductForConfig,
	resolveCollectionHandleFromNube,
	resolveProductImageUrls,
	resolveWidgetBaseUrl,
	type StorefrontBootstrap,
	type StorefrontConfig,
} from "./shared/nuvemshopStorefront";
import { removeLegacyStorefrontCta } from "./shared/storefrontCta";
import {
	adoptShopperDeviceIdFromIframe,
	getOrCreateShopperDeviceId,
} from "./shared/shopperDeviceId";

type IframeMessageEvent = {
	value?: Record<string, unknown>;
};

let activeIframe: ReturnType<typeof Iframe> | null = null;
let pendingCartReply:
	| ((ok: boolean, message: string) => void)
	| null = null;
let lastCartRequestId: string | null = null;

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
	if (payload.type === "omafit-device-id-adopt") {
		const deviceId = String(payload.deviceId || payload.omafit_device_id || "").trim();
		if (deviceId) adoptShopperDeviceIdFromIframe(deviceId);
		return;
	}
	if (payload.type !== "omafit-add-to-cart-request") return;
	if (pendingCartReply) return;

	const requestId = String(payload.requestId || "").trim();
	if (requestId) {
		if (requestId === lastCartRequestId) return;
		lastCartRequestId = requestId;
	}

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
	const tryonLayoutBackground = String(bootstrap.config.tryon_layout_background_image || "").trim();
	const shopperDeviceId = getOrCreateShopperDeviceId();
	const productImages = resolveProductImageUrls(product, state.store.language);
	const productImage = productImages[0] || "";
	const contextPayload = {
		type: "omafit-context",
		language: state.store.language || "pt",
		locale: state.store.language || "pt",
		storeLanguage: state.store.language || "pt",
		shopDomain: `nuvemshop/${state.store.id}`,
		omafitDeviceId: shopperDeviceId,
		omafit_device_id: shopperDeviceId,
		shopperDeviceId,
		publicId: bootstrap.publicId,
		productId: String(product.id),
		product_id: String(product.id),
		productHandle,
		product_handle: productHandle,
		productImage,
		product_image: productImage,
		productImages,
		product_images: productImages,
		collectionHandle,
		collectionHandles: collectionHandle ? [collectionHandle] : [],
		tryon_layout: tryonLayout,
		tryonLayout,
		tryon_layout_background_image: tryonLayoutBackground,
		tryonLayoutBackgroundImage: tryonLayoutBackground,
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

function resolveCtaBorderRadius(config: StorefrontConfig): number {
	const radius = Number(config.cta_button_border_radius);
	return Number.isFinite(radius) ? Math.max(0, Math.min(40, radius)) : 40;
}

function renderStorefrontCta(
	config: StorefrontConfig,
	onOpen: () => void,
) {
	const label = config.link_text || "Ver meu tamanho ideal";
	const primaryColor = config.primary_color || "#810707";
	const isButton = config.cta_type === "button";
	const radius = resolveCtaBorderRadius(config);

	if (!isButton) {
		return (
			<Link
				variant="link"
				onClick={onOpen}
				style={{
					color: primaryColor,
					fontWeight: "600",
					textDecoration: "underline",
					textUnderlineOffset: "3px",
				}}
			>
				{label}
			</Link>
		);
	}

	return (
		<Button
			variant="secondary"
			width="100%"
			onClick={onOpen}
			style={{
				border: `2px solid ${primaryColor}`,
				background: "#ffffff",
				color: primaryColor,
				borderRadius: `${radius}px`,
				padding: "12px 22px",
				fontSize: "15px",
				fontWeight: "600",
				lineHeight: "1.25",
				boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
			}}
		>
			<Text>{label}</Text>
		</Button>
	);
}

async function renderStorefrontWidget(
	nube: NubeSDK,
	config: StorefrontConfig,
	bootstrap: StorefrontBootstrap,
) {
	const product = getCurrentProduct(nube);
	const ctaSlot = getStorefrontCtaSlot(config);
	clearProductSlots(nube);

	if (config.widget_enabled === false) return;
	if (!product) return;
	const productHandle = getProductHandle(nube, product);
	const state = nube.getState();
	if (await shouldHideProductForConfig(product, config, state.store.id, productHandle)) return;
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
		renderStorefrontCta(config, () => {
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
		}),
	);
}

export function App(nube: NubeSDK) {
	let bootToken = 0;
	let themeRetryCount = 0;
	clearProductSlots(nube);

	const boot = async () => {
		const token = ++bootToken;
		const state = nube.getState();
		if (state.location.page.type !== "product") {
			clearProductSlots(nube);
			themeRetryCount = 0;
			return;
		}

		const themeName = getStorefrontThemeName();
		const bootstrap = await loadStorefrontBootstrap(
			state.store.id,
			state.store.domain,
			themeName,
		);
		if (token !== bootToken) return;
		if (!shouldUseStorefrontSdk(bootstrap)) {
			clearProductSlots(nube);
			if (
				!themeName &&
				bootstrap.ready &&
				bootstrap.storefront_sdk_enabled &&
				themeRetryCount < 10
			) {
				themeRetryCount += 1;
				window.setTimeout(() => {
					void boot();
				}, 150);
			}
			return;
		}
		themeRetryCount = 0;
		removeLegacyStorefrontCta();
		await renderStorefrontWidget(nube, bootstrap.config, bootstrap);
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
