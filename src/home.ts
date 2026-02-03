/**
 * Script da home do app (iframe no painel Nuvemshop).
 * O painel só mostra o iframe depois que a app chama iAmReady(nexo).
 * clientId: vem da URL (?client_id=xxx) ou do Portal do Parceiro (App ID).
 */
import nexo from "@tiendanube/nexo";
import { connect, iAmReady } from "@tiendanube/nexo/helpers";
import { ACTION_NAVIGATE_SYNC } from "@tiendanube/nexo/actions";

function getClientId(): string {
	if (typeof window === "undefined") return "";
	const params = new URLSearchParams(window.location.search);
	return params.get("client_id") || params.get("clientId") || "";
}

const clientId = getClientId();
if (!clientId) {
	console.warn("[Omafit] client_id não encontrado na URL. Use ?client_id=SEU_APP_ID (App ID do Portal do Parceiro).");
}

const instance = nexo.create({
	clientId: clientId || "placeholder",
	log: false,
});

connect(instance)
	.then(() => {
		iAmReady(instance);
		// Obrigatório após iAmReady: escutar ACTION_NAVIGATE_SYNC
		instance.subscribe(ACTION_NAVIGATE_SYNC, () => {});
	})
	.catch((err) => {
		console.error("[Omafit] Nexo connect failed:", err);
	});
