export const brl = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const usd = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const num = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
