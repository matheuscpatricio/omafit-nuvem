import React from "react";
import { createRoot } from "react-dom/client";
import nexo, { connect, getStoreInfo, iAmReady } from "@tiendanube/nexo";
import { OmafitAdminApp } from "./admin-app/App";

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
	if (!clientId) {
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

	await connect(instance);
	const storeInfo = await getStoreInfo(instance);

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
	iAmReady(instance);
}

bootstrap().catch((error) => {
	console.error("[Omafit] Failed to bootstrap admin app:", error);
	renderFatalError(
		`Nao foi possivel inicializar o painel integrado. ${error instanceof Error ? error.message : ""}`,
	);
});
