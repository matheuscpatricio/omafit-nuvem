export type AnchorProductPrice = {
  price_amount: number | null;
  currency_code: string | null;
};

function parsePriceAmount(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rawStr = String(raw).trim();
  if (Number.isInteger(n) && n >= 1000 && !rawStr.includes('.')) {
    return n / 100;
  }
  return n;
}

export function resolveAnchorProductPrice(
  catalog: { variants?: Array<Record<string, unknown>> } | null | undefined,
  selectedVariantId: string
): AnchorProductPrice {
  const variants = Array.isArray(catalog?.variants) ? catalog!.variants : [];
  const variantId = String(selectedVariantId || '').trim();
  let variant =
    variantId &&
    variants.find((v) => String(v?.id ?? '').trim() === variantId);
  if (!variant && variants.length === 1) variant = variants[0];
  if (!variant && variants.length > 0) {
    variant = variants.find((v) => v?.available !== false) || variants[0];
  }

  const amount = parsePriceAmount(variant?.price_amount ?? variant?.price);
  const currency =
    String(variant?.currency_code ?? variant?.currency ?? '').trim() || null;
  return { price_amount: amount, currency_code: currency };
}
