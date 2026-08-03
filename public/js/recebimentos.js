// ===========================================================================
// Recebimentos (recebíveis) — usa boletos com direction='receber'
// ===========================================================================
const $ = (id) => document.getElementById(id);
let items = [];
let stores = [];
const filters = { status: '', empresa: '' };

const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toLocaleDateString('en-CA');
const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

function storeColor(name) { const s = stores.find((x) => x.name === name); return s ? s.color : '#6b7686'; }

async function loadAll() {
  const [b, st] = await Promise.all([api('/api/boletos?direction=receber'), api('/api/stores')]);
  items = b.boletos || [];
  stores = st.stores || [];
  // filtro topo: todas empresas
  $('r-empresa').innerHTML = `<option value="">Todas Empresas</option>` + stores.map((s) => `<option>${esc(s.name)}</option>`).join('');
  // marketplaces do form (lista global)
  $('receb-mkt').innerHTML = `<option value="">Marketplace...</option>` + (window.MARKETPLACES || []).map((m) => `<option>${esc(m)}</option>`).join('');
  render();
}

// Ao escolher o marketplace, mostra só as empresas atreladas a ele
function refreshEmpresasByMkt() {
  const mkt = $('receb-mkt').value;
  const sel = $('receb-empresa');
  if (!mkt) { sel.innerHTML = `<option value="">Empresa...</option>`; sel.disabled = true; return; }
  const empresas = stores.filter((s) => (s.marketplace || '').split(',').map((x) => x.trim()).includes(mkt));
  sel.disabled = empresas.length === 0;
  sel.innerHTML = empresas.length
    ? `<option value="">Empresa...</option>` + empresas.map((s) => `<option>${esc(s.name)}</option>`).join('')
    : `<option value="">Nenhuma empresa neste marketplace</option>`;
}

function render() {
  const rows = items.filter((r) =>
    (!filters.status || r.status === filters.status) &&
    (!filters.empresa || (r.empresa || '') === filters.empresa)
  );
  // contadores
  $('c-all').textContent = `(${items.length})`;
  $('c-pend').textContent = `(${items.filter((r) => r.status === 'pendente').length})`;
  $('c-rec').textContent = `(${items.filter((r) => r.status === 'pago').length})`;

  // agrupa por dia
  const byDay = {};
  for (const r of rows) { (byDay[r.due_date] = byDay[r.due_date] || []).push(r); }
  const days = Object.keys(byDay).sort();
  const el = $('receb-list');
  if (days.length === 0) { el.innerHTML = '<p class="muted">Nenhum recebível.</p>'; return; }
  el.innerHTML = days.map((d) => {
    const list = byDay[d];
    const total = list.reduce((a, r) => a + (+r.value), 0);
    const [y, mo, dd] = d.split('-');
    const wd = WD[new Date(+y, +mo - 1, +dd).getDay()];
    const isToday = d === todayStr();
    // por empresa
    const byEmp = {};
    for (const r of list) { const k = r.empresa || 'Sem empresa'; byEmp[k] = (byEmp[k] || 0) + (+r.value); }
    const empLine = Object.entries(byEmp).map(([k, v]) => `<span class="emp-tag" style="color:${storeColor(k)}">${esc(k)} ${money(v)}</span>`).join('  ');
    return `<div class="receb-day ${isToday ? 'is-today' : ''}">
      <div class="receb-day-head">
        <span>${dd}/${mo} <span class="muted">${wd}</span> ${isToday ? '<span class="badge-hoje">Hoje</span>' : ''}</span>
        <span><b>${money(total)}</b> <span class="muted">${list.length} rec.</span></span>
      </div>
      ${list.map((r) => `
        <div class="receb-row">
          <input type="checkbox" data-toggle="${r.id}" ${r.status === 'pago' ? 'checked' : ''} title="Marcar recebido" />
          <span class="emp-badge" style="background:${storeColor(r.empresa)}22;color:${storeColor(r.empresa)}">${esc(r.empresa || '—')}</span>
          ${r.marketplace ? `<span class="mkt-mini">${esc(r.marketplace)}</span>` : ''}
          <span class="receb-desc">${esc(r.name || 'Recebível')}</span>
          <span class="receb-val ${r.status === 'pago' ? 'pos' : ''}">${money(r.value)}</span>
          <span class="pill ${r.status === 'pago' ? 'pill-pago' : 'pill-pend'}">${r.status === 'pago' ? 'Recebido' : 'Pend.'}</span>
          <button class="btn-del" data-del="${r.id}" title="Excluir">🗑</button>
        </div>`).join('')}
      <div class="receb-emp-line">POR EMPRESA &nbsp; ${empLine}</div>
    </div>`;
  }).join('');

  // totais (mês corrente)
  const mês = todayStr().slice(0, 7);
  const pend = items.filter((r) => r.status === 'pendente').reduce((a, r) => a + (+r.value), 0);
  const rec = items.filter((r) => r.status === 'pago' && (r.due_date || '').startsWith(mês)).reduce((a, r) => a + (+r.value), 0);
  $('tot-pend').textContent = money(pend);
  $('tot-rec').textContent = money(rec);
}

// ---------- Form ----------
$('receb-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('receb-msg'); msg.textContent = ''; msg.className = 'form-msg';
  const f = e.target;
  if (!f.marketplace.value) { msg.textContent = 'Selecione o marketplace.'; msg.classList.add('err'); return; }
  if (!f.empresa.value) { msg.textContent = 'Selecione a empresa.'; msg.classList.add('err'); return; }
  const payload = {
    direction: 'receber', kind: 'recebivel', status: 'pendente',
    name: f.name.value.trim() || 'Recebível', value: Number(f.value.value) || 0,
    due_date: f.due_date.value, empresa: f.empresa.value, marketplace: f.marketplace.value, category: 'Recebíveis',
  };
  try {
    await api('/api/boletos', { method: 'POST', body: JSON.stringify(payload) });
    f.reset();
    await loadAll();
  } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
});

// ---------- Ações ----------
$('receb-list').addEventListener('click', async (e) => {
  const tg = e.target.closest('[data-toggle]'); const dl = e.target.closest('[data-del]');
  if (dl) { if (!confirm('Excluir este recebível?')) return; await api(`/api/boletos/${dl.dataset.del}`, { method: 'DELETE' }); return loadAll(); }
  if (tg) {
    const r = items.find((x) => x.id === tg.dataset.toggle); if (!r) return;
    await api(`/api/boletos/${r.id}`, { method: 'PUT', body: JSON.stringify({ ...r, status: r.status === 'pago' ? 'pendente' : 'pago' }) });
    return loadAll();
  }
});

$('r-tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.stab'); if (!t) return;
  document.querySelectorAll('#r-tabs .stab').forEach((x) => x.classList.remove('is-active'));
  t.classList.add('is-active'); filters.status = t.dataset.s; render();
});
$('r-empresa').addEventListener('change', (e) => { filters.empresa = e.target.value; render(); });
$('receb-mkt').addEventListener('change', refreshEmpresasByMkt);

exportButtons($('export-box'), () => ({
  filename: `recebiveis-${todayStr()}`,
  title: 'Recebíveis',
  subtitle: 'FinanceEcom Free — Recebimentos',
  headers: ['Data', 'Empresa', 'Marketplace', 'Descrição', 'Valor', 'Status'],
  rows: items.map((r) => [r.due_date, r.empresa || '', r.marketplace || '', r.name || '', +r.value, r.status === 'pago' ? 'Recebido' : 'Pendente']),
}));

// ---------- Init ----------
(async () => {
  const session = await initShell('receb');
  if (!session) return;
  $('receb-form').due_date.value = todayStr();
  await loadAll();
})();
