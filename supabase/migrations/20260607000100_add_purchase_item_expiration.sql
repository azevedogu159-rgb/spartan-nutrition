ALTER TABLE public.purchase_items
ADD COLUMN IF NOT EXISTS expires_at DATE;

CREATE INDEX IF NOT EXISTS idx_purchase_items_product_expiration
ON public.purchase_items (product_id, expires_at)
WHERE remaining_qty > 0;
