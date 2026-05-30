CREATE TABLE public.partner_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  perfume_name TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_cost_brl NUMERIC NOT NULL,
  total_cost_brl NUMERIC NOT NULL,
  test_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all partner_tests" ON public.partner_tests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.apply_partner_test()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.products SET stock_qty = stock_qty - NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.revert_partner_test()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.products SET stock_qty = stock_qty + OLD.quantity, updated_at = now() WHERE id = OLD.product_id;
  RETURN OLD;
END;$$;

CREATE TRIGGER trg_apply_partner_test AFTER INSERT ON public.partner_tests FOR EACH ROW EXECUTE FUNCTION public.apply_partner_test();
CREATE TRIGGER trg_revert_partner_test AFTER DELETE ON public.partner_tests FOR EACH ROW EXECUTE FUNCTION public.revert_partner_test();