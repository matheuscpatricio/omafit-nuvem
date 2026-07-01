-- Tabelas para aprendizado do consultor stylist (paridade com Prisma no app Shopify)
CREATE TABLE IF NOT EXISTS widget_suggestion_pair_stats (
  id BIGSERIAL PRIMARY KEY,
  shop_domain TEXT NOT NULL,
  anchor_handle TEXT NOT NULL,
  suggested_handle TEXT NOT NULL,
  impression_id TEXT,
  impressions INTEGER NOT NULL DEFAULT 0,
  stylist_clicks INTEGER NOT NULL DEFAULT 0,
  atc INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shop_domain, anchor_handle, suggested_handle)
);

CREATE TABLE IF NOT EXISTS widget_store_profiles (
  id BIGSERIAL PRIMARY KEY,
  shop_domain TEXT NOT NULL UNIQUE,
  audience TEXT,
  price_band TEXT,
  primary_categories JSONB DEFAULT '[]'::jsonb,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE size_charts ADD COLUMN IF NOT EXISTS product_handle TEXT DEFAULT '';
ALTER TABLE size_charts ADD COLUMN IF NOT EXISTS gender_scope TEXT DEFAULT 'both';

ALTER TABLE widget_configurations ADD COLUMN IF NOT EXISTS tryon_layout TEXT DEFAULT 'default';
ALTER TABLE widget_configurations ADD COLUMN IF NOT EXISTS tryon_enabled BOOLEAN DEFAULT TRUE;
