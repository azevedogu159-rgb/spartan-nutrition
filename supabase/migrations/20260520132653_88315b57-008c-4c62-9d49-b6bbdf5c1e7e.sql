
-- =========================================
-- 1. purchase_orders (cabeçalho da compra)
-- =========================================
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text,
  country text,
  exchange_rate numeric NOT NULL DEFAULT 0,
  supplier_fee_pct numeric NOT NULL DEFAULT 0,
  total_usd numeric NOT NULL DEFAULT 0,
  total_brl numeric NOT NULL DEFAULT 0,
  payment_method text,
  notes text,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all purchase_orders" ON public.purchase_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================
-- 2. purchase_items (itens do lote)
-- =========================================
CREATE TABLE public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  perfume_name text NOT NULL,
  brand text,
  quantity numeric NOT NULL,
  unit_usd numeric NOT NULL DEFAULT 0,
  exchange_rate numeric NOT NULL DEFAULT 0,
  supplier_fee_pct numeric NOT NULL DEFAULT 0,
  unit_brl numeric NOT NULL DEFAULT 0,
  total_brl numeric NOT NULL DEFAULT 0,
  suggested_price_brl numeric NOT NULL DEFAULT 0,
  remaining_qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_items_order ON public.purchase_items(purchase_order_id);
CREATE INDEX idx_purchase_items_product ON public.purchase_items(product_id, created_at);
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all purchase_items" ON public.purchase_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================
-- 3. installments (parcelas)
-- =========================================
CREATE TABLE public.installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  installment_number int NOT NULL,
  due_date date NOT NULL,
  amount_brl numeric NOT NULL,
  status text NOT NULL DEFAULT 'pendente', -- pendente | pago | atrasado
  paid_at date,
  paid_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_installments_sale ON public.installments(sale_id);
CREATE INDEX idx_installments_due ON public.installments(due_date, status);
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all installments" ON public.installments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================
-- 4. sales — novos campos
-- =========================================
ALTER TABLE public.sales
  ADD COLUMN payment_method text NOT NULL DEFAULT 'a_vista', -- a_vista | parcelado | fiado | pix | dinheiro | cartao
  ADD COLUMN installments_count int NOT NULL DEFAULT 1,
  ADD COLUMN payment_status text NOT NULL DEFAULT 'pago'; -- pago | parcial | pendente

-- =========================================
-- 5. Migração de dados — purchases -> purchase_orders + purchase_items
-- Agrupa por (purchase_date, exchange_rate, supplier_fee_pct)
-- =========================================
DO $$
DECLARE
  grp RECORD;
  new_order_id uuid;
  p RECORD;
BEGIN
  FOR grp IN
    SELECT
      purchase_date, exchange_rate, supplier_fee_pct,
      SUM(unit_usd * quantity) AS sum_usd,
      SUM(total_brl) AS sum_brl
    FROM public.purchases
    GROUP BY purchase_date, exchange_rate, supplier_fee_pct
    ORDER BY purchase_date
  LOOP
    INSERT INTO public.purchase_orders (purchase_date, exchange_rate, supplier_fee_pct, total_usd, total_brl)
    VALUES (grp.purchase_date, grp.exchange_rate, grp.supplier_fee_pct, grp.sum_usd, grp.sum_brl)
    RETURNING id INTO new_order_id;

    FOR p IN
      SELECT * FROM public.purchases
      WHERE purchase_date = grp.purchase_date
        AND exchange_rate = grp.exchange_rate
        AND supplier_fee_pct = grp.supplier_fee_pct
      ORDER BY created_at
    LOOP
      INSERT INTO public.purchase_items (
        purchase_order_id, product_id, perfume_name, brand,
        quantity, unit_usd, exchange_rate, supplier_fee_pct,
        unit_brl, total_brl, remaining_qty, created_at
      ) VALUES (
        new_order_id, p.product_id, p.perfume_name, p.brand,
        p.quantity, p.unit_usd, p.exchange_rate, p.supplier_fee_pct,
        p.unit_brl, p.total_brl, p.quantity, p.created_at
      );
    END LOOP;
  END LOOP;
END $$;

-- =========================================
-- 6. Calcular remaining_qty descontando vendas existentes (FIFO por produto)
-- =========================================
DO $$
DECLARE
  s RECORD;
  it RECORD;
  to_consume numeric;
  take numeric;
BEGIN
  FOR s IN SELECT product_id, quantity FROM public.sales ORDER BY created_at LOOP
    to_consume := s.quantity;
    FOR it IN
      SELECT id, remaining_qty FROM public.purchase_items
      WHERE product_id = s.product_id AND remaining_qty > 0
      ORDER BY created_at
    LOOP
      EXIT WHEN to_consume <= 0;
      take := LEAST(it.remaining_qty, to_consume);
      UPDATE public.purchase_items SET remaining_qty = remaining_qty - take WHERE id = it.id;
      to_consume := to_consume - take;
    END LOOP;
  END LOOP;
END $$;

-- =========================================
-- 7. Triggers para purchase_items (estoque + custo médio)
-- =========================================
CREATE OR REPLACE FUNCTION public.apply_purchase_item()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cur_qty numeric; cur_cost numeric; new_qty numeric; new_cost numeric;
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

CREATE OR REPLACE FUNCTION public.revert_purchase_item()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cur_qty numeric; cur_cost numeric; new_qty numeric; new_cost numeric;
BEGIN
  SELECT stock_qty, avg_cost_brl INTO cur_qty, cur_cost FROM public.products WHERE id = OLD.product_id FOR UPDATE;
  new_qty := cur_qty - OLD.remaining_qty;
  IF new_qty < 0 THEN new_qty := 0; END IF;
  IF new_qty > 0 THEN
    new_cost := ((cur_qty * cur_cost) - (OLD.remaining_qty * (OLD.total_brl / NULLIF(OLD.quantity,0)))) / new_qty;
    IF new_cost < 0 THEN new_cost := 0; END IF;
  ELSE
    new_cost := 0;
  END IF;
  UPDATE public.products SET stock_qty = new_qty, avg_cost_brl = new_cost, updated_at = now() WHERE id = OLD.product_id;
  RETURN OLD;
END;$$;

CREATE TRIGGER trg_purchase_item_apply
AFTER INSERT ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_item();

CREATE TRIGGER trg_purchase_item_revert
BEFORE DELETE ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.revert_purchase_item();

-- =========================================
-- 8. Trigger FIFO em sales (consome dos lotes)
-- =========================================
CREATE OR REPLACE FUNCTION public.apply_sale_fifo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  to_consume numeric;
  it RECORD;
  take numeric;
BEGIN
  to_consume := NEW.quantity;
  FOR it IN
    SELECT id, remaining_qty FROM public.purchase_items
    WHERE product_id = NEW.product_id AND remaining_qty > 0
    ORDER BY created_at
  LOOP
    EXIT WHEN to_consume <= 0;
    take := LEAST(it.remaining_qty, to_consume);
    UPDATE public.purchase_items SET remaining_qty = remaining_qty - take WHERE id = it.id;
    to_consume := to_consume - take;
  END LOOP;
  UPDATE public.products SET stock_qty = stock_qty - NEW.quantity, updated_at = now() WHERE id = NEW.product_id;
  RETURN NEW;
END;$$;

CREATE OR REPLACE FUNCTION public.revert_sale_fifo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  to_return numeric;
  it RECORD;
  give numeric;
  taken numeric;
BEGIN
  to_return := OLD.quantity;
  FOR it IN
    SELECT id, quantity, remaining_qty FROM public.purchase_items
    WHERE product_id = OLD.product_id AND remaining_qty < quantity
    ORDER BY created_at DESC
  LOOP
    EXIT WHEN to_return <= 0;
    taken := it.quantity - it.remaining_qty;
    give := LEAST(taken, to_return);
    UPDATE public.purchase_items SET remaining_qty = remaining_qty + give WHERE id = it.id;
    to_return := to_return - give;
  END LOOP;
  UPDATE public.products SET stock_qty = stock_qty + OLD.quantity, updated_at = now() WHERE id = OLD.product_id;
  RETURN OLD;
END;$$;

CREATE TRIGGER trg_sale_apply_fifo
AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.apply_sale_fifo();

CREATE TRIGGER trg_sale_revert_fifo
BEFORE DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.revert_sale_fifo();

-- triggers para partner_tests
CREATE TRIGGER trg_partner_test_apply
AFTER INSERT ON public.partner_tests
FOR EACH ROW EXECUTE FUNCTION public.apply_partner_test();

CREATE TRIGGER trg_partner_test_revert
BEFORE DELETE ON public.partner_tests
FOR EACH ROW EXECUTE FUNCTION public.revert_partner_test();
