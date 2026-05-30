ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS suggested_price_brl numeric NOT NULL DEFAULT 0;

