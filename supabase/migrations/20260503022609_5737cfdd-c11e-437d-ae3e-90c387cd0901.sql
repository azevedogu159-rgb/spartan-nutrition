
DROP POLICY IF EXISTS "public all products"  ON public.products;
DROP POLICY IF EXISTS "public all purchases" ON public.purchases;
DROP POLICY IF EXISTS "public all sales"     ON public.sales;
DROP POLICY IF EXISTS "public all customers" ON public.customers;

CREATE POLICY "auth all products"  ON public.products  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all purchases" ON public.purchases FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all sales"     ON public.sales     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
