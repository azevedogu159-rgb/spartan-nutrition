import { createFileRoute } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brl } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Upload, Trash2 } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/estoque")({ component: EstoquePage });

type Product = {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  stock_qty: number;
  avg_cost_brl: number;
  suggested_price_brl: number;
  image_url: string | null;
};

type ProductLot = {
  product_id: string;
  expires_at: string | null;
  remaining_qty: number;
};

type ProductDraft = {
  name: string;
  brand: string;
  barcode: string;
};

function EstoquePage() {
  const [items, setItems] = useState<Product[]>([]);
  const [lotsByProduct, setLotsByProduct] = useState<Record<string, ProductLot[]>>({});
  const [q, setQ] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [savingPriceId, setSavingPriceId] = useState<string | null>(null);
  const [savingDetailsId, setSavingDetailsId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    const [{ data }, { data: lots }] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase
        .from("purchase_items")
        .select("product_id, expires_at, remaining_qty")
        .gt("remaining_qty", 0)
        .order("expires_at", { ascending: true, nullsFirst: false }),
    ]);
    const products = (data ?? []) as Product[];
    const openLots = (lots ?? []) as ProductLot[];
    setItems(products);
    setLotsByProduct(
      openLots.reduce<Record<string, ProductLot[]>>((acc, lot) => {
        (acc[lot.product_id] ??= []).push(lot);
        return acc;
      }, {}),
    );
    setPriceDrafts(
      products.reduce<Record<string, string>>((acc, p) => {
        acc[p.id] = Number(p.suggested_price_brl || 0) > 0 ? String(p.suggested_price_brl) : "";
        return acc;
      }, {}),
    );
    setProductDrafts(
      products.reduce<Record<string, ProductDraft>>((acc, p) => {
        acc[p.id] = {
          name: p.name,
          brand: p.brand ?? "",
          barcode: p.barcode ?? "",
        };
        return acc;
      }, {}),
    );
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      items.filter(
        (p) =>
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          (p.barcode ?? "").toLowerCase().includes(q.toLowerCase()) ||
          (p.brand ?? "").toLowerCase().includes(q.toLowerCase()),
      ),
    [items, q],
  );
  const available = useMemo(() => filtered.filter((p) => Number(p.stock_qty) > 0), [filtered]);
  const empty = useMemo(() => filtered.filter((p) => Number(p.stock_qty) <= 0), [filtered]);
  const totalValue = available.reduce(
    (a, p) => a + Number(p.stock_qty) * Number(p.avg_cost_brl),
    0,
  );
  const totalPotential = available.reduce(
    (a, p) => a + Number(p.stock_qty) * Number(p.suggested_price_brl || 0),
    0,
  );
  const totalPotentialProfit = totalPotential - totalValue;
  const totalUnits = available.reduce((a, p) => a + Number(p.stock_qty), 0);

  const onPick = (id: string) => fileRefs.current[id]?.click();

  const onFile = async (p: Product, file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Arquivo deve ter até 5MB.");
    if (!file.type.startsWith("image/")) return toast.error("Selecione uma imagem.");
    setUploadingId(p.id);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${p.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("product-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("product-photos").getPublicUrl(path);
      const { error: dbErr } = await supabase
        .from("products")
        .update({ image_url: pub.publicUrl })
        .eq("id", p.id);
      if (dbErr) throw dbErr;
      toast.success("Foto atualizada.");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadingId(null);
    }
  };

  const removePhoto = async (p: Product) => {
    if (!p.image_url) return;
    if (!confirm("Remover a foto deste produto?")) return;
    const { error } = await supabase.from("products").update({ image_url: null }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Foto removida.");
    load();
  };

  const saveSuggestedPrice = async (p: Product) => {
    const raw = priceDrafts[p.id]?.trim() ?? "";
    const price = raw === "" ? 0 : Number(raw);
    if (isNaN(price) || price < 0) return toast.error("Preço sugerido inválido.");

    setSavingPriceId(p.id);
    const { error } = await supabase
      .from("products")
      .update({ suggested_price_brl: price, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    setSavingPriceId(null);

    if (error) return toast.error(error.message);
    toast.success("Preço sugerido atualizado.");
    setItems((prev) =>
      prev.map((item) => (item.id === p.id ? { ...item, suggested_price_brl: price } : item)),
    );
    setPriceDrafts((prev) => ({ ...prev, [p.id]: price > 0 ? String(price) : "" }));
  };

  const saveProductDetails = async (p: Product) => {
    const draft = productDrafts[p.id];
    if (!draft) return;
    const name = draft.name.trim();
    const brand = draft.brand.trim();
    const barcode = draft.barcode.replace(/\D/g, "");
    if (!name) return toast.error("Informe o nome do produto.");

    setSavingDetailsId(p.id);
    const { error } = await supabase
      .from("products")
      .update({
        name,
        brand: brand || null,
        barcode: barcode || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id);
    setSavingDetailsId(null);

    if (error) return toast.error(error.message);
    toast.success("Produto atualizado.");
    setItems((prev) =>
      prev.map((item) => (item.id === p.id ? { ...item, name, brand: brand || null, barcode: barcode || null } : item)),
    );
    setProductDrafts((prev) => ({ ...prev, [p.id]: { name, brand, barcode } }));
  };

  const deleteProduct = async (p: Product) => {
    if (Number(p.stock_qty) > 0) {
      return toast.error("Produto com estoque nao pode ser excluido. Exclua/ajuste os lotes primeiro.");
    }
    if (!confirm(`Excluir "${p.name}" do estoque? Use isso apenas para cadastros de teste ou produtos sem historico.`)) return;

    setDeletingProductId(p.id);
    const [purchaseItems, sales, tests] = await Promise.all([
      supabase.from("purchase_items").select("id", { count: "exact", head: true }).eq("product_id", p.id),
      supabase.from("sales").select("id", { count: "exact", head: true }).eq("product_id", p.id),
      supabase.from("partner_tests").select("id", { count: "exact", head: true }).eq("product_id", p.id),
    ]);

    if (purchaseItems.error || sales.error || tests.error) {
      setDeletingProductId(null);
      return toast.error(purchaseItems.error?.message || sales.error?.message || tests.error?.message || "Erro ao verificar historico.");
    }

    const hasHistory = (purchaseItems.count ?? 0) + (sales.count ?? 0) + (tests.count ?? 0) > 0;
    if (hasHistory) {
      setDeletingProductId(null);
      return toast.error("Nao exclui produto com historico de compra, venda ou teste. Edite o cadastro se precisar.");
    }

    const { error } = await supabase.from("products").delete().eq("id", p.id);
    setDeletingProductId(null);
    if (error) return toast.error(error.message);
    toast.success("Produto excluido.");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Itens em estoque</div>
            <div className="mt-1 text-lg font-semibold">{totalUnits}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Valor em estoque</div>
            <div className="mt-1 text-lg font-semibold text-primary">{brl(totalValue)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Potencial de venda</div>
            <div className="mt-1 text-lg font-semibold">{brl(totalPotential)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-soft">
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Lucro potencial</div>
            <div className="mt-1 text-lg font-semibold text-success">
              {brl(totalPotentialProfit)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Estoque</CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar produto, suplemento ou marca..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
          ) : (
            <div className="space-y-6">
              <ProductSection
                title="Produtos disponíveis"
                emptyText="Nenhum produto disponível."
                products={available}
                fileRefs={fileRefs}
                uploadingId={uploadingId}
                savingPriceId={savingPriceId}
                savingDetailsId={savingDetailsId}
                deletingProductId={deletingProductId}
                priceDrafts={priceDrafts}
                productDrafts={productDrafts}
                onPick={onPick}
                onFile={onFile}
                removePhoto={removePhoto}
                setPriceDrafts={setPriceDrafts}
                setProductDrafts={setProductDrafts}
                saveSuggestedPrice={saveSuggestedPrice}
                saveProductDetails={saveProductDetails}
                deleteProduct={deleteProduct}
                lotsByProduct={lotsByProduct}
              />
              <ProductSection
                title="Produtos zerados"
                emptyText="Nenhum produto zerado."
                products={empty}
                fileRefs={fileRefs}
                uploadingId={uploadingId}
                savingPriceId={savingPriceId}
                savingDetailsId={savingDetailsId}
                deletingProductId={deletingProductId}
                priceDrafts={priceDrafts}
                productDrafts={productDrafts}
                onPick={onPick}
                onFile={onFile}
                removePhoto={removePhoto}
                setPriceDrafts={setPriceDrafts}
                setProductDrafts={setProductDrafts}
                saveSuggestedPrice={saveSuggestedPrice}
                saveProductDetails={saveProductDetails}
                deleteProduct={deleteProduct}
                lotsByProduct={lotsByProduct}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProductSection({
  title,
  emptyText,
  products,
  fileRefs,
  uploadingId,
  savingPriceId,
  savingDetailsId,
  deletingProductId,
  priceDrafts,
  productDrafts,
  onPick,
  onFile,
  removePhoto,
  setPriceDrafts,
  setProductDrafts,
  saveSuggestedPrice,
  saveProductDetails,
  deleteProduct,
  lotsByProduct,
}: {
  title: string;
  emptyText: string;
  products: Product[];
  fileRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadingId: string | null;
  savingPriceId: string | null;
  savingDetailsId: string | null;
  deletingProductId: string | null;
  priceDrafts: Record<string, string>;
  productDrafts: Record<string, ProductDraft>;
  onPick: (id: string) => void;
  onFile: (p: Product, file: File) => void;
  removePhoto: (p: Product) => void;
  setPriceDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setProductDrafts: Dispatch<SetStateAction<Record<string, ProductDraft>>>;
  saveSuggestedPrice: (p: Product) => void;
  saveProductDetails: (p: Product) => void;
  deleteProduct: (p: Product) => void;
  lotsByProduct: Record<string, ProductLot[]>;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{products.length}</span>
      </div>
      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border">
          {products.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              fileRefs={fileRefs}
              uploadingId={uploadingId}
              savingPriceId={savingPriceId}
              savingDetailsId={savingDetailsId}
              deletingProductId={deletingProductId}
              priceDraft={priceDrafts[p.id] ?? ""}
              productDraft={productDrafts[p.id] ?? { name: p.name, brand: p.brand ?? "", barcode: p.barcode ?? "" }}
              onPick={onPick}
              onFile={onFile}
              removePhoto={removePhoto}
              onDraftChange={(patch) =>
                setProductDrafts((prev) => ({
                  ...prev,
                  [p.id]: {
                    name: prev[p.id]?.name ?? p.name,
                    brand: prev[p.id]?.brand ?? p.brand ?? "",
                    barcode: prev[p.id]?.barcode ?? p.barcode ?? "",
                    ...patch,
                  },
                }))
              }
              onPriceChange={(value) =>
                setPriceDrafts((prev) => ({
                  ...prev,
                  [p.id]: value,
                }))
              }
              saveSuggestedPrice={saveSuggestedPrice}
              saveProductDetails={saveProductDetails}
              deleteProduct={deleteProduct}
              lots={lotsByProduct[p.id] ?? []}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ProductRow({
  product: p,
  fileRefs,
  uploadingId,
  savingPriceId,
  savingDetailsId,
  deletingProductId,
  priceDraft,
  productDraft,
  onPick,
  onFile,
  removePhoto,
  onDraftChange,
  onPriceChange,
  saveSuggestedPrice,
  saveProductDetails,
  deleteProduct,
  lots,
}: {
  product: Product;
  fileRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  uploadingId: string | null;
  savingPriceId: string | null;
  savingDetailsId: string | null;
  deletingProductId: string | null;
  priceDraft: string;
  productDraft: ProductDraft;
  onPick: (id: string) => void;
  onFile: (p: Product, file: File) => void;
  removePhoto: (p: Product) => void;
  onDraftChange: (patch: Partial<ProductDraft>) => void;
  onPriceChange: (value: string) => void;
  saveSuggestedPrice: (p: Product) => void;
  saveProductDetails: (p: Product) => void;
  deleteProduct: (p: Product) => void;
  lots: ProductLot[];
}) {
  const qty = Number(p.stock_qty);
  const status = getStockStatus(qty);
  const expiration = getExpirationStatus(lots);
  const suggestedPrice = Number(p.suggested_price_brl || 0);
  const potentialRevenue = qty > 0 ? qty * suggestedPrice : 0;
  const potentialProfit = potentialRevenue - (qty > 0 ? qty * Number(p.avg_cost_brl) : 0);

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <ProductImage url={p.image_url} size={48} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium truncate">{p.name}</div>
            <Badge variant={status.variant} className={status.className}>
              {status.label}
            </Badge>
            {expiration && (
              <Badge variant={expiration.variant} className={expiration.className}>
                {expiration.label}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {p.brand || "-"}
            {p.barcode ? ` · ${p.barcode}` : ""}
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-[minmax(180px,1.2fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_auto]">
            <Input
              value={productDraft.name}
              onChange={(e) => onDraftChange({ name: e.target.value })}
              placeholder="Produto"
              className="h-9"
            />
            <Input
              value={productDraft.brand}
              onChange={(e) => onDraftChange({ brand: e.target.value })}
              placeholder="Marca"
              className="h-9"
            />
            <Input
              inputMode="numeric"
              value={productDraft.barcode}
              onChange={(e) => onDraftChange({ barcode: e.target.value.replace(/\D/g, "") })}
              placeholder="Codigo"
              className="h-9"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={savingDetailsId === p.id}
              onClick={() => saveProductDetails(p)}
            >
              {savingDetailsId === p.id ? "..." : "Salvar"}
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2 sm:justify-end">
        <div className="w-40 space-y-1">
          <div className="text-xs text-muted-foreground">Venda sugerida (R$)</div>
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={priceDraft}
              onChange={(e) => onPriceChange(e.target.value)}
              placeholder="0,00"
              className="h-9"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={savingPriceId === p.id}
              onClick={() => saveSuggestedPrice(p)}
            >
              {savingPriceId === p.id ? "..." : "Salvar"}
            </Button>
          </div>
        </div>
        <input
          ref={(el) => {
            fileRefs.current[p.id] = el;
          }}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(p, f);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPick(p.id)}
          disabled={uploadingId === p.id}
        >
          <Upload className="h-3.5 w-3.5 mr-1" />
          {uploadingId === p.id ? "..." : p.image_url ? "Trocar" : "Foto"}
        </Button>
        {p.image_url && (
          <Button variant="ghost" size="icon" onClick={() => removePhoto(p)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={deletingProductId === p.id}
          onClick={() => deleteProduct(p)}
        >
          <Trash2 className="h-4 w-4 mr-1 text-destructive" />
          <span className="text-destructive">{deletingProductId === p.id ? "..." : "Excluir"}</span>
        </Button>
        <div className="min-w-24 text-left sm:text-right">
          <div className={`font-semibold ${qty <= 0 ? "text-muted-foreground" : ""}`}>
            {qty > 0 ? `${qty} un.` : "Sem estoque"}
          </div>
          {qty > 0 && (
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <div>custo méd. {brl(Number(p.avg_cost_brl))}</div>
              {expiration?.date && <div>validade {formatDate(expiration.date)}</div>}
              <div>potencial {brl(potentialRevenue)}</div>
              <div className={potentialProfit >= 0 ? "text-success" : "text-destructive"}>
                lucro pot. {brl(potentialProfit)}
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function getStockStatus(qty: number): {
  label: string;
  variant: ComponentProps<typeof Badge>["variant"];
  className?: string;
} {
  if (qty <= 0)
    return { label: "Sem estoque", variant: "outline", className: "text-muted-foreground" };
  if (qty <= 1)
    return { label: "Baixo estoque", variant: "secondary", className: "text-accent-foreground" };
  return { label: "Em estoque", variant: "secondary", className: "border-success/30 text-success" };
}

function getExpirationStatus(lots: ProductLot[]): {
  label: string;
  date: string;
  variant: ComponentProps<typeof Badge>["variant"];
  className?: string;
} | null {
  const first = lots.find((lot) => lot.expires_at);
  if (!first?.expires_at) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expires = new Date(`${first.expires_at}T00:00:00`);
  const days = Math.ceil((expires.getTime() - today.getTime()) / 86400000);

  if (days < 0) {
    return { label: "Vencido", date: first.expires_at, variant: "destructive" };
  }
  if (days <= 30) {
    return {
      label: `Vence em ${days}d`,
      date: first.expires_at,
      variant: "secondary",
      className: "border-destructive/30 text-destructive",
    };
  }
  if (days <= 90) {
    return {
      label: `Vence em ${days}d`,
      date: first.expires_at,
      variant: "secondary",
      className: "border-amber-500/30 text-amber-700",
    };
  }
  return {
    label: "Validade ok",
    date: first.expires_at,
    variant: "secondary",
    className: "border-success/30 text-success",
  };
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}
