import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Trash2, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { CustomerEditDialog, type EditableCustomer } from "@/components/CustomerEditDialog";

export const Route = createFileRoute("/clientes")({ component: ClientesPage });

type Customer = { id: string; name: string; phone: string | null; email: string | null; notes: string | null };
type Sale = {
  id: string; customer_id: string | null; perfume_name: string; quantity: number;
  unit_price_brl: number; revenue: number; profit: number; sale_date: string;
};

function ClientesPage() {
  const [list, setList] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<EditableCustomer | null>(null);

  const load = async () => {
    const [c, s] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase.from("sales").select("id, customer_id, perfume_name, quantity, unit_price_brl, revenue, profit, sale_date").not("customer_id", "is", null).order("sale_date", { ascending: false }),
    ]);
    setList((c.data ?? []) as Customer[]);
    setSales((s.data ?? []) as Sale[]);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Informe o nome.");
    setSaving(true);
    const { error } = await supabase.from("customers").insert({
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cliente cadastrado.");
    setName(""); setPhone(""); setEmail(""); setNotes("");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este cliente? O histórico de vendas será mantido sem vínculo.")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cliente excluído.");
    load();
  };

  const byCustomer = useMemo(() => {
    const m: Record<string, Sale[]> = {};
    for (const s of sales) {
      if (!s.customer_id) continue;
      (m[s.customer_id] ??= []).push(s);
    }
    return m;
  }, [sales]);

  return (
    <div className="space-y-6">
      <Card className="shadow-soft">
        <CardHeader><CardTitle>Cadastrar cliente</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button type="submit" disabled={saving} className="md:col-span-2 bg-[image:var(--gradient-luxe)]">
              {saving ? "Salvando..." : "Cadastrar cliente"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader><CardTitle>Clientes ({list.length})</CardTitle></CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((c) => {
                const cs = byCustomer[c.id] ?? [];
                const total = cs.reduce((a, s) => a + Number(s.revenue), 0);
                const isOpen = !!open[c.id];
                return (
                  <li key={c.id} className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="flex flex-1 items-center gap-2 text-left"
                        onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {[c.phone, c.email].filter(Boolean).join(" · ") || "Sem contato"}
                          </div>
                        </div>
                      </button>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{cs.length} compra(s)</div>
                        <div className="font-semibold">{brl(total)}</div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setEditing(c)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    {isOpen && (
                      <div className="mt-2 ml-6 rounded-md bg-secondary p-2">
                        {cs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sem compras registradas.</p>
                        ) : (
                          <ul className="divide-y divide-border/60">
                            {cs.map((s) => (
                              <li key={s.id} className="flex items-center justify-between py-1.5 text-sm">
                                <div className="min-w-0">
                                  <div className="truncate">{s.perfume_name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {new Date(s.sale_date).toLocaleDateString("pt-BR")} · {Number(s.quantity)} un.
                                  </div>
                                </div>
                                <div className="font-medium">{brl(Number(s.revenue))}</div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <CustomerEditDialog
        customer={editing}
        open={!!editing}
        onOpenChange={(v) => { if (!v) setEditing(null); }}
        onSaved={load}
      />
    </div>
  );
}
