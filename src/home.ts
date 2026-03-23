import React from "react";
import { createRoot } from "react-dom/client";
import nexo, { connect, getStoreInfo, iAmReady } from "./lib/nexo";
import { OmafitAdminApp } from "./admin-app/App";

function debugLog(
	message: string,
	data: Record<string, unknown>,
	hypothesisId: string,
) {
	// #region agent log
	fetch('http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b68c2f'},body:JSON.stringify({sessionId:'b68c2f',runId:'pre-fix',hypothesisId,location:'src/home.ts',message,data,timestamp:Date.now()})}).catch(()=>{});
	// #endregion
}

function getClientId(): string {
	if (typeof window === "undefined") return "";
	const params = new URLSearchParams(window.location.search);
	return params.get("client_id") || params.get("clientId") || "";
}

function renderFatalError(message: string) {
	const rootElement = document.getElementById("app");
	if (!rootElement) return;
	const root = createRoot(rootElement);
	root.render(
		React.createElement(
			"div",
			{
				style: {
					minHeight: "100vh",
					padding: "32px",
					fontFamily: 'Inter, system-ui, sans-serif',
					background: "#f5f7fb",
					color: "#111827",
				},
			},
			React.createElement(
				"div",
				{
					style: {
						maxWidth: "720px",
						margin: "0 auto",
						background: "#ffffff",
						border: "1px solid #e5e7eb",
						borderRadius: "18px",
						padding: "24px",
					},
				},
				React.createElement("h1", null, "Omafit"),
				React.createElement("p", null, message),
			),
		),
	);
}

async function bootstrap() {
	const clientId = getClientId();
	debugLog(
		"bootstrap_start",
		{
			href: typeof window !== "undefined" ? window.location.href : "",
			clientIdPresent: Boolean(clientId),
		},
		"H3",
	);
	if (!clientId) {
		debugLog("bootstrap_missing_client_id", {}, "H4");
		renderFatalError(
			"client_id nao encontrado na URL. Configure o App ID da Nuvemshop no Partner Portal.",
		);
		return;
	}

	const rootElement = document.getElementById("app");
	if (!rootElement) {
		throw new Error("Elemento #app nao encontrado.");
	}

	const instance = nexo.create({
		clientId,
		log: false,
	});

	debugLog("before_connect", { clientIdLength: clientId.length }, "H4");
	await connect(instance);
	debugLog("after_connect", { clientIdLength: clientId.length }, "H4");
	const storeInfo = await getStoreInfo(instance);
	debugLog(
		"store_info_loaded",
		{
			storeId: storeInfo.id,
			storeUrl: storeInfo.url,
			language: storeInfo.language,
			currency: storeInfo.currency,
		},
		"H4",
	);

	const root = createRoot(rootElement);
	root.render(
		React.createElement(OmafitAdminApp, {
			nexo: instance,
			store: {
				id: storeInfo.id,
				name: storeInfo.name,
				url: storeInfo.url,
				language: storeInfo.language || "pt",
				currency: storeInfo.currency || "BRL",
				country: storeInfo.country,
			},
		}),
	);
	debugLog("react_render_complete", { storeId: storeInfo.id }, "H4");
	iAmReady(instance);
	debugLog("iamready_sent", { storeId: storeInfo.id }, "H4");
}

bootstrap().catch((error) => {
	console.error("[Omafit] Failed to bootstrap admin app:", error);
	debugLog(
		"bootstrap_catch",
		{
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : null,
		},
		"H4",
	);
	renderFatalError(
		`Nao foi possivel inicializar o painel integrado. ${error instanceof Error ? error.message : ""}`,
	);
});
