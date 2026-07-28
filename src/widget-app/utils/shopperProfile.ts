import type { SizeCalculatorData } from '../SizeCalculator';
import { readHttpJsonResponse } from './readHttpJsonResponse';
import { getSupabaseFunctionHeaders, getSupabaseFunctionUrl } from './supabaseFunctions';

export const DEVICE_ID_STORAGE_KEY = 'omafit_device_id_v1';
const DEVICE_ID_COOKIE_KEY = 'omafit_device_id_v1';
const DEVICE_ID_COOKIE_MAX_AGE_SEC = 400 * 24 * 60 * 60;

let parentDeviceId: string | null = null;

export function setShopperDeviceIdFromParent(deviceId: string | null | undefined): boolean {
  const id = String(deviceId || '').trim();
  if (!id || id === parentDeviceId) return false;
  parentDeviceId = id;
  if (typeof localStorage !== 'undefined') {
    persistDeviceId(id, localStorage);
  }
  return true;
}

export function getShopperDeviceId(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): string {
  if (parentDeviceId) return parentDeviceId;
  try {
    const existing = storage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing?.trim()) return existing.trim();
  } catch {
    /* ignore */
  }
  const fromCookie = readDeviceIdCookie();
  if (fromCookie) return fromCookie;
  return getOrCreateDeviceId(storage);
}

export function normalizeShopDomain(value: string): string {
  if (!value) return '';
  const trimmed = value.trim().toLowerCase().replace(/^https?:\/\//, '');
  if (trimmed.startsWith('nuvemshop/')) {
    const storeId = trimmed.slice('nuvemshop/'.length).split('/')[0]?.trim();
    return storeId ? `nuvemshop/${storeId}` : 'nuvemshop';
  }
  return trimmed.replace(/\/.*$/, '');
}

function readDeviceIdCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${DEVICE_ID_COOKIE_KEY}=([^;]+)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return match[1].trim() || null;
  }
}

function writeDeviceIdCookie(id: string): void {
  if (typeof document === 'undefined' || !id) return;
  const secure =
    typeof window !== 'undefined' && window.location?.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${DEVICE_ID_COOKIE_KEY}=${encodeURIComponent(id)}; path=/; max-age=${DEVICE_ID_COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}

function persistDeviceId(id: string, storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(DEVICE_ID_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  writeDeviceIdCookie(id);
}

export type ShopperProfileEventName =
  | 'profile_offered'
  | 'profile_accepted'
  | 'profile_saved'
  | 'profile_skipped_calculator'
  | 'profile_deleted'
  | 'marketing_whatsapp_opted_in'
  | 'marketing_whatsapp_revoked';

export interface ShopperTryonHistoryEntry {
  id: string;
  product_handle: string | null;
  recommended_size: string | null;
  result_image_url: string | null;
  tryon_session_id: string | null;
  created_at: string;
}

export interface ShopperProfile {
  id: string;
  shop_domain: string;
  device_id: string;
  public_id: string;
  email: string | null;
  phone_e164_masked?: string | null;
  marketing_whatsapp_consent_at?: string | null;
  marketing_whatsapp_revoked_at?: string | null;
  marketing_photo_consent_at?: string | null;
  marketing_photo_revoked_at?: string | null;
  model_photo_saved?: boolean;
  measurements: SizeCalculatorData;
  consent_granted_at: string | null;
  consent_revoked_at: string | null;
  created_at: string;
  updated_at: string;
  history: ShopperTryonHistoryEntry[];
}

export interface ShopperProfileClientConfig {
  shopDomain: string;
  publicId: string;
}

function profileHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return getSupabaseFunctionHeaders({ 'Content-Type': 'application/json', ...extra });
}

function createUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateDeviceId(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): string {
  if (parentDeviceId) return parentDeviceId;
  try {
    const existing = storage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing?.trim()) {
      const id = existing.trim();
      writeDeviceIdCookie(id);
      return id;
    }
  } catch {
    /* ignore */
  }
  const fromCookie = readDeviceIdCookie();
  if (fromCookie) {
    persistDeviceId(fromCookie, storage);
    return fromCookie;
  }
  const id = createUuidV4();
  persistDeviceId(id, storage);
  return id;
}

export function isValidShopperMeasurements(data: unknown): data is SizeCalculatorData {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  const gender = m.gender;
  const height = Number(m.height);
  const weight = Number(m.weight);
  const bodyType = Number(m.bodyType ?? m.bodyTypeIndex ?? -1);
  const fit = Number(m.fit ?? m.fitIndex ?? -1);
  if (gender !== 'male' && gender !== 'female') return false;
  if (!Number.isFinite(height) || height < 100 || height > 250) return false;
  if (!Number.isFinite(weight) || weight < 30 || weight > 300) return false;
  if (!Number.isFinite(bodyType) || bodyType < 0 || bodyType > 4) return false;
  if (!Number.isFinite(fit) || fit < 0 || fit > 2) return false;
  return true;
}

export function normalizeShopperMeasurements(data: SizeCalculatorData): SizeCalculatorData {
  const bodyTypeIndex = Number(data.bodyTypeIndex ?? data.bodyType ?? 0);
  const fitIndex = Number(data.fitIndex ?? data.fit ?? 0);
  return {
    gender: data.gender,
    height: Math.round(Number(data.height)),
    weight: Number(data.weight),
    bodyType: bodyTypeIndex,
    fit: fitIndex,
    bodyTypeIndex,
    fitIndex,
  };
}

export function shopperMeasurementsEqual(a: SizeCalculatorData, b: SizeCalculatorData): boolean {
  const na = normalizeShopperMeasurements(a);
  const nb = normalizeShopperMeasurements(b);
  return (
    na.gender === nb.gender &&
    na.height === nb.height &&
    na.weight === nb.weight &&
    na.bodyTypeIndex === nb.bodyTypeIndex &&
    na.fitIndex === nb.fitIndex
  );
}

export function applyForcedGenderToMeasurements(
  data: SizeCalculatorData,
  forcedGender: 'male' | 'female' | null,
): SizeCalculatorData {
  const normalized = normalizeShopperMeasurements(data);
  if (!forcedGender) return normalized;
  return { ...normalized, gender: forcedGender };
}

export function hasActiveShopperConsent(profile: ShopperProfile | null | undefined): boolean {
  if (!profile) return false;
  return Boolean(profile.consent_granted_at) && !profile.consent_revoked_at;
}

export async function fetchShopperProfile(
  config: ShopperProfileClientConfig,
): Promise<ShopperProfile | null> {
  const deviceId = getOrCreateDeviceId();
  const shopDomain = normalizeShopDomain(config.shopDomain);
  if (!shopDomain) return null;

  const url = new URL(getSupabaseFunctionUrl('shopper-profile'));
  url.searchParams.set('shop_domain', shopDomain);
  url.searchParams.set('device_id', deviceId);
  url.searchParams.set('public_id', config.publicId.trim());

  const response = await fetch(url.toString(), { method: 'GET', headers: profileHeaders() });
  if (response.status === 404) return null;

  const parsed = await readHttpJsonResponse<{ profile?: ShopperProfile; error?: string }>(response);
  if (!parsed.ok || !parsed.data?.profile) return null;
  return parsed.data.profile;
}

export async function saveShopperProfile(
  config: ShopperProfileClientConfig,
  measurements: SizeCalculatorData,
  options?: { email?: string | null; event?: ShopperProfileEventName },
): Promise<ShopperProfile | null> {
  const deviceId = getOrCreateDeviceId();
  const response = await fetch(getSupabaseFunctionUrl('shopper-profile'), {
    method: 'PUT',
    headers: profileHeaders(),
    body: JSON.stringify({
      shop_domain: normalizeShopDomain(config.shopDomain),
      device_id: deviceId,
      public_id: config.publicId.trim(),
      measurements: normalizeShopperMeasurements(measurements),
      email: options?.email?.trim() || null,
      consent: true,
      event: options?.event || 'profile_saved',
    }),
  });

  const parsed = await readHttpJsonResponse<{ profile?: ShopperProfile; error?: string }>(response);
  if (!parsed.ok || !parsed.data?.profile) {
    throw new Error(parsed.error || 'Failed to save profile');
  }
  return parsed.data.profile;
}

export async function deleteShopperProfile(config: ShopperProfileClientConfig): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  const url = new URL(getSupabaseFunctionUrl('shopper-profile'));
  url.searchParams.set('shop_domain', normalizeShopDomain(config.shopDomain));
  url.searchParams.set('device_id', deviceId);
  url.searchParams.set('public_id', config.publicId.trim());

  const response = await fetch(url.toString(), { method: 'DELETE', headers: profileHeaders() });
  const parsed = await readHttpJsonResponse<{ success?: boolean; error?: string }>(response);
  if (!parsed.ok) throw new Error(parsed.error || 'Failed to delete profile');
}

export async function appendTryonHistory(
  config: ShopperProfileClientConfig,
  entry: {
    productHandle?: string | null;
    recommendedSize?: string | null;
    resultImageUrl?: string | null;
    tryonSessionId?: string | null;
    modelImageUrl?: string | null;
  },
): Promise<ShopperProfile | null> {
  const deviceId = getOrCreateDeviceId();
  const response = await fetch(getSupabaseFunctionUrl('shopper-profile'), {
    method: 'POST',
    headers: profileHeaders(),
    body: JSON.stringify({
      action: 'history',
      shop_domain: normalizeShopDomain(config.shopDomain),
      device_id: deviceId,
      public_id: config.publicId.trim(),
      product_handle: entry.productHandle || null,
      recommended_size: entry.recommendedSize || null,
      result_image_url: entry.resultImageUrl || null,
      tryon_session_id: entry.tryonSessionId || null,
      model_image_url: entry.modelImageUrl?.trim() || null,
    }),
  });

  if (response.status === 404) return null;
  const parsed = await readHttpJsonResponse<{ profile?: ShopperProfile; error?: string }>(response);
  if (!parsed.ok || !parsed.data?.profile) return null;
  return parsed.data.profile;
}

export function hasActiveMarketingWhatsappConsent(profile: ShopperProfile | null | undefined): boolean {
  if (!profile) return false;
  return Boolean(
    profile.marketing_whatsapp_consent_at &&
      !profile.marketing_whatsapp_revoked_at &&
      profile.phone_e164_masked,
  );
}

export async function saveShopperMarketingWhatsapp(
  config: ShopperProfileClientConfig,
  phone: string,
  options?: { modelImageUrl?: string | null; marketingPhotoConsent?: boolean },
): Promise<ShopperProfile | null> {
  const deviceId = getOrCreateDeviceId();
  const modelImageUrl = options?.modelImageUrl?.trim() || null;
  const marketingPhotoConsent = Boolean(options?.marketingPhotoConsent && modelImageUrl);
  const response = await fetch(getSupabaseFunctionUrl('shopper-profile'), {
    method: 'PATCH',
    headers: profileHeaders(),
    body: JSON.stringify({
      shop_domain: normalizeShopDomain(config.shopDomain),
      device_id: deviceId,
      public_id: config.publicId.trim(),
      phone: phone.trim(),
      marketing_whatsapp_consent: true,
      ...(marketingPhotoConsent
        ? { model_image_url: modelImageUrl, marketing_photo_consent: true }
        : {}),
    }),
  });

  const parsed = await readHttpJsonResponse<{ profile?: ShopperProfile; error?: string }>(response);
  if (!parsed.ok || !parsed.data?.profile) {
    throw new Error(parsed.error || 'Failed to save WhatsApp opt-in');
  }
  return parsed.data.profile;
}

export async function revokeShopperMarketingWhatsapp(
  config: ShopperProfileClientConfig,
): Promise<ShopperProfile | null> {
  const deviceId = getOrCreateDeviceId();
  const response = await fetch(getSupabaseFunctionUrl('shopper-profile'), {
    method: 'PATCH',
    headers: profileHeaders(),
    body: JSON.stringify({
      shop_domain: normalizeShopDomain(config.shopDomain),
      device_id: deviceId,
      public_id: config.publicId.trim(),
      revoke_marketing_whatsapp: true,
    }),
  });

  const parsed = await readHttpJsonResponse<{ profile?: ShopperProfile; error?: string }>(response);
  if (!parsed.ok || !parsed.data?.profile) {
    throw new Error(parsed.error || 'Failed to revoke WhatsApp marketing');
  }
  return parsed.data.profile;
}

export async function recordShopperProfileEvent(
  config: ShopperProfileClientConfig,
  event: ShopperProfileEventName,
): Promise<void> {
  const deviceId = getOrCreateDeviceId();
  const response = await fetch(getSupabaseFunctionUrl('shopper-profile'), {
    method: 'POST',
    headers: profileHeaders(),
    body: JSON.stringify({
      action: 'event',
      shop_domain: normalizeShopDomain(config.shopDomain),
      device_id: deviceId,
      public_id: config.publicId.trim(),
      event,
    }),
  });
  if (!response.ok) {
    console.warn('[shopperProfile] event failed:', event, response.status);
  }
}
