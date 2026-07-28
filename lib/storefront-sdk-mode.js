export function parseStorefrontSdkWhitelist(rawValue = "") {
	return String(rawValue || "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export function isStorefrontSdkWhitelisted(storeId, rawWhitelist = "") {
	const normalizedStoreId = String(storeId || "").trim();
	if (!normalizedStoreId) return false;
	return parseStorefrontSdkWhitelist(rawWhitelist).includes(normalizedStoreId);
}

/** NubeSDK expõe slots de PDP em todos os temas Nuvemshop; sem tema, usa whitelist de homolog. */
export function resolveStorefrontSdkEnabled(theme, storeId, rawWhitelist = "") {
	const normalizedTheme = String(theme || "").trim();
	if (normalizedTheme) return true;
	return isStorefrontSdkWhitelisted(storeId, rawWhitelist);
}
