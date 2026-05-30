import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";

export const Route = createFileRoute("/testes")({ component: TestesPage });

const PARTNERS = ["Gustavo Azevedo", "Eduardo Hernandes"] as const;

type Product = { id: string; name: string; stock_qty: number; avg_cost_brl: number; image_url: string | null };
type Test = {
  id: string; product_id: string; perfume_name: string; partner_name: string;
  quantity: number; unit_cost_brl: number; total_cost_brl: number; test_date: string;
};

function todayISO() { return new Date().toISOString().slice(0, 10); }

function TestesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [partner, setPartner] = useState<string>(PARTNERS[0]);
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(todayISO());
  const [list, setList] = useState<Test[]>([]);
  const [productsMap, setProductsMap] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const selected = products.find((p) => p.id === productId);
  const q = Number(qty) || 0;
  const unitCost = selected ? Number(selected.avg_cost_brl) : 0;
  const total = unitCost * q;

  const load = async () => {
    const [p, t, all] = await Promise.all([
      supabase.from("products").select("id, name, stock_qty, avg_cost_brl, image_url").gt("stock_qty", 0).order("name"),
      supabase.from("partner_tests").select("*").order("test_date", { ascending: false }).limit(100),
      supabase.from("products").select("id, image_url"),
    ]);
    setProducts((p.data ?? []) as Product[]);
    setList((t.data ?? []) as Test[]);
    const m: Record<string, string | null> = {};
    for (const r of (all.data ?? []) as { id: string; image_url: string | null }[]) m[r.id] = r.image_url;
    setProductsMap(m);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (!selected || !q) return toast.error("Preencha todos os campos.");
    if (q > Number(selected.stock_qty)) return toast.error("Quantidade maior que o estoque.");
    savingRef.current = true;
    setSaving(true);
    const { error } = await supabase.from("partner_tests").insert({
      product_id: selected.id, perfume_name: selected.name, partner_name: partner,
      quantity: q, unit_cost_brl: unitCost, total_cost_brl: total, test_date: date,
    });
    savingRef.current = false;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Registrado — ${brl(total)}`);
    setQty(""); setProductId("");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este registro? O estoque será devolvido.")) return;
    const { error } = await supabase.from("partner_tests").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Registro excluído.");
    load();
  };

  const totals = useMemo(() => {
    const all = list.reduce((a, t) => a + Number(t.total_cost_brl), 0);
    const byPartner: Record<string, number> = {};
    for (const t of list) byPartner[t.partner_name] = (byPartner[t.partner_name] ?? 0) + Number(t.total_cost_brl);
    return { all, byPartner };
  }, [list]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="shadow-soft"><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Total em amostras</div>
          <div className="mt-1 text-lg font-semibold text-primary">{brl(totals.all)}</div>
        </CardContent></Card>
        {PARTNERS.map((name) => (
          <Card key={name} className="shadow-soft"><CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground truncate">{name}</div>
            <div className="mt-1 text-lg font-semibold">{brl(totals.byPartner[name] ?? 0)}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card className="shadow-soft">
        <CardHeader><CardTitle>Registrar amostra / degustação</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Responsável *</Label>
              <Select value={partner} onValueChange={setPartner}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARTNERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Produto *</Label>
              <div className="flex items-center gap-3">
                {selected && <ProductImage url={selected.image_url} size={48} />}
                <div className="flex-1">
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Selecione um produto do estoque" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {Number(p.stock_qty)} un. (custo {brl(Number(p.avg_cost_brl))})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quantidade *</Label>
              <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-3 rounded-md bg-secondary p-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Custo unitário</div>
                <div className="font-semibold">{brl(unitCost)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Custo total</div>
                <div className="font-semibold text-primary">{brl(total)}</div>
              </div>
            </div>

            <Button type="submit" disabled={saving} className="md:col-span-2 bg-[image:var(--gradient-luxe)]">
              {saving ? "Salvando..." : "Confirmar registro"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader><CardTitle>Histórico de amostras</CardTitle></CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <ProductImage url={productsMap[t.product_id]} size={40} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.perfume_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(t.test_date).toLocaleDateString("pt-BR")} · {Number(t.quantity)} un. · {t.partner_name}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold">{brl(Number(t.total_cost_brl))}</div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => remove(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
