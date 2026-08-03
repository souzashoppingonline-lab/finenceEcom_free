// ===========================================================================
// FinanceEcom Free - Vendas & Custos
// ===========================================================================
const $ = (id) => document.getElementById(id);

let stores = [];
let sales = [];
let goals = [];
let editingId = null;

const state = { month: '', store: '' };

// ---------- Auth (Supabase) ----------
async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, {
    ...options,
    headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

// ---------- Helpers ----------
const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => (Number(v) || 0).toFixed(1) + '%';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function costOf(s) { return (+s.fee_mp) + (+s.freight) + (+s.cmv) + (+s.ads_ml) + (+s.tax); }
function marginOf(s) { return (+s.revenue) - costOf(s); }
function marginPctOf(s) { return +s.revenue > 0 ? (marginOf(s) / +s.revenue) * 100 : 0; }

function classify(p) {
  if (p < 0) return { label: 'Prejuízo', cls: 'c-danger' };
  if (p < 5) return { label: 'Muito Baixo', cls: 'c-danger' };
  if (p < 10) return { label: 'Preocupante', cls: 'c-warn' };
  if (p < 15) return { label: 'Aceitável', cls: 'c-warn' };
  if (p < 20) return { label: 'Bom', cls: 'c-ok' };
  if (p < 30) return { label: 'Ótimo', cls: 'c-ok' };
  return { label: 'Excelente', cls: 'c-ok' };
}

const storeName = (id) => (stores.find((s) => s.id === id) || {}).name || '—';
const storeColor = (id) => (stores.find((s) => s.id === id) || {}).color || '#1d7a5f';
const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
const curMonth = () => todayStr().slice(0, 7);

// ===========================================================================
// Carregamento
// ===========================================================================
async function loadAll() {
  const q = `month=${state.month}${state.store ? `&store=${state.store}` : ''}`;
  const [stRes, saRes, goRes] = await Promise.all([
    api('/api/stores'),
    api(`/api/sales?${q}`),
    api(`/api/goals?month=${state.month}`),
  ]);
  stores = stRes.stores || [];
  sales = saRes.sales || [];
  goals = goRes.goals || [];
  renderStoreSelectors();
  renderStoresList();
  renderSalesTable();
  renderGoal();
  renderTotals();
  renderReports();
  renderSameDay();
  renderDailyTable();
}

// ===========================================================================
// Lojas
// ===========================================================================
function renderStoreSelectors() {
  const filter = $('store-filter');
  const formSel = document.querySelector('#sales-form select[name="store_id"]');
  const opts = stores.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  filter.innerHTML = `<option value="">Todas as lojas</option>` + opts;
  filter.value = state.store;
  formSel.innerHTML = `<option value="">Selecione</option>` + opts;
}

function renderStoresList() {
  const el = $('stores-list');
  if (stores.length === 0) { el.innerHTML = '<p class="muted">Nenhuma loja cadastrada. Adicione a primeira acima.</p>'; return; }
  el.innerHTML = stores.map((s) => `
    <div class="store-chip">
      <input type="color" value="${s.color}" data-color="${s.id}" title="Cor" />
      <span>${esc(s.name)}</span>
      <button class="btn-del" data-del-store="${s.id}" title="Excluir">🗑</button>
    </div>`).join('');
}

// ===========================================================================
// Formulario + preview de margem
// ===========================================================================
function readForm() {
  const f = $('sales-form');
  const g = (n) => Number(f[n].value) || 0;
  return {
    date: f.date.value, store_id: f.store_id.value,
    qty: g('qty'), revenue: g('revenue'), fee_mp: g('fee_mp'), freight: g('freight'),
    cmv: g('cmv'), ads_ml: g('ads_ml'), tax: g('tax'),
  };
}

function updatePreview() {
  const s = readForm();
  const box = $('margin-preview');
  if (!(+s.revenue > 0)) { box.hidden = true; return; }
  const m = marginOf(s), p = marginPctOf(s), c = classify(p);
  box.hidden = false;
  box.className = `margin-preview ${c.cls}`;
  box.innerHTML = `
    <div><span class="mp-label">Margem de Contribuição</span><span class="mp-val">${money(m)}</span></div>
    <div><span class="mp-label">Margem %</span><span class="mp-val">${pct(p)}</span></div>
    <div><span class="mp-label">Classificação</span><span class="mp-val">${c.label}</span></div>`;
}

function resetForm() {
  const f = $('sales-form');
  f.reset();
  f.date.value = todayStr();
  editingId = null;
  $('form-title').textContent = 'Lançar dia de venda';
  $('save-sale').textContent = 'Salvar lançamento';
  $('cancel-edit').hidden = true;
  $('margin-preview').hidden = true;
}

function editSale(id) {
  const s = sales.find((x) => x.id === id);
  if (!s) return;
  const f = $('sales-form');
  f.date.value = s.date; f.store_id.value = s.store_id;
  ['qty', 'revenue', 'fee_mp', 'freight', 'cmv', 'ads_ml', 'tax'].forEach((k) => { f[k].value = s[k]; });
  editingId = id;
  $('form-title').textContent = 'Editar lançamento';
  $('save-sale').textContent = 'Salvar alterações';
  $('cancel-edit').hidden = false;
  updatePreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===========================================================================
// Tabela de lancamentos
// ===========================================================================
function renderSalesTable() {
  const tb = document.querySelector('#sales-table tbody');
  if (sales.length === 0) { tb.innerHTML = `<tr><td colspan="8" class="empty">Nenhum lançamento neste mês.</td></tr>`; return; }
  tb.innerHTML = sales.map((s) => {
    const m = marginOf(s), p = marginPctOf(s), c = classify(p);
    const [y, mo, d] = s.date.split('-');
    return `<tr>
      <td>${d}/${mo}/${y}</td>
      <td><span class="dot" style="background:${storeColor(s.store_id)}"></span>${esc(storeName(s.store_id))}</td>
      <td>${s.qty}</td>
      <td>${money(s.revenue)}</td>
      <td>${money(costOf(s))}</td>
      <td class="${m >= 0 ? 'pos' : 'neg'}">${money(m)}</td>
      <td class="${c.cls}">${pct(p)}</td>
      <td>
        <button class="btn-del" data-edit="${s.id}" title="Editar">✏️</button>
        <button class="btn-del" data-del="${s.id}" title="Excluir">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

// ===========================================================================
// Meta mensal + calculos
// ===========================================================================
function generalGoal() { return goals.find((g) => !g.store_id); }

function goalCalc(metaAmount) {
  const dim = daysInMonth(state.month);
  const isCurrent = state.month === curMonth();
  const today = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  // limite de dados: ontem (mes atual) ou fim do mes (mes passado)
  const limit = isCurrent ? yesterday : `${state.month}-31`;
  const upto = sales.filter((s) => s.date <= limit);
  const acumulado = upto.reduce((a, s) => a + (+s.revenue), 0);
  const diasComDado = new Set(upto.map((s) => s.date)).size;
  const runRate = diasComDado > 0 ? acumulado / diasComDado : 0;
  const projecao = runRate * dim;
  const diaOntem = isCurrent ? Number(yesterday.slice(8, 10)) : dim;
  const diasRestantes = isCurrent ? Math.max(dim - diaOntem, 0) : 0;
  const metaRestante = metaAmount - acumulado;
  const metaDia = diasRestantes > 0 ? metaRestante / diasRestantes : 0;
  const piso = metaDia * 0.7, ideal = metaDia * 1.3;
  const gap = projecao - metaAmount;
  const ontemFat = sales.filter((s) => s.date === yesterday).reduce((a, s) => a + (+s.revenue), 0);
  let status;
  if (acumulado >= metaAmount) status = { label: '🏆 META ATINGIDA', cls: 'c-ok' };
  else if (projecao > metaAmount * 1.05) status = { label: '🟢 ADIANTADO', cls: 'c-ok' };
  else if (projecao >= metaAmount * 0.95) status = { label: '🟡 EM RISCO', cls: 'c-warn' };
  else status = { label: '🔴 ATRASADO', cls: 'c-danger' };
  return { dim, acumulado, diasComDado, runRate, projecao, diasRestantes, metaRestante, metaDia, piso, ideal, gap, ontemFat, status, isCurrent };
}

function renderGoal() {
  const el = $('goal-section');
  const g = generalGoal();
  if (!g) {
    el.innerHTML = `<div class="card goal-empty">
      <h3>Meta de faturamento do mês</h3>
      <p class="muted">Defina quanto você quer faturar neste mês para acompanhar seu progresso.</p>
      <form id="goal-form" class="inline-form">
        <input type="number" id="goal-input" min="0" step="0.01" placeholder="Ex.: 50000" required />
        <button type="submit" class="btn-inline">Definir meta</button>
      </form></div>`;
    $('goal-form').addEventListener('submit', saveGoal);
    return;
  }
  const c = goalCalc(+g.amount);
  const pctReal = g.amount > 0 ? (c.acumulado / g.amount) * 100 : 0;
  const pctProj = g.amount > 0 ? Math.min((c.projecao / g.amount) * 100, 100) : 0;
  const barCls = pctReal >= 100 ? 'bar-ok' : pctReal >= 70 ? 'bar-warn' : 'bar-danger';
  el.innerHTML = `<div class="card goal-card">
    <div class="goal-head">
      <h3>Meta do mês <span class="${c.status.cls} goal-status">${c.status.label}</span></h3>
      <button id="edit-goal" class="btn-ghost">Editar meta</button>
    </div>
    <div class="stats-grid">
      ${kpi('Realizado até D-1', money(c.acumulado), pct(pctReal) + ' da meta')}
      ${kpi('Meta', money(+g.amount), '')}
      ${kpi('Meta restante', c.metaRestante > 0 ? money(c.metaRestante) : 'Superado em ' + money(-c.metaRestante), '')}
      ${kpi('Gap projeção', money(c.gap), '', c.gap >= 0 ? 'pos' : 'neg')}
    </div>
    <div class="stats-grid">
      ${kpi('Velocidade média (dia)', money(c.runRate), c.diasComDado + ' dias com dado')}
      ${kpi('Projeção do mês', money(c.projecao), '')}
      ${kpi('Meta do dia', c.isCurrent ? money(c.metaDia) : '—', c.isCurrent ? c.diasRestantes + ' dias restantes' : 'mês encerrado')}
      ${kpi('Ontem (D-1)', money(c.ontemFat), '')}
    </div>
    ${c.isCurrent ? `<div class="stats-grid">
      ${kpi('Pior dia aceitável', money(c.piso), '70% da meta do dia')}
      ${kpi('Meta mínima viável', money(c.metaDia), 'por dia')}
      ${kpi('Dia ideal', money(c.ideal), '130% da meta do dia')}
    </div>` : ''}
    <div class="goal-bar">
      <div class="goal-bar-fill ${barCls}" style="width:${Math.min(pctReal, 100)}%"></div>
      <div class="goal-bar-ghost" style="width:${pctProj}%"></div>
    </div>
    <p class="muted">Barra sólida = realizado (${pct(pctReal)}) · sombra = projeção ao fim do mês</p>
  </div>`;
  $('edit-goal').addEventListener('click', () => promptGoal(+g.amount));
}

function kpi(label, val, sub, valCls = '') {
  return `<div class="stat-card">
    <span class="stat-label">${label}</span>
    <span class="stat-value ${valCls}" style="font-size:1.5rem">${val}</span>
    ${sub ? `<span class="muted">${sub}</span>` : ''}
  </div>`;
}

async function saveGoal(e) {
  if (e) e.preventDefault();
  const amount = Number($('goal-input').value) || 0;
  await api('/api/goals', { method: 'PUT', body: JSON.stringify({ month: state.month, store_id: null, amount }) });
  await loadAll();
}
function promptGoal(current) {
  const v = prompt('Nova meta de faturamento (R$):', current);
  if (v == null) return;
  api('/api/goals', { method: 'PUT', body: JSON.stringify({ month: state.month, store_id: null, amount: Number(v) || 0 }) })
    .then(loadAll);
}

// ===========================================================================
// Totais do periodo
// ===========================================================================
function renderTotals() {
  const rev = sales.reduce((a, s) => a + (+s.revenue), 0);
  const mar = sales.reduce((a, s) => a + marginOf(s), 0);
  const qty = sales.reduce((a, s) => a + (+s.qty), 0);
  const marP = rev > 0 ? (mar / rev) * 100 : 0;
  const ticket = qty > 0 ? rev / qty : 0;
  const c = classify(marP);
  $('totals').innerHTML =
    kpi('Receita total', money(rev), '') +
    kpi('Margem de contribuição', money(mar), pct(marP), c.cls) +
    kpi('Total de vendas', qty + ' un', '') +
    kpi('Ticket médio', money(ticket), '');
}

// ===========================================================================
// Relatorios por loja
// ===========================================================================
function renderReports() {
  const el = $('store-reports');
  const byStore = {};
  for (const s of sales) {
    const k = s.store_id;
    if (!byStore[k]) byStore[k] = { revenue: 0, margin: 0, qty: 0, cmv: 0, freight: 0, fee_mp: 0, tax: 0, ads: 0 };
    const b = byStore[k];
    b.revenue += +s.revenue; b.margin += marginOf(s); b.qty += +s.qty;
    b.cmv += +s.cmv; b.freight += +s.freight; b.fee_mp += +s.fee_mp; b.tax += +s.tax; b.ads += (+s.ads_ml);
  }
  const ids = Object.keys(byStore);
  if (ids.length === 0) { el.innerHTML = '<p class="muted">Sem dados no período.</p>'; return; }
  el.innerHTML = ids.map((id) => {
    const b = byStore[id];
    const marP = b.revenue > 0 ? (b.margin / b.revenue) * 100 : 0;
    const bar = (label, val) => {
      const w = b.revenue > 0 ? Math.min((val / b.revenue) * 100, 100) : 0;
      return `<div class="comp-row"><span>${label}</span><div class="comp-bar"><div style="width:${w}%"></div></div><span>${money(val)}</span></div>`;
    };
    return `<div class="card report-card" style="border-top:3px solid ${storeColor(id)}">
      <h4><span class="dot" style="background:${storeColor(id)}"></span>${esc(storeName(id))}</h4>
      <div class="report-kpis">
        <div><span class="muted">Receita</span><b>${money(b.revenue)}</b></div>
        <div><span class="muted">Margem</span><b class="${b.margin >= 0 ? 'pos' : 'neg'}">${money(b.margin)}</b></div>
        <div><span class="muted">Vendas</span><b>${b.qty}</b></div>
        <div><span class="muted">Margem %</span><b class="${classify(marP).cls}">${pct(marP)}</b></div>
      </div>
      <div class="comp">
        ${bar('CMV', b.cmv)}${bar('Frete', b.freight)}${bar('Tarifas', b.fee_mp)}${bar('Imposto', b.tax)}${bar('Ads', b.ads)}
      </div>
    </div>`;
  }).join('');
}

// ===========================================================================
// Comparativo mesmo dia vs mes anterior
// ===========================================================================
function renderSameDay() {
  const el = $('sameday');
  const isCurrent = state.month === curMonth();
  let refDate;
  if (isCurrent) refDate = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  else {
    const ds = sales.map((s) => s.date).sort();
    refDate = ds[ds.length - 1];
  }
  if (!refDate) { el.innerHTML = '<p class="muted">Sem dados para comparar.</p>'; return; }
  const dayNum = refDate.slice(8, 10);
  const [y, m] = state.month.split('-').map(Number);
  const prev = new Date(y, m - 2, 1); // mes anterior
  const prevMonth = prev.toLocaleDateString('en-CA').slice(0, 7);
  const prevDate = `${prevMonth}-${dayNum}`;

  const agg = (date) => {
    const rows = sales.filter((s) => s.date === date);
    // vendas do mes anterior nao estao carregadas; buscamos sob demanda via cache
    return rows;
  };
  // precisamos das vendas do mes anterior: carregamos rapido
  api(`/api/sales?month=${prevMonth}${state.store ? `&store=${state.store}` : ''}`).then(({ sales: prevSales }) => {
    const sum = (rows) => rows.reduce((a, s) => ({
      revenue: a.revenue + (+s.revenue), margin: a.margin + marginOf(s), qty: a.qty + (+s.qty),
    }), { revenue: 0, margin: 0, qty: 0 });
    const cur = sum(agg(refDate));
    const old = sum(prevSales.filter((s) => s.date === prevDate));
    const card = (label, cv, ov, isMoney = true) => {
      const diff = ov !== 0 ? ((cv - ov) / Math.abs(ov)) * 100 : (cv > 0 ? 100 : 0);
      const cls = diff >= 0 ? 'pos' : 'neg';
      return `<div class="stat-card">
        <span class="stat-label">${label}</span>
        <span class="stat-value" style="font-size:1.4rem">${isMoney ? money(cv) : cv}</span>
        <span class="muted">Mês ant.: ${isMoney ? money(ov) : ov} · <b class="${cls}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)}%</b></span>
      </div>`;
    };
    const tCur = cur.qty > 0 ? cur.revenue / cur.qty : 0;
    const tOld = old.qty > 0 ? old.revenue / old.qty : 0;
    const mpCur = cur.revenue > 0 ? (cur.margin / cur.revenue) * 100 : 0;
    const mpOld = old.revenue > 0 ? (old.margin / old.revenue) * 100 : 0;
    el.innerHTML =
      `<p class="muted" style="grid-column:1/-1">Dia ${dayNum} deste mês vs dia ${dayNum} do mês anterior</p>` +
      card('Receita bruta', cur.revenue, old.revenue) +
      card('Margem R$', cur.margin, old.margin) +
      card('Margem %', pct(mpCur), pct(mpOld), false).replace('pos','pos') +
      card('Qtd. vendas', cur.qty, old.qty, false) +
      card('Ticket médio', tCur, tOld);
  }).catch(() => { el.innerHTML = ''; });
}

// ===========================================================================
// Tabela meta diaria
// ===========================================================================
const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function renderDailyTable() {
  const tb = document.querySelector('#daily-table tbody');
  const g = generalGoal();
  if (!g) { tb.innerHTML = `<tr><td colspan="7" class="empty">Defina uma meta para ver o acompanhamento diário.</td></tr>`; return; }
  const dim = daysInMonth(state.month);
  const metaDia = (+g.amount) / dim;
  const isCurrent = state.month === curMonth();
  const yesterdayDay = isCurrent ? Number(new Date(Date.now() - 86400000).toLocaleDateString('en-CA').slice(8, 10)) : dim;
  const byDay = {};
  for (const s of sales) byDay[Number(s.date.slice(8, 10))] = (byDay[Number(s.date.slice(8, 10))] || 0) + (+s.revenue);
  let acc = 0, rows = '';
  for (let d = 1; d <= dim; d++) {
    if (d > yesterdayDay) break; // nao mostra dias futuros/hoje vazios
    const fat = byDay[d] || 0;
    acc += fat;
    const [y, m] = state.month.split('-').map(Number);
    const wd = WD[new Date(y, m - 1, d).getDay()];
    const diff = fat - metaDia;
    let status, rowCls;
    if (fat === 0) { status = 'FALTOU 🔴'; rowCls = 'row-faltou'; }
    else if (fat >= metaDia) { status = 'PASSOU 🟢'; rowCls = 'row-passou'; }
    else { status = 'FALTOU 🔴'; rowCls = 'row-faltou'; }
    rows += `<tr class="${rowCls}">
      <td>${String(d).padStart(2, '0')}</td><td>${wd}</td>
      <td>${money(fat)}</td><td>${money(metaDia)}</td>
      <td>${status}</td><td class="${diff >= 0 ? 'pos' : 'neg'}">${money(diff)}</td>
      <td>${money(acc)}</td></tr>`;
  }
  tb.innerHTML = rows || `<tr><td colspan="7" class="empty">Sem dias para exibir.</td></tr>`;
}

// ===========================================================================
// Export CSV
// ===========================================================================
function exportCSV() {
  const header = ['Data', 'Loja', 'Qtd', 'Receita', 'Taxas MP', 'Frete', 'CMV', 'Ads', 'Imposto', 'Margem R$', 'Margem %'];
  const rows = sales.map((s) => [s.date, storeName(s.store_id), s.qty, s.revenue, s.fee_mp, s.freight, s.cmv, s.ads_ml, s.tax, marginOf(s).toFixed(2), marginPctOf(s).toFixed(1)]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vendas-${state.month}.csv`;
  a.click();
}

// ===========================================================================
// Eventos
// ===========================================================================
$('month-sel').addEventListener('change', (e) => { state.month = e.target.value; loadAll(); });
$('store-filter').addEventListener('change', (e) => { state.store = e.target.value; loadAll(); });
$('manage-stores').addEventListener('click', () => { $('stores-panel').hidden = !$('stores-panel').hidden; });
$('export-csv').addEventListener('click', exportCSV);

// preview ao vivo
$('sales-form').addEventListener('input', updatePreview);
$('cancel-edit').addEventListener('click', resetForm);

// salvar venda
$('sales-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('sales-msg'); msg.textContent = ''; msg.className = 'form-msg';
  const data = readForm();
  if (!data.store_id) { msg.textContent = 'Selecione a loja.'; msg.classList.add('err'); return; }
  try {
    if (editingId) await api(`/api/sales/${editingId}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/sales', { method: 'POST', body: JSON.stringify(data) });
    const targetMonth = data.date.slice(0, 7);
    if (targetMonth !== state.month) { state.month = targetMonth; $('month-sel').value = targetMonth; }
    resetForm();
    await loadAll();
    msg.textContent = 'Lançamento salvo!'; msg.classList.add('ok');
  } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
});

// tabela de vendas: editar / excluir
document.querySelector('#sales-table tbody').addEventListener('click', async (e) => {
  const ed = e.target.closest('[data-edit]'); const dl = e.target.closest('[data-del]');
  if (ed) return editSale(ed.dataset.edit);
  if (dl) {
    if (!confirm('Excluir este lançamento?')) return;
    await api(`/api/sales/${dl.dataset.del}`, { method: 'DELETE' });
    await loadAll();
  }
});

// lojas: adicionar / cor / excluir
$('store-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('store-name').value.trim(); const color = $('store-color').value;
  if (!name) return;
  await api('/api/stores', { method: 'POST', body: JSON.stringify({ name, color }) });
  $('store-name').value = '';
  await loadAll();
});
$('stores-list').addEventListener('change', async (e) => {
  const c = e.target.closest('[data-color]');
  if (c) { await api(`/api/stores/${c.dataset.color}`, { method: 'PUT', body: JSON.stringify({ color: c.value }) }); await loadAll(); }
});
$('stores-list').addEventListener('click', async (e) => {
  const d = e.target.closest('[data-del-store]');
  if (!d) return;
  if (!confirm('Excluir esta loja e TODOS os seus lançamentos?')) return;
  await api(`/api/stores/${d.dataset.delStore}`, { method: 'DELETE' });
  await loadAll();
});

// Init
(async () => {
  const session = await initShell('vendas');
  if (!session) return;
  state.month = curMonth();
  $('month-sel').value = state.month;
  $('sales-form').date.value = todayStr();
  await loadAll();
})();
