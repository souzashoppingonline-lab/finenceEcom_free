// ===========================================================================
// Boletos & Dívidas
// ===========================================================================
const $ = (id) => document.getElementById(id);
let boletos = [];
let cashflow = [];
let editingId = null;

const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toLocaleDateString('en-CA');

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

function fmtDate(iso) { const [y, m, d] = (iso || '').split('-'); return `${d}/${m}/${y}`; }

// ---------- Carregamento ----------
async function loadAll() {
  const [b, cf] = await Promise.all([api('/api/boletos'), api('/api/cashflow')]);
  boletos = b.boletos || [];
  cashflow = cf.entries || [];
  renderKPIs();
  renderSyncPanel();
  renderTable();
}

// ---------- KPIs ----------
function saldoCaixa() {
  const today = todayStr();
  return cashflow.filter((e) => e.date <= today)
    .reduce((a, e) => a + (e.type === 'income' ? +e.value : -(+e.value)), 0);
}

function renderKPIs() {
  const pend = (dir) => boletos.filter((b) => b.direction === dir && b.status === 'pendente').reduce((a, b) => a + (+b.value), 0);
  const totalPagar = pend('pagar');
  const totalReceber = pend('receber');
  const saldo = saldoCaixa();
  const dividaReal = totalPagar - saldo - totalReceber;
  const kpi = (label, val, cls = '') => `<div class="stat-card"><span class="stat-label">${label}</span><span class="stat-value ${cls}" style="font-size:1.5rem">${val}</span></div>`;
  $('boletos-kpis').innerHTML =
    kpi('A pagar (pendente)', money(totalPagar), 'neg') +
    kpi('A receber (pendente)', money(totalReceber), 'pos') +
    kpi('Saldo em caixa', money(saldo), saldo >= 0 ? 'pos' : 'neg') +
    kpi(dividaReal > 0 ? 'Dívida real projetada' : 'Superávit projetado', money(Math.abs(dividaReal)), dividaReal > 0 ? 'neg' : 'pos');
}

// ---------- Painel de sincronização ----------
function renderSyncPanel() {
  const pagos = boletos.filter((b) => b.status === 'pago');
  const linkedIds = new Set(cashflow.filter((e) => e.boleto_id).map((e) => e.boleto_id));
  const lancados = pagos.filter((b) => linkedIds.has(b.id)).length;
  const pct = pagos.length ? Math.round((lancados / pagos.length) * 100) : 100;
  const totalLancado = pagos.filter((b) => linkedIds.has(b.id)).reduce((a, b) => a + (+b.value), 0);
  $('sync-panel').innerHTML = `
    <div class="chart-head"><h3>Sincronização com o Fluxo de Caixa</h3><span class="health-overall ${pct === 100 ? 'ok' : 'warn'}">${lancados}/${pagos.length} lançados</span></div>
    <div class="goal-bar"><div class="goal-bar-fill ${pct === 100 ? 'bar-ok' : 'bar-warn'}" style="width:${pct}%"></div></div>
    <p class="muted">${pct}% dos boletos pagos já estão no Fluxo de Caixa · Total lançado: <b>${money(totalLancado)}</b></p>`;
}

// ---------- Tabela ----------
function currentFilters() {
  return { month: $('b-month').value, dir: $('b-dir').value, status: $('b-status').value };
}

function renderTable() {
  const f = currentFilters();
  const rows = boletos.filter((b) =>
    (!f.month || (b.due_date || '').startsWith(f.month)) &&
    (!f.dir || b.direction === f.dir) &&
    (!f.status || b.status === f.status)
  );
  const tb = document.querySelector('#boletos-table tbody');
  if (rows.length === 0) { tb.innerHTML = `<tr><td colspan="8" class="empty">Nenhum registro.</td></tr>`; return; }
  const today = todayStr();
  tb.innerHTML = rows.map((b) => {
    const overdue = b.status === 'pendente' && b.due_date < today;
    const dirBadge = b.direction === 'receber' ? '<span class="badge-in">A receber</span>' : '<span class="badge-out">A pagar</span>';
    const statusBtn = b.status === 'pago'
      ? `<button class="pill pill-pago" data-toggle="${b.id}">✓ Pago</button>`
      : `<button class="pill pill-pend" data-toggle="${b.id}">Marcar pago</button>`;
    return `<tr class="${overdue ? 'row-faltou' : ''}">
      <td>${fmtDate(b.due_date)}${overdue ? ' <span class="tag-late">vencido</span>' : ''}</td>
      <td>${esc(b.name)}</td>
      <td>${esc(b.supplier || '—')}</td>
      <td>${esc(b.empresa || '—')}</td>
      <td>${dirBadge}</td>
      <td class="${b.direction === 'receber' ? 'pos' : 'neg'}">${money(b.value)}</td>
      <td>${statusBtn}</td>
      <td>
        <button class="btn-del" data-edit="${b.id}" title="Editar">✏️</button>
        <button class="btn-del" data-del="${b.id}" title="Excluir">🗑</button>
      </td></tr>`;
  }).join('');
}

// ---------- Form ----------
function resetForm() {
  const f = $('boleto-form'); f.reset();
  f.due_date.value = todayStr();
  editingId = null;
  $('bform-title').textContent = 'Nova dívida / recebível';
  $('save-boleto').textContent = 'Salvar';
  $('bcancel').hidden = true;
}

function editBoleto(id) {
  const b = boletos.find((x) => x.id === id); if (!b) return;
  const f = $('boleto-form');
  f.direction.value = b.direction; f.name.value = b.name; f.supplier.value = b.supplier || '';
  f.value.value = b.value; f.due_date.value = b.due_date; f.category.value = b.category || '';
  f.empresa.value = b.empresa || ''; f.numero_nf.value = b.numero_nf || '';
  editingId = id;
  $('bform-title').textContent = 'Editar registro';
  $('save-boleto').textContent = 'Salvar alterações';
  $('bcancel').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('boleto-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('boleto-msg'); msg.textContent = ''; msg.className = 'form-msg';
  const f = e.target;
  const payload = {
    direction: f.direction.value, name: f.name.value.trim(), supplier: f.supplier.value.trim(),
    value: Number(f.value.value) || 0, due_date: f.due_date.value, category: f.category.value,
    empresa: f.empresa.value.trim(), numero_nf: f.numero_nf.value.trim(),
    status: editingId ? (boletos.find((x) => x.id === editingId)?.status || 'pendente') : 'pendente',
  };
  try {
    if (editingId) await api(`/api/boletos/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api('/api/boletos', { method: 'POST', body: JSON.stringify(payload) });
    resetForm();
    await loadAll();
    msg.textContent = 'Salvo!'; msg.classList.add('ok');
  } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
});
$('bcancel').addEventListener('click', resetForm);

// ---------- Ações da tabela ----------
document.querySelector('#boletos-table tbody').addEventListener('click', async (e) => {
  const tg = e.target.closest('[data-toggle]'); const ed = e.target.closest('[data-edit]'); const dl = e.target.closest('[data-del]');
  if (ed) return editBoleto(ed.dataset.edit);
  if (dl) {
    if (!confirm('Excluir este registro? (também remove o lançamento vinculado no Fluxo de Caixa)')) return;
    await api(`/api/boletos/${dl.dataset.del}`, { method: 'DELETE' });
    return loadAll();
  }
  if (tg) {
    const b = boletos.find((x) => x.id === tg.dataset.toggle); if (!b) return;
    const novo = { ...b, status: b.status === 'pago' ? 'pendente' : 'pago' };
    await api(`/api/boletos/${b.id}`, { method: 'PUT', body: JSON.stringify(novo) });
    return loadAll();
  }
});

['b-month', 'b-dir', 'b-status'].forEach((id) => $(id).addEventListener('change', renderTable));

// ---------- Init ----------
(async () => {
  const session = await initShell('boletos');
  if (!session) return;
  $('boleto-form').due_date.value = todayStr();
  await loadAll();
})();
