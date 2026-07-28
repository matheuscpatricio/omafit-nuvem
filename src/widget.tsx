import React from "react";
import { createRoot } from "react-dom/client";
import { WidgetPage } from "./widget-app/WidgetPage";
import { WidgetErrorBoundary } from "./widget-app/WidgetErrorBoundary";

function readWidgetProductKey(): string {
	if (typeof window === "undefined") return "";
	const params = new URLSearchParams(window.location.search);
	return (
		params.get("product_id") ||
		params.get("productId") ||
		params.get("product_handle") ||
		params.get("productHandle") ||
		""
	).trim();
}

function WidgetRoot() {
	const [productKey, setProductKey] = React.useState(readWidgetProductKey);

	React.useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const type = event?.data?.type;
			if (type !== "omafit-context" && type !== "omafit-config-update") return;
			const nextId = String(event.data.productId || event.data.product_id || "").trim();
			const nextHandle = String(event.data.productHandle || event.data.product_handle || "").trim();
			const nextKey = nextId || nextHandle;
			if (!nextKey) return;
			setProductKey((prev) => (prev === nextKey ? prev : nextKey));
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	return (
		<WidgetErrorBoundary key={productKey}>
			<WidgetPage key={productKey} />
		</WidgetErrorBoundary>
	);
}

const mountNode = document.getElementById("app");

if (mountNode) {
	createRoot(mountNode).render(
		<React.StrictMode>
			<WidgetRoot />
		</React.StrictMode>,
	);
}
