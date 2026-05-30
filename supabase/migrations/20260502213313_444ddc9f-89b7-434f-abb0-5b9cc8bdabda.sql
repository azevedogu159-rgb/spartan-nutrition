
-- Products (estoque agregado)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  brand TEXT,
  stock_qty NUMERIC NOT NULL DEFAULT 0,
  avg_cost_brl NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  perfume_name TEXT NOT NULL,
  brand TEXT,
  quantity NUMERIC NOT NULL,
  unit_usd NUMERIC NOT NULL,
  exchange_rate NUMERIC NOT NULL,
  unit_brl NUMERIC NOT NULL,
  total_brl NUMERIC NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  perfume_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_price_brl NUMERIC NOT NULL,
  unit_cost_brl NUMERIC NOT NULL,
  revenue NUMERIC NOT NULL,
  cost NUMERIC NOT NULL,
  profit NUMERIC NOT NULL,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Open access (single-user internal tool)
CREATE POLICY "public all products" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all purchases" ON public.purchases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all sales" ON public.sales FOR ALL USING (true) WITH CHECK (true);

-- Trigger: on purchase insert -> update product stock & weighted avg cost
CREATE OR REPLACE FUNCTION public.apply_purchase() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cur_qty NUMERIC; cur_cost NUMERIC; new_qty NUMERIC; new_cost NUMERIC;
BEGIN
  SELECT stock_qty, avg_cost_brl INTO cur_qty, cur_cost FROM public.products WHERE id = NEW.product_id FOR UPDATE;
  new_qty := cur_qty + NEW.quantity;
  IF new_qty > 0 THEN
    new_cost := ((cur_qty * cur_cost) + NEW.total_brl) / new_qty;
  ELSE
    new_cost := cur_cost;
  END IF;
  UPDATE public.products SET stock_qty = new_qty, avg_cost_brl = new_cost, updated_at = now() WHERE id = NEW.product_id;
  RETURN NEW;
END;$$;

CREATE TRIGGER trg_apply_purchase AFTER INSERT ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.apply_purchase();

-- Trigger: on purchase delete -> reverse
CREATE OR REPLACE FUNCTION public.revert_purchase() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cur_qty NUMERIC; cur_cost NUMERIC; new_qty NUMERIC; new_cost NUMERIC;
BEGIN
  SELECT stock_qty, avg_cost_brl INTO cur_qty, cur_cost FROM public.products WHERE id = OLD.product_id FOR UPDATE;
  new_qty := cur_qty - OLD.quantity;
  IF new_qty > 0 THEN
    new_cost := ((cur_qty * cur_cost) - OLD.total_brl) / new_qty;
    IF new_cost < 0 THEN new_cost := 0; END IF;
  ELSE
    new_qty := 0; new_cost := 0;
  END IF;
  UPDATE public.products SET stock_qty = new_qty, avg_cost_brl = new_cost, updated_at = now() WHERE id = OLD.product_id;
  RETURN OLD;
END;$$;

CREATE TRIGGER trg_revert_purchase AFTER DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.revert_purchase();

-- Trigger: on sale insert -> reduce stock
CREATE OR REPLACE FUNCTION public.apply_sale() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.products SET stock_qty = stock_qty - NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  RETURN NEW;
END;$$;

CREATE TRIGGER trg_apply_sale AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.apply_sale();

CREATE OR REPLACE FUNCTION public.revert_sale() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.products SET stock_qty = stock_qty + OLD.quantity, updated_at = now() WHERE id = OLD.product_id;
  RETURN OLD;
END;$$;

CREATE TRIGGER trg_revert_sale AFTER DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.revert_sale();
