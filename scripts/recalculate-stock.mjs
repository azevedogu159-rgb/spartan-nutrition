import fs from "node:fs";

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");

function loadEnv() {
  const raw = fs.readFileSync(".env", "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
    env[key] = value;
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase URL or publishable key in .env");
}

async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function byProduct(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const list = grouped.get(row.product_id) ?? [];
    list.push(row);
    grouped.set(row.product_id, list);
  }
  return grouped;
}

function money(value) {
  return Number(value.toFixed(2));
}

const [products, purchaseItems, sales, partnerTests] = await Promise.all([
  rest("products?select=id,name,stock_qty,avg_cost_brl&order=name.asc"),
  rest("purchase_items?select=id,product_id,quantity,remaining_qty,unit_brl,created_at&order=created_at.asc"),
  rest("sales?select=id,product_id,quantity,created_at,sale_date,payment_method,payment_status&order=created_at.asc"),
  rest("partner_tests?select=id,product_id,quantity,created_at,perfume_name&order=created_at.asc"),
]);

const itemsByProduct = byProduct(purchaseItems);
const salesByProduct = byProduct(sales);
const testsByProduct = byProduct(partnerTests);
const productUpdates = [];
const itemUpdates = [];
const warnings = [];

for (const product of products) {
  const items = (itemsByProduct.get(product.id) ?? []).map((item) => ({
    ...item,
    remaining_qty: Number(item.quantity),
  }));
  const outflows = [
    ...(salesByProduct.get(product.id) ?? []).map((row) => ({ ...row, source: "venda" })),
    ...(testsByProduct.get(product.id) ?? []).map((row) => ({ ...row, source: "amostra" })),
  ].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));

  for (const outflow of outflows) {
    let toConsume = Number(outflow.quantity);
    for (const item of items) {
      if (toConsume <= 0) break;
      if (item.remaining_qty <= 0) continue;
      const take = Math.min(item.remaining_qty, toConsume);
      item.remaining_qty -= take;
      toConsume -= take;
    }
    if (toConsume > 0) {
      warnings.push({
        product: product.name,
        source: outflow.source,
        source_id: outflow.id,
        missing_qty: toConsume,
        payment_method: outflow.payment_method,
        payment_status: outflow.payment_status,
      });
    }
  }

  let expectedStock = 0;
  let expectedCostTotal = 0;
  for (const item of items) {
    expectedStock += item.remaining_qty;
    expectedCostTotal += item.remaining_qty * Number(item.unit_brl || 0);
    const original = purchaseItems.find((row) => row.id === item.id);
    if (original && Number(original.remaining_qty) !== item.remaining_qty) {
      itemUpdates.push({ id: item.id, remaining_qty: item.remaining_qty });
    }
  }

  const expectedAvgCost = expectedStock > 0 ? expectedCostTotal / expectedStock : 0;
  if (
    Number(product.stock_qty) !== expectedStock ||
    money(Number(product.avg_cost_brl)) !== money(expectedAvgCost)
  ) {
    productUpdates.push({
      id: product.id,
      name: product.name,
      current_stock: Number(product.stock_qty),
      expected_stock: expectedStock,
      current_avg_cost: money(Number(product.avg_cost_brl)),
      expected_avg_cost: money(expectedAvgCost),
    });
  }
}

console.log(JSON.stringify({
  mode: shouldApply ? "apply" : "dry-run",
  products_checked: products.length,
  purchase_items_checked: purchaseItems.length,
  sales_checked: sales.length,
  partner_tests_checked: partnerTests.length,
  product_updates: productUpdates,
  purchase_item_updates: itemUpdates.length,
  warnings,
}, null, 2));

if (!shouldApply && products.length === 0 && purchaseItems.length === 0 && sales.length === 0 && partnerTests.length === 0) {
  console.warn("No rows returned. If the database is not empty, run with SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN in .env.");
}

if (!shouldApply) process.exit(0);

for (const update of itemUpdates) {
  await rest(`purchase_items?id=eq.${update.id}`, {
    method: "PATCH",
    body: JSON.stringify({ remaining_qty: update.remaining_qty }),
  });
}

for (const update of productUpdates) {
  await rest(`products?id=eq.${update.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      stock_qty: update.expected_stock,
      avg_cost_brl: update.expected_avg_cost,
      updated_at: new Date().toISOString(),
    }),
  });
}
