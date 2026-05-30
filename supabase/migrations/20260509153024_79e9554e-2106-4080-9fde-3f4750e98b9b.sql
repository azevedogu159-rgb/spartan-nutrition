
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read product photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-photos');

CREATE POLICY "Auth upload product photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-photos');

CREATE POLICY "Auth update product photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-photos');

CREATE POLICY "Auth delete product photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-photos');
