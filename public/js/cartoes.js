// ===========================================================================
// Cartões de Crédito
// ===========================================================================
const $ = (id) => document.getElementById(id);
let cards = [];
let parcelas = [];
let stores = [];
let editingCard = null;

const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toLocaleDateString('en-CA');
const mesLabel = (ym) => { const [y, m] = ym.split('-'); return `${m}/${y}`; };
const cardName = (id) => (cards.find((c) => c.id === id) || {}).name || '—';

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

// tabs
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x === t));
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
  if (t.dataset.tab === 'faturas') loadFaturas();
}));

async function loadAll() {
  const [c, p, st] = await Promise.all([api('/api/cards'), api('/api/parcelas'), api('/api/stores')]);
  cards = c.cards || []; parcelas = p.parcelas || []; stores = st.stores || [];
  const cardOpts = `<option value="">%L%</option>` + cards.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('compra-card').innerHTML = cardOpts.replace('%L%', 'Selecione');
  $('filter-card').innerHTML = cardOpts.replace('%L%', 'Todos');
  $('compra-empresa').innerHTML = `<option value="">Sem empresa</option>` + stores.map((s) => `<option>${esc(s.name)}</option>`).join('');
  renderCards();
  renderParcelas();
}

// ---------- Cartões ----------
function renderCards() {
  const tb = document.querySelector('#cards-table tbody');
  if (cards.length === 0) { tb.innerHTML = `<tr><td colspan="5" class="empty">Nenhum cartão cadastrado.</td></tr>`; return; }
  tb.innerHTML = cards.map((c) => `<tr>
    <td><span class="dot" style="background:${c.color || '#6b46c1'}"></span><b>${esc(c.name)}</b></td>
    <td>dia ${c.closing_day}</td><td>dia ${c.due_day}</td>
    <td>${c.card_limit ? money(c.card_limit) : '—'}</td>
    <td><button class="btn-del" data-edit="${c.id}">✏️</button><button class="btn-del" data-del="${c.id}">🗑</button></td>
  </tr>`).join('');
}

$('card-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('card-msg'); msg.textContent = ''; msg.className = 'form-msg';
  const f = e.target;
  const payload = { name: f.name.value.trim(), closing_day: +f.closing_day.value, due_day: +f.due_day.value, card_limit: +f.card_limit.value || 0, color: f.color.value };
  try {
    if (editingCard) await api(`/api/cards/${editingCard}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api('/api/cards', { method: 'POST', body: JSON.stringify(payload) });
    f.reset(); f.closing_day.value = 1; f.due_day.value = 10; f.color.value = '#6b46c1';
    editingCard = null; $('save-card').textContent = '+ Cadastrar cartão'; $('card-cancel').hidden = true;
    await loadAll(); msg.textContent = 'Cartão salvo!'; msg.classList.add('ok');
  } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
});
$('card-cancel').addEventListener('click', () => { editingCard = null; $('card-form').reset(); $('save-card').textContent = '+ Cadastrar cartão'; $('card-cancel').hidden = true; });
document.querySelector('#cards-table tbody').addEventListener('click', async (e) => {
  const ed = e.target.closest('[data-edit]'); const dl = e.target.closest('[data-del]');
  if (ed) { const c = cards.find((x) => x.id === ed.dataset.edit); if (!c) return; const f = $('card-form'); f.name.value = c.name; f.closing_day.value = c.closing_day; f.due_day.value = c.due_day; f.card_limit.value = c.card_limit || ''; f.color.value = c.color || '#6b46c1'; editingCard = c.id; $('save-card').textContent = 'Salvar alterações'; $('card-cancel').hidden = false; window.scrollTo({ top: 0, behavior: 'smooth' }); }
  if (dl) { if (!confirm('Excluir este cartão e suas parcelas?')) return; await api(`/api/cards/${dl.dataset.del}`, { method: 'DELETE' }); loadAll(); }
});

// ---------- Compra parcelada ----------
$('compra-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('compra-msg'); msg.textContent = ''; msg.className = 'form-msg';
  const f = e.target;
  const payload = { cartao_id: f.cartao_id.value, description: f.description.value.trim(), empresa: f.empresa.value, value: +f.value.value, installments: +f.installments.value, purchase_date: f.purchase_date.value };
  try {
    const r = await api('/api/parcelas/purchase', { method: 'POST', body: JSON.stringify(payload) });
    f.reset(); f.installments.value = 1; f.purchase_date.value = todayStr();
    await loadAll(); msg.textContent = `Compra lançada em ${r.count} parcela(s)!`; msg.classList.add('ok');
  } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
});

// ---------- Parcelas ----------
function renderParcelas() {
  const filter = $('filter-card').value;
  const rows = parcelas.filter((p) => !filter || p.cartao_id === filter).sort((a, b) => a.fatura_mes.localeCompare(b.fatura_mes));
  const tb = document.querySelector('#parcelas-table tbody');
  if (rows.length === 0) { tb.innerHTML = `<tr><td colspan="8" class="empty">Nenhuma parcela.</td></tr>`; return; }
  tb.innerHTML = rows.map((p) => `<tr>
    <td>${esc(p.description)}</td><td>${esc(p.empresa || '—')}</td><td>${esc(cardName(p.cartao_id))}</td>
    <td>${p.installment_no}/${p.installments_total}</td><td>${mesLabel(p.fatura_mes)}</td>
    <td>${money(p.value)}</td>
    <td>${p.status === 'pago' ? '<span class="pill pill-pago">Pago</span>' : '<span class="pill pill-pend">Pendente</span>'}</td>
    <td>${p.status === 'pendente' ? `<button class="btn-del" data-del="${p.id}" title="Excluir">🗑</button>` : ''}</td>
  </tr>`).join('');
}
$('filter-card').addEventListener('change', renderParcelas);
document.querySelector('#parcelas-table tbody').addEventListener('click', async (e) => {
  const dl = e.target.closest('[data-del]'); if (!dl) return;
  if (!confirm('Excluir esta parcela?')) return;
  await api(`/api/parcelas/${dl.dataset.del}`, { method: 'DELETE' }); loadAll();
});

// ---------- Faturas ----------
async function loadFaturas() {
  const [f, pg] = await Promise.all([api('/api/faturas'), api('/api/fatura-pagamentos')]);
  const faturas = f.faturas || [];
  const el = $('faturas-list');
  el.innerHTML = faturas.length === 0 ? '<p class="muted">Nenhuma fatura em aberto.</p>' : faturas.map((ft) => `
    <div class="card fatura-card">
      <h4>💳 ${esc(ft.cartao)}</h4>
      <p class="muted">Fatura ${mesLabel(ft.fatura_mes)} · ${ft.count} parcela(s)</p>
      <div class="fatura-total">${money(ft.total)}</div>
      <button class="btn-add-sale pay-fatura" data-card="${ft.cartao_id}" data-mes="${ft.fatura_mes}" data-total="${ft.total}" data-cardname="${esc(ft.cartao)}">Pagar Fatura</button>
    </div>`).join('');

  const tb = document.querySelector('#pagtos-table tbody');
  const pags = pg.pagamentos || [];
  tb.innerHTML = pags.length === 0 ? `<tr><td colspan="5" class="empty">Nenhum pagamento.</td></tr>` : pags.map((p) => {
    const [y, m, d] = p.data_pagamento.split('-');
    return `<tr><td>${d}/${m}/${y}</td><td>${esc(cardName(p.cartao_id))}</td><td>${mesLabel(p.fatura_mes)}</td><td>${p.parcelas_count}</td><td><b>${money(p.valor_pago)}</b></td></tr>`;
  }).join('');
}

$('faturas-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('.pay-fatura'); if (!btn) return;
  const total = money(+btn.dataset.total);
  if (!confirm(`Pagar a fatura ${mesLabel(btn.dataset.mes)} do ${btn.dataset.cardname} (${total})?\nAs parcelas serão agrupadas por empresa no Fluxo de Caixa.`)) return;
  const data = prompt('Data do pagamento (AAAA-MM-DD):', todayStr());
  if (!data) return;
  try {
    const r = await api('/api/faturas/pay', { method: 'POST', body: JSON.stringify({ cartao_id: btn.dataset.card, fatura_mes: btn.dataset.mes, data_pagamento: data }) });
    alert(`✓ Fatura paga: ${r.parcelas} parcelas, ${r.lancamentos} lançamento(s) no Fluxo de Caixa.`);
    await loadAll(); loadFaturas();
  } catch (err) { alert(err.message); }
});

// ---------- Init ----------
(async () => {
  const session = await initShell('cartoes');
  if (!session) return;
  $('compra-form').purchase_date.value = todayStr();
  await loadAll();
})();
