import {
	ACTION_NAVIGATE_SYNC,
	navigateHeader,
	syncPathname,
	type NexoClient,
} from "../lib/nexo";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode, Component } from "react";
import { I18nProvider, useI18n } from "./i18n";
import { OmafitBrandBanner } from "./OmafitBrandBanner";
import { SizeChartsSection } from "./SizeChartsSection";
import { TryOnMarketingSection } from "./TryOnMarketingSection";
import { WidgetSection } from "./WidgetSection";
import { cardStyle, subtleTextStyle } from "./adminUi";
import "./omafit-brand.css";
import type {
	OmafitAdminContext,
	OmafitAnalyticsSummary,
	OmafitCollection,
	OmafitWidgetConfig,
} from "../shared/models";

type SectionId = "dashboard" | "billing" | "widget" | "size-charts" | "analytics" | "try-on-marketing";

type BillingDebugSnapshot = {
	effectiveConceptCode?: string;
	effectiveServiceId?: string;
	billingMode?: string;
	recordPendingOverageAmount?: number;
	checks?: {
		nativeBillingReady?: boolean;
		selfBillingReady?: boolean;
		selfBillingActive?: boolean;
		chargesReady?: boolean;
		webhooksReady?: boolean;
		likelySelfBilling?: boolean;
		issues?: string[];
		recommendations?: string[];
	};
	webhookState?: {
		events?: Array<{ event?: string; url?: string }>;
	};
};

type WebhookSyncReport = {
	skipped?: boolean;
	reason?: string;
	hasOrdersScope?: boolean;
	oauthScope?: string;
	results?: Array<{
		event: string;
		status: string;
		error?: string;
		existingUrl?: string;
		httpStatus?: number;
	}>;
};

type StoreSyncResponse = {
	ok: boolean;
	webhookSync?: WebhookSyncReport;
	session?: {
		webhooksSyncedAt?: string | null;
		lastSyncAt?: string | null;
	};
};

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

function getInitialSection(): SectionId {
	if (typeof window === "undefined") return "dashboard";
	const params = new URLSearchParams(window.location.search);
	const section = params.get("section");
	if (section === "billing") return "billing";
	if (section === "widget") return "widget";
	if (section === "size-charts") return "size-charts";
	if (section === "analytics") return "analytics";
	if (section === "try-on-marketing") return "try-on-marketing";
	return "dashboard";
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

function getPlanDisplayName(
	plans: { id: string; name: string }[] | undefined,
	planId: string | null | undefined,
) {
	if (!planId) return "—";
	return plans?.find((plan) => plan.id === planId)?.name || planId;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
	const response = await fetch(url, options);
	const text = await response.text();
	const payload = text ? JSON.parse(text) : {};
	if (!response.ok) {
		if (String(url).includes("/api/billing/plan")) {
			// #region agent log
			console.error("[Omafit Debug] H9 billing_plan_response_error", payload);
			console.error(
				"[Omafit Debug] H9 billing_plan_response_error_json",
				JSON.stringify(payload),
			);
			// #endregion
		}
		const error = new Error(payload.error || payload.message || "Request failed") as Error & {
			payload?: unknown;
		};
		error.payload = payload;
		throw error;
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
		embed_position: "below_buy_buttons",
		cta_type: "link",
		cta_button_border_radius: 40,
		tryon_layout: "default",
		tryon_layout_background_image: "",
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
	const [analytics, setAnalytics] = useState<OmafitAnalyticsSummary | null>(null);
	const [days, setDays] = useState("90");
	const [busyAction, setBusyAction] = useState<string | null>(null);
	const [heroUploading, setHeroUploading] = useState(false);

	const storeQuery = useMemo(() => {
		const params = new URLSearchParams();
		const storeId = context?.store.id || store.id;
		const storeUrl = context?.store.url || store.url;
		if (storeId) params.set("store_id", String(storeId));
		if (storeUrl) params.set("store_url", storeUrl);
		return params.toString();
	}, [context?.store.id, context?.store.url, store.id, store.url]);

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
			navigateHeader(nexo, {
				text: `Omafit · ${t(
					`nav.${
						nextSection === "size-charts"
							? "sizeCharts"
							: nextSection === "try-on-marketing"
								? "tryOnMarketing"
								: nextSection
					}`,
				)}`,
			});
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
	}, [loadCollections, loadContext, loadWidgetConfig]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const params = new URLSearchParams(window.location.search);
		const billingResult = params.get("billing");
		if (!billingResult) return;
		if (billingResult === "success") {
			setNotice(t("billing.checkoutSuccess"));
		} else if (billingResult === "cancel") {
			setNotice(t("billing.checkoutCancel"));
		}
		params.delete("billing");
		const next = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, "");
		window.history.replaceState({}, "", next);
		void loadContext();
	}, [loadContext, t]);

	useEffect(() => {
		updateUrlSection(section);
	}, [section, updateUrlSection]);

	useEffect(() => {
		const unsubscribe = nexo.suscribe(ACTION_NAVIGATE_SYNC, (payload: { path?: string }) => {
			const path = String(payload?.path || "");
			if (path.includes("try-on-marketing") || path.includes("marketing")) setSection("try-on-marketing");
			else if (path.includes("analytics")) setSection("analytics");
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
	}, [context?.store.id, context?.store.url, days, loadAnalytics, section]);

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

	const uploadLogo = useCallback(
		async (file: File) => {
			setBusyAction("logo-upload");
			setError(null);
			try {
				const formData = new FormData();
				formData.append("file", file);
				const response = await fetch(withStoreQuery("/api/widget/logo-upload"), {
					method: "POST",
					body: formData,
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok || !payload?.url) {
					throw new Error(payload?.error || "Nao foi possivel enviar o logo.");
				}
				const nextConfig = {
					...widgetConfig,
					store_logo: String(payload.url),
				};
				setWidgetConfig((current) => ({
					...current,
					store_logo: String(payload.url),
				}));
				const saved = await fetchJson<{ config?: OmafitWidgetConfig }>(
					withStoreQuery("/api/widget-config"),
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(nextConfig),
					},
				);
				if (saved?.config) {
					setWidgetConfig(saved.config);
				}
				setNotice("Logo enviado e salvo com sucesso.");
			} catch (requestError) {
				setError(requestError instanceof Error ? requestError.message : t("feedback.error"));
			} finally {
				setBusyAction(null);
			}
		},
		[t, widgetConfig, withStoreQuery],
	);

	const uploadHeroBackground = useCallback(
		async (file: File) => {
			setHeroUploading(true);
			setError(null);
			try {
				const formData = new FormData();
				formData.append("file", file);
				const response = await fetch(withStoreQuery("/api/widget/hero-background-upload"), {
					method: "POST",
					body: formData,
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok || !payload?.url) {
					throw new Error(payload?.error || t("widget.errorUploadHeroBackground"));
				}
				const nextConfig = {
					...widgetConfig,
					tryon_layout_background_image: String(payload.url),
					tryon_layout: "hero" as const,
				};
				setWidgetConfig(nextConfig);
				await fetchJson(withStoreQuery("/api/widget-config"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(nextConfig),
				});
				setNotice(t("widget.configSaved"));
			} catch (requestError) {
				setError(requestError instanceof Error ? requestError.message : t("feedback.error"));
			} finally {
				setHeroUploading(false);
			}
		},
		[t, widgetConfig, withStoreQuery],
	);

	const [syncReport, setSyncReport] = useState<WebhookSyncReport | null>(null);

	const syncStore = useCallback(async () => {
		setBusyAction("sync");
		setError(null);
		try {
			const response = await fetchJson<StoreSyncResponse>(withStoreQuery("/api/admin/sync"), {
				method: "POST",
			});
			setSyncReport(response.webhookSync || null);
			await loadContext();
			setNotice(t("dashboard.syncSuccess"));
		} catch (requestError) {
			setSyncReport(null);
			setError(requestError instanceof Error ? requestError.message : t("feedback.error"));
		} finally {
			setBusyAction(null);
		}
	}, [loadContext, t, withStoreQuery]);

	const activatePlan = useCallback(
		async (planId: string) => {
			setBusyAction(`plan:${planId}`);
			setError(null);
			try {
				const response = await fetchJson<{
					ok: boolean;
					checkoutRequired?: boolean;
					checkoutUrl?: string;
					record?: unknown;
					debug?: unknown;
				}>(withStoreQuery("/api/billing/plan"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ planId }),
				});
				if (response.checkoutRequired && response.checkoutUrl) {
					setNotice(t("billing.checkoutRedirect"));
					window.location.href = response.checkoutUrl;
					return;
				}
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

	const openBillingPortal = useCallback(async () => {
		setBusyAction("billing-portal");
		setError(null);
		try {
			const response = await fetchJson<{ ok: boolean; portalUrl?: string }>(
				withStoreQuery("/api/billing/portal"),
				{ method: "POST" },
			);
			if (response.portalUrl) {
				window.location.href = response.portalUrl;
				return;
			}
			setError(t("feedback.error"));
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : t("feedback.error"));
		} finally {
			setBusyAction(null);
		}
	}, [t, withStoreQuery]);

	if (loading) {
		return (
			<div className="omafit-brand-shell omafit-admin">
				<div className="omafit-brand-shell__content omafit-admin__shell">
					<div className="omafit-admin-card">{t("common.loading")}</div>
				</div>
			</div>
		);
	}

	const whatsappMarketingEnabled = context?.billing.whatsapp_marketing_enabled === true;

	return (
		<div className="omafit-brand-shell omafit-admin">
			<div className="omafit-brand-shell__content omafit-admin__shell">
				<OmafitBrandBanner variant={section === "dashboard" ? "hero" : "compact"} />

				<nav className="omafit-admin-nav">
					{(
						[
							["dashboard", t("nav.dashboard")],
							["billing", t("nav.billing")],
							["widget", t("nav.widget")],
							["size-charts", t("nav.sizeCharts")],
							["analytics", t("nav.analytics")],
							...(whatsappMarketingEnabled
								? ([["try-on-marketing", t("nav.tryOnMarketing")]] as Array<[SectionId, string]>)
								: []),
						] as Array<[SectionId, string]>
					).map(([id, label]) => (
						<button
							key={id}
							type="button"
							className={`omafit-admin-nav__item${section === id ? " omafit-admin-nav__item--active" : ""}`}
							onClick={() => setSection(id)}
						>
							{label}
						</button>
					))}
				</nav>

				{notice ? <div className="omafit-admin-alert omafit-admin-alert--success">{notice}</div> : null}

				{error ? <div className="omafit-admin-alert omafit-admin-alert--error">{error}</div> : null}

				{context?.billing.status && context.billing.status !== "active" ? (
					<div className="omafit-admin-alert omafit-admin-alert--warning">{t("billing.inactiveBanner")}</div>
				) : null}

				{section === "dashboard" && context ? (
					<DashboardSection
						context={context}
						onSelectSection={setSection}
						onSyncStore={syncStore}
						syncBusy={busyAction === "sync"}
						syncReport={syncReport}
						onReconnect={() => {
							if (!context.auth.authUrl) return;
							if (window.top && window.top !== window) {
								window.top.location.href = context.auth.authUrl;
								return;
							}
							window.location.href = context.auth.authUrl;
						}}
					/>
				) : null}

				{section === "billing" && context ? (
					<BillingSection
						context={context}
						onActivatePlan={activatePlan}
						onOpenPortal={openBillingPortal}
						busyAction={busyAction}
						withStoreQuery={withStoreQuery}
						onSyncStore={syncStore}
						syncBusy={busyAction === "sync"}
						syncReport={syncReport}
					/>
				) : null}

				{section === "widget" && context ? (
					<WidgetSection
						config={widgetConfig}
						collections={collections}
						currentPlan={context.billing.plan || "ondemand"}
						onChange={setWidgetConfig}
						onSave={saveWidget}
						onUploadLogo={uploadLogo}
						onUploadHeroBackground={uploadHeroBackground}
						busy={busyAction === "widget"}
						logoUploading={busyAction === "logo-upload"}
						heroUploading={heroUploading}
					/>
				) : null}

				{section === "size-charts" ? (
					<SizeChartsSection
						collections={collections}
						withStoreQuery={withStoreQuery}
						onNotice={(message) => {
							setNotice(message);
							setError(null);
						}}
						onError={(message) => {
							setError(message);
						}}
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

				{section === "try-on-marketing" ? (
					<TryOnMarketingSection
						collections={collections}
						withStoreQuery={withStoreQuery}
						planLocked={!whatsappMarketingEnabled}
						onUpgrade={() => setSection("billing")}
						onNotice={(message) => {
							setNotice(message);
							setError(null);
						}}
						onError={(message) => {
							setError(message);
						}}
					/>
				) : null}
			</div>
		</div>
	);
}

function webhookStatusLabel(
	row: { status: string },
	t: (key: string, vars?: Record<string, string | number | null>) => string,
) {
	if (row.status === "created") return t("dashboard.webhookStatus.created");
	if (row.status === "existing") return t("dashboard.webhookStatus.existing");
	if (row.status === "conflict") return t("dashboard.webhookStatus.conflict");
	return t("dashboard.webhookStatus.failed");
}

function webhookRowDetail(
	row: {
		status: string;
		error?: string;
		existingUrl?: string;
		httpStatus?: number;
	},
	t: (key: string, vars?: Record<string, string | number | null>) => string,
) {
	if (row.error === "missing_read_orders_scope") {
		return t("dashboard.webhookError.missingOrdersScope");
	}
	if (row.status === "conflict" && row.existingUrl) {
		return t("dashboard.webhookError.conflictUrl", { url: row.existingUrl });
	}
	if (row.error) {
		return t("dashboard.webhookError.api", {
			status: row.httpStatus || "—",
			message: row.error,
		});
	}
	return null;
}

function WebhookSyncReportView({
	report,
	t,
}: {
	report: WebhookSyncReport | null;
	t: (key: string, vars?: Record<string, string | number | null>) => string;
}) {
	if (!report) return null;
	if (report.skipped) {
		return (
			<div className="omafit-admin-alert omafit-admin-alert--warning">
				{t("dashboard.webhookSyncSkipped", { reason: report.reason || "—" })}
			</div>
		);
	}
	const orderPaid = report.results?.find((row) => row.event === "order/paid");
	return (
		<div style={{ display: "grid", gap: 8 }}>
			<strong>{t("dashboard.webhookSyncTitle")}</strong>
			{report.hasOrdersScope === false ? (
				<div className="omafit-admin-alert omafit-admin-alert--warning">
					{t("dashboard.webhookMissingOrdersScope")}
				</div>
			) : null}
			<ul style={{ margin: 0, paddingLeft: 18 }}>
				{(report.results || []).map((row) => {
					const detail = webhookRowDetail(row, t);
					return (
						<li key={row.event} style={subtleTextStyle}>
							{row.event}: {webhookStatusLabel(row, t)}
							{detail ? (
								<div style={{ marginTop: 4, fontSize: 12 }}>{detail}</div>
							) : null}
						</li>
					);
				})}
			</ul>
			{orderPaid?.status === "existing" || orderPaid?.status === "created" ? (
				<span className="omafit-admin-pill omafit-admin-pill--success">
					{t("dashboard.orderPaidReady")}
				</span>
			) : (
				<span className="omafit-admin-pill omafit-admin-pill--warning">
					{t("dashboard.orderPaidMissing")}
				</span>
			)}
		</div>
	);
}

function DashboardSection({
	context,
	onReconnect,
	onSelectSection,
	onSyncStore,
	syncBusy,
	syncReport,
}: {
	context: OmafitAdminContext;
	onReconnect: () => void;
	onSelectSection: (section: SectionId) => void;
	onSyncStore: () => Promise<void>;
	syncBusy: boolean;
	syncReport: WebhookSyncReport | null;
}) {
	const { t } = useI18n();
	const usage = context.billing.usage;
	const showUsage = context.billing.status === "active";
	const imagesIncluded = usage.imagesIncluded;
	const imagesUsed = usage.imagesUsed;
	const usageLabel =
		usage.unlimited || imagesIncluded <= 0
			? String(imagesUsed)
			: `${imagesUsed} / ${imagesIncluded}`;

	return (
		<div style={{ display: "grid", gap: 20 }}>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
					gap: 16,
				}}
			>
				<StatCard label={t("dashboard.storeName")} value={context.store.name} />
				<StatCard label={t("dashboard.storeUrl")} value={context.store.url || "—"} />
				<StatCard
					label={t("dashboard.plan")}
					value={getPlanDisplayName(context.billing.plans, context.billing.plan)}
				/>
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
					{context.auth.lastSyncAt ? (
						<span style={subtleTextStyle}>
							{t("dashboard.lastSync")}: {new Date(context.auth.lastSyncAt).toLocaleString()}
						</span>
					) : null}
					{context.auth.connected ? (
						<button
							type="button"
							className="omafit-admin-btn omafit-admin-btn--primary"
							onClick={() => void onSyncStore()}
							disabled={syncBusy}
						>
							{syncBusy ? t("common.loading") : t("dashboard.syncStore")}
						</button>
					) : null}
					{!context.auth.connected ? (
						<button type="button" className="omafit-admin-btn omafit-admin-btn--primary" onClick={onReconnect}>
							{t("nav.reconnect")}
						</button>
					) : null}
				</div>
			</div>

			{syncReport ? (
				<div style={{ ...cardStyle, display: "grid", gap: 10 }}>
					<span style={subtleTextStyle}>{t("dashboard.syncHint")}</span>
					<WebhookSyncReportView report={syncReport} t={t} />
				</div>
			) : null}

			{showUsage ? (
				<div style={{ ...cardStyle, display: "grid", gap: 14 }}>
					<strong style={{ fontSize: 16 }}>{t("dashboard.monthlyUsage")}</strong>
					<div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
						<span style={{ fontWeight: 600 }}>{t("dashboard.imagesGenerated")}</span>
						<strong style={{ fontSize: 18 }}>{usageLabel}</strong>
					</div>
					{!usage.unlimited && imagesIncluded > 0 ? (
						<>
							<UsageProgressBar percentage={usage.percentage} />
							<div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
								<span style={subtleTextStyle}>{t("dashboard.remaining")}</span>
								<span>
									{usage.remaining ?? 0} {t("dashboard.imagesUnit")}
								</span>
							</div>
						</>
					) : usage.unlimited ? (
						<div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
							<span style={subtleTextStyle}>{t("dashboard.remaining")}</span>
							<span>{t("billing.unlimited")}</span>
						</div>
					) : null}
					{!usage.unlimited && imagesIncluded > 0 && usage.extraImages > 0 ? (
						<div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
							<span style={subtleTextStyle}>{t("dashboard.extraImagesLabel")}</span>
							<strong>
								{usage.extraImages} {t("dashboard.imagesUnit")}
							</strong>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function BillingSection({
	context,
	onActivatePlan,
	onOpenPortal,
	busyAction,
	withStoreQuery,
	onSyncStore,
	syncBusy,
	syncReport,
}: {
	context: OmafitAdminContext;
	onActivatePlan: (planId: string) => Promise<void>;
	onOpenPortal: () => Promise<void>;
	busyAction: string | null;
	withStoreQuery: (path: string) => string;
	onSyncStore: () => Promise<void>;
	syncBusy: boolean;
	syncReport: WebhookSyncReport | null;
}) {
	const { t } = useI18n();
	const [billingDebug, setBillingDebug] = useState<BillingDebugSnapshot | null>(null);
	const [billingDebugLoading, setBillingDebugLoading] = useState(false);
	const [billingDebugError, setBillingDebugError] = useState<string | null>(null);
	const stripe = context.billing.stripe;
	const stripeStatusLabel = (() => {
		if (!stripe?.configured) return t("billing.stripeNotConfigured");
		const status = String(stripe.paymentStatus || "").toLowerCase();
		if (status === "active" || status === "trialing") return t("billing.stripeActive");
		if (status === "past_due") return t("billing.stripePastDue");
		if (status === "canceled") return t("billing.stripeCanceled");
		return stripe.hasPaymentMethod ? t("billing.stripeActive") : "—";
	})();

	const runBillingDiagnostic = useCallback(async () => {
		setBillingDebugLoading(true);
		setBillingDebugError(null);
		try {
			const snapshot = await fetchJson<BillingDebugSnapshot>(
				withStoreQuery("/api/billing/debug"),
			);
			setBillingDebug(snapshot);
		} catch (requestError) {
			setBillingDebug(null);
			setBillingDebugError(
				requestError instanceof Error ? requestError.message : t("feedback.error"),
			);
		} finally {
			setBillingDebugLoading(false);
		}
	}, [t, withStoreQuery]);

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 6 }}>
				<strong style={{ fontSize: 18 }}>{t("billing.title")}</strong>
				<span style={subtleTextStyle}>{t("billing.subtitle")}</span>
				<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
					<button
						type="button"
						className="omafit-admin-btn"
						onClick={() => void runBillingDiagnostic()}
						disabled={billingDebugLoading}
					>
						{billingDebugLoading ? t("common.loading") : t("billing.diagnose")}
					</button>
					{stripe?.configured && stripe?.hasPaymentMethod ? (
						<button
							type="button"
							className="omafit-admin-btn"
							onClick={() => void onOpenPortal()}
							disabled={busyAction === "billing-portal"}
						>
							{busyAction === "billing-portal" ? t("common.loading") : t("billing.managePayment")}
						</button>
					) : null}
					<button
						type="button"
						className="omafit-admin-btn omafit-admin-btn--primary"
						onClick={() => void onSyncStore()}
						disabled={syncBusy}
					>
						{syncBusy ? t("common.loading") : t("dashboard.syncStore")}
					</button>
				</div>
			</div>

			{syncReport ? (
				<div style={{ ...cardStyle, display: "grid", gap: 10 }}>
					<WebhookSyncReportView report={syncReport} t={t} />
				</div>
			) : null}

			{billingDebugError ? (
				<div className="omafit-admin-alert omafit-admin-alert--warning">{billingDebugError}</div>
			) : null}

			{billingDebug ? (
				<div style={{ ...cardStyle, display: "grid", gap: 12 }}>
					<strong>{t("billing.diagnoseTitle")}</strong>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
						{billingDebug.checks?.selfBillingActive ? (
							<BillingStatusPill
								ok={billingDebug.checks?.selfBillingReady === true}
								label={t("billing.selfBillingReady")}
							/>
						) : (
							<BillingStatusPill
								ok={billingDebug.checks?.nativeBillingReady === true}
								label={t("billing.nativeBillingReady")}
							/>
						)}
						<BillingStatusPill
							ok={billingDebug.checks?.chargesReady === true}
							label={t("billing.chargesReady")}
						/>
						<BillingStatusPill
							ok={billingDebug.checks?.webhooksReady === true}
							label={t("billing.webhooksReady")}
						/>
					</div>
					{Number(billingDebug.recordPendingOverageAmount || 0) > 0 ? (
						<div style={subtleTextStyle}>
							{t("billing.pendingOverage")}:{" "}
							{formatMoney(
								Number(billingDebug.recordPendingOverageAmount || 0),
								context.billing.usage.currency,
							)}
						</div>
					) : null}
					{billingDebug.effectiveConceptCode ? (
						<div style={subtleTextStyle}>
							{t("billing.conceptCode")}: {billingDebug.effectiveConceptCode}
						</div>
					) : null}
					{billingDebug.effectiveServiceId ? (
						<div style={subtleTextStyle}>
							{t("billing.effectiveServiceId")}: {billingDebug.effectiveServiceId}
						</div>
					) : null}
					{billingDebug.webhookState?.events?.length ? (
						<div style={subtleTextStyle}>
							{t("billing.registeredWebhooks")}:{" "}
							{billingDebug.webhookState.events.map((item) => item.event).join(", ")}
						</div>
					) : null}
					{billingDebug.checks?.issues?.length ? (
						<div style={{ display: "grid", gap: 6 }}>
							<strong>{t("billing.issues")}</strong>
							<ul style={{ margin: 0, paddingLeft: 18 }}>
								{billingDebug.checks.issues.map((issue) => (
									<li key={issue} style={subtleTextStyle}>
										{issue}
									</li>
								))}
							</ul>
						</div>
					) : (
						<div style={subtleTextStyle}>{t("billing.noIssues")}</div>
					)}
					{billingDebug.checks?.recommendations?.length ? (
						<div style={{ display: "grid", gap: 6 }}>
							<strong>{t("billing.recommendations")}</strong>
							<ul style={{ margin: 0, paddingLeft: 18 }}>
								{billingDebug.checks.recommendations.map((item) => (
									<li key={item} style={subtleTextStyle}>
										{item}
									</li>
								))}
							</ul>
						</div>
					) : null}
				</div>
			) : null}

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
					gap: 16,
				}}
			>
				<StatCard
					label={t("billing.currentPlan")}
					value={getPlanDisplayName(context.billing.plans, context.billing.plan)}
				/>
				<StatCard label={t("billing.status")} value={context.billing.status} />
				{stripe?.configured ? (
					<StatCard label={t("billing.stripePaymentStatus")} value={stripeStatusLabel} />
				) : null}
				<StatCard
					label={t("billing.remaining")}
					value={
						context.billing.usage.unlimited
							? t("billing.unlimited")
							: String(context.billing.usage.remaining ?? 0)
					}
				/>
				<StatCard label={t("billing.extra")} value={String(context.billing.usage.extraImages)} />
				{context.billing.usage.pendingOverageAmount != null &&
				context.billing.usage.pendingOverageAmount > 0 ? (
					<StatCard
						label={t("billing.pendingOverage")}
						value={formatMoney(
							context.billing.usage.pendingOverageAmount,
							context.billing.usage.currency,
						)}
					/>
				) : null}
			</div>

			{context.billing.mode === "self" ||
			context.billing.mode === "stripe" ||
			context.billing.usage.billingMode === "self" ||
			context.billing.usage.billingMode === "stripe" ? (
				<div className="omafit-admin-alert omafit-admin-alert--info">
					{t("billing.selfBillingNote")}
				</div>
			) : null}

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
							{t("billing.monthlyPrice")}:{" "}
							{plan.monthlyPriceUsd && plan.monthlyPriceUsd > 0
								? `$${plan.monthlyPriceUsd}/30 ${t("billing.days")}`
								: plan.monthlyPrice > 0
									? formatMoney(plan.monthlyPrice, plan.currency)
									: t("billing.free")}
						</div>
						{plan.annualPriceUsd ? (
							<div style={subtleTextStyle}>
								{t("billing.annualPrice")}: ${plan.annualPriceUsd.toLocaleString("en-US")}
								{plan.annualDiscountUsd
									? ` (${t("billing.annualDiscount", { amount: `$${plan.annualDiscountUsd.toLocaleString("en-US")}` })})`
									: ""}
							</div>
						) : null}
						<div style={subtleTextStyle}>
							{t("billing.planIncludes")}:{" "}
							{plan.unlimitedTryOn ? t("billing.unlimited") : plan.imagesIncluded}
						</div>
						<div style={subtleTextStyle}>
							{t("billing.pricePerExtra")}:{" "}
							{plan.unlimitedTryOn
								? t("billing.planEnterpriseExtra")
								: formatMoney(plan.pricePerExtraImage, plan.currency)}
						</div>
						{plan.featureKeys?.length ? (
							<ul style={{ ...subtleTextStyle, margin: 0, paddingLeft: 18 }}>
								{plan.featureKeys.map((key) => (
									<li key={key}>{t(key)}</li>
								))}
							</ul>
						) : null}
						<button
							type="button"
							className={
								plan.id === context.billing.plan
									? "omafit-admin-btn"
									: "omafit-admin-btn omafit-admin-btn--primary"
							}
							onClick={() => onActivatePlan(plan.id)}
							disabled={busyAction === `plan:${plan.id}`}
						>
							{busyAction === `plan:${plan.id}`
								? t("common.loading")
								: plan.id === context.billing.plan
									? t("billing.currentPlanBadge")
									: context.billing.status === "active"
										? t("billing.switchPlan")
										: t("billing.subscribePlan")}
						</button>
					</div>
				))}
			</div>
		</div>
	);
}

function BillingStatusPill({ ok, label }: { ok: boolean; label: string }) {
	return (
		<span
			className={
				ok ? "omafit-admin-pill omafit-admin-pill--success" : "omafit-admin-pill omafit-admin-pill--neutral"
			}
		>
			{label}: {ok ? "OK" : "—"}
		</span>
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
	const fitNameMap: Record<string, string> = {
		"0": "Ajustado",
		"1": "Regular",
		"2": "Solto",
	};
	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 10 }}>
				<strong style={{ fontSize: 18 }}>{t("analytics.title")}</strong>
				<span style={subtleTextStyle}>{t("analytics.subtitle")}</span>
				<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
					<select className="omafit-admin-select" value={days} onChange={(event) => onChangeDays(event.target.value)}>
						<option value="7">7 dias</option>
						<option value="30">30 dias</option>
						<option value="90">90 dias</option>
						<option value="365">365 dias</option>
					</select>
					<button
						type="button"
						className="omafit-admin-btn omafit-admin-btn--primary"
						onClick={onReload}
						disabled={busy}
					>
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

					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
							gap: 16,
						}}
					>
						<StatCard
							label="Pedidos antes do Omafit"
							value={data.orderMetrics.ordersBefore != null ? String(data.orderMetrics.ordersBefore) : "—"}
						/>
						<StatCard
							label="Pedidos depois do Omafit"
							value={String(data.orderMetrics.ordersAfter ?? 0)}
						/>
						<StatCard
							label="Devoluções antes"
							value={data.orderMetrics.returnsBefore != null ? String(data.orderMetrics.returnsBefore) : "—"}
						/>
						<StatCard
							label="Conversão depois"
							value={
								data.orderMetrics.conversionAfter != null
									? `${data.orderMetrics.conversionAfter.toFixed(1)}%`
									: "—"
							}
						/>
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

					<div style={{ ...cardStyle, display: "grid", gap: 10 }}>
						<strong style={{ fontSize: 18 }}>Impacto financeiro</strong>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
							<StatCard
								label="ROI estimado"
								value={
									data.finance?.estimatedRoiPercent != null
										? `${data.finance.estimatedRoiPercent.toFixed(1)}%`
										: "—"
								}
							/>
							<StatCard
								label="Receita atribuída ao Omafit"
								value={formatMoney(data.finance?.attributedRevenue ?? null, data.currency || data.usage.currency)}
							/>
							<StatCard
								label="Custo evitado estimado"
								value={formatMoney(data.finance?.estimatedCostAvoided ?? null, data.currency || data.usage.currency)}
							/>
						</div>
					</div>

					<div style={{ ...cardStyle, display: "grid", gap: 10 }}>
						<strong style={{ fontSize: 18 }}>Performance</strong>
						<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
							<StatCard label="Sessões totais" value={String(data.performance?.sessionsTotal ?? data.totalSessions)} />
							<StatCard label="Sessões com perfil" value={String(data.performance?.sessionsWithProfile ?? 0)} />
							<StatCard
								label="Sessões com recomendação"
								value={String(data.performance?.sessionsWithRecommendation ?? 0)}
							/>
							<StatCard
								label="Duração média da sessão"
								value={
									data.performance?.avgSessionSeconds != null
										? `${Math.round(data.performance.avgSessionSeconds)}s`
										: "—"
								}
							/>
						</div>
					</div>

					<div style={{ ...cardStyle, display: "grid", gap: 10 }}>
						<strong style={{ fontSize: 18 }}>Qualidade</strong>
						<span style={subtleTextStyle}>
							Cobertura de recomendação:{" "}
							{data.quality?.recommendationCoveragePercent != null
								? `${data.quality.recommendationCoveragePercent.toFixed(1)}%`
								: "—"}
						</span>
						<span style={subtleTextStyle}>{data.quality?.tableDivergenceAlert || "Sem alertas no período."}</span>
					</div>

					<TwoColumnList
						leftTitle="Coleção + gênero (mais frequentes)"
						leftItems={(data.byCollectionGender || []).map(
							(item) =>
								`${item.collection} · ${item.gender} · tam ${item.mostSize?.value || "—"} · ajuste ${fitNameMap[item.mostFit?.value || ""] || "—"} · corpo ${item.mostBodyType?.value || "—"}`,
						)}
						rightTitle="Heatmap coleção x tamanho"
						rightItems={(data.intelligence?.heatmapRows || []).map(
							(item) => `${item.collection} · ${item.size}: ${item.count}`,
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
		<div className="omafit-admin-card" style={{ display: "grid", gap: 8 }}>
			<span className="omafit-admin-stat__label">{label}</span>
			<strong className="omafit-admin-stat__value">{value}</strong>
		</div>
	);
}

function UsageProgressBar({ percentage }: { percentage: number }) {
	return (
		<div
			className="omafit-admin-progress"
			role="progressbar"
			aria-valuenow={percentage}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<div
				className="omafit-admin-progress__bar"
				style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
			/>
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
		<button type="button" className="omafit-admin-btn" onClick={onClick}>
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
	const className =
		tone === "success"
			? "omafit-admin-pill omafit-admin-pill--success"
			: tone === "warning"
				? "omafit-admin-pill omafit-admin-pill--warning"
				: "omafit-admin-pill omafit-admin-pill--neutral";
	return <span className={className}>{label}</span>;
}

export function OmafitAdminApp(props: AdminAppProps) {
	return (
		<AdminErrorBoundary>
			<I18nProvider locale={props.store.language}>
				<AppContent {...props} />
			</I18nProvider>
		</AdminErrorBoundary>
	);
}

class AdminErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
	state = { error: null as Error | null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error) {
		console.error("[Omafit Admin] Render error:", error);
	}

	render() {
		if (this.state.error) {
			return (
				<div style={{ minHeight: "100vh", padding: 32, fontFamily: "Inter, system-ui, sans-serif" }}>
					<div
						style={{
							maxWidth: 720,
							margin: "0 auto",
							background: "#fff",
							border: "1px solid #e5e7eb",
							borderRadius: 18,
							padding: 24,
						}}
					>
						<h1 style={{ marginTop: 0 }}>Omafit</h1>
						<p>Nao foi possivel renderizar o painel.</p>
						<pre
							style={{
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
								background: "#f8fafc",
								padding: 12,
								borderRadius: 12,
							}}
						>
							{this.state.error.message}
						</pre>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}
