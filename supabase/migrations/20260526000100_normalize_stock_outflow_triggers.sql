-- Ensure each stock outflow is applied exactly once.
-- Previous migrations introduced legacy aggregate triggers and FIFO triggers side by side.

DROP TRIGGER IF EXISTS trg_apply_sale ON public.sales;
DROP TRIGGER IF EXISTS trg_revert_sale ON public.sales;
DROP TRIGGER IF EXISTS trg_sale_apply_fifo ON public.sales;
DROP TRIGGER IF EXISTS trg_sale_revert_fifo ON public.sales;

DROP TRIGGER IF EXISTS trg_apply_partner_test ON public.partner_tests;
DROP TRIGGER IF EXISTS trg_revert_partner_test ON public.partner_tests;
DROP TRIGGER IF EXISTS trg_partner_test_apply ON public.partner_tests;
DROP TRIGGER IF EXISTS trg_partner_test_revert ON public.partner_tests;

DO $$
DECLARE
  trig RECORD;
BEGIN
  FOR trig IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'public.sales'::regclass
      AND NOT t.tgisinternal
      AND n.nspname = 'public'
      AND p.proname IN ('apply_sale', 'revert_sale', 'apply_sale_fifo', 'revert_sale_fifo')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.sales', trig.tgname);
  END LOOP;

  FOR trig IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = 'public.partner_tests'::regclass
      AND NOT t.tgisinternal
      AND n.nspname = 'public'
      AND p.proname IN ('apply_partner_test', 'revert_partner_test')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.partner_tests', trig.tgname);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.apply_sale();
DROP FUNCTION IF EXISTS public.revert_sale();

CREATE OR REPLACE FUNCTION public.refresh_product_stock(p_product_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  final_stock numeric;
  final_cost numeric;
BEGIN
  SELECT
    COALESCE(SUM(remaining_qty), 0),
    COALESCE(SUM(remaining_qty * unit_brl), 0)
  INTO final_stock, final_cost
  FROM public.purchase_items
  WHERE product_id = p_product_id;

  UPDATE public.products
  SET
    stock_qty = final_stock,
    avg_cost_brl = CASE WHEN final_stock > 0 THEN final_cost / final_stock ELSE 0 END,
    updated_at = now()
  WHERE id = p_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_sale_fifo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  available_qty numeric;
  to_consume numeric;
  it RECORD;
  take numeric;
BEGIN
  PERFORM 1 FROM public.products WHERE id = NEW.product_id FOR UPDATE;

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
    FOR UPDATE
  LOOP
    EXIT WHEN to_consume <= 0;
    take := LEAST(it.remaining_qty, to_consume);
    UPDATE public.purchase_items
    SET remaining_qty = remaining_qty - take
    WHERE id = it.id;
    to_consume := to_consume - take;
  END LOOP;

  PERFORM public.refresh_product_stock(NEW.product_id);
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
  PERFORM 1 FROM public.products WHERE id = OLD.product_id FOR UPDATE;

  to_return := OLD.quantity;
  FOR it IN
    SELECT id, quantity, remaining_qty FROM public.purchase_items
    WHERE product_id = OLD.product_id AND remaining_qty < quantity
    ORDER BY created_at DESC, id DESC
    FOR UPDATE
  LOOP
    EXIT WHEN to_return <= 0;
    taken := it.quantity - it.remaining_qty;
    give := LEAST(taken, to_return);
    UPDATE public.purchase_items
    SET remaining_qty = remaining_qty + give
    WHERE id = it.id;
    to_return := to_return - give;
  END LOOP;

  PERFORM public.refresh_product_stock(OLD.product_id);
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
  PERFORM 1 FROM public.products WHERE id = NEW.product_id FOR UPDATE;

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
    FOR UPDATE
  LOOP
    EXIT WHEN to_consume <= 0;
    take := LEAST(it.remaining_qty, to_consume);
    UPDATE public.purchase_items
    SET remaining_qty = remaining_qty - take
    WHERE id = it.id;
    to_consume := to_consume - take;
  END LOOP;

  PERFORM public.refresh_product_stock(NEW.product_id);
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
  PERFORM 1 FROM public.products WHERE id = OLD.product_id FOR UPDATE;

  to_return := OLD.quantity;
  FOR it IN
    SELECT id, quantity, remaining_qty FROM public.purchase_items
    WHERE product_id = OLD.product_id AND remaining_qty < quantity
    ORDER BY created_at DESC, id DESC
    FOR UPDATE
  LOOP
    EXIT WHEN to_return <= 0;
    taken := it.quantity - it.remaining_qty;
    give := LEAST(taken, to_return);
    UPDATE public.purchase_items
    SET remaining_qty = remaining_qty + give
    WHERE id = it.id;
    to_return := to_return - give;
  END LOOP;

  PERFORM public.refresh_product_stock(OLD.product_id);
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_sale_apply_fifo
AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.apply_sale_fifo();

CREATE TRIGGER trg_sale_revert_fifo
BEFORE DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.revert_sale_fifo();

CREATE TRIGGER trg_partner_test_apply
AFTER INSERT ON public.partner_tests
FOR EACH ROW EXECUTE FUNCTION public.apply_partner_test();

CREATE TRIGGER trg_partner_test_revert
BEFORE DELETE ON public.partner_tests
FOR EACH ROW EXECUTE FUNCTION public.revert_partner_test();

DO $$
DECLARE
  prod RECORD;
  outflow RECORD;
  item RECORD;
  to_consume numeric;
  take numeric;
BEGIN
  UPDATE public.purchase_items
  SET remaining_qty = quantity;

  FOR prod IN SELECT id, name FROM public.products LOOP
    FOR outflow IN
      SELECT id, quantity, perfume_name, created_at, 'venda' AS source FROM public.sales
      WHERE product_id = prod.id
      UNION ALL
      SELECT id, quantity, perfume_name, created_at, 'amostra' AS source FROM public.partner_tests
      WHERE product_id = prod.id
      ORDER BY created_at, id
    LOOP
      to_consume := outflow.quantity;

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
          outflow.id, outflow.source, COALESCE(outflow.perfume_name, prod.name), to_consume;
      END IF;
    END LOOP;

    PERFORM public.refresh_product_stock(prod.id);
  END LOOP;
END $$;
