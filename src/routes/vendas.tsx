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
import { Camera, Trash2 } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";

export const Route = createFileRoute("/vendas")({ component: VendasPage });

type Product = { id: string; name: string; barcode: string | null; stock_qty: number; avg_cost_brl: number; suggested_price_brl: number; image_url: string | null };
type ProductLot = { product_id: string; expires_at: string | null; remaining_qty: number };
type Customer = { id: string; name: string };
type Sale = {
  id: string; product_id: string; perfume_name: string; quantity: number; unit_price_brl: number;
  unit_cost_brl: number; revenue: number; cost: number; profit: number; sale_date: string;
  customer_id: string | null; customer_name: string | null;
  payment_method: string; installments_count: number; payment_status: string;
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function normalizeBarcode(value: string) { return value.replace(/\D/g, ""); }
function addMonths(iso: string, m: number) {
  const d = new Date(iso); d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}

function VendasPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productId, setProductId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [customerId, setCustomerId] = useState<string>("none");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayISO());
  const [payment, setPayment] = useState("a_vista");
  const [parcelas, setParcelas] = useState("2");
  const [primeiroVenc, setPrimeiroVenc] = useState(todayISO());
  const [list, setList] = useState<Sale[]>([]);
  const [saving, setSaving] = useState(false);
  const [lotsByProduct, setLotsByProduct] = useState<Record<string, ProductLot[]>>({});
  const savingRef = useRef(false);

  const selected = products.find((p) => p.id === productId);
  const suggestedPrice = selected ? Number(selected.suggested_price_brl) || 0 : 0;
  const pricePlaceholder = suggestedPrice > 0 ? `Sugestao: ${brl(suggestedPrice)}` : "0,00";
  const expiration = selected ? getExpirationStatus(lotsByProduct[selected.id] ?? []) : null;
  const q = Number(qty) || 0, pr = Number(price) || 0;
  const cost = selected ? Number(selected.avg_cost_brl) * q : 0;
  const revenue = pr * q;
  const profit = revenue - cost;
  const isParcelado = payment === "parcelado";
  const isFiado = payment === "fiado";
  const nParcelas = Math.max(1, Number(parcelas) || 1);
  const valorParcela = isParcelado && nParcelas > 0 ? revenue / nParcelas : 0;

  const [productsMap, setProductsMap] = useState<Record<string, string | null>>({});

  const load = async () => {
    const [p, s, c, all, lots] = await Promise.all([
      supabase.from("products").select("id, name, barcode, stock_qty, avg_cost_brl, suggested_price_brl, image_url").gt("stock_qty", 0).order("name"),
      supabase.from("sales").select("*").order("sale_date", { ascending: false }).limit(50),
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("products").select("id, image_url"),
      supabase
        .from("purchase_items")
        .select("product_id, expires_at, remaining_qty")
        .gt("remaining_qty", 0)
        .order("expires_at", { ascending: true, nullsFirst: false }),
    ]);
    setProducts((p.data ?? []) as Product[]);
    setList((s.data ?? []) as Sale[]);
    setCustomers((c.data ?? []) as Customer[]);
    const openLots = (lots.data ?? []) as ProductLot[];
    setLotsByProduct(
      openLots.reduce<Record<string, ProductLot[]>>((acc, lot) => {
        (acc[lot.product_id] ??= []).push(lot);
        return acc;
      }, {}),
    );
    const m: Record<string, string | null> = {};
    for (const r of (all.data ?? []) as { id: string; image_url: string | null }[]) m[r.id] = r.image_url;
    setProductsMap(m);
  };
  useEffect(() => { load(); }, []);

  const applyProductData = (product: Product) => {
    setProductId(product.id);
    setBarcode(normalizeBarcode(product.barcode ?? ""));
    if (Number(product.suggested_price_brl) > 0) setPrice(String(product.suggested_price_brl));
  };

  const selectProduct = (id: string) => {
    const found = products.find((p) => p.id === id);
    if (!found) {
      setProductId(id);
      return;
    }
    applyProductData(found);
  };

  const selectByBarcode = (raw: string) => {
    const code = normalizeBarcode(raw);
    setBarcode(code);
    if (!code) return;
    const found = products.find((p) => normalizeBarcode(p.barcode ?? "") === code);
    if (!found) {
      toast.error("Produto nao encontrado para este codigo.");
      return;
    }
    applyProductData(found);
    toast.success(`${found.name} selecionado.`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (!selected || !q || !pr) return toast.error("Preencha todos os campos.");
    if (q > Number(selected.stock_qty)) return toast.error("Quantidade maior que o estoque.");
    savingRef.current = true;
    setSaving(true);
    const cust = customerId !== "none" ? customers.find((x) => x.id === customerId) : null;

    const paymentStatus = payment === "a_vista" || payment === "pix" || payment === "dinheiro" || payment === "cartao"
      ? "pago"
      : "pendente";

    const { data: sale, error } = await supabase.from("sales").insert({
      product_id: selected.id, perfume_name: selected.name, quantity: q,
      unit_price_brl: pr, unit_cost_brl: Number(selected.avg_cost_brl),
      revenue, cost, profit, sale_date: date,
      customer_id: cust?.id ?? null, customer_name: cust?.name ?? null,
      payment_method: payment,
      installments_count: isParcelado ? nParcelas : 1,
      payment_status: paymentStatus,
    }).select("id").single();

    if (error) {
      savingRef.current = false;
      setSaving(false);
      return toast.error(error.message);
    }

    if (isParcelado && sale) {
      const rows = Array.from({ length: nParcelas }, (_, i) => ({
        sale_id: sale.id,
        installment_number: i + 1,
        due_date: addMonths(primeiroVenc, i),
        amount_brl: valorParcela,
        status: "pendente",
      }));
      const { error: iErr } = await supabase.from("installments").insert(rows);
      if (iErr) {
        savingRef.current = false;
        setSaving(false);
        return toast.error(iErr.message);
      }
    } else if (isFiado && sale) {
      const { error: iErr } = await supabase.from("installments").insert({
        sale_id: sale.id, installment_number: 1, due_date: primeiroVenc, amount_brl: revenue, status: "pendente",
      });
      if (iErr) {
        savingRef.current = false;
        setSaving(false);
        return toast.error(iErr.message);
      }
    }

    savingRef.current = false;
    setSaving(false);
    toast.success(`Venda registrada — lucro ${brl(profit)}`);
    setQty(""); setPrice(""); setProductId(""); setBarcode(""); setCustomerId("none");
    setPayment("a_vista"); setParcelas("2");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta venda? O estoque será restaurado.")) return;
    const { error } = await supabase.from("sales").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Venda excluída.");
    load();
  };

  const totals = useMemo(() => ({
    revenue: list.reduce((a, s) => a + Number(s.revenue), 0),
    profit: list.reduce((a, s) => a + Number(s.profit), 0),
  }), [list]);

  const paymentLabel = (m: string) => ({
    a_vista: "À vista", pix: "Pix", cartao: "Cartão", dinheiro: "Dinheiro",
    parcelado: "Parcelado", fiado: "Fiado",
  }[m] ?? m);

  return (
    <div className="space-y-6">
      <Card className="shadow-soft">
        <CardHeader><CardTitle>Registrar venda</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Venda por codigo de barras</Label>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  value={barcode}
                  onChange={(e) => setBarcode(normalizeBarcode(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      selectByBarcode(barcode);
                    }
                  }}
                  placeholder="Escaneie com a camera ou digite e pressione Enter"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setScannerOpen(true)}>
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Produto *</Label>
              <div className="flex items-center gap-3">
                {selected && <ProductImage url={selected.image_url} size={48} />}
                <div className="flex-1">
                  <Select value={productId} onValueChange={selectProduct}>
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
              {selected && (
                <div className="mt-2 rounded-md bg-secondary p-2 text-xs text-muted-foreground">
                  <div>Codigo: <span className="font-medium text-foreground">{selected.barcode || "sem codigo"}</span></div>
                  <div>
                    Preco sugerido:{" "}
                    <span className="font-medium text-foreground">
                      {suggestedPrice > 0 ? brl(suggestedPrice) : "sem sugestao"}
                    </span>
                  </div>
                  <div>
                    Validade:{" "}
                    <span className={expiration?.className ?? "font-medium text-foreground"}>
                      {expiration ? `${expiration.dateLabel} - ${expiration.label}` : "sem validade informada"}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Cliente {(isParcelado || isFiado) && "*"}</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Sem cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cliente</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quantidade *</Label>
              <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Preço de venda unitário (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={pricePlaceholder} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Forma de pagamento</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a_vista">À vista</SelectItem>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                  <SelectItem value="parcelado">Parcelado</SelectItem>
                  <SelectItem value="fiado">Fiado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(isParcelado || isFiado) && (
              <div className="md:col-span-2 grid gap-3 md:grid-cols-2 rounded-md border border-border p-3">
                {isParcelado && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nº parcelas</Label>
                    <Input type="number" min="2" max="24" value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">{isParcelado ? "1º vencimento" : "Vencimento"}</Label>
                  <Input type="date" value={primeiroVenc} onChange={(e) => setPrimeiroVenc(e.target.value)} />
                </div>
                {isParcelado && (
                  <div className="md:col-span-2 text-xs text-muted-foreground">
                    {nParcelas}x de <span className="font-semibold text-foreground">{brl(valorParcela)}</span>
                    {" "}vencendo mensalmente a partir de {new Date(primeiroVenc).toLocaleDateString("pt-BR")}
                  </div>
                )}
              </div>
            )}

            <div className="md:col-span-2 grid grid-cols-3 gap-3 rounded-md bg-secondary p-3 text-sm">
              <Stat label="Receita" value={brl(revenue)} />
              <Stat label="Custo" value={brl(cost)} />
              <Stat label="Lucro" value={brl(profit)} accent={profit >= 0 ? "text-success" : "text-destructive"} />
            </div>

            <Button type="submit" disabled={saving} className="md:col-span-2 bg-[image:var(--gradient-luxe)]">
              {saving ? "Salvando..." : "Confirmar venda"}
            </Button>
          </form>
          <BarcodeScannerDialog
            open={scannerOpen}
            onOpenChange={setScannerOpen}
            onScan={selectByBarcode}
          />
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Histórico de vendas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Receita: <span className="font-semibold text-foreground">{brl(totals.revenue)}</span> · Lucro:{" "}
            <span className="font-semibold text-success">{brl(totals.profit)}</span>
          </p>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma venda registrada.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <ProductImage url={productsMap[s.product_id]} size={40} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{s.perfume_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.sale_date).toLocaleDateString("pt-BR")} · {Number(s.quantity)} un. × {brl(Number(s.unit_price_brl))}
                        {s.customer_name ? ` · ${s.customer_name}` : ""}
                        {" · "}<span className="font-medium">{paymentLabel(s.payment_method)}</span>
                        {s.payment_status === "pendente" && <span className="text-destructive"> · pendente</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold">{brl(Number(s.revenue))}</div>
                      <div className="text-xs text-success">+{brl(Number(s.profit))}</div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => remove(s.id)}>
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function getExpirationStatus(lots: ProductLot[]): {
  dateLabel: string;
  label: string;
  className: string;
} | null {
  const first = lots.find((lot) => lot.expires_at);
  if (!first?.expires_at) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expires = new Date(`${first.expires_at}T00:00:00`);
  const days = Math.ceil((expires.getTime() - today.getTime()) / 86400000);
  const dateLabel = expires.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });

  if (days < 0) {
    return {
      dateLabel,
      label: `vencido ha ${Math.abs(days)} dias`,
      className: "font-medium text-destructive",
    };
  }
  if (days === 0) {
    return { dateLabel, label: "vence hoje", className: "font-medium text-destructive" };
  }
  if (days <= 30) {
    return { dateLabel, label: `vence em ${days} dias`, className: "font-medium text-destructive" };
  }
  if (days <= 90) {
    return { dateLabel, label: `vence em ${days} dias`, className: "font-medium text-amber-700" };
  }
  return { dateLabel, label: `vence em ${days} dias`, className: "font-medium text-success" };
}
