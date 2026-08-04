// ===========================================================================
// Fluxo de Caixa
// ===========================================================================
const $ = (id) => document.getElementById(id);
let entries = [];      // lançamentos do mês
let allEntries = [];   // todos (para saldo)
let boletos = [];      // compromissos (para previsão)
const state = { month: '' };

const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toLocaleDateString('en-CA');
const curMonth = () => todayStr().slice(0, 7);
function fmtDate(iso) { const [y, m, d] = (iso || '').split('-'); return `${d}/${m}/${y}`; }

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

async function loadAll() {
  const [m, all, b] = await Promise.all([
    api(`/api/cashflow?month=${state.month}`),
    api('/api/cashflow'),
    api('/api/boletos?status=pendente'),
  ]);
  entries = m.entries || [];
  allEntries = all.entries || [];
  boletos = b.boletos || [];
  renderKPIs();
  renderCompany();
  renderTable();
  renderForecast();
}

function saldoAte(dateStr) {
  return allEntries.filter((e) => e.date <= dateStr)
    .reduce((a, e) => a + (e.type === 'income' ? +e.value : -(+e.value)), 0);
}

function renderKPIs() {
  const inc = entries.filter((e) => e.type === 'income').reduce((a, e) => a + (+e.value), 0);
  const exp = entries.filter((e) => e.type === 'expense').reduce((a, e) => a + (+e.value), 0);
  const saldo = saldoAte(todayStr());
  // projeção: saldo atual + recebíveis pendentes - contas a pagar pendentes
  const futIn = boletos.filter((b) => b.direction === 'receber').reduce((a, b) => a + (+b.value), 0);
  const futOut = boletos.filter((b) => b.direction === 'pagar').reduce((a, b) => a + (+b.value), 0);
  const proj = saldo + futIn - futOut;
  const kpi = (l, v, cls = '') => `<div class="stat-card"><span class="stat-label">${l}</span><span class="stat-value ${cls}" style="font-size:1.5rem">${v}</span></div>`;
  $('cf-kpis').innerHTML =
    kpi('Saldo em caixa', money(saldo), saldo >= 0 ? 'pos' : 'neg') +
    kpi('Entradas (mês)', money(inc), 'pos') +
    kpi('Saídas (mês)', money(exp), 'neg') +
    kpi('Saldo projetado', money(proj), proj >= 0 ? 'pos' : 'neg');
  window.animateCounts?.($('cf-kpis').querySelectorAll('.stat-value'));
}

function renderCompany() {
  const by = {};
  for (const e of entries) {
    const k = e.empresa || 'Sem empresa';
    if (!by[k]) by[k] = { inc: 0, exp: 0 };
    if (e.type === 'income') by[k].inc += +e.value; else by[k].exp += +e.value;
  }
  const keys = Object.keys(by);
  if (keys.length === 0) { $('cf-company').innerHTML = '<p class="muted">Sem lançamentos no período.</p>'; return; }
  $('cf-company').innerHTML = keys.map((k) => {
    const s = by[k].inc - by[k].exp;
    return `<div class="card report-card">
      <h4>${esc(k)}</h4>
      <div class="report-kpis">
        <div><span class="muted">Entradas</span><b class="pos">${money(by[k].inc)}</b></div>
        <div><span class="muted">Saídas</span><b class="neg">${money(by[k].exp)}</b></div>
        <div><span class="muted">Saldo</span><b class="${s >= 0 ? 'pos' : 'neg'}">${money(s)}</b></div>
      </div></div>`;
  }).join('');
}

function badges(e) {
  let b = '';
  if (e.boleto_id) b += '<span class="badge-boleto">Boleto</span> ';
  if (e.category === 'Cartão de Crédito') b += '<span class="badge-cartao">Cartão</span> ';
  return b;
}

function renderTable() {
  const f = $('cf-filter').value;
  let rows = entries;
  if (f === 'income' || f === 'expense') rows = entries.filter((e) => e.type === f);
  else if (f === 'boleto') rows = entries.filter((e) => e.boleto_id);
  else if (f === 'cartao') rows = entries.filter((e) => e.category === 'Cartão de Crédito');
  const tb = document.querySelector('#cf-table tbody');
  if (rows.length === 0) { tb.innerHTML = `<tr><td colspan="7" class="empty">Nenhum lançamento.</td></tr>`; return; }
  tb.innerHTML = rows.map((e) => {
    const isIn = e.type === 'income';
    return `<tr>
      <td>${fmtDate(e.date)}</td>
      <td>${isIn ? '<span class="badge-in">Entrada</span>' : '<span class="badge-out">Saída</span>'} ${badges(e)}</td>
      <td>${esc(e.category || '—')}</td>
      <td>${esc(e.empresa || '—')}</td>
      <td>${esc(e.reason || '—')}</td>
      <td class="${isIn ? 'pos' : 'neg'}">${isIn ? '' : '-'}${money(e.value)}</td>
      <td>${e.boleto_id ? '<span class="tag-late">via boleto</span>' : `<button class="btn-del" data-del="${e.id}" title="Excluir">🗑</button>`}</td>
    </tr>`;
  }).join('');
}

function renderForecast() {
  const tb = document.querySelector('#cf-forecast tbody');
  const pend = boletos.slice().sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  if (pend.length === 0) { tb.innerHTML = `<tr><td colspan="5" class="empty">Nenhum compromisso pendente.</td></tr>`; return; }
  let saldo = saldoAte(todayStr());
  tb.innerHTML = pend.map((b) => {
    const isIn = b.direction === 'receber';
    saldo += isIn ? +b.value : -(+b.value);
    return `<tr>
      <td>${fmtDate(b.due_date)}</td>
      <td>${esc(b.name)}</td>
      <td>${isIn ? '<span class="badge-in">A receber</span>' : '<span class="badge-out">A pagar</span>'}</td>
      <td class="${isIn ? 'pos' : 'neg'}">${isIn ? '' : '-'}${money(b.value)}</td>
      <td class="${saldo >= 0 ? 'pos' : 'neg'}">${money(saldo)}</td>
    </tr>`;
  }).join('');
}

// ---------- Form ----------
$('cf-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('cf-msg'); msg.textContent = ''; msg.className = 'form-msg';
  const f = e.target;
  const payload = {
    type: f.type.value, date: f.date.value, value: Number(f.value.value) || 0,
    category: f.category.value.trim(), empresa: f.empresa.value.trim(), reason: f.reason.value.trim(),
  };
  try {
    await api('/api/cashflow', { method: 'POST', body: JSON.stringify(payload) });
    f.reset(); f.date.value = todayStr();
    await loadAll();
    msg.textContent = 'Lançado!'; msg.classList.add('ok');
  } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
});

document.querySelector('#cf-table tbody').addEventListener('click', async (e) => {
  const dl = e.target.closest('[data-del]'); if (!dl) return;
  if (!confirm('Excluir este lançamento?')) return;
  try { await api(`/api/cashflow/${dl.dataset.del}`, { method: 'DELETE' }); await loadAll(); }
  catch (err) { alert(err.message); }
});

$('cf-month').addEventListener('change', (e) => { state.month = e.target.value; loadAll(); });
$('cf-filter').addEventListener('change', renderTable);

// ---------- Init ----------
(async () => {
  const session = await initShell('fluxo');
  if (!session) return;
  state.month = curMonth();
  $('cf-month').value = state.month;
  $('cf-form').date.value = todayStr();
  await loadAll();
})();
