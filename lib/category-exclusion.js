/**
 * Comparação de categorias da Nuvemshop (id, handle e nome).
 * Handles costumam ser slugs sem acento ("acessorios"); o breadcrumb
 * e o admin mostram "Acessórios". A comparação ignora acento e caixa.
 */

export function normalizeCategoryToken(value) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{M}/gu, "");
}

function localizedText(value) {
	if (value == null) return "";
	if (typeof value === "string" || typeof value === "number")
		return String(value).trim();
	if (typeof value !== "object") return String(value).trim();
	const text =
		value.pt ||
		value["pt-BR"] ||
		value.es ||
		value.en ||
		Object.values(value).find(
			(entry) => typeof entry === "string" && entry.trim(),
		);
	return String(text || "").trim();
}

export function categoryRecordTokens(category) {
	if (!category || typeof category !== "object") return [];
	const tokens = [];
	const push = (value) => {
		const text = localizedText(value);
		if (text) tokens.push(text);
	};
	push(category.id);
	push(category.handle);
	push(category.title);
	push(category.name);
	return tokens;
}

export function tokensFromCategoryEntry(entry) {
	if (entry == null) return [];
	if (typeof entry === "number" || typeof entry === "string") {
		const text = String(entry).trim();
		return text ? [text] : [];
	}
	if (typeof entry === "object") return categoryRecordTokens(entry);
	return [];
}

export function parentCategoryId(category) {
	const parent = category?.parent;
	if (parent == null || parent === "" || parent === 0 || parent === "0")
		return "";
	if (typeof parent === "object") {
		const id = parent.id;
		if (id == null || id === "" || id === 0 || id === "0") return "";
		return String(id).trim();
	}
	const text = String(parent).trim();
	if (!text || text === "0") return "";
	return text;
}

function childIdsOf(category) {
	const raw = category?.subcategories || category?.subcategory_ids || [];
	if (!Array.isArray(raw)) return [];
	return raw
		.map((entry) => {
			if (entry == null) return "";
			if (typeof entry === "object") return String(entry.id ?? "").trim();
			return String(entry).trim();
		})
		.filter((id) => id && id !== "0");
}

function indexCategoryTree(categories) {
	const byId = new Map();
	const children = new Map();
	const tokenToId = new Map();
	for (const category of categories || []) {
		const id = String(category?.id ?? "").trim();
		if (!id) continue;
		byId.set(id, category);
		for (const token of categoryRecordTokens(category)) {
			tokenToId.set(normalizeCategoryToken(token), id);
		}
		const parent = parentCategoryId(category);
		if (parent) {
			const list = children.get(parent) || [];
			list.push(id);
			children.set(parent, list);
		}
		for (const childId of childIdsOf(category)) {
			const list = children.get(id) || [];
			list.push(childId);
			children.set(id, list);
		}
	}
	return { byId, children, tokenToId };
}

/**
 * Inclui a categoria excluída e todas as subcategorias (id, handle e nome).
 * Os tokens originais permanecem, para o caso de a árvore da API não carregar.
 */
export function expandExcludedCategorySet(excluded, categories = []) {
	const raw = (Array.isArray(excluded) ? excluded : [])
		.map((value) => String(value ?? "").trim())
		.filter(Boolean);
	if (raw.length === 0) return [];
	const wanted = new Set(raw.map((value) => normalizeCategoryToken(value)));
	const { byId, children } = indexCategoryTree(categories);
	const selected = new Set();
	for (const [id, category] of byId) {
		const matches = categoryRecordTokens(category).some((token) =>
			wanted.has(normalizeCategoryToken(token)),
		);
		if (matches) selected.add(id);
	}
	const queue = [...selected];
	const seen = new Set(selected);
	while (queue.length > 0) {
		const id = queue.shift();
		for (const childId of children.get(id) || []) {
			if (seen.has(childId)) continue;
			seen.add(childId);
			queue.push(childId);
		}
	}
	const out = new Set(raw);
	for (const id of seen) {
		for (const token of categoryRecordTokens(byId.get(id) || { id }))
			out.add(token);
	}
	return Array.from(out);
}

/**
 * Soma ao produto os handles/nomes da categoria e de todos os pais.
 * Assim, excluir "Acessórios" esconde um produto cadastrado só na filha.
 */
export function expandProductCategoryTokens(productTokens, categories = []) {
	const base = (Array.isArray(productTokens) ? productTokens : [])
		.flatMap((entry) => tokensFromCategoryEntry(entry))
		.map((value) => String(value).trim())
		.filter(Boolean);
	const { byId, tokenToId } = indexCategoryTree(categories);
	const out = new Set(base);
	const queue = [];
	for (const token of base) {
		if (byId.has(token)) queue.push(token);
		const mapped = tokenToId.get(normalizeCategoryToken(token));
		if (mapped) queue.push(mapped);
	}
	const seen = new Set();
	while (queue.length > 0) {
		const id = queue.shift();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const category = byId.get(id);
		for (const token of categoryRecordTokens(category || { id }))
			out.add(token);
		const parent = parentCategoryId(category || {});
		if (parent) queue.push(parent);
	}
	return Array.from(out);
}

export function isCategoryExcluded(categoryTokens, excludedCollections) {
	if (!Array.isArray(excludedCollections) || excludedCollections.length === 0)
		return false;
	const productTokens = (categoryTokens || [])
		.flatMap((entry) => tokensFromCategoryEntry(entry))
		.map((token) => normalizeCategoryToken(token))
		.filter(Boolean);
	if (productTokens.length === 0) return false;
	const excluded = new Set(
		excludedCollections
			.map((value) => normalizeCategoryToken(value))
			.filter(Boolean),
	);
	return productTokens.some((token) => excluded.has(token));
}

export function mergeCategoryTokens(...groups) {
	const merged = new Set();
	for (const group of groups) {
		if (!Array.isArray(group)) continue;
		for (const token of group) {
			for (const text of tokensFromCategoryEntry(token)) {
				if (text) merged.add(text);
			}
		}
	}
	return Array.from(merged);
}

const NON_CATEGORY_PATHS = new Set([
	"produtos",
	"producto",
	"productos",
	"products",
	"product",
	"cart",
	"comprar",
	"checkout",
	"account",
	"conta",
	"contacto",
	"contato",
	"busca",
	"search",
	"admin",
]);

/** Handle de categoria a partir do breadcrumb Morelia (`/acessorios/`) ou `/categorias/acessorios`. */
export function breadcrumbHandleFromHref(href) {
	const raw = String(href || "").trim();
	if (
		!raw ||
		raw.startsWith("#") ||
		raw.startsWith("mailto:") ||
		raw.startsWith("javascript:")
	) {
		return "";
	}
	let pathname = raw;
	try {
		pathname = new URL(raw, "https://store.local").pathname;
	} catch {
		return "";
	}
	const parts = pathname
		.split("/")
		.map((part) => {
			try {
				return decodeURIComponent(part).trim();
			} catch {
				return part.trim();
			}
		})
		.filter(Boolean);
	if (parts.length === 0) return "";
	const head = parts[0].toLowerCase();
	if (head === "categoria" || head === "categorias" || head === "collections") {
		return parts[1] || "";
	}
	if (parts.length === 1 && !NON_CATEGORY_PATHS.has(head)) return parts[0];
	return "";
}
