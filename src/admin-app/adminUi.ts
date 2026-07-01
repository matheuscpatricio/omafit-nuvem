import type { CSSProperties } from "react";

/** Tokens alinhados a omafit-brand.css */
export const brandColors = {
	bgPrimary: "#16100a",
	bgSecondary: "#241a10",
	accent: "#d96845",
	accentDark: "#b8522e",
	cream: "#f6f0e2",
	muted: "#a8947e",
	border: "#3a2e22",
	pageBg: "#faf6ef",
	cardBg: "#fffdf8",
	cardBorder: "#ead9c8",
	text: "#16100a",
	textMuted: "#6b5d4f",
} as const;

export const pageStyle: CSSProperties = {
	minHeight: "100vh",
	background: brandColors.pageBg,
	color: brandColors.text,
	fontFamily:
		'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

export const shellStyle: CSSProperties = {
	maxWidth: 1280,
	margin: "0 auto",
	padding: 24,
	display: "grid",
	gap: 20,
};

export const cardStyle: CSSProperties = {
	background: brandColors.cardBg,
	border: `1px solid ${brandColors.cardBorder}`,
	borderRadius: 18,
	padding: 20,
	boxShadow: `0 10px 28px rgba(22, 16, 10, 0.08)`,
};

export const subtleTextStyle: CSSProperties = {
	color: brandColors.textMuted,
	fontSize: 14,
	lineHeight: 1.5,
};

export const sectionTitleStyle: CSSProperties = {
	fontSize: 18,
	fontWeight: 700,
	color: brandColors.text,
	letterSpacing: "-0.01em",
};

export const buttonBaseStyle: CSSProperties = {
	borderRadius: 12,
	padding: "10px 16px",
	border: `1px solid color-mix(in srgb, ${brandColors.accent} 28%, #d9cdb8)`,
	cursor: "pointer",
	fontSize: 14,
	fontWeight: 600,
	background: "#fff9f0",
	color: brandColors.text,
};

export const primaryButtonStyle: CSSProperties = {
	...buttonBaseStyle,
	background: `linear-gradient(135deg, ${brandColors.accent} 0%, ${brandColors.accentDark} 100%)`,
	borderColor: brandColors.accentDark,
	color: "#ffffff",
	boxShadow: `0 6px 16px rgba(217, 104, 69, 0.28)`,
};

export const inputStyle: CSSProperties = {
	width: "100%",
	borderRadius: 12,
	border: `1px solid ${brandColors.cardBorder}`,
	padding: "12px 14px",
	fontSize: 14,
	boxSizing: "border-box",
	background: brandColors.cardBg,
	color: brandColors.text,
};

export const labelStyle: CSSProperties = {
	display: "grid",
	gap: 8,
	fontSize: 13,
	fontWeight: 600,
	color: brandColors.text,
};

export function navItemStyle(active: boolean): CSSProperties {
	if (active) {
		return {
			...buttonBaseStyle,
			background: `linear-gradient(135deg, ${brandColors.bgPrimary} 0%, ${brandColors.bgSecondary} 100%)`,
			borderColor: brandColors.bgPrimary,
			color: brandColors.cream,
			boxShadow: "0 6px 18px rgba(22, 16, 10, 0.22)",
		};
	}
	return buttonBaseStyle;
}

export function tabButtonStyle(active: boolean): CSSProperties {
	return navItemStyle(active);
}

export function planBadgeStyle(tone: "success" | "attention"): CSSProperties {
	return {
		display: "inline-flex",
		alignItems: "center",
		padding: "4px 10px",
		borderRadius: 999,
		fontSize: 12,
		fontWeight: 700,
		background: tone === "success" ? "rgba(34, 197, 94, 0.12)" : "rgba(217, 104, 69, 0.14)",
		color: tone === "success" ? "#166534" : brandColors.accentDark,
	};
}

export const statValueStyle: CSSProperties = {
	fontSize: 24,
	fontWeight: 800,
	color: brandColors.accentDark,
	letterSpacing: "-0.02em",
};
