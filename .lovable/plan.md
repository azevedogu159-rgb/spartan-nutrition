# Reestruturação: Compras em lotes + Vendas parceladas

## Objetivo
Transformar o app em um sistema completo de:
1. **Compras agrupadas em lotes** (cabeçalho + itens), com histórico pesquisável
2. **Estoque vinculado por lote** (FIFO de custo)
3. **Vendas parceladas / fiado** com contas a receber
4. **Dashboard financeiro** ampliado

---

## 1. Banco de dados (migração)

### Novas tabelas

**`purchase_orders`** (cabeçalho da compra)
- supplier, country, exchange_rate, total_usd, total_brl, payment_method, notes, purchase_date

**`purchase_items`** (itens do lote) — substitui o uso atual de `purchases` como linha única
- purchase_order_id, product_id, perfume_name, brand, quantity, unit_usd, unit_brl, total_brl, supplier_fee_pct, suggested_price_brl, **remaining_qty** (saldo do lote)

**`installments`** (parcelas de vendas)
- sale_id, installment_number, due_date, amount_brl, status (pago/pendente/atrasado), paid_at, paid_amount

### Alterações em tabelas existentes

**`sales`** — adicionar:
- `payment_method` (à_vista | parcelado | fiado | pix | dinheiro | cartao)
- `installments_count`, `payment_status` (pago/parcial/pendente)
- `purchase_item_id` (opcional, p/ rastrear de qual lote saiu)

### Migração de dados
- Cada `purchases` atual vira um `purchase_order` com 1 item (preserva histórico das compras já lançadas).
- `remaining_qty` inicial = quantity - (vendas já feitas desse produto, rateadas por FIFO).

### Triggers
- `apply_purchase_item` / `revert_purchase_item`: atualizam `stock_qty` + `avg_cost_brl` em `products` e setam `remaining_qty`.
- `apply_sale_fifo`: ao vender, desconta de `purchase_items.remaining_qty` em ordem FIFO.
- `update_installment_status`: marca atrasado quando `due_date < hoje AND status = pendente` (job ou trigger on read).

---

## 2. Frontend — novas rotas

### `/compras` (refatorar — atual vira "Nova compra em lote")
Formulário expandido:
- **Cabeçalho**: fornecedor, país, data, cotação, taxa, forma de pagamento, observações
- **Itens** (lista dinâmica add/remove): perfume, marca, qtd, USD unit, preço sugerido
- Totais calculados ao vivo (USD/BRL/lucro estimado)
- Botão "Adicionar produto" para empilhar itens antes de salvar

### `/historico-compras` (nova)
- Lista de `purchase_orders` com busca (perfume, fornecedor, marca, data, ID)
- Click → detalhe da compra:
  - todos os itens, custos, total investido
  - quantos vendidos / quantos em estoque (via `remaining_qty`)
  - lucro estimado vs realizado

### `/vendas` (expandir)
- Adicionar seletor de forma de pagamento
- Se "parcelado" → input de nº parcelas + datas → gera registros em `installments`
- Se "fiado" → cria 1 parcela em aberto

### `/contas-a-receber` (nova)
- Lista de parcelas pendentes/atrasadas agrupadas por cliente
- Filtros: vencendo hoje, atrasadas, do mês
- Ação "marcar como paga" (com data e valor)
- Cards: total a receber, recebido no mês, atrasado, previsão próximos 30 dias

### `/` (Dashboard — expandir)
Adicionar seções:
- **Vendas**: mês, lucro mês, ticket médio
- **Estoque**: investido total, potencial de venda, lucro potencial, produtos parados (>30 dias sem venda)
- **Financeiro**: a receber, recebido, atrasado
- **Alertas**: badge no header com parcelas vencendo/atrasadas

---

## 3. Componentes auxiliares
- `PurchaseOrderForm` — formulário de lote com itens dinâmicos
- `PurchaseOrderDetail` — modal/página com itens e vendas vinculadas
- `InstallmentList` — lista de parcelas com ações
- `PaymentMethodSelect` + `InstallmentsBuilder` — usados em vendas

---

## Arquivos
**Criar:**
- migração SQL grande (tabelas + triggers + migração de dados)
- `src/routes/historico-compras.tsx`
- `src/routes/contas-a-receber.tsx`
- `src/components/PurchaseOrderForm.tsx`
- `src/components/PurchaseOrderDetail.tsx`
- `src/components/InstallmentsBuilder.tsx`

**Editar:**
- `src/routes/compras.tsx` (refatorar p/ lote)
- `src/routes/vendas.tsx` (add parcelamento)
- `src/routes/index.tsx` (dashboard expandido)
- `src/routes/estoque.tsx` (mostrar de qual lote veio)
- `src/components/AppHeader.tsx` (novos links + badge alertas)

---

## Pontos a confirmar antes de implementar

1. **Custo na venda (FIFO)**: ao vender, devo usar o custo do **lote mais antigo** com saldo (FIFO real) ou continuar com `avg_cost_brl` médio? FIFO dá lucro mais preciso por lote mas é mais complexo.

2. **Compras existentes**: as 2 compras já lançadas viram 2 `purchase_orders` separados (cada um com seus produtos como itens)? Confirmo que sim?

3. **Forma de pagamento da compra**: precisa controlar se a *compra* foi parcelada também (contas a pagar), ou só vendas?

4. **Escopo desta entrega**: faço tudo de uma vez ou prefere em fases? Sugiro 2 fases:
   - **Fase 1**: Compras em lote + Histórico + Estoque vinculado
   - **Fase 2**: Vendas parceladas + Contas a receber + Dashboard financeiro
