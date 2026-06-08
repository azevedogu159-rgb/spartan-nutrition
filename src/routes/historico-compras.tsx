import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { Search, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/historico-compras")({ component: HistoricoPage });

type Order = {
  id: string;
  supplier: string | null;
  country: string | null;
  total_brl: number;
  payment_method: string | null;
  notes: string | null;
  purchase_date: string;
};

type Item = {
  id: string;
  purchase_order_id: string;
  product_id: string;
  perfume_name: string;
  brand: string | null;
  quantity: number;
  unit_brl: number;
  total_brl: number;
  suggested_price_brl: number;
  remaining_qty: number;
};

function HistoricoPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = async () => {
    const [o, i] = await Promise.all([
      supabase.from("purchase_orders").select("*").order("purchase_date", { ascending: false }),
      supabase.from("purchase_items").select("*"),
    ]);
    setOrders((o.data ?? []) as Order[]);
    setItems((i.data ?? []) as Item[]);
  };
  useEffect(() => { load(); }, []);

  const itemsByOrder = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const it of items) (m[it.purchase_order_id] ??= []).push(it);
    return m;
  }, [items]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((o) => {
      if ((o.supplier ?? "").toLowerCase().includes(term)) return true;
      if (o.id.toLowerCase().includes(term)) return true;
      if (o.purchase_date.includes(term)) return true;
      const its = itemsByOrder[o.id] ?? [];
      return its.some((it) =>
        it.perfume_name.toLowerCase().includes(term) ||
        (it.brand ?? "").toLowerCase().includes(term)
      );
    });
  }, [orders, q, itemsByOrder]);

  const removeOrder = async (id: string) => {
    if (!confirm("Excluir esta compra inteira? Os itens serao revertidos do estoque.")) return;
    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Compra excluida.");
    load();
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Historico de compras</CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por produto, marca, fornecedor, data..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma compra encontrada.</p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((o) => {
                const its = itemsByOrder[o.id] ?? [];
                const totalQty = its.reduce((a, x) => a + Number(x.quantity), 0);
                const remaining = its.reduce((a, x) => a + Number(x.remaining_qty), 0);
                const sold = totalQty - remaining;
                const estProfit = its.reduce((a, x) => a + (Number(x.suggested_price_brl) - Number(x.unit_brl)) * Number(x.quantity), 0);
                const isOpen = open[o.id];
                return (
                  <li key={o.id} className="rounded-md border border-border">
                    <button
                      onClick={() => setOpen((p) => ({ ...p, [o.id]: !p[o.id] }))}
                      className="w-full p-3 flex items-center justify-between gap-3 hover:bg-secondary/40 transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {new Date(o.purchase_date).toLocaleDateString("pt-BR")}
                          {o.supplier && ` - ${o.supplier}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {its.length} produtos - {totalQty} un.
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">ID: {o.id.slice(0, 8)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-primary">{brl(Number(o.total_brl))}</div>
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {isOpen && (
                      <div className="border-t border-border p-3 space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <Stat label="Vendidos" value={`${sold} un.`} />
                          <Stat label="Em estoque" value={`${remaining} un.`} />
                          <Stat label="Lucro estimado" value={brl(estProfit)} accent="text-success" />
                          <Stat label="Pagamento" value={o.payment_method ?? "-"} />
                        </div>

                        <ul className="divide-y divide-border">
                          {its.map((it) => (
                            <li key={it.id} className="py-2 flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate">{it.perfume_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {Number(it.quantity)} un. - custo unit. {brl(Number(it.unit_brl))}
                                  {Number(it.suggested_price_brl) > 0 && ` - venda sug. ${brl(Number(it.suggested_price_brl))}`}
                                </div>
                              </div>
                              <div className="text-right text-xs">
                                <div className="font-semibold">{brl(Number(it.total_brl))}</div>
                                <div className="text-muted-foreground">restam {Number(it.remaining_qty)}</div>
                              </div>
                            </li>
                          ))}
                        </ul>

                        {o.notes && (
                          <p className="text-xs text-muted-foreground italic">{o.notes}</p>
                        )}

                        <div className="flex justify-end">
                          <Button variant="ghost" size="sm" onClick={() => removeOrder(o.id)}>
                            <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                            <span className="text-destructive">Excluir compra</span>
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded bg-secondary p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}
