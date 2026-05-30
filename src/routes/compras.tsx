import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Camera, Trash2, Plus, History } from "lucide-react";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";

export const Route = createFileRoute("/compras")({ component: ComprasPage });

type Item = {
  name: string;
  brand: string;
  barcode: string;
  qty: string;
  usd: string;
  suggested: string;
};

function emptyItem(): Item {
  return { name: "", brand: "", barcode: "", qty: "", usd: "", suggested: "" };
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function normalizeBarcode(value: string) { return value.replace(/\D/g, ""); }

function ComprasPage() {
  const [supplier, setSupplier] = useState("");
  const [country, setCountry] = useState("");
  const [rate, setRate] = useState("");
  const [fee, setFee] = useState("");
  const [payment, setPayment] = useState("a_vista");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [scannerItem, setScannerItem] = useState<number | null>(null);

  const feeMul = 1 + (Number(fee) || 0) / 100;
  const r = Number(rate) || 0;

  const totals = useMemo(() => {
    let usd = 0, brlSum = 0, profit = 0;
    for (const it of items) {
      const q = Number(it.qty) || 0;
      const u = Number(it.usd) || 0;
      const unitBrl = u * r * feeMul;
      usd += u * q;
      brlSum += unitBrl * q;
      profit += ((Number(it.suggested) || 0) - unitBrl) * q;
    }
    return { usd, brl: brlSum, profit };
  }, [items, r, feeMul]);

  const updateItem = (i: number, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((p) => [...p, emptyItem()]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rate) return toast.error("Informe a cotação do dólar.");
    const valid = items.filter((it) => it.name.trim() && it.qty && it.usd);
    if (valid.length === 0) return toast.error("Adicione ao menos um produto.");

    setSaving(true);
    try {
      const { data: order, error: oErr } = await supabase.from("purchase_orders").insert({
        supplier: supplier.trim() || null,
        country: country.trim() || null,
        exchange_rate: r,
        supplier_fee_pct: Number(fee) || 0,
        total_usd: totals.usd,
        total_brl: totals.brl,
        payment_method: payment,
        notes: notes.trim() || null,
        purchase_date: date,
      }).select("id").single();
      if (oErr) throw oErr;

      for (const it of valid) {
        const cleanName = it.name.trim();
        const barcode = normalizeBarcode(it.barcode);
        const productQuery = supabase.from("products").select("id");
        const { data: existing } = barcode
          ? await productQuery.eq("barcode", barcode).maybeSingle()
          : await productQuery.eq("name", cleanName).maybeSingle();
        let productId = existing?.id;
        if (!productId) {
          const { data: created, error: cErr } = await supabase
            .from("products").insert({ name: cleanName, brand: it.brand.trim() || null, barcode: barcode || null }).select("id").single();
          if (cErr) throw cErr;
          productId = created.id;
        } else if (it.brand.trim() || barcode) {
          await supabase
            .from("products")
            .update({ brand: it.brand.trim() || null, barcode: barcode || null })
            .eq("id", productId);
        }
        const q = Number(it.qty), u = Number(it.usd);
        const unitBrl = u * r * feeMul;
        const { error: iErr } = await supabase.from("purchase_items").insert({
          purchase_order_id: order.id,
          product_id: productId,
          perfume_name: cleanName,
          brand: it.brand.trim() || null,
          quantity: q,
          unit_usd: u,
          exchange_rate: r,
          supplier_fee_pct: Number(fee) || 0,
          unit_brl: unitBrl,
          total_brl: unitBrl * q,
          suggested_price_brl: Number(it.suggested) || 0,
          remaining_qty: q,
        });
        if (iErr) throw iErr;
      }

      toast.success("Compra registrada!");
      setSupplier(""); setCountry(""); setFee(""); setNotes(""); setItems([emptyItem()]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link to="/historico-compras">
          <Button variant="outline" size="sm">
            <History className="h-4 w-4 mr-1.5" /> Histórico de compras
          </Button>
        </Link>
      </div>

      <Card className="shadow-soft">
        <CardHeader><CardTitle>Nova compra (lote)</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Fornecedor">
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ex.: Distribuidora, Growth, Max Titanium" />
              </Field>
              <Field label="País / origem">
                <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Ex.: Brasil, importado, fornecedor local" />
              </Field>
              <Field label="Data da compra">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Forma de pagamento">
                <Select value={payment} onValueChange={setPayment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_vista">À vista</SelectItem>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="parcelado">Parcelado</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Cotação do dólar (R$) *">
                <Input type="number" step="0.0001" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="5,1500" />
              </Field>
              <Field label="Taxa do fornecedor (%)">
                <Input type="number" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Ex.: 22" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Observações">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </Field>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Produtos do lote</h3>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar produto
                </Button>
              </div>

              {items.map((it, i) => {
                const q = Number(it.qty) || 0;
                const u = Number(it.usd) || 0;
                const unitBrl = u * r * feeMul;
                const lineTotal = unitBrl * q;
                return (
                  <div key={i} className="rounded-md border border-border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Item {i + 1}</span>
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Produto *">
                        <Input value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} placeholder="Ex.: Whey Protein 900g Chocolate" />
                      </Field>
                      <Field label="Marca / linha">
                        <Input value={it.brand} onChange={(e) => updateItem(i, { brand: e.target.value })} placeholder="Ex.: Integralmédica, Dark Lab, Soldiers" />
                      </Field>
                      <Field label="Codigo de barras">
                        <div className="flex gap-2">
                          <Input
                            inputMode="numeric"
                            value={it.barcode}
                            onChange={(e) => updateItem(i, { barcode: normalizeBarcode(e.target.value) })}
                            placeholder="Escaneie ou digite"
                          />
                          <Button type="button" variant="outline" size="icon" onClick={() => setScannerItem(i)}>
                            <Camera className="h-4 w-4" />
                          </Button>
                        </div>
                      </Field>
                      <Field label="Quantidade *">
                        <Input type="number" min="1" value={it.qty} onChange={(e) => updateItem(i, { qty: e.target.value })} />
                      </Field>
                      <Field label="Valor unit. (USD) *">
                        <Input type="number" step="0.01" value={it.usd} onChange={(e) => updateItem(i, { usd: e.target.value })} />
                      </Field>
                      <Field label="Preço sugerido venda (R$)">
                        <Input type="number" step="0.01" value={it.suggested} onChange={(e) => updateItem(i, { suggested: e.target.value })} />
                      </Field>
                      <div className="grid grid-cols-2 gap-3 rounded-md bg-secondary p-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Custo unit.</div>
                          <div className="font-semibold">{brl(unitBrl)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Total linha</div>
                          <div className="font-semibold text-primary">{brl(lineTotal)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-md bg-secondary p-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Total USD</div>
                <div className="font-semibold">${totals.usd.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total R$</div>
                <div className="font-semibold text-primary">{brl(totals.brl)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Lucro estimado</div>
                <div className="font-semibold text-success">{brl(totals.profit)}</div>
              </div>
            </div>

            <Button type="submit" disabled={saving} className="w-full bg-[image:var(--gradient-luxe)]">
              {saving ? "Salvando..." : "Registrar compra"}
            </Button>
          </form>
          <BarcodeScannerDialog
            open={scannerItem !== null}
            onOpenChange={(open) => !open && setScannerItem(null)}
            onScan={(code) => {
              if (scannerItem !== null) updateItem(scannerItem, { barcode: normalizeBarcode(code) });
              toast.success("Codigo lido.");
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
