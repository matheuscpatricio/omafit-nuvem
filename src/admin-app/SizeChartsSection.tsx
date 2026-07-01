import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "./i18n";
import {
	type GenderKey,
	type ScopedChartsState,
	DEFAULT_REFS,
	chartsFromApiRows,
	chartsToApiRows,
	createEmptyCollectionCharts,
	getDefaultSizesForRefs,
	getExpectedMeasurementCount,
	getMeasurementRefsForCollectionType,
	isFootwearCollectionType,
	normalizeGenderScope,
	normalizeMeasurementRefsForType,
} from "./sizeChartModel";
import type { OmafitCollection, OmafitProduct, OmafitSizeChart } from "../shared/models";

const cardStyle = {
	background: "#ffffff",
	border: "1px solid #e5e7eb",
	borderRadius: 18,
	padding: 20,
	boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
} as const;

const subtleTextStyle = {
	color: "#6b7280",
	fontSize: 14,
	lineHeight: 1.5,
} as const;

const buttonBaseStyle = {
	borderRadius: 12,
	padding: "10px 16px",
	border: "1px solid #d1d5db",
	cursor: "pointer",
	fontSize: 14,
	fontWeight: 600,
	background: "#ffffff",
} as const;

const primaryButtonStyle = {
	...buttonBaseStyle,
	background: "#111827",
	borderColor: "#111827",
	color: "#ffffff",
} as const;

const inputStyle = {
	width: "100%",
	borderRadius: 12,
	border: "1px solid #d1d5db",
	padding: "12px 14px",
	fontSize: 14,
	boxSizing: "border-box" as const,
};

const labelStyle = {
	display: "grid",
	gap: 8,
	fontSize: 13,
	fontWeight: 600,
	color: "#374151",
} as const;

const tabButtonStyle = (active: boolean) => ({
	...buttonBaseStyle,
	background: active ? "#111827" : "#ffffff",
	color: active ? "#ffffff" : "#111827",
	borderColor: active ? "#111827" : "#d1d5db",
});

type SizeChartsSectionProps = {
	collections: OmafitCollection[];
	withStoreQuery: (path: string) => string;
	onNotice: (message: string) => void;
	onError: (message: string | null) => void;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
	const response = await fetch(url, options);
	const text = await response.text();
	const payload = text ? JSON.parse(text) : {};
	if (!response.ok) {
		throw new Error(payload.error || payload.message || "Request failed");
	}
	return payload as T;
}

export function SizeChartsSection({
	collections,
	withStoreQuery,
	onNotice,
	onError,
}: SizeChartsSectionProps) {
	const { t } = useI18n();
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [charts, setCharts] = useState<ScopedChartsState>({ collection: {}, product: {} });
	const [selectedScopeTab, setSelectedScopeTab] = useState(0);
	const [selectedCollectionIndex, setSelectedCollectionIndex] = useState(0);
	const [selectedProductIndex, setSelectedProductIndex] = useState(0);
	const [selectedGenderTab, setSelectedGenderTab] = useState(0);
	const [productsLoading, setProductsLoading] = useState(false);
	const [productsError, setProductsError] = useState<string | null>(null);
	const [products, setProducts] = useState<OmafitProduct[]>([]);
	const [collectionSearch, setCollectionSearch] = useState("");
	const [productSearch, setProductSearch] = useState("");

	const collectionHandles = useMemo(() => ["", ...collections.map((c) => c.handle)], [collections]);
	const productHandles = useMemo(
		() => products.map((p) => p.handle).filter(Boolean),
		[products],
	);
	const selectedScope = selectedScopeTab === 1 ? "product" : "collection";
	const selectedCollectionHandle = collectionHandles[selectedCollectionIndex] ?? "";
	const selectedProductHandle = productHandles[selectedProductIndex] ?? "";
	const selectedHandle =
		selectedScope === "product" ? selectedProductHandle : selectedCollectionHandle;

	const loadSizeCharts = useCallback(async () => {
		const data = await fetchJson<{ charts: OmafitSizeChart[] }>(
			withStoreQuery("/api/size-charts"),
		);
		setCharts(chartsFromApiRows(data.charts || []));
	}, [withStoreQuery]);

	const loadProducts = useCallback(async () => {
		try {
			setProductsLoading(true);
			setProductsError(null);
			const data = await fetchJson<{ products: OmafitProduct[] }>(
				withStoreQuery("/api/products"),
			);
			setProducts(
				(data.products || [])
					.filter((item) => item?.handle)
					.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""))),
			);
		} catch {
			setProductsError(t("sizeChart.errorLoadProducts"));
		} finally {
			setProductsLoading(false);
		}
	}, [t, withStoreQuery]);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		Promise.all([loadSizeCharts(), loadProducts()])
			.catch(() => {
				if (!cancelled) onError(t("feedback.error"));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [loadProducts, loadSizeCharts, onError, t]);

	const getScopeCharts = useCallback(
		(scope = selectedScope) => charts[scope] || {},
		[charts, selectedScope],
	);

	const getChart = useCallback(
		(handle: string, gender: GenderKey, scope = selectedScope) => {
			const coll = getScopeCharts(scope)[handle];
			const collectionType = coll?.collectionType ?? "upper";
			const fallback = {
				enabled: false,
				measurementRefs: getMeasurementRefsForCollectionType(collectionType),
				sizes: [],
			};
			if (!coll) return fallback;
			const chart = coll[gender];
			if (!chart) return fallback;
			return {
				...chart,
				measurementRefs: normalizeMeasurementRefsForType(
					chart.measurementRefs,
					collectionType,
				),
			};
		},
		[getScopeCharts, selectedScope],
	);

	const getCollectionType = useCallback(
		(handle: string, scope = selectedScope) => {
			const type = getScopeCharts(scope)[handle]?.collectionType;
			return type === "upper" || type === "lower" || type === "full" || type === "footwear"
				? type
				: "upper";
		},
		[getScopeCharts, selectedScope],
	);

	const setCollectionType = useCallback(
		(handle: string, collectionType: OmafitSizeChart["collection_type"], scope = selectedScope) => {
			setCharts((prev) => {
				const next = { ...prev, [scope]: { ...(prev[scope] || {}) } };
				if (!next[scope][handle]) next[scope][handle] = createEmptyCollectionCharts();
				const nextMeasurementRefs = getMeasurementRefsForCollectionType(collectionType);
				const nextElasticity = isFootwearCollectionType(collectionType)
					? ""
					: next[scope][handle].collectionElasticity || "structured";
				const remapChart = (chart = { enabled: false, measurementRefs: nextMeasurementRefs, sizes: [] }) => ({
					...chart,
					measurementRefs: nextMeasurementRefs,
					sizes: (chart.sizes || []).map((row) => {
						const mapped: Record<string, string> = { size: row?.size ?? "" };
						for (const key of nextMeasurementRefs) mapped[key] = row?.[key] ?? "";
						return mapped;
					}),
				});
				next[scope][handle] = {
					...next[scope][handle],
					collectionType,
					collectionElasticity: nextElasticity,
					male: remapChart(next[scope][handle].male),
					female: remapChart(next[scope][handle].female),
					unisex: remapChart(next[scope][handle].unisex),
				};
				return next;
			});
		},
		[selectedScope],
	);

	const getCollectionElasticity = useCallback(
		(handle: string, scope = selectedScope) => {
			if (isFootwearCollectionType(getCollectionType(handle, scope))) return "";
			const elasticity = getScopeCharts(scope)[handle]?.collectionElasticity;
			return elasticity === "structured" ||
				elasticity === "light_flex" ||
				elasticity === "flexible" ||
				elasticity === "high_elasticity"
				? elasticity
				: "structured";
		},
		[getCollectionType, getScopeCharts, selectedScope],
	);

	const setCollectionElasticity = useCallback(
		(
			handle: string,
			collectionElasticity: OmafitSizeChart["collection_elasticity"],
			scope = selectedScope,
		) => {
			setCharts((prev) => {
				const next = { ...prev, [scope]: { ...(prev[scope] || {}) } };
				if (!next[scope][handle]) next[scope][handle] = createEmptyCollectionCharts();
				next[scope][handle] = { ...next[scope][handle], collectionElasticity };
				return next;
			});
		},
		[selectedScope],
	);

	const getGenderScope = useCallback(
		(handle: string, scope = selectedScope) =>
			normalizeGenderScope(getScopeCharts(scope)[handle]?.genderScope),
		[getScopeCharts, selectedScope],
	);

	const setGenderScope = useCallback(
		(handle: string, value: string, scope = selectedScope) => {
			const next = normalizeGenderScope(value);
			setCharts((prev) => {
				const updated = { ...prev, [scope]: { ...(prev[scope] || {}) } };
				if (!updated[scope][handle]) updated[scope][handle] = createEmptyCollectionCharts();
				updated[scope][handle] = { ...updated[scope][handle], genderScope: next };
				return updated;
			});
		},
		[selectedScope],
	);

	const setChart = useCallback(
		(
			handle: string,
			gender: GenderKey,
			updater: (current: ReturnType<typeof getChart>) => ReturnType<typeof getChart>,
			scope = selectedScope,
		) => {
			setCharts((prev) => {
				const next = { ...prev, [scope]: { ...(prev[scope] || {}) } };
				if (!next[scope][handle]) next[scope][handle] = createEmptyCollectionCharts();
				next[scope][handle] = {
					...next[scope][handle],
					[gender]: updater(next[scope][handle][gender] || getChart(handle, gender, scope)),
				};
				return next;
			});
		},
		[getChart, selectedScope],
	);

	const selectedGenderScope = getGenderScope(selectedHandle);
	const visibleGenderOptions = useMemo(() => {
		const all = [
			{ label: t("sizeChart.genderMale"), value: "male" as GenderKey },
			{ label: t("sizeChart.genderFemale"), value: "female" as GenderKey },
			{ label: t("sizeChart.genderUnisex"), value: "unisex" as GenderKey },
		];
		if (selectedGenderScope === "male") return all.filter((o) => o.value === "male");
		if (selectedGenderScope === "female") return all.filter((o) => o.value === "female");
		return all;
	}, [selectedGenderScope, t]);

	const visibleGenderTab = Math.min(selectedGenderTab, Math.max(0, visibleGenderOptions.length - 1));
	const currentGender = visibleGenderOptions[visibleGenderTab]?.value ?? "male";
	const selectedCollectionType = getCollectionType(selectedHandle);
	const isFootwearSelected = isFootwearCollectionType(selectedCollectionType);
	const currentChart = getChart(selectedHandle, currentGender);
	const selectedDisplayLabel =
		selectedScope === "product"
			? products[selectedProductIndex]?.title || selectedHandle || t("sizeChart.product")
			: selectedCollectionHandle
				? collections.find((c) => c.handle === selectedCollectionHandle)?.title ||
					selectedCollectionHandle
				: t("sizeChart.defaultCollection");

	useEffect(() => {
		if (selectedGenderTab > visibleGenderOptions.length - 1) setSelectedGenderTab(0);
	}, [visibleGenderOptions.length, selectedGenderTab]);

	const saveSizeCharts = async () => {
		try {
			setSaving(true);
			onError(null);
			await fetchJson(withStoreQuery("/api/size-charts"), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ charts: chartsToApiRows(charts) }),
			});
			await loadSizeCharts();
			onNotice(t("sizeChart.saved"));
		} catch (err) {
			onError(err instanceof Error ? err.message : t("sizeChart.errorSave"));
		} finally {
			setSaving(false);
		}
	};

	const collectionOptions = collectionHandles.map((handle, idx) => {
		const label =
			handle === ""
				? t("sizeChart.defaultCollection")
				: collections[idx - 1]?.title || handle;
		return { label, value: idx, searchable: `${label} ${handle}`.toLowerCase() };
	});

	const productOptions = productHandles.map((handle, idx) => {
		const title = products[idx]?.title || "";
		const label = title ? `${title} (${handle})` : handle;
		return { label, value: idx, searchable: `${title} ${handle}`.toLowerCase() };
	});

	const filteredCollectionOptions = collectionSearch.trim()
		? collectionOptions.filter((opt) =>
				opt.searchable.includes(collectionSearch.trim().toLowerCase()),
			)
		: collectionOptions;

	const filteredProductOptions = productSearch.trim()
		? productOptions.filter((opt) =>
				opt.searchable.includes(productSearch.trim().toLowerCase()),
			)
		: productOptions;

	if (loading) {
		return <div style={cardStyle}>{t("sizeChart.loadingTables")}</div>;
	}

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 16 }}>
				<div style={{ display: "grid", gap: 8 }}>
					<strong style={{ fontSize: 18 }}>{t("sizeChart.title")}</strong>
					<span style={subtleTextStyle}>{t("sizeChart.subtitle")}</span>
				</div>

				<div>
					<strong style={{ fontSize: 15 }}>{t("sizeChart.configureSizeTables")}</strong>
					<p style={{ ...subtleTextStyle, margin: "8px 0 12px" }}>{t("sizeChart.configureHelp")}</p>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							style={tabButtonStyle(selectedScopeTab === 0)}
							onClick={() => setSelectedScopeTab(0)}
						>
							{t("sizeChart.configureByCollection")}
						</button>
						<button
							type="button"
							style={tabButtonStyle(selectedScopeTab === 1)}
							onClick={() => setSelectedScopeTab(1)}
						>
							{t("sizeChart.configureByProduct")}
						</button>
					</div>
				</div>

				{selectedScope === "product" ? (
					<div style={{ display: "grid", gap: 8 }}>
						{productsLoading ? (
							<span style={subtleTextStyle}>{t("sizeChart.loadingProducts")}</span>
						) : null}
						{productsError ? (
							<span style={{ color: "#b91c1c", fontSize: 14 }}>{productsError}</span>
						) : null}
						<label style={labelStyle}>
							<span>{t("sizeChart.product")}</span>
							<input
								style={inputStyle}
								value={productSearch}
								placeholder={t("sizeChart.searchProductPlaceholder")}
								onChange={(e) => setProductSearch(e.target.value)}
								onFocus={() => setProductSearch("")}
								disabled={productHandles.length === 0}
							/>
						</label>
						{productHandles.length === 0 ? (
							<span style={subtleTextStyle}>{t("sizeChart.noProductsFound")}</span>
						) : (
							<div
								style={{
									maxHeight: 220,
									overflowY: "auto",
									border: "1px solid #e5e7eb",
									borderRadius: 12,
								}}
							>
								{(productSearch.trim() ? filteredProductOptions : productOptions).map((opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => {
											setSelectedProductIndex(opt.value);
											setProductSearch("");
										}}
										style={{
											...buttonBaseStyle,
											width: "100%",
											textAlign: "left",
											borderRadius: 0,
											border: "none",
											borderBottom: "1px solid #f3f4f6",
											background:
												selectedProductIndex === opt.value ? "#f3f4f6" : "#ffffff",
										}}
									>
										{opt.label}
									</button>
								))}
								{productSearch.trim() && filteredProductOptions.length === 0 ? (
									<div style={{ padding: 12, ...subtleTextStyle }}>
										{t("sizeChart.noProductsMatchSearch")}
									</div>
								) : null}
							</div>
						)}
					</div>
				) : (
					<div style={{ display: "grid", gap: 8 }}>
						<label style={labelStyle}>
							<span>{t("sizeChart.collection")}</span>
							<input
								style={inputStyle}
								value={collectionSearch}
								placeholder={t("sizeChart.searchCollectionPlaceholder")}
								onChange={(e) => setCollectionSearch(e.target.value)}
								onFocus={() => setCollectionSearch("")}
							/>
						</label>
						<div
							style={{
								maxHeight: 220,
								overflowY: "auto",
								border: "1px solid #e5e7eb",
								borderRadius: 12,
							}}
						>
							{(collectionSearch.trim() ? filteredCollectionOptions : collectionOptions).map(
								(opt) => (
									<button
										key={opt.value}
										type="button"
										onClick={() => {
											setSelectedCollectionIndex(opt.value);
											setCollectionSearch("");
										}}
										style={{
											...buttonBaseStyle,
											width: "100%",
											textAlign: "left",
											borderRadius: 0,
											border: "none",
											borderBottom: "1px solid #f3f4f6",
											background:
												selectedCollectionIndex === opt.value ? "#f3f4f6" : "#ffffff",
										}}
									>
										{opt.label}
									</button>
								),
							)}
							{collectionSearch.trim() && filteredCollectionOptions.length === 0 ? (
								<div style={{ padding: 12, ...subtleTextStyle }}>
									{t("sizeChart.noCollectionsMatchSearch")}
								</div>
							) : null}
						</div>
					</div>
				)}

				<div style={{ display: "grid", gap: 8 }}>
					<strong>{t("sizeChart.genderScopeTitle")}</strong>
					<span style={subtleTextStyle}>{t("sizeChart.genderScopeHelp")}</span>
					{(
						[
							["both", t("sizeChart.genderScopeBoth")],
							["male", t("sizeChart.genderScopeMale")],
							["female", t("sizeChart.genderScopeFemale")],
						] as const
					).map(([value, label]) => (
						<label key={value} style={{ display: "flex", gap: 8, alignItems: "center" }}>
							<input
								type="checkbox"
								checked={selectedGenderScope === value}
								onChange={(e) => e.target.checked && setGenderScope(selectedHandle, value)}
							/>
							<span>{label}</span>
						</label>
					))}
				</div>

				<div style={{ display: "grid", gap: 8 }}>
					<strong>{t("sizeChart.collectionTypeTitle")}</strong>
					<span style={subtleTextStyle}>{t("sizeChart.selectOneOption")}</span>
					{(
						[
							["upper", t("sizeChart.collectionTypeUpper")],
							["lower", t("sizeChart.collectionTypeLower")],
							["full", t("sizeChart.collectionTypeFull")],
							["footwear", t("sizeChart.collectionTypeFootwear")],
						] as const
					).map(([value, label]) => (
						<label key={value} style={{ display: "flex", gap: 8, alignItems: "center" }}>
							<input
								type="checkbox"
								checked={selectedCollectionType === value}
								onChange={(e) =>
									e.target.checked && setCollectionType(selectedHandle, value)
								}
							/>
							<span>{label}</span>
						</label>
					))}
				</div>

				{!isFootwearSelected ? (
					<div style={{ display: "grid", gap: 8 }}>
						<strong>{t("sizeChart.collectionElasticityTitle")}</strong>
						<span style={subtleTextStyle}>{t("sizeChart.selectOneOption")}</span>
						{(
							[
								["structured", t("sizeChart.collectionElasticityStructured")],
								["light_flex", t("sizeChart.collectionElasticityLightFlex")],
								["flexible", t("sizeChart.collectionElasticityFlexible")],
								["high_elasticity", t("sizeChart.collectionElasticityHighElasticity")],
							] as const
						).map(([value, label]) => (
							<label key={value} style={{ display: "flex", gap: 8, alignItems: "center" }}>
								<input
									type="checkbox"
									checked={getCollectionElasticity(selectedHandle) === value}
									onChange={(e) =>
										e.target.checked && setCollectionElasticity(selectedHandle, value)
									}
								/>
								<span>{label}</span>
							</label>
						))}
					</div>
				) : null}

				<hr style={{ border: "none", borderTop: "1px solid #e5e7eb" }} />

				<div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
					<strong>
						{t("sizeChart.table")} {visibleGenderOptions[visibleGenderTab]?.label || ""} ·{" "}
						{selectedDisplayLabel}
					</strong>
					<span
						style={{
							fontSize: 12,
							fontWeight: 600,
							padding: "4px 10px",
							borderRadius: 999,
							background: currentChart.enabled ? "#dcfce7" : "#f3f4f6",
							color: currentChart.enabled ? "#166534" : "#6b7280",
						}}
					>
						{currentChart.enabled ? t("common.active") : t("common.inactive")}
					</span>
				</div>

				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					{visibleGenderOptions.map((opt, index) => (
						<button
							key={opt.value}
							type="button"
							style={tabButtonStyle(visibleGenderTab === index)}
							onClick={() => setSelectedGenderTab(index)}
						>
							{opt.label}
						</button>
					))}
				</div>

				<div style={{ ...cardStyle, display: "grid", gap: 14 }}>
					<div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
						<strong>{t("sizeChart.measureRefs")}</strong>
						<button
							type="button"
							style={currentChart.enabled ? buttonBaseStyle : primaryButtonStyle}
							onClick={() =>
								setChart(selectedHandle, currentGender, (c) => ({
									...c,
									enabled: !c.enabled,
									sizes: !c.enabled ? c.sizes : [],
								}))
							}
						>
							{currentChart.enabled ? t("sizeChart.disableTable") : t("sizeChart.enableTable")}
						</button>
					</div>

					{currentChart.enabled ? (
						<>
							{isFootwearSelected ? (
								<span>{t("sizeChart.measureFootSize")}</span>
							) : (
								<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
									{[0, 1, 2].map((index) => (
										<label key={index} style={labelStyle}>
											<span>{t("sizeChart.measureN", { n: String(index + 1) })}</span>
											<select
												style={inputStyle}
												value={currentChart.measurementRefs[index] ?? DEFAULT_REFS[index]}
												onChange={(e) => {
													const refs = [...currentChart.measurementRefs];
													const oldKey = refs[index];
													const value = e.target.value;
													if (refs[index] === value) return;
													const otherIndex = refs.findIndex(
														(r, i) => i !== index && r === value,
													);
													const isSwap = otherIndex >= 0;
													if (isSwap) refs[otherIndex] = oldKey;
													refs[index] = value;
													setChart(selectedHandle, currentGender, (c) => ({
														...c,
														measurementRefs: refs,
														sizes: c.sizes.map((row) => {
															const next: Record<string, string> = { size: row.size };
															for (const key of refs) {
																if (key === value) next[key] = row[oldKey] ?? "";
																else if (key === oldKey && isSwap) next[key] = row[value] ?? "";
																else next[key] = row[key] ?? "";
															}
															return next;
														}),
													}));
												}}
											>
												{[
													["peito", t("sizeChart.measureChest")],
													["cintura", t("sizeChart.measureWaist")],
													["quadril", t("sizeChart.measureHip")],
													["comprimento", t("sizeChart.measureLength")],
													["tornozelo", t("sizeChart.measureAnkle")],
												].map(([value, label]) => (
													<option key={value} value={value}>
														{label}
													</option>
												))}
											</select>
										</label>
									))}
								</div>
							)}

							{currentChart.sizes.length === 0 ? (
								<div style={{ textAlign: "center", display: "grid", gap: 8 }}>
									<span style={subtleTextStyle}>{t("sizeChart.noSizes")}</span>
									<button
										type="button"
										style={buttonBaseStyle}
										onClick={() =>
											setChart(selectedHandle, currentGender, (c) => ({
												...c,
												enabled: true,
												sizes: [...c.sizes, getDefaultSizesForRefs(c.measurementRefs)],
											}))
										}
									>
										{t("sizeChart.addFirstSize")}
									</button>
								</div>
							) : (
								<div style={{ display: "grid", gap: 12 }}>
									{currentChart.sizes.map((row, index) => (
										<div
											key={`size-row-${index}`}
											style={{ ...cardStyle, display: "grid", gap: 10 }}
										>
											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
													gap: 8,
												}}
											>
												<strong>{t("sizeChart.sizeN", { n: String(index + 1) })}</strong>
												<button
													type="button"
													style={{ ...buttonBaseStyle, color: "#b91c1c" }}
													onClick={() =>
														setChart(selectedHandle, currentGender, (c) => ({
															...c,
															sizes: c.sizes.filter((_, i) => i !== index),
														}))
													}
												>
													{t("common.remove")}
												</button>
											</div>
											<div
												style={{
													display: "grid",
													gridTemplateColumns: `repeat(${currentChart.measurementRefs.length + 1}, minmax(120px, 1fr))`,
													gap: 10,
												}}
											>
												<label style={labelStyle}>
													<span>{t("sizeChart.size")}</span>
													<input
														style={inputStyle}
														value={row.size ?? ""}
														placeholder={t("sizeChart.placeholderSize")}
														onChange={(e) =>
															setChart(selectedHandle, currentGender, (c) => ({
																...c,
																sizes: c.sizes.map((r, i) =>
																	i === index ? { ...r, size: e.target.value } : r,
																),
															}))
														}
													/>
												</label>
												{currentChart.measurementRefs.map((key) => {
													const labelKey =
														key === "peito"
															? "sizeChart.measureChest"
															: key === "cintura"
																? "sizeChart.measureWaist"
																: key === "quadril"
																	? "sizeChart.measureHip"
																	: key === "comprimento"
																		? "sizeChart.measureLength"
																		: key === "tornozelo"
																			? "sizeChart.measureAnkle"
																			: "sizeChart.measureFootSize";
													return (
														<label key={key} style={labelStyle}>
															<span>{t(labelKey)}</span>
															<input
																style={inputStyle}
																type="number"
																value={String(row[key] ?? "")}
																onChange={(e) =>
																	setChart(selectedHandle, currentGender, (c) => ({
																		...c,
																		sizes: c.sizes.map((r, i) =>
																			i === index
																				? { ...r, [key]: e.target.value }
																				: r,
																		),
																	}))
																}
															/>
														</label>
													);
												})}
											</div>
										</div>
									))}
									<button
										type="button"
										style={buttonBaseStyle}
										onClick={() =>
											setChart(selectedHandle, currentGender, (c) => ({
												...c,
												enabled: true,
												sizes: [...c.sizes, getDefaultSizesForRefs(c.measurementRefs)],
											}))
										}
									>
										{t("sizeChart.addSize")}
									</button>
								</div>
							)}
						</>
					) : (
						<span style={subtleTextStyle}>{t("sizeChart.tableDisabledHint")}</span>
					)}
				</div>

				<div style={{ display: "flex", justifyContent: "flex-end" }}>
					<button
						type="button"
						style={primaryButtonStyle}
						onClick={saveSizeCharts}
						disabled={saving}
					>
						{saving ? t("common.loading") : t("sizeChart.saveTables")}
					</button>
				</div>
			</div>

			<div style={{ ...cardStyle, display: "grid", gap: 8 }}>
				<strong>{t("sizeChart.howItWorks")}</strong>
				<span style={subtleTextStyle}>{t("sizeChart.howBullet1")}</span>
				<span style={subtleTextStyle}>{t("sizeChart.howBullet2")}</span>
				<span style={subtleTextStyle}>{t("sizeChart.howBullet3")}</span>
				<span style={subtleTextStyle}>{t("sizeChart.howBullet4")}</span>
			</div>
		</div>
	);
}
