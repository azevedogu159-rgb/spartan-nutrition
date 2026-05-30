import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  DollarSign,
  Percent,
  Package,
  Trophy,
  Wallet,
  CalendarDays,
  FlaskConical,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Target,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Dashboard });

type Sale = {
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  perfume_name: string;
  sale_date: string;
  payment_method: string;
};
type Product = {
  id: string;
  stock_qty: number;
  avg_cost_brl: number;
  suggested_price_brl: number;
};
type Order = { total_brl: number; purchase_date: string };
type PartnerTest = { total_cost_brl: number };
type Installment = {
  amount_brl: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  paid_amount: number | null;
};

function Dashboard() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tests, setTests] = useState<PartnerTest[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);

  const load = async () => {
    const [s, p, o, t, inst] = await Promise.all([
      supabase
        .from("sales")
        .select("quantity, revenue, cost, profit, perfume_name, sale_date, payment_method"),
      supabase.from("products").select("id, stock_qty, avg_cost_brl, suggested_price_brl"),
      supabase.from("purchase_orders").select("total_brl, purchase_date"),
      supabase.from("partner_tests").select("total_cost_brl"),
      supabase.from("installments").select("amount_brl, due_date, status, paid_at, paid_amount"),
    ]);
    setSales((s.data ?? []) as Sale[]);
    setProducts((p.data ?? []) as Product[]);
    setOrders((o.data ?? []) as Order[]);
    setTests((t.data ?? []) as PartnerTest[]);
    setInstallments((inst.data ?? []) as Installment[]);
  };
  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const today = new Date();
    const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const currentYM = ym(today);
    const todayISO = today.toISOString().slice(0, 10);

    const vistaMethods = ["a_vista", "pix", "dinheiro", "cartao"];
    const profit = sales.reduce((a, s) => a + Number(s.profit), 0);

    const monthSales = sales.filter((s) => ym(new Date(s.sale_date)) === currentYM);
    const monthProfit = monthSales.reduce((a, s) => a + Number(s.profit), 0);
    const ticketMedio =
      monthSales.length > 0
        ? monthSales.reduce((a, s) => a + Number(s.revenue), 0) / monthSales.length
        : 0;

    const availableProducts = products.filter((p) => Number(p.stock_qty) > 0);
    const inventoryValue = availableProducts.reduce(
      (a, p) => a + Number(p.stock_qty) * Number(p.avg_cost_brl),
      0,
    );
    const potentialRevenue = availableProducts.reduce(
      (a, p) => a + Number(p.stock_qty) * Number(p.suggested_price_brl),
      0,
    );
    const potentialProfit = potentialRevenue - inventoryValue;

    const totalInvested = orders.reduce((a, p) => a + Number(p.total_brl), 0);
    const investedThisMonth = orders
      .filter((p) => ym(new Date(p.purchase_date)) === currentYM)
      .reduce((a, p) => a + Number(p.total_brl), 0);

    const months: { key: string; label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        key: ym(d),
        label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        total: 0,
      });
    }
    for (const p of orders) {
      const k = ym(new Date(p.purchase_date));
      const m = months.find((x) => x.key === k);
      if (m) m.total += Number(p.total_brl);
    }

    const top = Object.values(
      sales.reduce<Record<string, { name: string; qty: number; profit: number }>>((acc, s) => {
        const k = s.perfume_name;
        acc[k] ??= { name: k, qty: 0, profit: 0 };
        acc[k].qty += Number(s.quantity);
        acc[k].profit += Number(s.profit);
        return acc;
      }, {}),
    )
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const testsTotal = tests.reduce((a, t) => a + Number(t.total_cost_brl), 0);

    let toReceive = 0,
      late = 0,
      receivedMonth = 0,
      lateCount = 0;
    let installmentsRevenue = 0;

    for (const it of installments) {
      const amt = Number(it.amount_brl);
      const paid = Number(it.paid_amount ?? (it.status === "pago" ? amt : 0));

      if (it.status === "pago" || it.status === "parcial") {
        installmentsRevenue += paid;
        if ((it.paid_at ?? "").slice(0, 7) === currentYM) {
          receivedMonth += paid;
        }
      }

      if (it.status === "pendente" || it.status === "parcial") {
        const remaining = amt - paid;
        if (remaining > 0) {
          toReceive += remaining;
          if (it.due_date < todayISO) {
            late += remaining;
            lateCount++;
          }
        }
      }
    }

    const aVistaRevenue = sales
      .filter((s) => vistaMethods.includes(s.payment_method ?? ""))
      .reduce((a, s) => a + Number(s.revenue), 0);

    const aVistaMonthRevenue = monthSales
      .filter((s) => vistaMethods.includes(s.payment_method ?? ""))
      .reduce((a, s) => a + Number(s.revenue), 0);

    const revenue = aVistaRevenue + installmentsRevenue;
    const monthRevenue = aVistaMonthRevenue + receivedMonth;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      revenue,
      profit,
      margin,
      monthRevenue,
      monthProfit,
      ticketMedio,
      inventoryValue,
      potentialRevenue,
      potentialProfit,
      totalInvested,
      investedThisMonth,
      months,
      top,
      testsTotal,
      toReceive,
      late,
      receivedMonth,
      lateCount,
    };
  }, [sales, products, orders, tests, installments]);

  const maxMonth = Math.max(1, ...stats.months.map((m) => m.total));

  function chunkArray<T>(arr: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size),
    );
  }

  const recalculateStock = async () => {
    if (
      !confirm(
        "Isso vai recalcular TODO o estoque baseado no histórico de compras, vendas e amostras. Deseja continuar?",
      )
    )
      return;
    try {
      toast("Recalculando estoque...");
      const [pReq, piReq, sReq, tReq] = await Promise.all([
        supabase.from("products").select("id"),
        supabase.from("purchase_items").select("*").order("created_at", { ascending: true }),
        supabase
          .from("sales")
          .select("id, product_id, perfume_name, quantity, created_at")
          .order("created_at", { ascending: true }),
        supabase
          .from("partner_tests")
          .select("id, product_id, perfume_name, quantity, created_at")
          .order("created_at", { ascending: true }),
      ]);
      const productsList = pReq.data ?? [];
      const allPI = piReq.data ?? [];
      const allSales = sReq.data ?? [];
      const allTests = tReq.data ?? [];

      const piUpdates = [];
      const pUpdates = [];
      const insufficientProducts = new Set<string>();

      for (const prod of productsList) {
        const pItems = allPI.filter((x) => x.product_id === prod.id);
        const outflows = [
          ...allSales
            .filter((x) => x.product_id === prod.id)
            .map((x) => ({ ...x, source: "venda" })),
          ...allTests
            .filter((x) => x.product_id === prod.id)
            .map((x) => ({ ...x, source: "amostra" })),
        ].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

        pItems.forEach((pi) => (pi.remaining_qty = Number(pi.quantity)));

        for (const outflow of outflows) {
          let toConsume = Number(outflow.quantity);
          for (const pi of pItems) {
            if (toConsume <= 0) break;
            if (pi.remaining_qty > 0) {
              const take = Math.min(pi.remaining_qty, toConsume);
              pi.remaining_qty -= take;
              toConsume -= take;
            }
          }
          if (toConsume > 0) {
            insufficientProducts.add(
              `${outflow.perfume_name ?? outflow.product_id} (${outflow.source})`,
            );
          }
        }

        let finalStock = 0;
        let totalCost = 0;
        pItems.forEach((pi) => {
          finalStock += pi.remaining_qty;
          totalCost += pi.remaining_qty * (Number(pi.unit_brl) || 0);
        });
        const finalAvgCost = finalStock > 0 ? totalCost / finalStock : 0;

        pUpdates.push({ id: prod.id, stock_qty: finalStock, avg_cost_brl: finalAvgCost });
        pItems.forEach((pi) => {
          piUpdates.push({ id: pi.id, remaining_qty: pi.remaining_qty });
        });
      }

      for (const chunk of chunkArray(piUpdates, 50)) {
        await Promise.all(
          chunk.map((u) =>
            supabase
              .from("purchase_items")
              .update({ remaining_qty: u.remaining_qty })
              .eq("id", u.id),
          ),
        );
      }
      for (const chunk of chunkArray(pUpdates, 50)) {
        await Promise.all(
          chunk.map((u) =>
            supabase
              .from("products")
              .update({ stock_qty: u.stock_qty, avg_cost_brl: u.avg_cost_brl })
              .eq("id", u.id),
          ),
        );
      }

      if (insufficientProducts.size > 0) {
        toast.warning(
          `Estoque recalculado, mas há saídas acima das compras lançadas em ${insufficientProducts.size} produto(s).`,
        );
      } else {
        toast.success("Estoque recalculado com sucesso!");
      }
      load();
    } catch (e) {
      toast.error("Erro ao recalcular: " + (e instanceof Error ? e.message : "erro desconhecido"));
    }
  };

  const Section = ({
    title,
    cards,
  }: {
    title: string;
    cards: {
      label: string;
      value: string;
      icon: React.ComponentType<{ className?: string }>;
      accent: string;
    }[];
  }) => (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="shadow-soft">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </span>
                <c.icon className={`h-4 w-4 ${c.accent}`} />
              </div>
              <div className="mt-2 text-lg font-semibold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {stats.lateCount > 0 && (
        <Card className="shadow-soft border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="flex-1 text-sm">
              <span className="font-semibold text-destructive">
                {stats.lateCount} parcela{stats.lateCount > 1 ? "s" : ""} atrasada
                {stats.lateCount > 1 ? "s" : ""}
              </span>
              {" — "}
              {brl(stats.late)} em aberto
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <Button variant="outline" size="sm" onClick={recalculateStock}>
          <RefreshCw className="mr-2 h-4 w-4" /> Recalcular Estoque
        </Button>
      </div>

      <Section
        title="Vendas & Faturamento"
        cards={[
          {
            label: "Caixa Recebido Mês",
            value: brl(stats.monthRevenue),
            icon: DollarSign,
            accent: "text-primary",
          },
          {
            label: "Lucro Vendas Mês",
            value: brl(stats.monthProfit),
            icon: TrendingUp,
            accent: "text-success",
          },
          {
            label: "Ticket médio",
            value: brl(stats.ticketMedio),
            icon: Target,
            accent: "text-accent-foreground",
          },
          {
            label: "Caixa Recebido Total",
            value: brl(stats.revenue),
            icon: DollarSign,
            accent: "text-primary",
          },
          {
            label: "Lucro Vendas Total",
            value: brl(stats.profit),
            icon: TrendingUp,
            accent: "text-success",
          },
          {
            label: "Margem de Lucro",
            value: `${stats.margin.toFixed(1)}%`,
            icon: Percent,
            accent: "text-accent-foreground",
          },
        ]}
      />

      <Section
        title="Estoque"
        cards={[
          {
            label: "Valor em estoque",
            value: brl(stats.inventoryValue),
            icon: Package,
            accent: "text-primary",
          },
          {
            label: "Potencial de venda",
            value: brl(stats.potentialRevenue),
            icon: TrendingUp,
            accent: "text-accent-foreground",
          },
          {
            label: "Lucro potencial",
            value: brl(stats.potentialProfit),
            icon: Target,
            accent: "text-success",
          },
        ]}
      />

      <Section
        title="Financeiro"
        cards={[
          { label: "A receber", value: brl(stats.toReceive), icon: Clock, accent: "text-primary" },
          {
            label: "Atrasado",
            value: brl(stats.late),
            icon: AlertTriangle,
            accent: "text-destructive",
          },
          {
            label: "Recebido no mês",
            value: brl(stats.receivedMonth),
            icon: CheckCircle2,
            accent: "text-success",
          },
        ]}
      />

      <Section
        title="Investimentos"
        cards={[
          {
            label: "Investimento total",
            value: brl(stats.totalInvested),
            icon: Wallet,
            accent: "text-primary",
          },
          {
            label: "Investido no mês",
            value: brl(stats.investedThisMonth),
            icon: CalendarDays,
            accent: "text-accent-foreground",
          },
          {
            label: "Investido em amostras",
            value: brl(stats.testsTotal),
            icon: FlaskConical,
            accent: "text-accent-foreground",
          },
        ]}
      />

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" /> Investimento por compra/mês (últimos 6)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem compras registradas.</p>
          ) : (
            <ul className="space-y-2">
              {stats.months.map((m) => (
                <li key={m.key} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="capitalize">{m.label}</span>
                    <span className="font-medium">{brl(m.total)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-[image:var(--gradient-luxe)]"
                      style={{ width: `${(m.total / maxMonth) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-accent-foreground" /> Mais vendidos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.top.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem vendas registradas ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {stats.top.map((t, i) => (
                <li key={t.name} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[image:var(--gradient-gold)] text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="font-medium">{t.name}</span>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold">{t.qty} un.</div>
                    <div className="text-xs text-success">{brl(t.profit)} lucro</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
