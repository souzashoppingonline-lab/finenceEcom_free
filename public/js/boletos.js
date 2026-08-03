// ===========================================================================
// Boletos & Dívidas (layout Cadastrar Dívida + tabela com filtros)
// ===========================================================================
const $ = (id) => document.getElementById(id);
let boletos = [];
let cashflow = [];
let stores = [];
let suppliers = [];
let categories = [];
let faturas = []; // faturas de cartao (virtuais)
let editingId = null;
const filters = { status: '', kind: '', dir: '', empresa: '', nf: '', month: '', dia: '', forn: '', banco: '', cartao: '' };

const KIND_LABEL = {
  boleto: 'Boleto', cartao: 'Cartão', imposto: 'Imposto', pessoal: 'Pessoal',
  fatura_ml: 'Fatura ML', flex: 'Flex', custo_fixo: 'Custo Fixo', custo_variavel: 'Custo Variável',
};
const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toLocaleDateString('en-CA');
function fmtDate(iso) { const [y, m, d] = (iso || '').split('-'); return `${d}/${m}/${String(y).slice(2)}`; }

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

// ---------- Carregamento ----------
async function loadAll() {
  const [b, cf, st, sup, cat, ft] = await Promise.all([
    api('/api/boletos'), api('/api/cashflow'), api('/api/stores'),
    api('/api/lists?type=supplier'), api('/api/lists?type=category'), api('/api/faturas'),
  ]);
  boletos = b.boletos || [];
  cashflow = cf.entries || [];
  stores = st.stores || [];
  suppliers = (sup.items || []).map((i) => i.name);
  categories = (cat.items || []).map((i) => i.name);
  // faturas de cartao viram "boletos virtuais" (a pagar, tipo cartao)
  faturas = (ft.faturas || []).map((f) => ({
    id: `fatura:${f.cartao_id}:${f.fatura_mes}`, virtual: true,
    cartao_id: f.cartao_id, fatura_mes: f.fatura_mes, cartao: f.cartao,
    name: `Fatura ${f.cartao} (${f.count}x)`, supplier: null, empresa: null, numero_nf: null,
    kind: 'cartao', direction: 'pagar', status: 'pendente', value: f.total, due_date: f.due_date,
  }));
  renderKPIs();
  renderEmpresaOptions();
  renderLists();
  renderTable();
}

function renderLists() {
  const f = $('boleto-form');
  const supCur = f.supplier.value, catCur = f.category.value;
  $('sel-supplier').innerHTML = `<option value="">— Nenhum fornecedor —</option>` + suppliers.map((n) => `<option>${esc(n)}</option>`).join('');
  $('sel-category').innerHTML = `<option value="">Selecione</option>` + categories.map((n) => `<option>${esc(n)}</option>`).join('');
  f.supplier.value = supCur; f.category.value = catCur;
}

function linkedIds() { return new Set(cashflow.filter((e) => e.boleto_id).map((e) => e.boleto_id)); }

function saldoCaixa() {
  const t = todayStr();
  return cashflow.filter((e) => e.date <= t).reduce((a, e) => a + (e.type === 'income' ? +e.value : -(+e.value)), 0);
}

function renderKPIs() {
  const pend = (dir) => boletos.filter((b) => b.direction === dir && b.status === 'pendente').reduce((a, b) => a + (+b.value), 0);
  const faturasTotal = faturas.reduce((a, f) => a + (+f.value), 0);
  const totalPagar = pend('pagar') + faturasTotal, totalReceber = pend('receber'), saldo = saldoCaixa();
  const dividaReal = totalPagar - saldo - totalReceber;
  const kpi = (l, v, cls = '') => `<div class="stat-card"><span class="stat-label">${l}</span><span class="stat-value ${cls}" style="font-size:1.4rem">${v}</span></div>`;
  $('boletos-kpis').innerHTML =
    kpi('A pagar (pendente)', money(totalPagar), 'neg') +
    kpi('A receber (pendente)', money(totalReceber), 'pos') +
    kpi('Saldo em caixa', money(saldo), saldo >= 0 ? 'pos' : 'neg') +
    kpi(dividaReal > 0 ? 'Dívida real projetada' : 'Superávit projetado', money(Math.abs(dividaReal)), dividaReal > 0 ? 'neg' : 'pos');
}

// ---------- Empresa (chips no form + filtro) ----------
function renderEmpresaOptions() {
  const chips = $('empresa-chips');
  const names = stores.map((s) => s.name);
  chips.innerHTML = `<button type="button" class="empresa-chip is-active" data-emp="">Nenhuma</button>` +
    names.map((n) => `<button type="button" class="empresa-chip" data-emp="${esc(n)}">${esc(n)}</button>`).join('');
  $('b-empresa').innerHTML = `<option value="">Todas</option>` + names.map((n) => `<option>${esc(n)}</option>`).join('');
  // Fornecedores, bancos e cartoes distintos dos proprios boletos
  const uniq = (key) => [...new Set(boletos.map((b) => (b[key] || '').trim()).filter(Boolean))].sort();
  $('b-forn').innerHTML = `<option value="">Todos</option>` + uniq('supplier').map((n) => `<option>${esc(n)}</option>`).join('');
  $('b-banco').innerHTML = `<option value="">Todos</option>` + uniq('bank').map((n) => `<option>${esc(n)}</option>`).join('');
  $('b-cartao').innerHTML = `<option value="">Todos</option>` + boletos.filter((b) => b.kind === 'cartao').map((b) => (b.name || '').trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).map((n) => `<option>${esc(n)}</option>`).join('');
}

// ---------- Tabela ----------
function statusOf(b) {
  if (b.status === 'pago') return 'pago';
  if (b.due_date < todayStr()) return 'atrasado';
  return 'pendente';
}

function renderTable() {
  const lids = linkedIds();
  let rows = [...boletos, ...faturas].filter((b) => {
    if (filters.month && !(b.due_date || '').startsWith(filters.month)) return false;
    if (filters.kind && b.kind !== filters.kind) return false;
    if (filters.dir && b.direction !== filters.dir) return false;
    if (filters.empresa && (b.empresa || '') !== filters.empresa) return false;
    if (filters.forn && (b.supplier || '') !== filters.forn) return false;
    if (filters.banco && (b.bank || '') !== filters.banco) return false;
    if (filters.cartao && b.name !== filters.cartao) return false;
    if (filters.dia && Number((b.due_date || '').slice(8, 10)) !== Number(filters.dia)) return false;
    if (filters.nf && !((b.numero_nf || '').includes(filters.nf))) return false;
    if (filters.status === 'fc') return lids.has(b.id);
    if (filters.status === 'atrasado') return statusOf(b) === 'atrasado';
    if (filters.status === 'pendente') return b.status === 'pendente';
    if (filters.status === 'pago') return b.status === 'pago';
    return true;
  });
  $('debt-count').textContent = `${rows.length} dívida${rows.length === 1 ? '' : 's'}`;
  const tb = document.querySelector('#boletos-table tbody');
  if (rows.length === 0) { tb.innerHTML = `<tr><td colspan="8" class="empty">Nenhuma dívida encontrada.</td></tr>`; return; }
  tb.innerHTML = rows.map((b) => {
    const st = statusOf(b);
    const late = st === 'atrasado';
    if (b.virtual) {
      return `<tr class="row-fatura">
        <td class="${late ? 'venc-late' : ''}">${fmtDate(b.due_date)}${late ? ' <span class="tag-late">ATRASADO</span>' : ''}</td>
        <td><span class="type-badge badge-cartao">💳 Cartão</span></td>
        <td><b>${esc(b.name)}</b></td>
        <td>—</td><td>—</td>
        <td><b>${money(b.value)}</b></td>
        <td><button class="pill pill-pend" data-payfat="${b.cartao_id}" data-mes="${b.fatura_mes}" data-total="${b.value}" data-card="${esc(b.cartao)}">Pagar Fatura</button></td>
        <td><a href="/cartoes.html" class="btn-del" title="Ver cartão">🔗</a></td></tr>`;
    }
    const statusPill = b.status === 'pago'
      ? `<button class="pill pill-pago" data-toggle="${b.id}">Pago</button>`
      : `<button class="pill pill-pend" data-toggle="${b.id}">Pendente</button>`;
    return `<tr>
      <td class="${late ? 'venc-late' : ''}">${fmtDate(b.due_date)}${late ? ' <span class="tag-late">ATRASADO</span>' : ''}</td>
      <td><span class="type-badge">${esc(KIND_LABEL[b.kind] || 'Boleto')}</span></td>
      <td><b>${esc(b.name)}</b>${b.supplier ? ` <span class="supp">${esc(b.supplier)}</span>` : ''}</td>
      <td>${esc(b.empresa || '—')}</td>
      <td>${esc(b.numero_nf || '—')}</td>
      <td class="${b.direction === 'receber' ? 'pos' : ''}"><b>${money(b.value)}</b></td>
      <td>${statusPill}${linkedIds().has(b.id) ? ' <span class="badge-boleto">FC</span>' : ''}</td>
      <td>
        <button class="btn-del" data-edit="${b.id}" title="Editar">✏️</button>
        <button class="btn-del" data-del="${b.id}" title="Excluir">🗑</button>
      </td></tr>`;
  }).join('');
}

// ---------- Form ----------
function resetForm() {
  const f = $('boleto-form'); f.reset();
  f.due_date.value = todayStr(); f.kind.value = 'boleto'; f.empresa.value = ''; f.status.value = 'pendente';
  document.querySelectorAll('.kind-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.kind === 'boleto'));
  document.querySelectorAll('.empresa-chip').forEach((c) => c.classList.toggle('is-active', c.dataset.emp === ''));
  document.querySelectorAll('.status-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.st === 'pendente'));
  editingId = null;
  $('save-boleto').textContent = 'Cadastrar dívida';
  $('bcancel').hidden = true;
}

function editBoleto(id) {
  const b = boletos.find((x) => x.id === id); if (!b) return;
  const f = $('boleto-form');
  f.kind.value = b.kind || 'boleto'; f.due_date.value = b.due_date; f.category.value = b.category || '';
  f.supplier.value = b.supplier || ''; f.empresa.value = b.empresa || ''; f.numero_nf.value = b.numero_nf || '';
  f.name.value = b.name; f.direction.value = b.direction; f.value.value = b.value;
  document.querySelectorAll('.kind-btn').forEach((x) => x.classList.toggle('is-active', x.dataset.kind === b.kind));
  document.querySelectorAll('.empresa-chip').forEach((c) => c.classList.toggle('is-active', c.dataset.emp === (b.empresa || '')));
  f.status.value = b.status;
  document.querySelectorAll('.status-btn').forEach((x) => x.classList.toggle('is-active', x.dataset.st === b.status));
  editingId = id;
  $('save-boleto').textContent = 'Salvar alterações';
  $('bcancel').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('kind-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('.kind-btn'); if (!btn) return;
  document.querySelectorAll('.kind-btn').forEach((b) => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  $('boleto-form').kind.value = btn.dataset.kind;
});

$('status-select').addEventListener('click', (e) => {
  const btn = e.target.closest('.status-btn'); if (!btn) return;
  document.querySelectorAll('.status-btn').forEach((b) => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  $('boleto-form').status.value = btn.dataset.st;
});

$('empresa-chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.empresa-chip'); if (!chip) return;
  document.querySelectorAll('.empresa-chip').forEach((c) => c.classList.remove('is-active'));
  chip.classList.add('is-active');
  $('boleto-form').empresa.value = chip.dataset.emp;
});

$('boleto-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('boleto-msg'); msg.textContent = ''; msg.className = 'form-msg';
  const f = e.target;
  const payload = {
    kind: f.kind.value, direction: f.direction.value, name: f.name.value.trim(), supplier: f.supplier.value.trim(),
    value: Number(f.value.value) || 0, due_date: f.due_date.value, category: f.category.value,
    empresa: f.empresa.value.trim(), numero_nf: f.numero_nf.value.trim(),
    status: f.status.value === 'pago' ? 'pago' : 'pendente', // "atrasado" é derivado da data
  };
  try {
    if (editingId) await api(`/api/boletos/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api('/api/boletos', { method: 'POST', body: JSON.stringify(payload) });
    resetForm();
    await loadAll();
    msg.textContent = 'Dívida cadastrada!'; msg.classList.add('ok');
  } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
});
$('bcancel').addEventListener('click', resetForm);

// ---------- Ações da tabela ----------
document.querySelector('#boletos-table tbody').addEventListener('click', async (e) => {
  const pf = e.target.closest('[data-payfat]');
  if (pf) {
    if (!confirm(`Pagar a fatura do ${pf.dataset.card} (${money(+pf.dataset.total)})?\nAs parcelas serão agrupadas por empresa no Fluxo de Caixa.`)) return;
    const data = prompt('Data do pagamento (AAAA-MM-DD):', todayStr());
    if (!data) return;
    try { await api('/api/faturas/pay', { method: 'POST', body: JSON.stringify({ cartao_id: pf.dataset.payfat, fatura_mes: pf.dataset.mes, data_pagamento: data }) }); await loadAll(); }
    catch (err) { alert(err.message); }
    return;
  }
  const tg = e.target.closest('[data-toggle]'); const ed = e.target.closest('[data-edit]'); const dl = e.target.closest('[data-del]');
  if (ed) return editBoleto(ed.dataset.edit);
  if (dl) { if (!confirm('Excluir esta dívida? (remove o lançamento vinculado no Fluxo de Caixa)')) return; await api(`/api/boletos/${dl.dataset.del}`, { method: 'DELETE' }); return loadAll(); }
  if (tg) {
    const b = boletos.find((x) => x.id === tg.dataset.toggle); if (!b) return;
    await api(`/api/boletos/${b.id}`, { method: 'PUT', body: JSON.stringify({ ...b, status: b.status === 'pago' ? 'pendente' : 'pago' }) });
    return loadAll();
  }
});

// ---------- Filtros ----------
$('status-tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.stab'); if (!t) return;
  document.querySelectorAll('.stab').forEach((x) => x.classList.remove('is-active'));
  t.classList.add('is-active'); filters.status = t.dataset.s; renderTable();
});
$('type-tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.ttab'); if (!t) return;
  document.querySelectorAll('.ttab').forEach((x) => x.classList.remove('is-active'));
  t.classList.add('is-active'); filters.kind = t.dataset.k; renderTable();
});
$('b-month').addEventListener('change', (e) => { filters.month = e.target.value; renderTable(); });
$('b-empresa').addEventListener('change', (e) => { filters.empresa = e.target.value; renderTable(); });
$('b-dir').addEventListener('change', (e) => { filters.dir = e.target.value; renderTable(); });
$('b-nf').addEventListener('input', (e) => { filters.nf = e.target.value.trim(); renderTable(); });
$('b-dia').addEventListener('input', (e) => { filters.dia = e.target.value.trim(); renderTable(); });
$('b-forn').addEventListener('change', (e) => { filters.forn = e.target.value; renderTable(); });
$('b-banco').addEventListener('change', (e) => { filters.banco = e.target.value; renderTable(); });
$('b-cartao').addEventListener('change', (e) => { filters.cartao = e.target.value; renderTable(); });

// ---------- Cadastrar fornecedor / categoria ----------
async function addListItem(type, label) {
  const name = prompt(`Nome do(a) ${label}:`);
  if (!name || !name.trim()) return;
  try { await api('/api/lists', { method: 'POST', body: JSON.stringify({ type, name: name.trim() }) }); await loadAll(); }
  catch (err) { alert(err.message); }
}
$('add-fornecedor').addEventListener('click', () => addListItem('supplier', 'fornecedor'));
$('add-categoria').addEventListener('click', () => addListItem('category', 'categoria'));

// ---------- Init ----------
exportButtons($('export-box'), () => ({
  filename: 'boletos-dividas',
  title: 'Boletos & Dívidas',
  subtitle: 'FinanceEcom Free',
  headers: ['Vencimento', 'Tipo', 'Descrição', 'Fornecedor', 'Empresa', 'NF', 'Direção', 'Valor', 'Status'],
  rows: boletos.map((b) => [b.due_date, KIND_LABEL[b.kind] || 'Boleto', b.name, b.supplier || '', b.empresa || '', b.numero_nf || '', b.direction, +b.value, b.status]),
}));

// ---------- Alerta diário por e-mail ----------
async function loadAlert() {
  try {
    const { alert } = await api('/api/boleto-alert');
    $('alert-email').value = alert.email || '';
    $('alert-hour').value = alert.hour ?? 8;
    $('alert-enabled').checked = !!alert.enabled;
  } catch (_) {}
}
$('alert-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('alert-msg'); msg.textContent = ''; msg.className = 'form-msg';
  try {
    await api('/api/boleto-alert', { method: 'PUT', body: JSON.stringify({ email: $('alert-email').value.trim(), hour: +$('alert-hour').value, enabled: $('alert-enabled').checked }) });
    msg.textContent = 'Alerta salvo!'; msg.classList.add('ok');
  } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
});
$('alert-test').addEventListener('click', async () => {
  const msg = $('alert-msg'); msg.textContent = 'Enviando...'; msg.className = 'form-msg';
  try {
    await api('/api/boleto-alert/test', { method: 'POST', body: JSON.stringify({ email: $('alert-email').value.trim() }) });
    msg.textContent = 'E-mail de teste enviado! Confira a caixa (e o spam).'; msg.classList.add('ok');
  } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
});

(async () => {
  const session = await initShell('boletos');
  if (!session) return;
  $('boleto-form').due_date.value = todayStr();
  await loadAll();
  loadAlert();
})();
