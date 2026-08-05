// ===========================================================================
// Projeção de Caixa (90 dias)
// ===========================================================================
const $ = (id) => document.getElementById(id);
const HORIZON = 90;
let caixaAtual = 0;
let days = []; // [{date, entradas, saidas, saldo, real, projected, inItems, outItems}]

// `money` vem de dre-core.js (carregado antes). Não redeclarar aqui.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toLocaleDateString('en-CA');
const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function addDays(dateStr, n) { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); }
function fmtDay(dateStr) { const d = new Date(dateStr + 'T00:00:00'); return `${WD[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; }

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

async function build() {
  const today = todayStr();
  const [cf, bol, ft] = await Promise.all([
    api('/api/cashflow'),
    api('/api/boletos?status=pendente'),
    api('/api/faturas'),
  ]);
  const entries = cf.entries || [];
  const boletos = bol.boletos || [];
  const faturas = ft.faturas || [];

  // 1. Caixa atual = saldo real até hoje
  caixaAtual = entries.filter((e) => e.date <= today).reduce((a, e) => a + (e.type === 'income' ? +e.value : -(+e.value)), 0);

  // Buckets por dia (mapa date -> {in, out, inItems, outItems})
  const map = {};
  const ensure = (d) => (map[d] = map[d] || { in: 0, out: 0, inItems: [], outItems: [] });

  // Entradas futuras: recebíveis pendentes + lançamentos income futuros
  for (const b of boletos.filter((x) => x.direction === 'receber')) {
    if (b.due_date > today) { const m = ensure(b.due_date); m.in += +b.value; m.inItems.push(`${b.empresa || b.name}: ${money(b.value)}`); }
  }
  for (const e of entries.filter((x) => x.type === 'income' && x.date > today)) {
    const m = ensure(e.date); m.in += +e.value; m.inItems.push(`${e.reason || 'Entrada'}: ${money(e.value)}`);
  }
  // Saídas futuras: boletos a pagar pendentes (exceto tipo 'cartao', que vem via fatura)
  for (const b of boletos.filter((x) => x.direction === 'pagar' && x.kind !== 'cartao')) {
    if (b.due_date >= today) { const m = ensure(b.due_date); m.out += +b.value; m.outItems.push(`${b.name}: ${money(b.value)}`); }
  }
  // Faturas de cartão (fonte da verdade das parcelas) como saída no vencimento
  for (const f of faturas) {
    if (f.due_date >= today) { const m = ensure(f.due_date); m.out += +f.total; m.outItems.push(`Fatura ${f.cartao}: ${money(f.total)}`); }
  }

  // Média diária de recebíveis (próximos 7 dias) para preencher dias vazios
  let soma7 = 0, dias7 = 0;
  for (let i = 1; i <= 7; i++) { const d = addDays(today, i); if (map[d]?.in) { soma7 += map[d].in; dias7++; } }
  const media = dias7 > 0 ? Math.round((soma7 / dias7) * 100) / 100 : 0;

  // Monta os 90 dias com saldo acumulado
  days = [];
  let saldo = caixaAtual;
  for (let i = 0; i <= HORIZON; i++) {
    const date = addDays(today, i);
    const m = map[date] || { in: 0, out: 0, inItems: [], outItems: [] };
    let entradas = m.in, projected = false;
    if (i > 0 && entradas === 0 && media > 0) { entradas = media; projected = true; }
    const saidas = m.out;
    if (i > 0) saldo += entradas - saidas; // dia 0 já está no caixa atual
    days.push({ date, entradas, saidas, saldo, real: i === 0, projected, inItems: m.inItems, outItems: m.outItems, inCount: m.inItems.length, outCount: m.outItems.length });
  }
}

function sumRange(field, n) { return days.slice(1, n + 1).reduce((a, d) => a + d[field], 0); }

function renderKPIs() {
  const entradas = sumRange('entradas', HORIZON);
  const saidas = sumRange('saidas', HORIZON);
  const proj = caixaAtual + entradas - saidas;
  const kpi = (l, v, cls = '') => `<div class="stat-card"><span class="stat-label">${l}</span><span class="stat-value ${cls}" style="font-size:1.5rem">${v}</span></div>`;
  $('proj-kpis').innerHTML =
    kpi('Caixa atual', money(caixaAtual), caixaAtual >= 0 ? 'pos' : 'neg') +
    kpi('Entradas previstas (90d)', money(entradas), 'pos') +
    kpi('Saídas previstas (90d)', money(saidas), 'neg') +
    kpi('Caixa projetado (90d)', money(proj), proj >= 0 ? 'pos' : 'neg');
  window.animateCounts?.($('proj-kpis').querySelectorAll('.stat-value'));
}

function renderPeriods() {
  const el = $('periods');
  el.innerHTML = [7, 15, 21, 30, 45, 60].map((n) => {
    const proj = caixaAtual + sumRange('entradas', n) - sumRange('saidas', n);
    return `<div class="period-card"><span class="stat-label">${n} dias</span><span class="period-val ${proj >= 0 ? 'pos' : 'neg'}">${money(proj)}</span></div>`;
  }).join('');
}

function renderChart() {
  const data = days.slice(0, 31);
  const el = $('proj-chart');
  const W = 760, H = 240, padL = 54, padB = 24, padT = 10, padR = 10;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const saldos = data.map((d) => d.saldo);
  const max = Math.max(...saldos, 0), min = Math.min(...saldos, 0);
  const range = (max - min) || 1;
  const x = (i) => padL + (i / (data.length - 1)) * plotW;
  const y = (v) => padT + plotH - ((v - min) / range) * plotH;
  const line = saldos.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const zeroY = y(0);
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">`;
  svg += `<line x1="${padL}" y1="${zeroY}" x2="${W - padR}" y2="${zeroY}" stroke="#d64545" stroke-dasharray="4" stroke-width="1"/>`;
  svg += `<text x="${padL - 6}" y="${y(max) + 3}" class="axis-y">${money(max)}</text>`;
  svg += `<text x="${padL - 6}" y="${y(min) + 3}" class="axis-y">${money(min)}</text>`;
  // area negativa
  svg += `<path d="${line}" fill="none" stroke="#1d7a5f" stroke-width="2.5"/>`;
  data.forEach((d, i) => { if (d.saldo < 0) svg += `<circle cx="${x(i)}" cy="${y(d.saldo)}" r="3" fill="#d64545"/>`; });
  svg += `</svg>`;
  el.innerHTML = svg;
}

function renderTable() {
  const n = Number($('days-sel').value);
  const rows = days.slice(0, n + 1);
  const critico = 5000;
  const maiorSaida = Math.max(...rows.map((d) => d.saidas));
  const tb = document.querySelector('#proj-table tbody');
  tb.innerHTML = rows.map((d) => {
    let cls = '';
    if (d.real) cls = 'row-today';
    else if (d.saldo < 0) cls = 'row-neg';
    else if (d.saldo < critico) cls = 'row-crit';
    const inTxt = d.entradas > 0
      ? `${d.projected ? '<span class="mini-badge proj">proj.</span>' : (d.real ? '<span class="mini-badge real">real</span>' : '')} <span class="pos">${money(d.entradas)}</span>`
      : '<span class="muted">—</span>';
    const events = [];
    if (d.inCount) events.push(`<span class="ev ev-in" title="${esc(d.inItems.join(' | '))}">↑ ${d.inCount} receb.</span>`);
    if (d.outCount) events.push(`<span class="ev ev-out" title="${esc(d.outItems.join(' | '))}">↓ ${d.outCount} saída(s)</span>`);
    if (!d.inCount && d.projected) events.push('<span class="ev ev-proj">média proj.</span>');
    return `<tr class="${cls}">
      <td><b>${fmtDay(d.date)}</b>${d.real ? ' <span class="badge-hoje">Hoje</span>' : ''}${d.saidas === maiorSaida && maiorSaida > 0 ? ' <span class="tag-late">maior saída</span>' : ''}</td>
      <td>${inTxt}</td>
      <td>${d.saidas > 0 ? `<span class="neg">${money(d.saidas)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="${d.saldo < 0 ? 'neg' : (d.saldo < critico ? 'c-warn' : '')}"><b>${money(d.saldo)}</b></td>
      <td>${events.join(' ') || '—'}</td>
    </tr>`;
  }).join('');
}

function renderAlerts() {
  const el = $('alerts');
  const alerts = [];
  const negDay = days.find((d) => !d.real && d.saldo < 0);
  if (negDay) alerts.push({ t: 'danger', txt: `🔴 Caixa fica negativo em ${fmtDay(negDay.date)} (${money(negDay.saldo)}).` });
  const venc7 = days.slice(1, 8).reduce((a, d) => a + d.saidas, 0);
  if (venc7 > 0) alerts.push({ t: 'warn', txt: `🟡 Vencimentos nos próximos 7 dias: ${money(venc7)}.` });
  const maior = days.slice(1).reduce((mx, d) => d.saidas > (mx?.saidas || 0) ? d : mx, null);
  if (maior && maior.saidas > 0) alerts.push({ t: 'warn', txt: `🟡 Maior saída programada: ${money(maior.saidas)} em ${fmtDay(maior.date)}.` });
  if (!days.slice(0, 61).some((d) => d.saldo < 0)) alerts.push({ t: 'ok', txt: '🟢 Caixa saudável: sem risco de saldo negativo nos próximos 60 dias.' });
  el.innerHTML = alerts.map((a) => `<div class="alert alert-${a.t}">${a.txt}</div>`).join('');
}

$('days-sel').addEventListener('change', renderTable);

// ===========================================================================
// Fluxo de Caixa Anual (manual)
// ===========================================================================
const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
let manualRows = [];
let manualYear = new Date().getFullYear();

async function loadManual() {
  await loadFinance(); // sales + expenses (dre-core)
  const { rows } = await api(`/api/manual-cashflow?year=${manualYear}`);
  manualRows = rows || [];
  renderManual();
}

function manualOf(month) { return manualRows.find((r) => r.month === month) || { day1: 0, bank_in: 0, bank_out: 0 }; }

function renderManual() {
  const dre = annualDRE(String(manualYear));
  const tb = document.querySelector('#manual-table tbody');
  const inp = (m, field, val) => `<input type="number" step="0.01" class="mini-inp" data-m="${m}" data-f="${field}" value="${val || ''}" placeholder="0" />`;
  tb.innerHTML = MONTHS_PT.map((lbl, i) => {
    const m = i + 1, r = manualOf(m), d = dre[i];
    const saldoBanco = (+r.bank_in) - (+r.bank_out);
    const cresc = i > 0 && dre[i - 1].receita > 0 ? ((d.receita - dre[i - 1].receita) / dre[i - 1].receita) * 100 : null;
    return `<tr>
      <td><b>${lbl}</b></td>
      <td>${inp(m, 'day1', r.day1)}</td>
      <td>${inp(m, 'bank_in', r.bank_in)}</td>
      <td>${inp(m, 'bank_out', r.bank_out)}</td>
      <td class="${saldoBanco >= 0 ? 'pos' : 'neg'}"><b>${money(saldoBanco)}</b></td>
      <td>${d.receita > 0 ? money(d.receita) : '—'}</td>
      <td class="${d.lucroPct >= 0 ? 'pos' : 'neg'}">${d.receita > 0 ? d.lucroPct.toFixed(1) + '%' : '—'}</td>
      <td class="${cresc == null ? 'muted' : cresc >= 0 ? 'pos' : 'neg'}">${cresc == null ? '—' : (cresc >= 0 ? '▲' : '▼') + ' ' + Math.abs(cresc).toFixed(1) + '%'}</td>
    </tr>`;
  }).join('');
  // grafico: faturamento x saldo banco
  trendChart($('manual-chart'), [
    { name: 'Faturamento', color: '#1e6fff', values: dre.map((d) => d.receita) },
    { name: 'Saldo Banco', color: '#22d3ee', values: MONTHS_PT.map((_, i) => (+manualOf(i + 1).bank_in) - (+manualOf(i + 1).bank_out)) },
  ], MONTHS_PT);
}

document.querySelector('#manual-table tbody').addEventListener('change', async (e) => {
  const el = e.target.closest('.mini-inp'); if (!el) return;
  const m = Number(el.dataset.m);
  const r = manualOf(m);
  const payload = { year: manualYear, month: m, day1: +r.day1, bank_in: +r.bank_in, bank_out: +r.bank_out };
  payload[el.dataset.f] = Number(el.value) || 0;
  try { await api('/api/manual-cashflow', { method: 'PUT', body: JSON.stringify(payload) }); await loadManual(); }
  catch (err) { alert(err.message); }
});

$('manual-year').addEventListener('change', (e) => { manualYear = Number(e.target.value); loadManual(); });

(async () => {
  const session = await initShell('projecao');
  if (!session) return;
  await build();
  renderAlerts(); renderKPIs(); renderPeriods(); renderChart(); renderTable();
  const yr = new Date().getFullYear();
  $('manual-year').innerHTML = [yr - 1, yr, yr + 1].map((y) => `<option ${y === yr ? 'selected' : ''}>${y}</option>`).join('');
  loadManual();
})();
