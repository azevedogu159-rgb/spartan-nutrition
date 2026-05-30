-- Remove legacy sale stock triggers so each sale only leaves stock once.
DROP TRIGGER IF EXISTS trg_apply_sale ON public.sales;
DROP TRIGGER IF EXISTS trg_revert_sale ON public.sales;
DROP FUNCTION IF EXISTS public.apply_sale();
DROP FUNCTION IF EXISTS public.revert_sale();
DROP TRIGGER IF EXISTS trg_apply_partner_test ON public.partner_tests;
DROP TRIGGER IF EXISTS trg_revert_partner_test ON public.partner_tests;
DROP TRIGGER IF EXISTS trg_partner_test_apply ON public.partner_tests;
DROP TRIGGER IF EXISTS trg_partner_test_revert ON public.partner_tests;

CREATE OR REPLACE FUNCTION public.apply_sale_fifo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  available_qty numeric;
  to_consume numeric;
  it RECORD;
  take numeric;
BEGIN
  SELECT COALESCE(SUM(remaining_qty), 0)
    INTO available_qty
  FROM public.purchase_items
  WHERE product_id = NEW.product_id;

  IF available_qty < NEW.quantity THEN
    RAISE EXCEPTION 'Estoque insuficiente para %. Disponivel: %, solicitado: %',
      NEW.perfume_name, available_qty, NEW.quantity;
  END IF;

  to_consume := NEW.quantity;
  FOR it IN
    SELECT id, remaining_qty FROM public.purchase_items
    WHERE product_id = NEW.product_id AND remaining_qty > 0
    ORDER BY created_at, id
  LOOP
    EXIT WHEN to_consume <= 0;
    take := LEAST(it.remaining_qty, to_consume);
    UPDATE public.purchase_items SET remaining_qty = remaining_qty - take WHERE id = it.id;
    to_consume := to_consume - take;
  END LOOP;

  UPDATE public.products
  SET stock_qty = GREATEST(stock_qty - NEW.quantity, 0), updated_at = now()
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;

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
    ORDER BY created_at DESC, id DESC
  LOOP
    EXIT WHEN to_return <= 0;
    taken := it.quantity - it.remaining_qty;
    give := LEAST(taken, to_return);
    UPDATE public.purchase_items SET remaining_qty = remaining_qty + give WHERE id = it.id;
    to_return := to_return - give;
  END LOOP;

  UPDATE public.products
  SET stock_qty = stock_qty + OLD.quantity, updated_at = now()
  WHERE id = OLD.product_id;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_partner_test()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  available_qty numeric;
  to_consume numeric;
  it RECORD;
  take numeric;
BEGIN
  SELECT COALESCE(SUM(remaining_qty), 0)
    INTO available_qty
  FROM public.purchase_items
  WHERE product_id = NEW.product_id;

  IF available_qty < NEW.quantity THEN
    RAISE EXCEPTION 'Estoque insuficiente para amostra de %. Disponivel: %, solicitado: %',
      NEW.perfume_name, available_qty, NEW.quantity;
  END IF;

  to_consume := NEW.quantity;
  FOR it IN
    SELECT id, remaining_qty FROM public.purchase_items
    WHERE product_id = NEW.product_id AND remaining_qty > 0
    ORDER BY created_at, id
  LOOP
    EXIT WHEN to_consume <= 0;
    take := LEAST(it.remaining_qty, to_consume);
    UPDATE public.purchase_items SET remaining_qty = remaining_qty - take WHERE id = it.id;
    to_consume := to_consume - take;
  END LOOP;

  UPDATE public.products
  SET stock_qty = GREATEST(stock_qty - NEW.quantity, 0), updated_at = now()
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_partner_test()
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
    ORDER BY created_at DESC, id DESC
  LOOP
    EXIT WHEN to_return <= 0;
    taken := it.quantity - it.remaining_qty;
    give := LEAST(taken, to_return);
    UPDATE public.purchase_items SET remaining_qty = remaining_qty + give WHERE id = it.id;
    to_return := to_return - give;
  END LOOP;

  UPDATE public.products
  SET stock_qty = stock_qty + OLD.quantity, updated_at = now()
  WHERE id = OLD.product_id;

  RETURN OLD;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_sale_apply_fifo'
      AND tgrelid = 'public.sales'::regclass
  ) THEN
    CREATE TRIGGER trg_sale_apply_fifo
    AFTER INSERT ON public.sales
    FOR EACH ROW EXECUTE FUNCTION public.apply_sale_fifo();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_sale_revert_fifo'
      AND tgrelid = 'public.sales'::regclass
  ) THEN
    CREATE TRIGGER trg_sale_revert_fifo
    BEFORE DELETE ON public.sales
    FOR EACH ROW EXECUTE FUNCTION public.revert_sale_fifo();
  END IF;
END $$;

CREATE TRIGGER trg_partner_test_apply
AFTER INSERT ON public.partner_tests
FOR EACH ROW EXECUTE FUNCTION public.apply_partner_test();

CREATE TRIGGER trg_partner_test_revert
BEFORE DELETE ON public.partner_tests
FOR EACH ROW EXECUTE FUNCTION public.revert_partner_test();

-- Rebuild lot balances and aggregate stock from purchase history minus every sale/test.
-- Pending/fiado/parcelado sales and partner tests are included because the product already left stock.
DO $$
DECLARE
  prod RECORD;
  sale RECORD;
  item RECORD;
  to_consume numeric;
  take numeric;
  final_stock numeric;
  final_cost numeric;
BEGIN
  UPDATE public.purchase_items
  SET remaining_qty = quantity;

  FOR prod IN SELECT id, name FROM public.products LOOP
    FOR sale IN
      SELECT id, quantity, perfume_name, created_at, 'venda' AS source FROM public.sales
      WHERE product_id = prod.id
      UNION ALL
      SELECT id, quantity, perfume_name, created_at, 'amostra' AS source FROM public.partner_tests
      WHERE product_id = prod.id
      ORDER BY created_at, id
    LOOP
      to_consume := sale.quantity;

      FOR item IN
        SELECT id, remaining_qty FROM public.purchase_items
        WHERE product_id = prod.id AND remaining_qty > 0
        ORDER BY created_at, id
      LOOP
        EXIT WHEN to_consume <= 0;
        take := LEAST(item.remaining_qty, to_consume);
        UPDATE public.purchase_items
        SET remaining_qty = remaining_qty - take
        WHERE id = item.id;
        to_consume := to_consume - take;
      END LOOP;

      IF to_consume > 0 THEN
        RAISE NOTICE 'Saida % (%) de % excede compras/lotes em % unidade(s).',
          sale.id, sale.source, COALESCE(sale.perfume_name, prod.name), to_consume;
      END IF;
    END LOOP;

    SELECT
      COALESCE(SUM(remaining_qty), 0),
      COALESCE(SUM(remaining_qty * unit_brl), 0)
    INTO final_stock, final_cost
    FROM public.purchase_items
    WHERE product_id = prod.id;

    UPDATE public.products
    SET
      stock_qty = final_stock,
      avg_cost_brl = CASE WHEN final_stock > 0 THEN final_cost / final_stock ELSE 0 END,
      updated_at = now()
    WHERE id = prod.id;
  END LOOP;
END $$;
