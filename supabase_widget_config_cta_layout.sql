-- Paridade com app Shopify: CTA, layout do provador e imagem hero.
ALTER TABLE widget_configurations ADD COLUMN IF NOT EXISTS embed_position TEXT DEFAULT 'below_buy_buttons';
ALTER TABLE widget_configurations ADD COLUMN IF NOT EXISTS cta_type TEXT DEFAULT 'link';
ALTER TABLE widget_configurations ADD COLUMN IF NOT EXISTS cta_button_border_radius INTEGER DEFAULT 40;
ALTER TABLE widget_configurations ADD COLUMN IF NOT EXISTS tryon_layout_background_image TEXT;
