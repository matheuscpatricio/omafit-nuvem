type GuardWindow = Window & {
	__omafitCartGuardsInstalled?: boolean;
	__omafitSdkActive?: boolean;
	__omafitCartClaims?: Record<string, number>;
	__omafitSuppressProductSubmitUntil?: number;
	__omafitAllowNextProductSubmit?: boolean;
	__omafitPerformCartAdd?: (payload: Record<string, unknown>) => void;
};

const CLAIM_TTL_MS = 10000;

function guardWindow(): GuardWindow | null {
	if (typeof window === "undefined") return null;
	return window as GuardWindow;
}

export function markStorefrontSdkActive(active: boolean): void {
	const w = guardWindow();
	if (!w) return;
	w.__omafitSdkActive = active;
}

export function registerStorefrontSdkCartAdd(
	perform: (payload: Record<string, unknown>) => void,
): void {
	const w = guardWindow();
	if (!w) return;
	w.__omafitPerformCartAdd = perform;
}

export function claimStorefrontCartAdd(
	requestId: string,
	now = Date.now(),
): boolean {
	const w = guardWindow();
	if (!w) return true;
	if (!w.__omafitCartClaims) w.__omafitCartClaims = {};
	const claims = w.__omafitCartClaims;
	for (const key of Object.keys(claims)) {
		if (now - claims[key] > CLAIM_TTL_MS) delete claims[key];
	}
	const id = String(requestId || "").trim() || `anon:${Math.floor(now / 1500)}`;
	if (claims[id]) return false;
	claims[id] = now;
	return true;
}

export function allowNextProductFormSubmit(): void {
	const w = guardWindow();
	if (!w) return;
	w.__omafitAllowNextProductSubmit = true;
}

export function suppressProductFormSubmit(durationMs = 4000): void {
	const w = guardWindow();
	if (!w) return;
	const until = Date.now() + durationMs;
	if ((w.__omafitSuppressProductSubmitUntil || 0) < until) {
		w.__omafitSuppressProductSubmitUntil = until;
	}
}

function isProductSubmitControl(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;
	const control = target.closest(
		".js-prod-submit-form, .js-addtocart, button[type='submit'], input[type='submit']",
	);
	if (!(control instanceof Element)) return false;
	return Boolean(
		control.closest("form, .js-product-form, [data-store^='product-form-']"),
	);
}

/**
 * Um único add por requestId, mesmo com vários scripts da vitrine.
 * Com NubeSDK ativo, o clique no formulário (script legado antigo) é engolido:
 * o tema Morelia soma um `cart:add` e um submit.
 */
export function installStorefrontCartGuards(): void {
	const w = guardWindow();
	if (!w || w.__omafitCartGuardsInstalled) return;
	if (typeof w.addEventListener !== "function") return;
	if (
		typeof EventTarget === "undefined" ||
		typeof EventTarget.prototype?.dispatchEvent !== "function"
	) {
		return;
	}
	w.__omafitCartGuardsInstalled = true;

	w.addEventListener(
		"message",
		(event: MessageEvent) => {
			const data = event.data as { type?: string; requestId?: string } | null;
			if (!data || data.type !== "omafit-add-to-cart-request") return;
			if (!w.__omafitSdkActive) return;
			const requestId = String(data.requestId || "").trim();
			if (!claimStorefrontCartAdd(requestId)) {
				event.stopImmediatePropagation();
				return;
			}
			suppressProductFormSubmit();
			event.stopImmediatePropagation();
			w.__omafitPerformCartAdd?.(data as Record<string, unknown>);
		},
		true,
	);

	const originalDispatch = EventTarget.prototype.dispatchEvent;
	EventTarget.prototype.dispatchEvent = function dispatchEventGuarded(
		event: Event,
	) {
		const until = w.__omafitSuppressProductSubmitUntil || 0;
		if (
			event?.type === "click" &&
			Date.now() < until &&
			isProductSubmitControl(this)
		) {
			if (w.__omafitAllowNextProductSubmit) {
				w.__omafitAllowNextProductSubmit = false;
				return originalDispatch.call(this, event);
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			return true;
		}
		return originalDispatch.call(this, event);
	};
}
