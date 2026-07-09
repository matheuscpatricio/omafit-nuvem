import { useCallback, useEffect, useState } from "react";
import { cardStyle, subtleTextStyle } from "./adminUi";

const META_WHATSAPP_MANAGER_URL = "https://business.facebook.com/wa/manage/home/";

type Props = {
	withStoreQuery: (path: string) => string;
	collections: Array<{ handle: string; title: string }>;
	onNotice: (message: string) => void;
	onError: (message: string) => void;
	planLocked?: boolean;
	onUpgrade?: () => void;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
	const response = await fetch(url, options);
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(payload.error || "Request failed");
	}
	return payload as T;
}

export function TryOnMarketingSection({
	withStoreQuery,
	collections,
	onNotice,
	onError,
	planLocked = false,
	onUpgrade,
}: Props) {
	const [loading, setLoading] = useState(true);
	const [connection, setConnection] = useState<{ connected?: boolean; display_phone?: string } | null>(null);
	const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
	const [phoneNumberId, setPhoneNumberId] = useState("");
	const [accessToken, setAccessToken] = useState("");
	const [wabaId, setWabaId] = useState("");
	const [campaignName, setCampaignName] = useState("");
	const [collectionHandle, setCollectionHandle] = useState("");

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [conn, met] = await Promise.all([
				fetchJson<{ connected?: boolean; display_phone?: string }>(withStoreQuery("/api/whatsapp/connection")),
				fetchJson<Record<string, number>>(withStoreQuery("/api/whatsapp/metrics")),
			]);
			setConnection(conn);
			setMetrics(met);
		} catch (error) {
			onError(error instanceof Error ? error.message : "Erro ao carregar Try On Marketing");
		} finally {
			setLoading(false);
		}
	}, [onError, withStoreQuery]);

	useEffect(() => {
		if (!planLocked) void load();
	}, [load, planLocked]);

	if (planLocked) {
		return (
			<div style={{ ...cardStyle, display: "grid", gap: 12 }}>
				<strong>Try On Marketing — WhatsApp</strong>
				<span style={subtleTextStyle}>
					Disponível apenas no plano Growth ou superior. Faça upgrade para conectar WABA e enviar campanhas.
				</span>
				{onUpgrade ? (
					<button type="button" className="omafit-admin-btn omafit-admin-btn--primary" onClick={onUpgrade}>
						Ver planos
					</button>
				) : null}
			</div>
		);
	}

	const connect = async () => {
		try {
			await fetchJson(withStoreQuery("/api/whatsapp/connect"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					phone_number_id: phoneNumberId,
					access_token: accessToken,
					waba_id: wabaId || null,
				}),
			});
			onNotice("WhatsApp conectado.");
			await load();
		} catch (error) {
			onError(error instanceof Error ? error.message : "Falha ao conectar");
		}
	};

	const createCampaign = async () => {
		if (!collectionHandle) {
			onError("Selecione uma coleção — cada destinatário recebe um try-on personalizado.");
			return;
		}
		try {
			const seg = await fetchJson<{ segment: { id: string } }>(withStoreQuery("/api/whatsapp/segments"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "Opt-in + foto (30 dias)",
					filter_json: {
						has_marketing_consent: true,
						has_photo_consent: true,
						tryon_since_days: 30,
					},
				}),
			});
			await fetchJson(withStoreQuery("/api/whatsapp/campaigns"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: campaignName || "Campanha Try On",
					segment_id: seg.segment.id,
					promoted_collection_handles: [collectionHandle],
					materialize: true,
					confirm: true,
				}),
			});
			onNotice("Campanha criada.");
			setCampaignName("");
			await load();
		} catch (error) {
			onError(error instanceof Error ? error.message : "Falha ao criar campanha");
		}
	};

	if (loading) {
		return <div style={cardStyle}>Carregando Try On Marketing…</div>;
	}

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 12 }}>
				<strong>Try On Marketing — WhatsApp</strong>
				<span style={subtleTextStyle}>
					{connection?.connected
						? `Conectado: ${connection.display_phone || "WABA ativo"}`
						: "Conecte seu número WhatsApp Business (WABA)."}
				</span>
				<a
					href={META_WHATSAPP_MANAGER_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="omafit-admin-btn omafit-admin-btn--secondary"
					style={{ textAlign: "center", textDecoration: "none" }}
				>
					Abrir Meta Business Manager (WhatsApp)
				</a>
				<label>
					Phone Number ID
					<input className="omafit-admin-input" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
				</label>
				<label>
					WABA ID
					<input className="omafit-admin-input" value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
				</label>
				<label>
					Access Token
					<input className="omafit-admin-input" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
				</label>
				<button type="button" className="omafit-admin-btn omafit-admin-btn--primary" onClick={() => void connect()}>
					Salvar conexão
				</button>
			</div>

			<div style={{ ...cardStyle, display: "grid", gap: 8 }}>
				<strong>Métricas</strong>
				<span style={subtleTextStyle}>Opt-ins: {metrics?.opt_in_count ?? 0}</span>
				<span style={subtleTextStyle}>Entregues: {metrics?.messages_delivered ?? 0}</span>
			</div>

			<div style={{ ...cardStyle, display: "grid", gap: 12 }}>
				<strong>Nova campanha</strong>
				<span style={subtleTextStyle}>
					Cada destinatário recebe um try-on personalizado (foto + peça da coleção) no WhatsApp.
				</span>
				<input
					className="omafit-admin-input"
					placeholder="Nome da campanha"
					value={campaignName}
					onChange={(e) => setCampaignName(e.target.value)}
				/>
				<select
					className="omafit-admin-select"
					value={collectionHandle}
					onChange={(e) => setCollectionHandle(e.target.value)}
				>
					<option value="">Selecione a coleção (obrigatório)</option>
					{collections.map((c) => (
						<option key={c.handle} value={c.handle}>
							{c.title || c.handle}
						</option>
					))}
				</select>
				<button type="button" className="omafit-admin-btn omafit-admin-btn--primary" onClick={() => void createCampaign()}>
					Criar campanha
				</button>
			</div>
		</div>
	);
}
