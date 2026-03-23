import React from "react";
import { createRoot } from "react-dom/client";
import nexo, { connect, getStoreInfo, iAmReady } from "./lib/nexo";
import { OmafitAdminApp } from "./admin-app/App";

let bootRoot: ReturnType<typeof createRoot> | null = null;

function debugLog(
	message: string,
	data: Record<string, unknown>,
	hypothesisId: string,
) {
	// #region agent log
	fetch('http://127.0.0.1:7523/ingest/ebd119e5-639e-45b4-9806-782ca57f574c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b68c2f'},body:JSON.stringify({sessionId:'b68c2f',runId:'pre-fix',hypothesisId,location:'src/home.ts',message,data,timestamp:Date.now()})}).catch(()=>{});
	// #endregion
	console.info("[Omafit Debug]", hypothesisId, message, data);
}

function getOrCreateRoot(element: HTMLElement) {
	if (!bootRoot) {
		bootRoot = createRoot(element);
	}
	return bootRoot;
}

function renderBootState(stage: string, detail?: string) {
	const rootElement = document.getElementById("app");
	if (!rootElement) return;
	const root = getOrCreateRoot(rootElement);
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
						display: "grid",
						gap: "12px",
					},
				},
				React.createElement("h1", null, "Omafit"),
				React.createElement("strong", null, `Etapa: ${stage}`),
				React.createElement("p", { style: { margin: 0 } }, detail || "Inicializando painel..."),
			),
		),
	);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			reject(new Error(`${label} timeout after ${timeoutMs}ms`));
		}, timeoutMs);
		promise.then(
			(value) => {
				window.clearTimeout(timeout);
				resolve(value);
			},
			(error) => {
				window.clearTimeout(timeout);
				reject(error);
			},
		);
	});
}

function getClientIdDetails() {
	if (typeof window === "undefined") {
		return {
			clientId: "",
			queryClientId: "",
			queryClientIdAlt: "",
			referrer: "",
			referrerClientId: "",
		};
	}
	const params = new URLSearchParams(window.location.search);
	const queryClientId = params.get("client_id") || "";
	const queryClientIdAlt = params.get("clientId") || "";
	const referrer = document.referrer || "";
	const referrerClientId = referrer.match(/\/admin\/apps\/(\d+)/)?.[1] || "";
	return {
		clientId: queryClientId || queryClientIdAlt,
		queryClientId,
		queryClientIdAlt,
		referrer,
		referrerClientId,
	};
}

function renderFatalError(message: string) {
	const rootElement = document.getElementById("app");
	if (!rootElement) return;
	const root = getOrCreateRoot(rootElement);
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
	const clientIdDetails = getClientIdDetails();
	const clientId = clientIdDetails.clientId;
	renderBootState("bootstrap:start", "Carregando configuracao inicial...");
	debugLog(
		"bootstrap_start",
		{
			href: typeof window !== "undefined" ? window.location.href : "",
			clientIdPresent: Boolean(clientId),
			queryClientId: clientIdDetails.queryClientId || null,
			queryClientIdAlt: clientIdDetails.queryClientIdAlt || null,
			referrer: clientIdDetails.referrer || null,
			referrerClientId: clientIdDetails.referrerClientId || null,
		},
		"H3",
	);
	if (!clientId) {
		debugLog(
			"bootstrap_missing_client_id",
			{
				referrer: clientIdDetails.referrer || null,
				referrerClientId: clientIdDetails.referrerClientId || null,
			},
			"H4",
		);
		renderFatalError(
			`client_id nao encontrado na URL. Referrer detectado: ${clientIdDetails.referrer || "nenhum"}.`,
		);
		return;
	}

	const rootElement = document.getElementById("app");
	if (!rootElement) {
		throw new Error("Elemento #app nao encontrado.");
	}

	const instance = nexo.create({
		clientId,
		log: true,
	});

	renderBootState("nexo:connect", "Aguardando handshake com o admin da Nuvemshop...");
	debugLog("before_connect", { clientIdLength: clientId.length }, "H4");
	await withTimeout(connect(instance), 4000, "connect");
	debugLog("after_connect", { clientIdLength: clientId.length }, "H4");
	renderBootState("store:info", "Conexao estabelecida. Buscando dados da loja...");
	const storeInfo = await withTimeout(getStoreInfo(instance), 4000, "getStoreInfo");
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

	renderBootState("react:render", "Renderizando interface do painel...");
	const root = getOrCreateRoot(rootElement);
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
