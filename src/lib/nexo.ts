export type Message<T = unknown> = {
	type: string;
	payload?: T;
};

export type Dispatch = <T = unknown>(message: Message<T>) => void;
export type Unsubscribe = () => void;
export type Subscribe = (type: string, callback: (payload: any) => void) => Unsubscribe;
export type OnReady = (callback: () => void) => void;

export type NexoClient = {
	clientId: string;
	dispatch: Dispatch;
	suscribe: Subscribe;
	onReady: OnReady;
};

export type StoreInfoResponse = {
	id: string;
	name: string;
	url: string;
	country: string;
	language: string;
	currency: string;
	languages: string[];
};

export type NavigateHeaderRequest = {
	goTo?: "back" | string;
	goToAdmin?: string;
	text?: string;
	remove?: boolean;
};

type Handler = (message: Message) => void;

export const ACTION_READY = "app/ready";
export const ACTION_CONNECTED = "app/connected";
export const ACTION_NAVIGATE_SYNC = "app/navigate/sync";
export const ACTION_NAVIGATE_PATHNAME = "app/navigate/pathname";
export const ACTION_NAVIGATE_HEADER = "app/navigate/header";
export const ACTION_STORE_INFO = "app/store/info";

function message<T = unknown>(type: string, payload?: T): Message<T> {
	return { type, payload };
}

function registerIframe(log = false) {
	const handlers: Handler[] = [];

	window.addEventListener("message", (event) => {
		for (const handler of handlers) {
			handler(event.data);
		}
	});

	const debug = (direction: "dispatched" | "received", type: string, payload?: unknown) => {
		if (!log) return;
		const color = direction === "dispatched" ? "#f5ec7f" : "#00cc35";
		console.group(`%c ${direction}`, `color: ${color}`);
		console.log("type", type);
		if (payload !== undefined) {
			console.log("payload", payload);
		}
		console.groupEnd();
	};

	return {
		dispatch(nextMessage: Message) {
			if (window.parent !== window) {
				debug("dispatched", nextMessage.type, nextMessage.payload);
				window.parent.postMessage(nextMessage, "*");
			}
		},
		suscribe(type: string, callback: (payload: any) => void) {
			const handler: Handler = (incomingMessage) => {
				if (incomingMessage?.type === type) {
					debug("received", incomingMessage.type, incomingMessage.payload);
					callback(incomingMessage.payload);
				}
			};
			handlers.push(handler);
			return () => {
				const index = handlers.indexOf(handler);
				if (index >= 0) {
					handlers.splice(index, 1);
				}
			};
		},
	};
}

export function create({
	clientId,
	log,
}: {
	clientId: string;
	log?: boolean;
}): NexoClient {
	let readyRegistered = false;
	const { dispatch, suscribe } = registerIframe(Boolean(log));

	return {
		clientId,
		dispatch,
		suscribe,
		onReady(callback) {
			if (readyRegistered) {
				throw new Error("onReady should be run only once");
			}
			const unsubscribe = suscribe(ACTION_CONNECTED, () => {
				callback();
				unsubscribe();
				readyRegistered = true;
			});
			dispatch(message(ACTION_CONNECTED));
		},
	};
}

export function connect(nexo: NexoClient, ttl = 3000): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => reject(new Error("Timeout")), ttl);
		nexo.onReady(() => {
			resolve();
			window.clearTimeout(timeout);
		});
	});
}

export function iAmReady(nexo: NexoClient) {
	nexo.dispatch(message(ACTION_READY));
}

function asyncAction<TResponse = unknown, TRequest = unknown>(
	nexo: NexoClient,
	type: string,
	payload?: TRequest,
): Promise<TResponse> {
	return new Promise((resolve) => {
		const unsubscribe = nexo.suscribe(type, (responsePayload) => {
			resolve(responsePayload as TResponse);
			unsubscribe();
		});
		nexo.dispatch(message(type, payload));
	});
}

export function getStoreInfo(nexo: NexoClient): Promise<StoreInfoResponse> {
	return asyncAction<StoreInfoResponse>(nexo, ACTION_STORE_INFO);
}

export function syncPathname(nexo: NexoClient, pathname: string) {
	nexo.dispatch(message(ACTION_NAVIGATE_SYNC, { pathname }));
}

export function navigateHeader(nexo: NexoClient, config: NavigateHeaderRequest) {
	nexo.dispatch(message(ACTION_NAVIGATE_HEADER, config));
}

const nexo = {
	create,
	connect,
	iAmReady,
	getStoreInfo,
	syncPathname,
	navigateHeader,
	ACTION_READY,
	ACTION_CONNECTED,
	ACTION_NAVIGATE_SYNC,
	ACTION_NAVIGATE_PATHNAME,
	ACTION_NAVIGATE_HEADER,
	ACTION_STORE_INFO,
};

export default nexo;
