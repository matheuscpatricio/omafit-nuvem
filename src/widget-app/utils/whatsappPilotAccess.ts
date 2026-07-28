export const DEFAULT_WHATSAPP_PILOT_STORE_KEYS = [
  'arrascaneta-2.myshopify.com',
  'nuvemshop/6994912',
];

export function normalizeWhatsappStoreKey(key: string | null | undefined): string {
  const cleaned = String(key || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '');
  // Tenants Nuvemshop são `nuvemshop/{storeId}` — preservar o id para não
  // colapsar todas as lojas Nuvemshop na mesma chave de piloto.
  const nuvemshop = cleaned.match(/^nuvemshop\/([^/?#\s]+)/);
  if (nuvemshop) return `nuvemshop/${nuvemshop[1]}`;
  return cleaned.replace(/[/?#].*$/, '');
}

function readWhatsappPilotStoreKeysEnv(): string {
  if (typeof import.meta === 'undefined' || !import.meta.env) return '';
  return String(import.meta.env.VITE_OMAFIT_WHATSAPP_PILOT_STORE_KEYS ?? '');
}

export function isWhatsappPilotRestrictionActive(): boolean {
  const raw = readWhatsappPilotStoreKeysEnv();
  if (raw === '*') return false;
  return true;
}

export function getWhatsappPilotStoreKeys(): Set<string> {
  const raw = readWhatsappPilotStoreKeysEnv();
  if (raw === '*') return new Set();
  if (raw.trim()) {
    return new Set(
      raw
        .split(',')
        .map((part) => normalizeWhatsappStoreKey(part))
        .filter(Boolean),
    );
  }
  return new Set(DEFAULT_WHATSAPP_PILOT_STORE_KEYS.map(normalizeWhatsappStoreKey));
}

export function isStoreWhatsappPilotAllowed(storeKey: string | null | undefined): boolean {
  const normalized = normalizeWhatsappStoreKey(storeKey);
  if (!normalized) return false;
  if (!isWhatsappPilotRestrictionActive()) return true;
  return getWhatsappPilotStoreKeys().has(normalized);
}

export function isWhatsappMarketingEnabledForShop(
  shopDomain: string | null | undefined,
  growthPlusFromPlan: boolean,
): boolean {
  if (isWhatsappPilotRestrictionActive()) {
    return isStoreWhatsappPilotAllowed(shopDomain);
  }
  return growthPlusFromPlan;
}
