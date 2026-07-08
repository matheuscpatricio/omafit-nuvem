-- =============================================================================
-- Billing proprio (parceiro) — excedente de try-on Nuvemshop
-- Execute no SQL Editor do Supabase.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_shops' AND column_name = 'billing_mode'
  ) THEN
    ALTER TABLE shopify_shops ADD COLUMN billing_mode TEXT DEFAULT 'self';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_shops' AND column_name = 'pending_overage_amount'
  ) THEN
    ALTER TABLE shopify_shops ADD COLUMN pending_overage_amount NUMERIC(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_shops' AND column_name = 'pending_overage_units'
  ) THEN
    ALTER TABLE shopify_shops ADD COLUMN pending_overage_units INTEGER DEFAULT 0;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS billing_usage_charges (
  id BIGSERIAL PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  store_id TEXT,
  platform TEXT DEFAULT 'nuvemshop',
  prediction_id TEXT,
  units INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'BRL',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_usage_charges_shop_domain
  ON billing_usage_charges (shop_domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_usage_charges_prediction
  ON billing_usage_charges (prediction_id)
  WHERE prediction_id IS NOT NULL;

ALTER TABLE billing_usage_charges DISABLE ROW LEVEL SECURITY;
