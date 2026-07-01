import {
	ACTION_NAVIGATE_SYNC,
	navigateHeader,
	syncPathname,
	type NexoClient,
} from "../lib/nexo";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { I18nProvider, useI18n } from "./i18n";
import { OmafitBrandBanner } from "./OmafitBrandBanner";
import { SizeChartsSection } from "./SizeChartsSection";
import { WidgetSection } from "./WidgetSection";
import type {
	OmafitAdminContext,
	OmafitAnalyticsSummary,
	OmafitCollection,
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
	const [days, setDays] = useState("30");
	const [busyAction, setBusyAction] = useState<string | null>(null);
	const [heroUploading, setHeroUploading] = useState(false);

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
			navigateHeader(nexo, {
				text: `Omafit · ${t(
					`nav.${nextSection === "size-charts" ? "sizeCharts" : nextSection}`,
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

	const activatePlan = useCallback(
		async (planId: string) => {
			setBusyAction(`plan:${planId}`);
			setError(null);
			try {
				const response = await fetchJson<{
					ok: boolean;
					record?: unknown;
					debug?: unknown;
				}>(withStoreQuery("/api/billing/plan"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ planId }),
				});
				// #region agent log
				console.info("[Omafit Debug] H17 billing_plan_success_json", JSON.stringify(response));
				// #endregion
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
		<div style={pageStyle} className="omafit-brand-shell">
			<div style={shellStyle} className="omafit-brand-shell__content">
				<OmafitBrandBanner variant={section === "dashboard" ? "hero" : "compact"} />

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

				{context?.billing.status && context.billing.status !== "active" ? (
					<div
						style={{
							...cardStyle,
							borderColor: "#fde68a",
							background: "#fffbeb",
							color: "#92400e",
						}}
					>
						{t("billing.inactiveBanner")}
					</div>
				) : null}

				{section === "dashboard" && context ? (
					<DashboardSection
						context={context}
						onSelectSection={setSection}
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
						busyAction={busyAction}
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
					{!context.auth.connected ? (
						<button type="button" style={primaryButtonStyle} onClick={onReconnect}>
							{t("nav.reconnect")}
						</button>
					) : null}
				</div>
			</div>

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
				<StatCard
					label={t("billing.currentPlan")}
					value={getPlanDisplayName(context.billing.plans, context.billing.plan)}
				/>
				<StatCard label={t("billing.status")} value={context.billing.status} />
				<StatCard
					label={t("billing.remaining")}
					value={
						context.billing.usage.unlimited
							? t("billing.unlimited")
							: String(context.billing.usage.remaining ?? 0)
					}
				/>
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
							style={plan.id === context.billing.plan ? primaryButtonStyle : buttonBaseStyle}
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
		<div style={{ ...cardStyle, display: "grid", gap: 8 }}>
			<span style={subtleTextStyle}>{label}</span>
			<strong style={{ fontSize: 24 }}>{value}</strong>
		</div>
	);
}

function UsageProgressBar({ percentage }: { percentage: number }) {
	const tone = percentage > 70 ? "#2563eb" : "#16a34a";
	return (
		<div
			style={{
				width: "100%",
				height: 8,
				borderRadius: 999,
				background: "#e5e7eb",
				overflow: "hidden",
			}}
			role="progressbar"
			aria-valuenow={percentage}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<div
				style={{
					width: `${Math.max(0, Math.min(100, percentage))}%`,
					height: "100%",
					background: tone,
					borderRadius: 999,
					transition: "width 0.2s ease",
				}}
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
