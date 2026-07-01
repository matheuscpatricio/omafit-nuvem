import type { CSSProperties } from "react";

export const cardStyle: CSSProperties = {
	background: "#ffffff",
	border: "1px solid #e5e7eb",
	borderRadius: 18,
	padding: 20,
	boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

export const subtleTextStyle: CSSProperties = {
	color: "#6b7280",
	fontSize: 14,
	lineHeight: 1.5,
};

export const buttonBaseStyle: CSSProperties = {
	borderRadius: 12,
	padding: "10px 16px",
	border: "1px solid #d1d5db",
	cursor: "pointer",
	fontSize: 14,
	fontWeight: 600,
	background: "#ffffff",
};

export const primaryButtonStyle: CSSProperties = {
	...buttonBaseStyle,
	background: "#111827",
	borderColor: "#111827",
	color: "#ffffff",
};

export const inputStyle: CSSProperties = {
	width: "100%",
	borderRadius: 12,
	border: "1px solid #d1d5db",
	padding: "12px 14px",
	fontSize: 14,
	boxSizing: "border-box",
};

export const labelStyle: CSSProperties = {
	display: "grid",
	gap: 8,
	fontSize: 13,
	fontWeight: 600,
	color: "#374151",
};

export function planBadgeStyle(tone: "success" | "attention"): CSSProperties {
	return {
		display: "inline-flex",
		alignItems: "center",
		padding: "4px 10px",
		borderRadius: 999,
		fontSize: 12,
		fontWeight: 700,
		background: tone === "success" ? "#dcfce7" : "#fef3c7",
		color: tone === "success" ? "#166534" : "#92400e",
	};
}
