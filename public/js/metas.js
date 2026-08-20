// ===========================================================================
// Metas de Faturamento (geral + por empresa)
// ===========================================================================
const $ = (id) => document.getElementById(id);
let goals = [];
let sales = [];
let stores = [];
let month = '';

const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => (Number(v) || 0).toFixed(1) + '%';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toLocaleDateString('en-CA');
const curMonth = () => todayStr().slice(0, 7);
const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

async function loadAll() {
  const [g, s, st] = await Promise.all([api(`/api/goals?month=${month}`), api(`/api/sales?month=${month}`), api('/api/stores')]);
  goals = g.goals || []; sales = s.sales || []; stores = st.stores || [];
  renderGeral();
  renderStores();
}

// Cálculo de meta (realizado, run rate, projeção, status)
function calc(meta, realizado, filteredSales) {
  const dim = daysInMonth(month);
  const isCurrent = month === curMonth();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
  const limit = isCurrent ? yesterday : `${month}-31`;
  const upto = filteredSales.filter((s) => s.date <= limit);
  const acumulado = upto.reduce((a, s) => a + (+s.revenue), 0);
  const diasComDado = new Set(upto.map((s) => s.date)).size;
  const runRate = diasComDado > 0 ? acumulado / diasComDado : 0;
  const projecao = runRate * dim;
  const restante = meta - realizado;
  const diaOntem = isCurrent ? Number(yesterday.slice(8, 10)) : dim;
  const diasRestantes = isCurrent ? Math.max(dim - diaOntem, 0) : 0;
  const metaDia = diasRestantes > 0 ? restante / diasRestantes : 0;
  let status;
  if (realizado >= meta) status = { label: 'META ATINGIDA', cls: 'c-ok', bar: 'bar-ok' };
  else if (projecao > meta * 1.05) status = { label: '🟢 ADIANTADO', cls: 'c-ok', bar: 'bar-ok' };
  else if (projecao >= meta * 0.95) status = { label: '🟡 EM RISCO', cls: 'c-warn', bar: 'bar-warn' };
  else status = { label: '🔴 ATRASADO', cls: 'c-danger', bar: 'bar-danger' };
  return { runRate, projecao, restante, metaDia, diasRestantes, status, isCurrent };
}

function generalGoal() { return goals.find((g) => !g.store_id); }

function renderGeral() {
  const g = generalGoal();
  const el = $('meta-geral');
  if (!g) {
    el.innerHTML = `<div class="card goal-empty"><h3>Meta geral do mês</h3>
      <p class="muted">Defina quanto quer faturar neste mês (todas as empresas).</p>
      <form id="gform" class="inline-form"><input type="number" id="ginput" min="0" step="0.01" placeholder="Ex.: 50000" required /><button class="btn-inline">Definir meta</button></form></div>`;
    $('gform').addEventListener('submit', (e) => { e.preventDefault(); saveGoal(null, +$('ginput').value); });
    return;
  }
  const realizado = sales.reduce((a, s) => a + (+s.revenue), 0);
  const c = calc(+g.amount, realizado, sales);
  const p = g.amount > 0 ? (realizado / g.amount) * 100 : 0;
  const kpi = (l, v, s = '') => `<div class="stat-card"><span class="stat-label">${l}</span><span class="stat-value" style="font-size:1.4rem">${v}</span>${s ? `<span class="muted">${s}</span>` : ''}</div>`;
  el.innerHTML = `<div class="card goal-card">
    <div class="goal-head"><h3>Meta geral <span class="${c.status.cls} goal-status">${c.status.label}</span></h3>
      <button class="btn-ghost" onclick="editGoal(null, ${g.amount})">Editar meta</button></div>
    <div class="stats-grid">
      ${kpi('Meta', money(+g.amount))}
      ${kpi('Realizado', money(realizado), pct(p) + ' da meta')}
      ${kpi('Falta', c.restante > 0 ? money(c.restante) : 'Superado', c.isCurrent ? money(c.metaDia) + '/dia' : '')}
      ${kpi('Projeção', money(c.projecao))}
    </div>
    <div class="goal-bar"><div class="goal-bar-fill ${c.status.bar}" style="width:${Math.min(p, 100)}%"></div></div>
    <p class="muted">${pct(p)} da meta · projeção ${money(c.projecao)}${c.isCurrent ? ' · faltam ' + c.diasRestantes + ' dias' : ''}</p>
  </div>`;
  window.animateCounts?.(el.querySelectorAll('.stat-value'));
}

function renderStores() {
  const el = $('meta-stores');
  if (stores.length === 0) { el.innerHTML = '<p class="muted">Cadastre empresas para definir metas por empresa.</p>'; return; }
  el.innerHTML = stores.map((s) => {
    const g = goals.find((x) => x.store_id === s.id);
    const realizado = sales.filter((v) => v.store_id === s.id).reduce((a, v) => a + (+v.revenue), 0);
    if (!g) {
      return `<div class="card report-card" style="border-top:3px solid ${s.color}">
        <h4><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</h4>
        <p class="muted">Sem meta. Realizado: <b>${money(realizado)}</b></p>
        <form class="inline-form" data-store="${s.id}"><input type="number" min="0" step="0.01" placeholder="Meta R$" required /><button class="btn-inline">Definir</button></form>
      </div>`;
    }
    const p = g.amount > 0 ? (realizado / g.amount) * 100 : 0;
    const c = calc(+g.amount, realizado, sales.filter((v) => v.store_id === s.id));
    return `<div class="card report-card" style="border-top:3px solid ${s.color}">
      <h4><span class="dot" style="background:${s.color}"></span>${esc(s.name)} <span class="${c.status.cls}" style="font-size:.8rem">${c.status.label}</span></h4>
      <div class="report-kpis">
        <div><span class="muted">Meta</span><b>${money(+g.amount)}</b></div>
        <div><span class="muted">Realizado</span><b class="pos">${money(realizado)}</b></div>
      </div>
      <div class="goal-bar" style="height:14px"><div class="goal-bar-fill ${c.status.bar}" style="width:${Math.min(p, 100)}%"></div></div>
      <p class="muted" style="margin-top:8px">${pct(p)} · <a href="#" onclick="editGoal('${s.id}', ${g.amount});return false">editar</a> · <a href="#" onclick="removeGoal('${s.id}');return false">remover</a></p>
    </div>`;
  }).join('');
  el.querySelectorAll('form[data-store]').forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); saveGoal(f.dataset.store, +f.querySelector('input').value); }));
}

async function saveGoal(store_id, amount) {
  await api('/api/goals', { method: 'PUT', body: JSON.stringify({ month, store_id, amount }) });
  await loadAll();
}
window.editGoal = (store_id, current) => { const v = prompt('Nova meta (R$):', current); if (v != null) saveGoal(store_id, +v); };
window.removeGoal = (store_id) => { if (confirm('Remover esta meta?')) saveGoal(store_id, 0); };

$('meta-month').addEventListener('change', (e) => { month = e.target.value; loadAll(); });

(async () => {
  const session = await initShell('metas');
  if (!session) return;
  month = curMonth();
  $('meta-month').value = month;
  await loadAll();
})();
