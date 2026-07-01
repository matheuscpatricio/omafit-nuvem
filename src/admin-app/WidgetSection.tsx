import { useRef } from "react";
import { hasGrowthPlusPlan } from "../../lib/billing-growth-plus.js";
import type { OmafitCollection, OmafitWidgetConfig } from "../shared/models";
import {
	buttonBaseStyle,
	cardStyle,
	inputStyle,
	labelStyle,
	planBadgeStyle,
	primaryButtonStyle,
	subtleTextStyle,
} from "./adminUi";
import { useI18n } from "./i18n";

type WidgetSectionProps = {
	config: OmafitWidgetConfig;
	collections: OmafitCollection[];
	currentPlan: string;
	onChange: (next: OmafitWidgetConfig) => void;
	onSave: () => Promise<void>;
	onUploadLogo: (file: File) => Promise<void>;
	onUploadHeroBackground: (file: File) => Promise<void>;
	busy: boolean;
	logoUploading: boolean;
	heroUploading: boolean;
};

function checkboxRow(
	checked: boolean,
	label: string,
	onChange: (checked: boolean) => void,
	disabled = false,
) {
	return (
		<label
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				fontSize: 14,
				color: disabled ? "#9ca3af" : "#374151",
				cursor: disabled ? "not-allowed" : "pointer",
			}}
		>
			<input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
			<span>{label}</span>
		</label>
	);
}

export function WidgetSection({
	config,
	collections,
	currentPlan,
	onChange,
	onSave,
	onUploadLogo,
	onUploadHeroBackground,
	busy,
	logoUploading,
	heroUploading,
}: WidgetSectionProps) {
	const { t } = useI18n();
	const heroFileRef = useRef<HTMLInputElement>(null);
	const hasHeroLayoutAccess = hasGrowthPlusPlan(currentPlan);
	const hasStylistConsultantAccess = hasGrowthPlusPlan(currentPlan);
	const previewRadius = Number.isFinite(Number(config.cta_button_border_radius))
		? Math.max(0, Math.min(40, Number(config.cta_button_border_radius)))
		: 40;
	const previewText = config.link_text || t("widget.defaultLinkText");
	const previewColor = config.primary_color || "#810707";
	const isButton = config.cta_type === "button";

	return (
		<div style={{ display: "grid", gap: 16 }}>
			<div style={{ ...cardStyle, display: "grid", gap: 6 }}>
				<strong style={{ fontSize: 18 }}>{t("widget.title")}</strong>
				<span style={subtleTextStyle}>{t("widget.subtitle")}</span>
			</div>

			<div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
				<div style={{ ...cardStyle, display: "grid", gap: 18 }}>
					<strong>{t("widget.personalization")}</strong>

					<label style={labelStyle}>
						<span>{t("widget.linkText")}</span>
						<input
							style={inputStyle}
							value={config.link_text}
							onChange={(event) => onChange({ ...config, link_text: event.target.value })}
						/>
						<span style={subtleTextStyle}>{t("widget.linkTextHelp")}</span>
					</label>

					<div style={{ display: "grid", gap: 8 }}>
						<span style={{ ...labelStyle, gap: 0 }}>{t("widget.embedPositionLabel")}</span>
						<span style={subtleTextStyle}>{t("widget.embedPositionHelp")}</span>
						{checkboxRow(
							config.embed_position !== "above_buy_buttons",
							t("widget.embedPositionBelow"),
							(checked) =>
								onChange({
									...config,
									embed_position: checked ? "below_buy_buttons" : "above_buy_buttons",
								}),
						)}
						{checkboxRow(
							config.embed_position === "above_buy_buttons",
							t("widget.embedPositionAbove"),
							(checked) =>
								onChange({
									...config,
									embed_position: checked ? "above_buy_buttons" : "below_buy_buttons",
								}),
						)}
					</div>

					<div style={{ display: "grid", gap: 8 }}>
						<span style={{ ...labelStyle, gap: 0 }}>{t("widget.ctaTypeLabel")}</span>
						<span style={subtleTextStyle}>{t("widget.ctaTypeHelp")}</span>
						{checkboxRow(
							config.cta_type !== "button",
							t("widget.ctaTypeLink"),
							(checked) => onChange({ ...config, cta_type: checked ? "link" : "button" }),
						)}
						{checkboxRow(
							config.cta_type === "button",
							t("widget.ctaTypeButton"),
							(checked) => onChange({ ...config, cta_type: checked ? "button" : "link" }),
						)}
						{isButton ? (
							<label style={labelStyle}>
								<span>
									{t("widget.ctaButtonRadiusLabel")}: {previewRadius}px
								</span>
								<input
									type="range"
									min={0}
									max={40}
									step={1}
									value={previewRadius}
									onChange={(event) =>
										onChange({
											...config,
											cta_button_border_radius: Number(event.target.value),
										})
									}
								/>
								<span style={subtleTextStyle}>{t("widget.ctaButtonRadiusHelp")}</span>
							</label>
						) : null}
					</div>

					<div style={{ display: "grid", gap: 10 }}>
						<span style={{ ...labelStyle, gap: 0 }}>{t("widget.tryonLayoutLabel")}</span>
						<span style={subtleTextStyle}>{t("widget.tryonLayoutHelp")}</span>
						{[
							{ id: "default" as const, label: t("widget.tryonLayoutDefault") },
							{ id: "sidebar" as const, label: t("widget.tryonLayoutSidebar") },
						].map((option) => (
							<label key={option.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
								<input
									type="radio"
									name="tryon_layout"
									checked={
										option.id === "default"
											? config.tryon_layout !== "sidebar" && config.tryon_layout !== "hero"
											: config.tryon_layout === "sidebar"
									}
									onChange={() => onChange({ ...config, tryon_layout: option.id })}
								/>
								<span>{option.label}</span>
							</label>
						))}
						<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
							<label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
								<input
									type="radio"
									name="tryon_layout"
									checked={config.tryon_layout === "hero"}
									disabled={!hasHeroLayoutAccess}
									onChange={() => {
										if (hasHeroLayoutAccess) onChange({ ...config, tryon_layout: "hero" });
									}}
								/>
								<span style={{ opacity: hasHeroLayoutAccess ? 1 : 0.55 }}>{t("widget.tryonLayoutHero")}</span>
							</label>
							<span style={planBadgeStyle(hasHeroLayoutAccess ? "success" : "attention")}>
								{t("widget.tryonLayoutHeroPlanBadge")}
							</span>
						</div>
						{!hasHeroLayoutAccess ? (
							<span style={subtleTextStyle}>{t("widget.tryonLayoutHeroLocked")}</span>
						) : null}
						{config.tryon_layout === "hero" && hasHeroLayoutAccess ? (
							<div style={{ display: "grid", gap: 10 }}>
								<span style={subtleTextStyle}>{t("widget.tryonLayoutHeroImageHelp")}</span>
								{config.tryon_layout_background_image ? (
									<div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
										<img
											src={config.tryon_layout_background_image}
											alt={t("widget.tryonLayoutHeroImage")}
											style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 10, border: "1px solid #e5e7eb" }}
										/>
										<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
											<button
												type="button"
												style={buttonBaseStyle}
												onClick={() => heroFileRef.current?.click()}
												disabled={heroUploading}
											>
												{t("widget.changeHeroBackground")}
											</button>
											<button
												type="button"
												style={buttonBaseStyle}
												onClick={() => onChange({ ...config, tryon_layout_background_image: "" })}
											>
												{t("widget.removeHeroBackground")}
											</button>
										</div>
									</div>
								) : (
									<button
										type="button"
										style={buttonBaseStyle}
										onClick={() => heroFileRef.current?.click()}
										disabled={heroUploading}
									>
										{heroUploading ? t("common.loading") : t("widget.uploadHeroBackground")}
									</button>
								)}
								<input
									ref={heroFileRef}
									type="file"
									accept="image/*"
									style={{ display: "none" }}
									onChange={(event) => {
										const file = event.target.files?.[0];
										if (file) void onUploadHeroBackground(file);
										event.currentTarget.value = "";
									}}
								/>
							</div>
						) : null}
					</div>

					<div style={{ display: "grid", gap: 8, padding: 14, borderRadius: 14, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
						<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
							<strong>{t("widget.stylistConsultantLabel")}</strong>
							<span style={planBadgeStyle(hasStylistConsultantAccess ? "success" : "attention")}>
								{t("widget.stylistConsultantPlanBadge")}
							</span>
						</div>
						<span style={subtleTextStyle}>{t("widget.stylistConsultantHelp")}</span>
						<span style={subtleTextStyle}>
							{hasStylistConsultantAccess
								? t("widget.stylistConsultantEnabled")
								: t("widget.stylistConsultantLocked")}
						</span>
					</div>

					<div style={{ display: "grid", gap: 8 }}>
						<span style={{ ...labelStyle, gap: 0 }}>{t("widget.logoUrl")}</span>
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp,image/svg+xml"
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) void onUploadLogo(file);
								event.currentTarget.value = "";
							}}
							disabled={logoUploading}
						/>
					</div>

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
							onChange={(event) => onChange({ ...config, widget_enabled: event.target.checked })}
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
					<span style={subtleTextStyle}>{t("widget.ctaPreviewLabel")}</span>
					<div
						style={{
							border: "1px solid #e5e7eb",
							borderRadius: 8,
							padding: 12,
							display: "inline-block",
							width: "fit-content",
							maxWidth: "100%",
						}}
					>
						{isButton ? (
							<button
								type="button"
								style={{
									fontFamily: "inherit",
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									gap: 10,
									padding: "12px 22px",
									borderRadius: `${previewRadius}px`,
									border: `2px solid ${previewColor}`,
									background: "#ffffff",
									color: previewColor,
									cursor: "default",
									fontSize: 15,
									fontWeight: 600,
									lineHeight: 1.25,
									boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
									maxWidth: "100%",
								}}
							>
								{config.store_logo ? (
									<img
										src={config.store_logo}
										alt=""
										style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }}
									/>
								) : null}
								<span>{previewText}</span>
							</button>
						) : (
							<a
								href="#"
								onClick={(event) => event.preventDefault()}
								style={{
									fontFamily: "inherit",
									color: previewColor,
									textDecoration: "underline",
									textUnderlineOffset: 3,
									cursor: "default",
								}}
							>
								{previewText}
							</a>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
