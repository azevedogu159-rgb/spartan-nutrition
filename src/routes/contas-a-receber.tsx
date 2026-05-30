import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Clock, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/contas-a-receber")({ component: ContasPage });

type Installment = {
  id: string;
  sale_id: string;
  installment_number: number;
  due_date: string;
  amount_brl: number;
  status: string;
  paid_at: string | null;
  paid_amount: number | null;
};
type Sale = { id: string; customer_id: string | null; customer_name: string | null; perfume_name: string };
type Customer = { id: string; name: string };

function todayISO() { return new Date().toISOString().slice(0, 10); }

function ContasPage() {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [sales, setSales] = useState<Record<string, Sale>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payModal, setPayModal] = useState<Installment | null>(null);
  const [editModal, setEditModal] = useState<Installment | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [editForm, setEditForm] = useState({
    installment_number: "",
    due_date: "",
    amount_brl: "",
    paid_amount: "",
    paid_at: "",
    customer_id: "none",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const today = todayISO();

  const load = async () => {
    const [i, s, c] = await Promise.all([
      supabase.from("installments").select("*").order("due_date"),
      supabase.from("sales").select("id, customer_id, customer_name, perfume_name"),
      supabase.from("customers").select("id, name").order("name"),
    ]);
    setInstallments((i.data ?? []) as Installment[]);
    const m: Record<string, Sale> = {};
    for (const x of (s.data ?? []) as Sale[]) m[x.id] = x;
    setSales(m);
    setCustomers((c.data ?? []) as Customer[]);
  };
  useEffect(() => { load(); }, []);

  const refreshSalePaymentStatus = async (saleId: string) => {
    const { data, error } = await supabase
      .from("installments")
      .select("status")
      .eq("sale_id", saleId);
    if (error) return;

    const rows = data ?? [];
    const paymentStatus =
      rows.length === 0 || rows.every((x) => x.status === "pago")
        ? "pago"
        : rows.some((x) => x.status === "pago" || x.status === "parcial")
          ? "parcial"
          : "pendente";

    await supabase.from("sales").update({ payment_status: paymentStatus }).eq("id", saleId);
  };

  const openPayModal = (it: Installment) => {
    setPayModal(it);
    const remaining = Number(it.amount_brl) - Number(it.paid_amount ?? 0);
    setPayAmount(String(Math.max(remaining, 0)));
  };

  const openEditModal = (it: Installment) => {
    const sale = sales[it.sale_id];
    setEditModal(it);
    setEditForm({
      installment_number: String(it.installment_number),
      due_date: it.due_date,
      amount_brl: String(it.amount_brl),
      paid_amount: it.paid_amount == null ? "" : String(it.paid_amount),
      paid_at: it.paid_at ?? "",
      customer_id: sale?.customer_id ?? "none",
    });
  };

  const confirmPay = async () => {
    if (!payModal) return;
    const receivedNow = Number(payAmount);
    if (isNaN(receivedNow) || receivedNow <= 0) return toast.error("Valor inválido");
    
    const amt = Number(payModal.amount_brl);
    const previousPaid = Number(payModal.paid_amount ?? 0);
    const totalPaid = previousPaid + receivedNow;
    if (totalPaid > amt) return toast.error("Valor recebido maior que o saldo da parcela");
    const isPartial = totalPaid < amt;

    const { error } = await supabase.from("installments").update({
      status: isPartial ? "parcial" : "pago", 
      paid_at: today, 
      paid_amount: totalPaid,
    }).eq("id", payModal.id);
    
    if (error) return toast.error(error.message);
    await refreshSalePaymentStatus(payModal.sale_id);
    toast.success(isPartial ? "Baixa parcial registrada!" : "Parcela paga!");
    setPayModal(null);
    load();
  };

  const confirmEdit = async () => {
    if (!editModal || savingEdit) return;

    const installmentNumber = Number(editForm.installment_number);
    const amount = Number(editForm.amount_brl);
    const paid = editForm.paid_amount.trim() === "" ? null : Number(editForm.paid_amount);

    if (!Number.isInteger(installmentNumber) || installmentNumber < 1) {
      return toast.error("NÃºmero da parcela invÃ¡lido");
    }
    if (!editForm.due_date) return toast.error("Informe a data de vencimento");
    if (isNaN(amount) || amount <= 0) return toast.error("Valor da parcela invÃ¡lido");
    if (paid != null && (isNaN(paid) || paid < 0)) return toast.error("Valor recebido invÃ¡lido");
    if (paid != null && paid > amount) return toast.error("Valor recebido maior que a parcela");

    const status = paid == null || paid === 0 ? "pendente" : paid < amount ? "parcial" : "pago";
    const paidAt = status === "pendente" ? null : editForm.paid_at || today;
    const customer = editForm.customer_id !== "none"
      ? customers.find((c) => c.id === editForm.customer_id)
      : null;

    setSavingEdit(true);
    const [installmentResult, saleResult] = await Promise.all([
      supabase.from("installments").update({
        installment_number: installmentNumber,
        due_date: editForm.due_date,
        amount_brl: amount,
        paid_amount: paid,
        paid_at: paidAt,
        status,
      }).eq("id", editModal.id),
      supabase.from("sales").update({
        customer_id: customer?.id ?? null,
        customer_name: customer?.name ?? null,
      }).eq("id", editModal.sale_id),
    ]);
    setSavingEdit(false);

    if (installmentResult.error) return toast.error(installmentResult.error.message);
    if (saleResult.error) return toast.error(saleResult.error.message);
    await refreshSalePaymentStatus(editModal.sale_id);
    toast.success("Parcela atualizada.");
    setEditModal(null);
    load();
  };

  const removeSale = async (it: Installment) => {
    const sale = sales[it.sale_id];
    const label = [sale?.customer_name, sale?.perfume_name].filter(Boolean).join(" - ") || "este lancamento";
    if (!confirm(`Excluir ${label}? A venda sera removida, as parcelas serao apagadas e o estoque sera restaurado.`)) return;

    const { error } = await supabase.from("sales").delete().eq("id", it.sale_id);
    if (error) return toast.error(error.message);
    toast.success("Lancamento excluido.");
    load();
  };

  const stats = useMemo(() => {
    let pending = 0, late = 0, receivedMonth = 0, dueNext30 = 0;
    const todayD = new Date(today);
    const in30 = new Date(todayD); in30.setDate(in30.getDate() + 30);
    const monthKey = today.slice(0, 7);
    for (const it of installments) {
      const amt = Number(it.amount_brl);
      const paid = Number(it.paid_amount ?? 0);
      if (it.status === "pago" || it.status === "parcial") {
        if ((it.paid_at ?? "").slice(0, 7) === monthKey) receivedMonth += paid;
      }
      if (it.status === "pendente" || it.status === "parcial") {
        const remaining = amt - paid;
        const due = new Date(it.due_date);
        if (due < todayD) late += remaining;
        else pending += remaining;
        if (due >= todayD && due <= in30) dueNext30 += remaining;
      }
    }
    return { pending, late, receivedMonth, dueNext30 };
  }, [installments, today]);

  const pendingList = installments.filter((i) => i.status !== "pago");
  const paidList = installments.filter((i) => i.status === "pago").slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="A receber" value={brl(stats.pending)} icon={Clock} accent="text-primary" />
        <StatCard label="Atrasado" value={brl(stats.late)} icon={AlertTriangle} accent="text-destructive" />
        <StatCard label="Próx. 30 dias" value={brl(stats.dueNext30)} icon={Clock} accent="text-accent-foreground" />
        <StatCard label="Recebido no mês" value={brl(stats.receivedMonth)} icon={CheckCircle2} accent="text-success" />
      </div>

      <Card className="shadow-soft">
        <CardHeader><CardTitle>Parcelas em aberto</CardTitle></CardHeader>
        <CardContent>
          {pendingList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma parcela em aberto.</p>
          ) : (
            <ul className="divide-y divide-border">
              {pendingList.map((it) => {
                const sale = sales[it.sale_id];
                const late = it.due_date < today;
                return (
                  <li key={it.id} className="py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {sale?.customer_name ?? "Sem cliente"} · {sale?.perfume_name ?? "—"}
                      </div>
                      <div className={`text-xs ${late ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        Parcela {it.installment_number} · vence {new Date(it.due_date).toLocaleDateString("pt-BR")}
                        {late && " · ATRASADA"}
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="font-semibold text-primary">{brl(Number(it.amount_brl) - Number(it.paid_amount ?? 0))}</div>
                      <div className="text-xs text-muted-foreground">de {brl(Number(it.amount_brl))}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditModal(it)}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openPayModal(it)}>
                        <CheckCircle2 className="h-4 w-4 mr-1 text-success" /> Baixa
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeSale(it)}>
                        <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Excluir
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {paidList.length > 0 && (
        <Card className="shadow-soft">
          <CardHeader><CardTitle className="text-base">Últimos pagamentos</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {paidList.map((it) => {
                const sale = sales[it.sale_id];
                return (
                  <li key={it.id} className="py-2 flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{sale?.customer_name ?? "Sem cliente"} · {sale?.perfume_name}</div>
                      <div className="text-xs text-muted-foreground">
                        Pago em {it.paid_at ? new Date(it.paid_at).toLocaleDateString("pt-BR") : "—"} · parcela {it.installment_number}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-success">{brl(Number(it.paid_amount ?? it.amount_brl))}</div>
                      <Button size="icon" variant="ghost" onClick={() => openEditModal(it)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeSale(it)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!payModal} onOpenChange={(o) => !o && setPayModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar Baixa no Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Valor Previsto da Parcela</Label>
              <div className="text-lg font-semibold">{brl(Number(payModal?.amount_brl))}</div>
              {Number(payModal?.paid_amount ?? 0) > 0 && (
                <div className="text-xs text-muted-foreground">
                  Ja recebido: {brl(Number(payModal?.paid_amount ?? 0))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Valor recebido agora (R$)</Label>
              <Input 
                type="number" 
                step="0.01" 
                value={payAmount} 
                onChange={(e) => setPayAmount(e.target.value)} 
              />
              <p className="text-xs text-muted-foreground">Se o valor recebido for menor que o previsto, o restante continuará como pendente.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayModal(null)}>Cancelar</Button>
            <Button onClick={confirmPay} className="bg-[image:var(--gradient-luxe)]">Confirmar Pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editModal} onOpenChange={(o) => !o && setEditModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Parcela</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>NÂº da parcela</Label>
              <Input
                type="number"
                min="1"
                value={editForm.installment_number}
                onChange={(e) => setEditForm((f) => ({ ...f, installment_number: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento</Label>
              <Input
                type="date"
                value={editForm.due_date}
                onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor da parcela (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editForm.amount_brl}
                onChange={(e) => setEditForm((f) => ({ ...f, amount_brl: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor recebido (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editForm.paid_amount}
                onChange={(e) => setEditForm((f) => ({ ...f, paid_amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Cliente</Label>
              <Select
                value={editForm.customer_id}
                onValueChange={(value) => setEditForm((f) => ({ ...f, customer_id: value }))}
              >
                <SelectTrigger><SelectValue placeholder="Sem cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cliente</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={editForm.paid_at}
                onChange={(e) => setEditForm((f) => ({ ...f, paid_at: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal(null)}>Cancelar</Button>
            <Button onClick={confirmEdit} disabled={savingEdit} className="bg-[image:var(--gradient-luxe)]">
              {savingEdit ? "Salvando..." : "Salvar alteraÃ§Ãµes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; accent: string }) {
  return (
    <Card className="shadow-soft">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        <div className="mt-2 text-lg font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
