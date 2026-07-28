const DEVICE_ID_STORAGE_KEY = 'omafit_device_id_v1';

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

/** Persiste device_id no domínio da loja (SDK Nuvemshop / storefront). */
export function getOrCreateShopperDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    return createUuidV4();
  }
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing?.trim()) return existing.trim();
  } catch {
    /* ignore */
  }
  const id = createUuidV4();
  try {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

export function adoptShopperDeviceIdFromIframe(deviceId: string): void {
  const id = String(deviceId || '').trim();
  if (!id || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
