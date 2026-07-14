import { useCallback, useEffect, useState } from "react";
import { cardStyle, subtleTextStyle } from "./adminUi";
import { useI18n } from "./i18n";

const META_WHATSAPP_MANAGER_URL = "https://business.facebook.com/wa/manage/home/";

type Props = {
	withStoreQuery: (path: string) => string;
	collections: Array<{ handle: string; title: string }>;
	onNotice: (message: string) => void;
	onError: (message: string) => void;
	planLocked?: boolean;
	onUpgrade?: () => void;
};

type PreviewResponse = {
	count?: number;
	estimated_cost_usd?: number;
	generation_mode?: string;
};

type CampaignMode = "personalized_tryon" | "existing_tryon";

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
	const { t } = useI18n();
	const [loading, setLoading] = useState(true);
	const [connection, setConnection] = useState<{ connected?: boolean; display_phone?: string } | null>(null);
	const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
	const [phoneNumberId, setPhoneNumberId] = useState("");
	const [accessToken, setAccessToken] = useState("");
	const [wabaId, setWabaId] = useState("");
	const [campaignName, setCampaignName] = useState("");
	const [campaignMode, setCampaignMode] = useState<CampaignMode>("personalized_tryon");
	const [collectionHandle, setCollectionHandle] = useState("");
	const [preview, setPreview] = useState<PreviewResponse | null>(null);
	const [showConnectionForm, setShowConnectionForm] = useState(false);
	const [showAdvancedConnection, setShowAdvancedConnection] = useState(false);

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
			onError(error instanceof Error ? error.message : t("tryOnMarketing.loadError"));
		} finally {
			setLoading(false);
		}
	}, [onError, t, withStoreQuery]);

	useEffect(() => {
		if (!planLocked) void load();
	}, [load, planLocked]);

	useEffect(() => {
		if (!connection?.connected) {
			setShowConnectionForm(true);
		}
	}, [connection?.connected]);

	if (planLocked) {
		return (
			<div style={{ ...cardStyle, display: "grid", gap: 12 }}>
				<strong>{t("tryOnMarketing.title")}</strong>
				<span style={subtleTextStyle}>{t("tryOnMarketing.planLocked")}</span>
				{onUpgrade ? (
					<button type="button" className="omafit-admin-btn omafit-admin-btn--primary" onClick={onUpgrade}>
						{t("tryOnMarketing.viewPlans")}
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
			onNotice(t("tryOnMarketing.connectSuccess"));
			setShowConnectionForm(false);
			await load();
		} catch (error) {
			onError(error instanceof Error ? error.message : t("feedback.error"));
		}
	};

	const isExistingPhotoMode = campaignMode === "existing_tryon";

	const buildCampaignPayload = () => ({
		filter_json: {
			has_marketing_consent: true,
			has_photo_consent: !isExistingPhotoMode,
			tryon_since_days: 30,
			product_handles: [],
		},
		promoted_collection_handles: collectionHandle ? [collectionHandle] : [],
		generation_mode: campaignMode,
	});

	const handlePreview = async () => {
		if (!isExistingPhotoMode && !collectionHandle) {
			onError(t("tryOnMarketing.selectCollectionError"));
			return;
		}
		try {
			const res = await fetchJson<PreviewResponse>(withStoreQuery("/api/whatsapp/segments/preview"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(buildCampaignPayload()),
			});
			setPreview(res);
		} catch (error) {
			onError(error instanceof Error ? error.message : t("feedback.error"));
		}
	};

	const createCampaign = async () => {
		if (!isExistingPhotoMode && !collectionHandle) {
			onError(t("tryOnMarketing.selectCollectionError"));
			return;
		}
		try {
			const seg = await fetchJson<{ segment: { id: string } }>(withStoreQuery("/api/whatsapp/segments"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: isExistingPhotoMode
						? t("tryOnMarketing.segmentDefaultNameExisting")
						: t("tryOnMarketing.segmentDefaultName"),
					filter_json: {
						has_marketing_consent: true,
						has_photo_consent: !isExistingPhotoMode,
						tryon_since_days: 30,
					},
				}),
			});
			await fetchJson(withStoreQuery("/api/whatsapp/campaigns"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: campaignName || t("tryOnMarketing.newCampaignTitle"),
					segment_id: seg.segment.id,
					promoted_collection_handles: collectionHandle ? [collectionHandle] : [],
					generation_mode: campaignMode,
					materialize: true,
					confirm: true,
				}),
			});
			onNotice(t("tryOnMarketing.campaignCreated"));
			setCampaignName("");
			setPreview(null);
			await load();
		} catch (error) {
			onError(error instanceof Error ? error.message : t("feedback.error"));
		}
	};

	if (loading) {
		return <div style={cardStyle}>{t("tryOnMarketing.loading")}</div>;
	}

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 12 }}>
				<strong>{t("tryOnMarketing.title")}</strong>
				<span style={subtleTextStyle}>{t("tryOnMarketing.subtitle")}</span>
				<span style={{ ...subtleTextStyle, padding: "10px 12px", borderRadius: 10, background: "rgba(0,0,0,0.04)" }}>
					{t("tryOnMarketing.introHelp")}
				</span>
			</div>

			<div style={{ ...cardStyle, display: "grid", gap: 12 }}>
				<strong>{t("tryOnMarketing.connectionTitle")}</strong>
				{connection?.connected ? (
					<span style={{ ...subtleTextStyle, color: "#1a7f37" }}>
						{t("tryOnMarketing.connected", { phone: connection.display_phone || "WhatsApp" })}
					</span>
				) : (
					<span style={subtleTextStyle}>{t("tryOnMarketing.connectHint")}</span>
				)}
				{connection?.connected && !showConnectionForm ? (
					<button
						type="button"
						className="omafit-admin-btn omafit-admin-btn--secondary"
						onClick={() => setShowConnectionForm(true)}
					>
						{t("tryOnMarketing.changeConnection")}
					</button>
				) : (
					<>
						<a
							href={META_WHATSAPP_MANAGER_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="omafit-admin-btn omafit-admin-btn--secondary"
							style={{ textAlign: "center", textDecoration: "none" }}
						>
							{t("tryOnMarketing.openMeta")}
						</a>
						<ol style={{ margin: 0, paddingLeft: 20, ...subtleTextStyle }}>
							<li>{t("tryOnMarketing.connectionStep1")}</li>
							<li>{t("tryOnMarketing.connectionStep2")}</li>
							<li>{t("tryOnMarketing.connectionStep3")}</li>
						</ol>
						<label>
							{t("tryOnMarketing.metaPhoneId")}
							<span style={{ display: "block", fontSize: 12, opacity: 0.75 }}>
								{t("tryOnMarketing.metaPhoneIdHelp")}
							</span>
							<input
								className="omafit-admin-input"
								value={phoneNumberId}
								onChange={(e) => setPhoneNumberId(e.target.value)}
							/>
						</label>
						<label>
							{t("tryOnMarketing.metaAccessToken")}
							<span style={{ display: "block", fontSize: 12, opacity: 0.75 }}>
								{t("tryOnMarketing.metaAccessTokenHelp")}
							</span>
							<input
								className="omafit-admin-input"
								type="password"
								value={accessToken}
								onChange={(e) => setAccessToken(e.target.value)}
							/>
						</label>
						<button
							type="button"
							className="omafit-admin-btn omafit-admin-btn--secondary"
							onClick={() => setShowAdvancedConnection((open) => !open)}
						>
							{t("tryOnMarketing.advancedSettings")} {showAdvancedConnection ? "▲" : "▼"}
						</button>
						{showAdvancedConnection ? (
							<label>
								{t("tryOnMarketing.wabaId")}
								<span style={{ display: "block", fontSize: 12, opacity: 0.75 }}>
									{t("tryOnMarketing.wabaIdHelp")}
								</span>
								<input className="omafit-admin-input" value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
							</label>
						) : null}
						<button type="button" className="omafit-admin-btn omafit-admin-btn--primary" onClick={() => void connect()}>
							{t("tryOnMarketing.saveConnection")}
						</button>
					</>
				)}
			</div>

			<div style={{ ...cardStyle, display: "grid", gap: 8 }}>
				<strong>{t("tryOnMarketing.metricsTitle")}</strong>
				<span style={subtleTextStyle}>
					{t("tryOnMarketing.metricsCustomers")}: {metrics?.opt_in_count ?? 0}
				</span>
				<span style={subtleTextStyle}>
					{t("tryOnMarketing.metricsDelivered")}: {metrics?.messages_delivered ?? 0}
				</span>
			</div>

			<div style={{ ...cardStyle, display: "grid", gap: 12 }}>
				<strong>{t("tryOnMarketing.newCampaignTitle")}</strong>
				<span style={subtleTextStyle}>
					{isExistingPhotoMode ? t("tryOnMarketing.campaignHintExisting") : t("tryOnMarketing.campaignHint")}
				</span>
				<label>
					{t("tryOnMarketing.campaignType")}
					<select
						className="omafit-admin-select"
						value={campaignMode}
						onChange={(e) => {
							setCampaignMode(e.target.value as CampaignMode);
							setPreview(null);
						}}
					>
						<option value="personalized_tryon">{t("tryOnMarketing.campaignTypeNewCollection")}</option>
						<option value="existing_tryon">{t("tryOnMarketing.campaignTypeExisting")}</option>
					</select>
				</label>
				<label>
					{isExistingPhotoMode ? t("tryOnMarketing.collectionFilterOptional") : t("tryOnMarketing.collection")}
					<select
						className="omafit-admin-select"
						value={collectionHandle}
						onChange={(e) => {
							setCollectionHandle(e.target.value);
							setPreview(null);
						}}
					>
						<option value="">
							{isExistingPhotoMode
								? t("tryOnMarketing.selectCollectionOptional")
								: t("tryOnMarketing.selectCollection")}
						</option>
					{collections.map((c) => (
						<option key={c.handle} value={c.handle}>
							{c.title || c.handle}
						</option>
					))}
					</select>
				</label>
				<input
					className="omafit-admin-input"
					placeholder={t("tryOnMarketing.campaignNamePlaceholder")}
					value={campaignName}
					onChange={(e) => setCampaignName(e.target.value)}
				/>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
					<button type="button" className="omafit-admin-btn omafit-admin-btn--secondary" onClick={() => void handlePreview()}>
						{t("tryOnMarketing.previewAudience")}
					</button>
					{preview != null ? (
						<span style={subtleTextStyle}>
							{t("tryOnMarketing.eligible", { count: preview.count ?? 0 })} ·{" "}
							{t(
								preview.generation_mode === "existing_tryon" || isExistingPhotoMode
									? "tryOnMarketing.previewCostExisting"
									: "tryOnMarketing.previewCost",
								{
									cost: Number(preview.estimated_cost_usd ?? 0).toFixed(2),
								},
							)}
						</span>
					) : null}
					<button type="button" className="omafit-admin-btn omafit-admin-btn--primary" onClick={() => void createCampaign()}>
						{t("tryOnMarketing.createCampaign")}
					</button>
				</div>
			</div>
		</div>
	);
}
