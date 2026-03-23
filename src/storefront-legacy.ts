type LegacyStorefrontConfig = {
	link_text: string;
	store_logo?: string | null;
	primary_color?: string;
	widget_enabled: boolean;
	excluded_collections: string[];
};

type LegacyStorefrontResponse = {
	config?: LegacyStorefrontConfig | null;
	widgetUrl?: string | null;
};

type LegacyStoreContext = {
	id: string;
	domain: string;
};

type LegacyProductContext = {
	name: string;
	handle: string;
	productId: string;
	variantId: string;
	imageUrl: string;
	imageUrls: string[];
};

declare global {
	interface Window {
		LS?: {
			store?: {
				id?: number | string;
				url?: string;
				custom_url?: string;
			};
		};
	}
}

const DEFAULT_APP_BASE = "https://omafit-nuvem-production.up.railway.app";
const CTA_WRAPPER_ID = "omafit-legacy-wrapper";
const CTA_BUTTON_ID = "omafit-legacy-button";
const MODAL_ID = "omafit-legacy-modal";
const STYLE_ID = "omafit-legacy-style";

function debugLog(message: string, data: Record<string, unknown>, hypothesisId: string) {
	// #region agent log
	fetch('http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b68c2f'},body:JSON.stringify({sessionId:'b68c2f',runId:'legacy-storefront-debug',hypothesisId,location:'src/storefront-legacy.ts',message,data,timestamp:Date.now()})}).catch(()=>{});
	// #endregion
	console.info("[Omafit Legacy Debug]", hypothesisId, message, data);
}

function getAppBaseUrl(): string {
	const currentScript = document.currentScript as HTMLScriptElement | null;
	if (currentScript?.src) {
		return new URL(currentScript.src).origin;
	}
	const script = Array.from(document.scripts).find((item) =>
		(item as HTMLScriptElement).src.includes("legacy-storefront.min.js"),
	) as HTMLScriptElement | undefined;
	if (script?.src) {
		return new URL(script.src).origin;
	}
	return DEFAULT_APP_BASE;
}

function getStoreContext(): LegacyStoreContext | null {
	const store = window.LS?.store;
	const id = String(store?.id || "").trim();
	const domain = String(store?.custom_url || store?.url || window.location.hostname).trim();
	if (!id || !domain) return null;
	return { id, domain };
}

function getProductContext(): LegacyProductContext | null {
	const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || window.location.href;
	const handle = canonical.split("/produtos/")[1]?.replace(/\/+$/, "") || "";
	const name =
		document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ||
		document.querySelector("h1")?.textContent?.trim() ||
		document.title;
	const variantId =
		document.querySelector<HTMLInputElement>('input[name="add_to_cart"]')?.value?.trim() || "";
	const productId =
		document.querySelector<HTMLFormElement>('[data-store^="product-form-"]')
			?.getAttribute("data-store")
			?.replace("product-form-", "")
			?.trim() || variantId;
	const imageCandidates = Array.from(
		new Set(
			[
				document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content || "",
				...Array.from(document.querySelectorAll<HTMLImageElement>("img")).map(
					(image) =>
						image.currentSrc ||
						image.src ||
						image.getAttribute("data-src") ||
						image.getAttribute("data-zoom") ||
						"",
				),
			]
				.map((value) => String(value || "").trim())
				.filter((value) => /^https?:\/\//.test(value)),
		),
	).slice(0, 8);
	if (!handle || !name) return null;
	return {
		name,
		handle,
		productId,
		variantId,
		imageUrl: imageCandidates[0] || "",
		imageUrls: imageCandidates,
	};
}

async function loadConfig(appBaseUrl: string, storeId: string) {
	const endpoint = `${appBaseUrl}/api/storefront/widget-config?store_id=${encodeURIComponent(storeId)}`;
	try {
		debugLog("load_config_start", { endpoint, storeId }, "L1");
		const response = await fetch(endpoint, { mode: "cors" });
		if (!response.ok) throw new Error(`request failed: ${response.status}`);
		const data = (await response.json()) as LegacyStorefrontResponse;
		const config = data.config || {
			link_text: "Ver meu tamanho ideal",
			widget_enabled: true,
			excluded_collections: [],
			primary_color: "#810707",
		};
		debugLog(
			"load_config_success",
			{
				storeId,
				widgetEnabled: config.widget_enabled,
				widgetUrl: String(data.widgetUrl || `${appBaseUrl}/widget.html`),
			},
			"L1",
		);
		return {
			config,
			widgetUrl: String(data.widgetUrl || `${appBaseUrl}/widget.html`),
		};
	} catch (error) {
		debugLog(
			"load_config_error",
			{
				storeId,
				error: error instanceof Error ? error.message : String(error),
			},
			"L1",
		);
		return {
			config: {
				link_text: "Ver meu tamanho ideal",
				widget_enabled: true,
				excluded_collections: [],
				primary_color: "#810707",
			},
			widgetUrl: `${appBaseUrl}/widget.html`,
		};
	}
}

function buildWidgetUrl(
	baseUrl: string,
	store: LegacyStoreContext,
	product: LegacyProductContext,
	config: LegacyStorefrontConfig,
) {
	const widgetUrl = new URL(baseUrl);
	widgetUrl.searchParams.set("platform", "nuvemshop");
	widgetUrl.searchParams.set("store_id", store.id);
	widgetUrl.searchParams.set("store_domain", store.domain);
	widgetUrl.searchParams.set("product_id", product.productId || product.variantId || product.handle);
	widgetUrl.searchParams.set("variant_id", product.variantId || "");
	widgetUrl.searchParams.set("product_name", product.name);
	widgetUrl.searchParams.set("product_handle", product.handle);
	if (product.imageUrl) widgetUrl.searchParams.set("product_image", product.imageUrl);
	if (product.imageUrls.length) {
		widgetUrl.searchParams.set("product_images", JSON.stringify(product.imageUrls));
	}
	if (config.store_logo) widgetUrl.searchParams.set("store_logo", config.store_logo);
	if (config.primary_color) widgetUrl.searchParams.set("primary_color", config.primary_color);
	return widgetUrl.toString();
}

function getCurrentVariantId() {
	return document.querySelector<HTMLInputElement>('input[name="add_to_cart"]')?.value?.trim() || "";
}

function normalizeText(value: string) {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim();
}

function findProductForm() {
	return (
		document.querySelector<HTMLFormElement>(".js-product-form") ||
		document.querySelector<HTMLFormElement>('[data-store^="product-form-"]')
	);
}

function trySelectSizeOption(desiredSize: string) {
	const normalizedDesiredSize = normalizeText(desiredSize);
	if (!normalizedDesiredSize) return false;
	const form = findProductForm();
	if (!form) return false;

	const selects = Array.from(form.querySelectorAll<HTMLSelectElement>("select"));
	for (const select of selects) {
		const option = Array.from(select.options).find((item) => {
			const haystack = normalizeText(`${item.label} ${item.text} ${item.value}`);
			return haystack === normalizedDesiredSize;
		});
		if (option) {
			select.value = option.value;
			select.dispatchEvent(new Event("change", { bubbles: true }));
			return true;
		}
	}

	const clickables = Array.from(
		form.querySelectorAll<HTMLElement>(
			'input[type="radio"], button, a, label, [data-value], [data-option-value]',
		),
	);
	for (const element of clickables) {
		const haystack = normalizeText(
			[
				element.getAttribute("value"),
				element.getAttribute("data-value"),
				element.getAttribute("data-option-value"),
				element.getAttribute("aria-label"),
				element.textContent,
			]
				.filter(Boolean)
				.join(" "),
		);
		if (haystack === normalizedDesiredSize) {
			element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			return true;
		}
	}

	return false;
}

function postCartResult(ok: boolean, message: string) {
	const iframe = document.querySelector<HTMLIFrameElement>(`#${MODAL_ID} iframe`);
	if (!iframe?.contentWindow) return;
	iframe.contentWindow.postMessage(
		{
			type: "omafit-add-to-cart-result",
			ok,
			message,
		},
		"*",
	);
}

function attachMessageBridge() {
	if ((window as Window & { __omafitBridgeAttached?: boolean }).__omafitBridgeAttached) return;
	(window as Window & { __omafitBridgeAttached?: boolean }).__omafitBridgeAttached = true;

	window.addEventListener("message", (event) => {
		if (event.data?.type !== "omafit-add-to-cart-request") return;
		const desiredSize = String(event.data?.selection?.recommended_size || "").trim();
		const sizeMatched = desiredSize ? trySelectSizeOption(desiredSize) : false;
		const form = findProductForm();
		const submitButton =
			form?.querySelector<HTMLElement>(".js-prod-submit-form") ||
			form?.querySelector<HTMLElement>('button[type="submit"]') ||
			form?.querySelector<HTMLElement>('input[type="submit"]');
		const beforeVariantId = getCurrentVariantId();

		window.setTimeout(() => {
			if (submitButton) {
				submitButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
				postCartResult(
					true,
					sizeMatched
						? "Produto adicionado ao carrinho com o tamanho recomendado."
						: beforeVariantId
							? "Produto adicionado ao carrinho com a seleção atual da página."
							: "Omafit enviou a solicitação para o carrinho.",
				);
				return;
			}
			if (form) {
				form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
				postCartResult(true, "Omafit enviou a solicitação para o carrinho.");
				return;
			}
			postCartResult(false, "Nao foi possivel localizar o formulario de compra.");
		}, sizeMatched ? 500 : 120);
	});
}

function ensureStyles(primaryColor: string) {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = `
#${CTA_WRAPPER_ID} {
  width: 100%;
  margin-top: 12px;
}
#${CTA_BUTTON_ID} {
  width: 100%;
  border: 1px solid ${primaryColor || "#810707"};
  background: transparent;
  color: ${primaryColor || "#810707"};
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
#${CTA_BUTTON_ID}:hover {
  opacity: 0.9;
}
#${MODAL_ID} {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 99999;
}
#${MODAL_ID}[hidden] {
  display: none;
}
#${MODAL_ID} .omafit-modal-card {
  width: min(960px, 100%);
  height: min(760px, 100%);
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto 1fr;
}
#${MODAL_ID} .omafit-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb;
  font-family: Arial, sans-serif;
}
#${MODAL_ID} .omafit-modal-close {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}
#${MODAL_ID} iframe {
  width: 100%;
  height: 100%;
  border: 0;
}
`;
	document.head.appendChild(style);
}

function getMountTarget() {
	const buyContainer = document.querySelector<HTMLElement>(".js-buy-button-container");
	if (!buyContainer) return null;
	return buyContainer.closest(".row") || buyContainer;
}

function ensureModal(widgetUrl: string) {
	let modal = document.getElementById(MODAL_ID);
	if (!modal) {
		modal = document.createElement("div");
		modal.id = MODAL_ID;
		modal.hidden = true;
		modal.innerHTML = `
      <div class="omafit-modal-card" role="dialog" aria-modal="true" aria-label="Omafit">
        <div class="omafit-modal-header">
          <strong>Omafit</strong>
          <button type="button" class="omafit-modal-close" aria-label="Fechar">×</button>
        </div>
        <iframe title="Omafit" src=""></iframe>
      </div>
    `;
		document.body.appendChild(modal);
		modal.addEventListener("click", (event) => {
			if (event.target === modal) {
				modal.hidden = true;
			}
		});
		modal.querySelector(".omafit-modal-close")?.addEventListener("click", () => {
			modal.hidden = true;
		});
	}
	const iframe = modal.querySelector("iframe");
	if (iframe instanceof HTMLIFrameElement) {
		iframe.src = widgetUrl;
	}
	return modal;
}

function renderButton(
	store: LegacyStoreContext,
	product: LegacyProductContext,
	config: LegacyStorefrontConfig,
	widgetBaseUrl: string,
) {
	if (config.widget_enabled === false) {
		debugLog("render_skipped_disabled", { storeId: store.id }, "L2");
		return;
	}
	const mountTarget = getMountTarget();
	if (!mountTarget) {
		debugLog("render_missing_mount", { selector: ".js-buy-button-container" }, "L2");
		return;
	}
	const widgetUrl = buildWidgetUrl(widgetBaseUrl, store, product, config);
	ensureStyles(config.primary_color || "#810707");
	let wrapper = document.getElementById(CTA_WRAPPER_ID);
	if (!wrapper) {
		wrapper = document.createElement("div");
		wrapper.id = CTA_WRAPPER_ID;
		wrapper.innerHTML = `<button id="${CTA_BUTTON_ID}" type="button"></button>`;
		mountTarget.insertAdjacentElement("afterend", wrapper);
	}
	const button = wrapper.querySelector<HTMLButtonElement>(`#${CTA_BUTTON_ID}`);
	if (!button) return;
	button.textContent = config.link_text || "Ver meu tamanho ideal";
	button.onclick = () => {
		const modal = ensureModal(widgetUrl);
		modal.hidden = false;
	};
	debugLog(
		"render_button_complete",
		{
			storeId: store.id,
			productHandle: product.handle,
			mountFound: true,
			widgetUrl,
		},
		"L2",
	);
}

async function init() {
	const store = getStoreContext();
	const product = getProductContext();
	attachMessageBridge();
	debugLog(
		"legacy_init",
		{
			href: window.location.href,
			storeId: store?.id || null,
			storeDomain: store?.domain || null,
			productHandle: product?.handle || null,
			hasProductForm: Boolean(document.querySelector(".js-product-form")),
			hasBuyContainer: Boolean(document.querySelector(".js-buy-button-container")),
		},
		"L0",
	);
	if (!store || !product) return;
	const appBaseUrl = getAppBaseUrl();
	const { config, widgetUrl } = await loadConfig(appBaseUrl, store.id);
	renderButton(store, product, config, widgetUrl);
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", () => {
		void init();
	});
} else {
	void init();
}
