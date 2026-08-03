// ===========================================================================
// Motor de cálculo DRE / Ponto de Equilíbrio (compartilhado)
// ===========================================================================
window.financeData = { sales: [], expenses: [] };

const VAR_COSTS = [
  { key: 'fee_mp', label: 'Taxas Marketplace' },
  { key: 'freight', label: 'Frete Subsidiado' },
  { key: 'cmv', label: 'CMV — Custo da Mercadoria' },
  { key: 'ads_ml', label: 'Ads' },
  { key: 'tax', label: 'Imposto' },
];

const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

async function dreApi(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

async function loadFinance() {
  const [s, e] = await Promise.all([dreApi('/api/sales'), dreApi('/api/expenses')]);
  financeData.sales = s.sales || [];
  financeData.expenses = e.expenses || [];
}

// Despesas válidas para um mês YYYY-MM (inclui recorrentes a partir da data)
function expensesForMonth(month) {
  return financeData.expenses.filter((x) => {
    const m = (x.date || '').slice(0, 7);
    if (x.recurring) return m <= month;
    return m === month;
  });
}

function dreForMonth(month) {
  const sales = financeData.sales.filter((s) => (s.date || '').startsWith(month));
  const receita = sales.reduce((a, s) => a + (+s.revenue), 0);
  const custos = {};
  let custosVar = 0;
  for (const c of VAR_COSTS) { const v = sales.reduce((a, s) => a + (+s[c.key] || 0), 0); custos[c.key] = v; custosVar += v; }
  const mc = receita - custosVar;
  const mcPct = receita > 0 ? (mc / receita) * 100 : 0;
  const exps = expensesForMonth(month);
  const fixed = exps.filter((e) => e.type === 'fixed').reduce((a, e) => a + (+e.value), 0);
  const operational = exps.filter((e) => e.type === 'operational').reduce((a, e) => a + (+e.value), 0);
  const despesas = fixed + operational;
  const lucro = mc - despesas;
  const lucroPct = receita > 0 ? (lucro / receita) * 100 : 0;
  return { month, receita, custos, custosVar, mc, mcPct, fixed, operational, despesas, lucro, lucroPct, custosTotais: custosVar + despesas, expenses: exps };
}

function annualDRE(year) {
  return MONTHS.map((_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const d = dreForMonth(m);
    return { i, label: MONTHS[i], month: m, receita: d.receita, custosTotais: d.custosTotais, resultado: d.lucro, mcPct: d.mcPct, lucroPct: d.lucroPct, hasData: d.receita > 0 || d.despesas > 0 };
  });
}

function healthBadge(pct) {
  if (pct < 0) return { label: 'Prejuízo', cls: 'c-danger' };
  if (pct < 15) return { label: 'Crítico', cls: 'c-danger' };
  if (pct < 25) return { label: 'Atenção', cls: 'c-warn' };
  return { label: 'Saudável', cls: 'c-ok' };
}

// Ponto de equilíbrio
function breakEven(month) {
  const d = dreForMonth(month);
  const custosFixos = d.despesas; // despesas fixas + operacionais
  const pe = d.mcPct > 0 ? custosFixos / (d.mcPct / 100) : 0;
  const pctAtingido = pe > 0 ? (d.receita / pe) * 100 : (custosFixos === 0 ? 100 : 0);
  let status;
  if (pctAtingido >= 100) status = { label: 'Saudável', cls: 'c-ok' };
  else if (pctAtingido >= 80) status = { label: 'Atenção', cls: 'c-warn' };
  else status = { label: 'Crítico', cls: 'c-danger' };
  const [y, m] = month.split('-').map(Number);
  const diasMes = new Date(y, m, 0).getDate();
  return { ...d, custosFixos, pe, pctAtingido, status, mediaDiaria: pe / diasMes, faltaOuUltrapassa: d.receita - pe };
}
