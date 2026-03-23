import {
	ACTION_NAVIGATE_SYNC,
	navigateHeader,
	syncPathname,
	type NexoClient,
} from "../lib/nexo";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { I18nProvider, useI18n } from "./i18n";
import type {
	OmafitAdminContext,
	OmafitAnalyticsSummary,
	OmafitCollection,
	OmafitSizeChart,
	OmafitWidgetConfig,
} from "../shared/models";

type SectionId = "dashboard" | "billing" | "widget" | "size-charts" | "analytics";

type StoreBootstrap = {
	id: string;
	name: string;
	url: string;
	language: string;
	currency: string;
	country?: string;
};

type AdminAppProps = {
	nexo: NexoClient;
	store: StoreBootstrap;
};

const pageStyle: CSSProperties = {
	minHeight: "100vh",
	background: "#f5f7fb",
	color: "#111827",
	fontFamily:
		'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const shellStyle: CSSProperties = {
	maxWidth: 1280,
	margin: "0 auto",
	padding: 24,
	display: "grid",
	gap: 20,
};

const cardStyle: CSSProperties = {
	background: "#ffffff",
	border: "1px solid #e5e7eb",
	borderRadius: 18,
	padding: 20,
	boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

const subtleTextStyle: CSSProperties = {
	color: "#6b7280",
	fontSize: 14,
	lineHeight: 1.5,
};

const buttonBaseStyle: CSSProperties = {
	borderRadius: 12,
	padding: "10px 16px",
	border: "1px solid #d1d5db",
	cursor: "pointer",
	fontSize: 14,
	fontWeight: 600,
	background: "#ffffff",
};

const primaryButtonStyle: CSSProperties = {
	...buttonBaseStyle,
	background: "#111827",
	borderColor: "#111827",
	color: "#ffffff",
};

const inputStyle: CSSProperties = {
	width: "100%",
	borderRadius: 12,
	border: "1px solid #d1d5db",
	padding: "12px 14px",
	fontSize: 14,
	boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
	display: "grid",
	gap: 8,
	fontSize: 13,
	fontWeight: 600,
	color: "#374151",
};

function getInitialSection(): SectionId {
	if (typeof window === "undefined") return "dashboard";
	const params = new URLSearchParams(window.location.search);
	const section = params.get("section");
	if (section === "billing") return "billing";
	if (section === "widget") return "widget";
	if (section === "size-charts") return "size-charts";
	if (section === "analytics") return "analytics";
	return "dashboard";
}

function formatDate(value?: string | null) {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(date);
}

function formatMoney(value: number, currency: string) {
	try {
		return new Intl.NumberFormat("pt-BR", {
			style: "currency",
			currency: currency || "BRL",
			maximumFractionDigits: 2,
		}).format(value || 0);
	} catch (_error) {
		return `${currency || "BRL"} ${Number(value || 0).toFixed(2)}`;
	}
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
	const response = await fetch(url, options);
	const text = await response.text();
	const payload = text ? JSON.parse(text) : {};
	if (!response.ok) {
		throw new Error(payload.error || payload.message || "Request failed");
	}
	return payload as T;
}

function defaultWidgetConfig(locale: string): OmafitWidgetConfig {
	return {
		link_text: "Ver meu tamanho ideal",
		store_logo: "",
		primary_color: "#810707",
		widget_enabled: true,
		excluded_collections: [],
		admin_locale: locale || "pt-BR",
	};
}

function defaultChart(): OmafitSizeChart {
	return {
		collection_handle: "",
		gender: "female",
		collection_type: "upper",
		collection_elasticity: "structured",
		measurement_refs: ["peito", "cintura", "quadril"],
		sizes: [{ size: "P", peito: "", cintura: "", quadril: "" }],
	};
}

function normalizeChartForType(chart: OmafitSizeChart): OmafitSizeChart {
	const measurementRefs =
		chart.collection_type === "footwear"
			? ["tamanho_pe"]
			: chart.measurement_refs.length === 3
				? chart.measurement_refs
				: ["peito", "cintura", "quadril"];
	return {
		...chart,
		collection_elasticity:
			chart.collection_type === "footwear" ? "" : chart.collection_elasticity || "structured",
		measurement_refs: measurementRefs,
		sizes: chart.sizes.map((row) => {
			const next: Record<string, string> = { size: row.size || "" };
			for (const key of measurementRefs) {
				next[key] = row[key] || "";
			}
			return next;
		}),
	};
}

function AppContent({ nexo, store }: AdminAppProps) {
	const { t } = useI18n();
	const [section, setSection] = useState<SectionId>(getInitialSection);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [context, setContext] = useState<OmafitAdminContext | null>(null);
	const [widgetConfig, setWidgetConfig] = useState<OmafitWidgetConfig>(
		defaultWidgetConfig(store.language),
	);
	const [collections, setCollections] = useState<OmafitCollection[]>([]);
	const [sizeCharts, setSizeCharts] = useState<OmafitSizeChart[]>([defaultChart()]);
	const [analytics, setAnalytics] = useState<OmafitAnalyticsSummary | null>(null);
	const [days, setDays] = useState("30");
	const [busyAction, setBusyAction] = useState<string | null>(null);

	const storeQuery = useMemo(() => {
		const params = new URLSearchParams();
		if (store.id) params.set("store_id", store.id);
		if (store.url) params.set("store_url", store.url);
		return params.toString();
	}, [store.id, store.url]);

	const withStoreQuery = useCallback(
		(path: string) => `${path}${path.includes("?") ? "&" : "?"}${storeQuery}`,
		[storeQuery],
	);

	const updateUrlSection = useCallback(
		(nextSection: SectionId) => {
			if (typeof window === "undefined") return;
			const url = new URL(window.location.href);
			url.searchParams.set("section", nextSection);
			window.history.replaceState({}, "", url.toString());
			syncPathname(nexo, `/${nextSection}`);
			navigateHeader(nexo, { text: `Omafit · ${t(`nav.${nextSection === "size-charts" ? "sizeCharts" : nextSection}`)}` });
		},
		[nexo, t],
	);

	const loadContext = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await fetchJson<OmafitAdminContext>(withStoreQuery("/api/admin/context"));
			setContext(data);
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : t("feedback.error"));
		} finally {
			setLoading(false);
		}
	}, [t, withStoreQuery]);

	const loadCollections = useCallback(async () => {
		try {
			const data = await fetchJson<{ collections: OmafitCollection[] }>(
				withStoreQuery("/api/collections"),
			);
			setCollections(data.collections || []);
		} catch (_error) {
			setCollections([]);
		}
	}, [withStoreQuery]);

	const loadWidgetConfig = useCallback(async () => {
		try {
			const data = await fetchJson<{ config: OmafitWidgetConfig }>(
				withStoreQuery("/api/widget-config"),
			);
			setWidgetConfig(
				data.config || defaultWidgetConfig(context?.store.language || store.language),
			);
		} catch (_error) {
			setWidgetConfig(defaultWidgetConfig(context?.store.language || store.language));
		}
	}, [context?.store.language, store.language, withStoreQuery]);

	const loadSizeCharts = useCallback(async () => {
		try {
			const data = await fetchJson<{ charts: OmafitSizeChart[] }>(
				withStoreQuery("/api/size-charts"),
			);
			setSizeCharts(
				data.charts && data.charts.length > 0
					? data.charts.map(normalizeChartForType)
					: [defaultChart()],
			);
		} catch (_error) {
			setSizeCharts([defaultChart()]);
		}
	}, [withStoreQuery]);

	const loadAnalytics = useCallback(async () => {
		setBusyAction("analytics");
		try {
			const data = await fetchJson<OmafitAnalyticsSummary>(
				withStoreQuery(`/api/analytics/summary?days=${encodeURIComponent(days)}`),
			);
			setAnalytics(data);
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : t("feedback.error"));
		} finally {
			setBusyAction(null);
		}
	}, [days, t, withStoreQuery]);

	useEffect(() => {
		loadContext();
		loadCollections();
		loadWidgetConfig();
		loadSizeCharts();
	}, [loadCollections, loadContext, loadSizeCharts, loadWidgetConfig]);

	useEffect(() => {
		updateUrlSection(section);
	}, [section, updateUrlSection]);

	useEffect(() => {
		const unsubscribe = nexo.suscribe(ACTION_NAVIGATE_SYNC, (payload: { path?: string }) => {
			const path = String(payload?.path || "");
			if (path.includes("analytics")) setSection("analytics");
			else if (path.includes("size")) setSection("size-charts");
			else if (path.includes("widget")) setSection("widget");
			else if (path.includes("billing")) setSection("billing");
			else setSection("dashboard");
		});
		return () => unsubscribe?.();
	}, [nexo]);

	useEffect(() => {
		if (section === "analytics") {
			loadAnalytics();
		}
	}, [days, loadAnalytics, section]);

	const saveWidget = useCallback(async () => {
		setBusyAction("widget");
		setError(null);
		try {
			await fetchJson(withStoreQuery("/api/widget-config"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(widgetConfig),
			});
			setNotice(t("widget.saved"));
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : t("feedback.error"));
		} finally {
			setBusyAction(null);
		}
	}, [t, widgetConfig, withStoreQuery]);

	const saveCharts = useCallback(async () => {
		setBusyAction("charts");
		setError(null);
		try {
			await fetchJson(withStoreQuery("/api/size-charts"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					charts: sizeCharts.map(normalizeChartForType),
				}),
			});
			setNotice(t("sizeCharts.saved"));
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : t("feedback.error"));
		} finally {
			setBusyAction(null);
		}
	}, [sizeCharts, t, withStoreQuery]);

	const activatePlan = useCallback(
		async (planId: string) => {
			setBusyAction(`plan:${planId}`);
			setError(null);
			try {
				await fetchJson(withStoreQuery("/api/billing/plan"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ planId }),
				});
				await loadContext();
				setNotice(t("feedback.saved"));
			} catch (requestError) {
				setError(requestError instanceof Error ? requestError.message : t("feedback.error"));
			} finally {
				setBusyAction(null);
			}
		},
		[loadContext, t, withStoreQuery],
	);

	const syncStore = useCallback(async () => {
		setBusyAction("sync");
		setError(null);
		try {
			await fetchJson(withStoreQuery("/api/admin/sync"), { method: "POST" });
			await loadContext();
			setNotice("Loja sincronizada com sucesso.");
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : t("feedback.error"));
		} finally {
			setBusyAction(null);
		}
	}, [loadContext, t, withStoreQuery]);

	const updateChart = useCallback((index: number, nextChart: OmafitSizeChart) => {
		setSizeCharts((current) =>
			current.map((chart, chartIndex) =>
				chartIndex === index ? normalizeChartForType(nextChart) : chart,
			),
		);
	}, []);

	if (loading) {
		return (
			<div style={pageStyle}>
				<div style={shellStyle}>
					<div style={cardStyle}>{t("common.loading")}</div>
				</div>
			</div>
		);
	}

	return (
		<div style={pageStyle}>
			<div style={shellStyle}>
				<header
					style={{
						...cardStyle,
						display: "grid",
						gap: 12,
						background:
							"linear-gradient(135deg, rgba(17,24,39,1) 0%, rgba(52,73,94,1) 100%)",
						color: "#ffffff",
					}}
				>
					<div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
						<div style={{ display: "grid", gap: 8 }}>
							<strong style={{ fontSize: 28 }}>{context?.appName || "Omafit"}</strong>
							<span style={{ color: "rgba(255,255,255,0.82)" }}>{t("dashboard.subtitle")}</span>
						</div>
						<div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "start" }}>
							<a href={context?.supportUrl} style={{ ...buttonBaseStyle, textDecoration: "none", color: "#111827" }}>
								{t("common.openSupport")}
							</a>
							<button
								type="button"
								style={primaryButtonStyle}
								onClick={syncStore}
								disabled={busyAction === "sync" || !context?.auth.connected}
							>
								{busyAction === "sync" ? t("common.loading") : t("common.refresh")}
							</button>
						</div>
					</div>
					<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
						<StatusPill
							label={`${t("dashboard.authStatus")}: ${context?.auth.connected ? t("common.connected") : t("common.disconnected")}`}
							tone={context?.auth.connected ? "success" : "warning"}
						/>
						<StatusPill
							label={`${t("billing.currentPlan")}: ${context?.billing.plan || "ondemand"}`}
							tone="neutral"
						/>
						<StatusPill
							label={`${t("dashboard.imagesUsed")}: ${context?.billing.usage.imagesUsed || 0}/${context?.billing.usage.imagesIncluded || 0}`}
							tone="neutral"
						/>
					</div>
				</header>

				<nav
					style={{
						display: "flex",
						gap: 10,
						flexWrap: "wrap",
					}}
				>
					{(
						[
							["dashboard", t("nav.dashboard")],
							["billing", t("nav.billing")],
							["widget", t("nav.widget")],
							["size-charts", t("nav.sizeCharts")],
							["analytics", t("nav.analytics")],
						] as Array<[SectionId, string]>
					).map(([id, label]) => (
						<button
							key={id}
							type="button"
							onClick={() => setSection(id)}
							style={{
								...buttonBaseStyle,
								background: section === id ? "#111827" : "#ffffff",
								color: section === id ? "#ffffff" : "#111827",
								borderColor: section === id ? "#111827" : "#d1d5db",
							}}
						>
							{label}
						</button>
					))}
				</nav>

				{notice ? (
					<div
						style={{
							...cardStyle,
							borderColor: "#86efac",
							background: "#f0fdf4",
							color: "#166534",
						}}
					>
						{notice}
					</div>
				) : null}

				{error ? (
					<div
						style={{
							...cardStyle,
							borderColor: "#fecaca",
							background: "#fef2f2",
							color: "#b91c1c",
						}}
					>
						{error}
					</div>
				) : null}

				{section === "dashboard" && context ? (
					<DashboardSection
						context={context}
						onSelectSection={setSection}
						onReconnect={() => {
							if (context.auth.authUrl) window.location.href = context.auth.authUrl;
						}}
					/>
				) : null}

				{section === "billing" && context ? (
					<BillingSection
						context={context}
						onActivatePlan={activatePlan}
						busyAction={busyAction}
					/>
				) : null}

				{section === "widget" ? (
					<WidgetSection
						config={widgetConfig}
						collections={collections}
						onChange={setWidgetConfig}
						onSave={saveWidget}
						busy={busyAction === "widget"}
					/>
				) : null}

				{section === "size-charts" ? (
					<SizeChartsSection
						collections={collections}
						charts={sizeCharts}
						onChange={updateChart}
						onAddChart={() => setSizeCharts((current) => [...current, defaultChart()])}
						onRemoveChart={(index) =>
							setSizeCharts((current) =>
								current.length === 1
									? [defaultChart()]
									: current.filter((_, chartIndex) => chartIndex !== index),
							)
						}
						onSave={saveCharts}
						busy={busyAction === "charts"}
					/>
				) : null}

				{section === "analytics" ? (
					<AnalyticsSection
						days={days}
						onChangeDays={setDays}
						onReload={loadAnalytics}
						busy={busyAction === "analytics"}
						data={analytics}
					/>
				) : null}
			</div>
		</div>
	);
}

function DashboardSection({
	context,
	onReconnect,
	onSelectSection,
}: {
	context: OmafitAdminContext;
	onReconnect: () => void;
	onSelectSection: (section: SectionId) => void;
}) {
	const { t } = useI18n();
	return (
		<div style={{ display: "grid", gap: 20 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 8 }}>
				<strong style={{ fontSize: 18 }}>{t("dashboard.title")}</strong>
				<span style={subtleTextStyle}>{t("dashboard.syncHint")}</span>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
					gap: 16,
				}}
			>
				<StatCard label={t("dashboard.storeName")} value={context.store.name} />
				<StatCard label={t("dashboard.storeId")} value={context.store.id || "—"} />
				<StatCard label={t("dashboard.storeUrl")} value={context.store.url || "—"} />
				<StatCard label={t("dashboard.plan")} value={context.billing.plan || "ondemand"} />
			</div>

			<div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
				<div style={{ ...cardStyle, display: "grid", gap: 12 }}>
					<strong>{t("dashboard.quickActions")}</strong>
					<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
						<ActionButton onClick={() => onSelectSection("widget")}>{t("dashboard.widgetAction")}</ActionButton>
						<ActionButton onClick={() => onSelectSection("analytics")}>{t("dashboard.analyticsAction")}</ActionButton>
						<ActionButton onClick={() => onSelectSection("billing")}>{t("dashboard.billingAction")}</ActionButton>
						<ActionButton onClick={() => onSelectSection("size-charts")}>{t("dashboard.sizeChartsAction")}</ActionButton>
					</div>
				</div>

				<div style={{ ...cardStyle, display: "grid", gap: 10 }}>
					<strong>{t("dashboard.authStatus")}</strong>
					<StatusPill
						label={context.auth.connected ? t("common.connected") : t("common.disconnected")}
						tone={context.auth.connected ? "success" : "warning"}
					/>
					<span style={subtleTextStyle}>
						{context.auth.connected
							? t("dashboard.connectedDescription")
							: t("dashboard.reconnectNeeded")}
					</span>
					{!context.auth.connected ? (
						<button type="button" style={primaryButtonStyle} onClick={onReconnect}>
							{t("nav.reconnect")}
						</button>
					) : null}
				</div>
			</div>

			<div style={{ ...cardStyle, display: "grid", gap: 10 }}>
				<strong>{t("dashboard.webhooks")}</strong>
				<span style={subtleTextStyle}>
					{t("dashboard.lastSync")}: {formatDate(context.auth.lastSyncAt)}
				</span>
				<span style={subtleTextStyle}>
					Webhooks: {formatDate(context.auth.webhooksSyncedAt)}
				</span>
			</div>
		</div>
	);
}

function BillingSection({
	context,
	onActivatePlan,
	busyAction,
}: {
	context: OmafitAdminContext;
	onActivatePlan: (planId: string) => Promise<void>;
	busyAction: string | null;
}) {
	const { t } = useI18n();
	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 6 }}>
				<strong style={{ fontSize: 18 }}>{t("billing.title")}</strong>
				<span style={subtleTextStyle}>{t("billing.subtitle")}</span>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
					gap: 16,
				}}
			>
				<StatCard label={t("billing.currentPlan")} value={context.billing.plan} />
				<StatCard label={t("billing.status")} value={context.billing.status} />
				<StatCard label={t("billing.remaining")} value={String(context.billing.usage.remaining)} />
				<StatCard label={t("billing.extra")} value={String(context.billing.usage.extraImages)} />
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
					gap: 16,
				}}
			>
				{context.billing.plans.map((plan) => (
					<div key={plan.id} style={{ ...cardStyle, display: "grid", gap: 12 }}>
						<div>
							<strong>{plan.name}</strong>
							<div style={subtleTextStyle}>{plan.description}</div>
						</div>
						<div style={subtleTextStyle}>
							{t("billing.planIncludes")}: {plan.imagesIncluded}
						</div>
						<div style={subtleTextStyle}>
							{t("billing.pricePerExtra")}: {formatMoney(plan.pricePerExtraImage, plan.currency)}
						</div>
						<button
							type="button"
							style={plan.id === context.billing.plan ? primaryButtonStyle : buttonBaseStyle}
							onClick={() => onActivatePlan(plan.id)}
							disabled={busyAction === `plan:${plan.id}`}
						>
							{busyAction === `plan:${plan.id}` ? t("common.loading") : t("billing.activate")}
						</button>
					</div>
				))}
			</div>
		</div>
	);
}

function WidgetSection({
	config,
	collections,
	onChange,
	onSave,
	busy,
}: {
	config: OmafitWidgetConfig;
	collections: OmafitCollection[];
	onChange: (next: OmafitWidgetConfig) => void;
	onSave: () => Promise<void>;
	busy: boolean;
}) {
	const { t } = useI18n();
	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 6 }}>
				<strong style={{ fontSize: 18 }}>{t("widget.title")}</strong>
				<span style={subtleTextStyle}>{t("widget.subtitle")}</span>
			</div>

			<div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
				<div style={{ ...cardStyle, display: "grid", gap: 16 }}>
					<label style={labelStyle}>
						<span>{t("widget.linkText")}</span>
						<input
							style={inputStyle}
							value={config.link_text}
							onChange={(event) => onChange({ ...config, link_text: event.target.value })}
						/>
					</label>

					<label style={labelStyle}>
						<span>{t("widget.logoUrl")}</span>
						<input
							style={inputStyle}
							value={config.store_logo || ""}
							onChange={(event) => onChange({ ...config, store_logo: event.target.value })}
							placeholder="https://..."
						/>
					</label>

					<label style={labelStyle}>
						<span>{t("widget.primaryColor")}</span>
						<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
							<input
								type="color"
								value={config.primary_color}
								onChange={(event) => onChange({ ...config, primary_color: event.target.value })}
								style={{ width: 52, height: 40, border: "none", background: "transparent" }}
							/>
							<input
								style={inputStyle}
								value={config.primary_color}
								onChange={(event) => onChange({ ...config, primary_color: event.target.value })}
							/>
						</div>
					</label>

					<label style={{ ...labelStyle, gridTemplateColumns: "auto 1fr", alignItems: "center" }}>
						<input
							type="checkbox"
							checked={config.widget_enabled}
							onChange={(event) =>
								onChange({ ...config, widget_enabled: event.target.checked })
							}
						/>
						<span>{t("widget.enable")}</span>
					</label>

					<div style={{ display: "grid", gap: 10 }}>
						<strong>{t("widget.categories")}</strong>
						<span style={subtleTextStyle}>{t("widget.categoriesHint")}</span>
						<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
							{collections.map((collection) => {
								const id = String(collection.id);
								const active = config.excluded_collections.includes(id);
								return (
									<button
										key={id}
										type="button"
										onClick={() =>
											onChange({
												...config,
												excluded_collections: active
													? config.excluded_collections.filter((item) => item !== id)
													: [...config.excluded_collections, id],
											})
										}
										style={{
											...buttonBaseStyle,
											padding: "8px 12px",
											background: active ? "#fee2e2" : "#ffffff",
											borderColor: active ? "#ef4444" : "#d1d5db",
										}}
									>
										{collection.title}
									</button>
								);
							})}
						</div>
					</div>

					<button type="button" style={primaryButtonStyle} onClick={onSave} disabled={busy}>
						{busy ? t("common.loading") : t("common.save")}
					</button>
				</div>

				<div style={{ ...cardStyle, display: "grid", gap: 16, alignContent: "start" }}>
					<strong>{t("widget.preview")}</strong>
					<div style={{ ...subtleTextStyle, marginBottom: 4 }}>PDP CTA</div>
					<div
						style={{
							border: `1px solid ${config.primary_color}`,
							borderRadius: 14,
							padding: "14px 16px",
							color: config.primary_color,
							fontWeight: 700,
							display: "inline-flex",
							alignItems: "center",
							gap: 10,
						}}
					>
						{config.store_logo ? (
							<img
								src={config.store_logo}
								alt=""
								style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }}
							/>
						) : null}
						<span>{config.link_text || "Ver meu tamanho ideal"}</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function SizeChartsSection({
	collections,
	charts,
	onChange,
	onAddChart,
	onRemoveChart,
	onSave,
	busy,
}: {
	collections: OmafitCollection[];
	charts: OmafitSizeChart[];
	onChange: (index: number, chart: OmafitSizeChart) => void;
	onAddChart: () => void;
	onRemoveChart: (index: number) => void;
	onSave: () => Promise<void>;
	busy: boolean;
}) {
	const { t } = useI18n();
	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 8 }}>
				<strong style={{ fontSize: 18 }}>{t("sizeCharts.title")}</strong>
				<span style={subtleTextStyle}>{t("sizeCharts.subtitle")}</span>
				<div>
					<button type="button" style={buttonBaseStyle} onClick={onAddChart}>
						{t("sizeCharts.addChart")}
					</button>
				</div>
			</div>

			{charts.map((chart, index) => (
				<SizeChartEditor
					key={`${chart.collection_handle}-${chart.gender}-${index}`}
					index={index}
					chart={chart}
					collections={collections}
					onChange={onChange}
					onRemove={() => onRemoveChart(index)}
				/>
			))}

			<div>
				<button type="button" style={primaryButtonStyle} onClick={onSave} disabled={busy}>
					{busy ? t("common.loading") : t("common.save")}
				</button>
			</div>
		</div>
	);
}

function SizeChartEditor({
	index,
	chart,
	collections,
	onChange,
	onRemove,
}: {
	index: number;
	chart: OmafitSizeChart;
	collections: OmafitCollection[];
	onChange: (index: number, chart: OmafitSizeChart) => void;
	onRemove: () => void;
}) {
	const { t } = useI18n();
	const measurementRefs =
		chart.collection_type === "footwear" ? ["tamanho_pe"] : chart.measurement_refs;

	function update(next: Partial<OmafitSizeChart>) {
		onChange(index, normalizeChartForType({ ...chart, ...next }));
	}

	return (
		<div style={{ ...cardStyle, display: "grid", gap: 14 }}>
			<div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
				<strong>
					{t("sizeCharts.collection")} #{index + 1}
				</strong>
				<button type="button" style={buttonBaseStyle} onClick={onRemove}>
					Remover
				</button>
			</div>

			<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
				<label style={labelStyle}>
					<span>{t("sizeCharts.collection")}</span>
					<select
						style={inputStyle}
						value={chart.collection_handle}
						onChange={(event) => update({ collection_handle: event.target.value })}
					>
						<option value="">Geral</option>
						{collections.map((collection) => (
							<option key={collection.id} value={collection.handle}>
								{collection.title}
							</option>
						))}
					</select>
				</label>

				<label style={labelStyle}>
					<span>{t("sizeCharts.gender")}</span>
					<select
						style={inputStyle}
						value={chart.gender}
						onChange={(event) =>
							update({ gender: event.target.value as OmafitSizeChart["gender"] })
						}
					>
						<option value="female">Feminino</option>
						<option value="male">Masculino</option>
						<option value="unisex">Unissex</option>
					</select>
				</label>

				<label style={labelStyle}>
					<span>{t("sizeCharts.collectionType")}</span>
					<select
						style={inputStyle}
						value={chart.collection_type}
						onChange={(event) =>
							update({
								collection_type: event.target.value as OmafitSizeChart["collection_type"],
							})
						}
					>
						<option value="upper">Upper</option>
						<option value="lower">Lower</option>
						<option value="full">Full</option>
						<option value="footwear">Footwear</option>
					</select>
				</label>

				<label style={labelStyle}>
					<span>{t("sizeCharts.elasticity")}</span>
					<select
						style={inputStyle}
						value={chart.collection_elasticity}
						disabled={chart.collection_type === "footwear"}
						onChange={(event) =>
							update({
								collection_elasticity:
									event.target.value as OmafitSizeChart["collection_elasticity"],
							})
						}
					>
						<option value="structured">Structured</option>
						<option value="light_flex">Light flex</option>
						<option value="flexible">Flexible</option>
						<option value="high_elasticity">High elasticity</option>
					</select>
				</label>
			</div>

			<div style={{ display: "grid", gap: 8 }}>
				<strong>{t("sizeCharts.measurements")}</strong>
				<div style={{ display: "grid", gridTemplateColumns: `repeat(${measurementRefs.length}, 1fr)`, gap: 12 }}>
					{measurementRefs.map((measurement, measurementIndex) => (
						<input
							key={`${measurement}-${measurementIndex}`}
							style={inputStyle}
							value={measurement}
							disabled={chart.collection_type === "footwear"}
							onChange={(event) => {
								const nextRefs = [...measurementRefs];
								nextRefs[measurementIndex] = event.target.value;
								update({ measurement_refs: nextRefs });
							}}
						/>
					))}
				</div>
			</div>

			<div style={{ display: "grid", gap: 8 }}>
				<strong>{t("sizeCharts.sizeRows")}</strong>
				{chart.sizes.map((row, rowIndex) => (
					<div
						key={`${row.size}-${rowIndex}`}
						style={{
							display: "grid",
							gridTemplateColumns: `140px repeat(${measurementRefs.length}, 1fr) auto`,
							gap: 10,
						}}
					>
						<input
							style={inputStyle}
							value={row.size}
							onChange={(event) => {
								const nextRows = [...chart.sizes];
								nextRows[rowIndex] = { ...nextRows[rowIndex], size: event.target.value };
								update({ sizes: nextRows });
							}}
						/>
						{measurementRefs.map((measurement) => (
							<input
								key={measurement}
								style={inputStyle}
								value={row[measurement] || ""}
								onChange={(event) => {
									const nextRows = [...chart.sizes];
									nextRows[rowIndex] = {
										...nextRows[rowIndex],
										[measurement]: event.target.value,
									};
									update({ sizes: nextRows });
								}}
							/>
						))}
						<button
							type="button"
							style={buttonBaseStyle}
							onClick={() =>
								update({
									sizes: chart.sizes.filter((_, currentRowIndex) => currentRowIndex !== rowIndex),
								})
							}
						>
							X
						</button>
					</div>
				))}
				<button
					type="button"
					style={buttonBaseStyle}
					onClick={() =>
						update({
							sizes: [
								...chart.sizes,
								Object.fromEntries(
									["size", ...measurementRefs].map((measurement) => [measurement, ""]),
								) as Record<string, string>,
							],
						})
					}
				>
					{t("sizeCharts.addRow")}
				</button>
			</div>
		</div>
	);
}

function AnalyticsSection({
	data,
	days,
	onChangeDays,
	onReload,
	busy,
}: {
	data: OmafitAnalyticsSummary | null;
	days: string;
	onChangeDays: (days: string) => void;
	onReload: () => Promise<void>;
	busy: boolean;
}) {
	const { t } = useI18n();
	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 10 }}>
				<strong style={{ fontSize: 18 }}>{t("analytics.title")}</strong>
				<span style={subtleTextStyle}>{t("analytics.subtitle")}</span>
				<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
					<select style={inputStyle} value={days} onChange={(event) => onChangeDays(event.target.value)}>
						<option value="7">7 dias</option>
						<option value="30">30 dias</option>
						<option value="90">90 dias</option>
						<option value="365">365 dias</option>
					</select>
					<button type="button" style={primaryButtonStyle} onClick={onReload} disabled={busy}>
						{busy ? t("common.loading") : t("analytics.reload")}
					</button>
				</div>
			</div>

			{data ? (
				<>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
							gap: 16,
						}}
					>
						<StatCard label={t("analytics.sessions")} value={String(data.totalSessions)} />
						<StatCard label={t("analytics.orders")} value={String(data.orderMetrics.omafitOrdersAfter)} />
						<StatCard
							label={t("analytics.revenue")}
							value={formatMoney(data.orderMetrics.omafitRevenueAfter, data.usage.currency)}
						/>
						<StatCard label={t("analytics.returns")} value={String(data.orderMetrics.returnsAfter)} />
					</div>

					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
						<div style={{ ...cardStyle, display: "grid", gap: 8 }}>
							<strong>{t("analytics.avgMale")}</strong>
							<span style={subtleTextStyle}>
								Altura: {data.avgByGender.male.height?.toFixed(1) || "—"} cm
							</span>
							<span style={subtleTextStyle}>
								Peso: {data.avgByGender.male.weight?.toFixed(1) || "—"} kg
							</span>
						</div>
						<div style={{ ...cardStyle, display: "grid", gap: 8 }}>
							<strong>{t("analytics.avgFemale")}</strong>
							<span style={subtleTextStyle}>
								Altura: {data.avgByGender.female.height?.toFixed(1) || "—"} cm
							</span>
							<span style={subtleTextStyle}>
								Peso: {data.avgByGender.female.weight?.toFixed(1) || "—"} kg
							</span>
						</div>
					</div>

					<TwoColumnList
						leftTitle={t("analytics.topCollections")}
						leftItems={data.usageByCollection.map((item) => `${item.collection}: ${item.count} (${item.percent.toFixed(1)}%)`)}
						rightTitle={t("analytics.topSizes")}
						rightItems={data.sizeDistribution.map((item) => `${item.size}: ${item.count}`)}
					/>

					<TwoColumnList
						leftTitle={t("analytics.bodyTypes")}
						leftItems={data.bodyTypeDistribution.map((item) => `Tipo ${item.bodyType}: ${item.count}`)}
						rightTitle={t("analytics.recommendations")}
						rightItems={data.topRecommendations.map(
							(item) =>
								`${item.collection} · ${item.gender} · ${item.recommendedSize || "—"} · corpo ${item.bodyType || "—"}`,
						)}
					/>
				</>
			) : (
				<div style={cardStyle}>{t("common.noData")}</div>
			)}
		</div>
	);
}

function TwoColumnList({
	leftTitle,
	leftItems,
	rightTitle,
	rightItems,
}: {
	leftTitle: string;
	leftItems: string[];
	rightTitle: string;
	rightItems: string[];
}) {
	return (
		<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 8 }}>
				<strong>{leftTitle}</strong>
				{leftItems.length > 0 ? leftItems.map((item) => <span key={item} style={subtleTextStyle}>{item}</span>) : <span style={subtleTextStyle}>Sem dados.</span>}
			</div>
			<div style={{ ...cardStyle, display: "grid", gap: 8 }}>
				<strong>{rightTitle}</strong>
				{rightItems.length > 0 ? rightItems.map((item) => <span key={item} style={subtleTextStyle}>{item}</span>) : <span style={subtleTextStyle}>Sem dados.</span>}
			</div>
		</div>
	);
}

function StatCard({ label, value }: { label: string; value: string }) {
	return (
		<div style={{ ...cardStyle, display: "grid", gap: 8 }}>
			<span style={subtleTextStyle}>{label}</span>
			<strong style={{ fontSize: 24 }}>{value}</strong>
		</div>
	);
}

function ActionButton({
	children,
	onClick,
}: {
	children: ReactNode;
	onClick: () => void;
}) {
	return (
		<button type="button" style={buttonBaseStyle} onClick={onClick}>
			{children}
		</button>
	);
}

function StatusPill({
	label,
	tone,
}: {
	label: string;
	tone: "success" | "warning" | "neutral";
}) {
	const theme =
		tone === "success"
			? { background: "#dcfce7", color: "#166534" }
			: tone === "warning"
				? { background: "#fef3c7", color: "#92400e" }
				: { background: "rgba(255,255,255,0.16)", color: "#ffffff" };
	return (
		<span
			style={{
				display: "inline-flex",
				padding: "8px 12px",
				borderRadius: 999,
				fontSize: 13,
				fontWeight: 700,
				...theme,
			}}
		>
			{label}
		</span>
	);
}

export function OmafitAdminApp(props: AdminAppProps) {
	return (
		<I18nProvider locale={props.store.language}>
			<AppContent {...props} />
		</I18nProvider>
	);
}
