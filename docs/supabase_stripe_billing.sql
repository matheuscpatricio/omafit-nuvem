-- =============================================================================
-- Stripe billing (Nuvemshop only) — colunas em shopify_shops
-- Execute no SQL Editor do Supabase após supabase_self_billing.sql
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_shops' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE shopify_shops ADD COLUMN stripe_customer_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_shops' AND column_name = 'stripe_subscription_id'
  ) THEN
    ALTER TABLE shopify_shops ADD COLUMN stripe_subscription_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_shops' AND column_name = 'stripe_payment_status'
  ) THEN
    ALTER TABLE shopify_shops ADD COLUMN stripe_payment_status TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_shops' AND column_name = 'platform'
  ) THEN
    ALTER TABLE shopify_shops ADD COLUMN platform TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shopify_shops_stripe_customer
  ON shopify_shops (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopify_shops_nuvemshop_platform
  ON shopify_shops (shop_domain)
  WHERE platform = 'nuvemshop' OR shop_domain LIKE 'nuvemshop/%';

-- Marca linhas existentes com shop_domain nuvemshop/* como plataforma Nuvemshop
UPDATE shopify_shops
SET platform = 'nuvemshop'
WHERE shop_domain LIKE 'nuvemshop/%'
  AND (platform IS NULL OR platform <> 'nuvemshop');

-- Rastreio de cobranças Stripe (excedente)
ALTER TABLE billing_usage_charges
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;

CREATE INDEX IF NOT EXISTS idx_billing_usage_charges_stripe_invoice
  ON billing_usage_charges (stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;
