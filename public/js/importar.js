// ===========================================================================
// Lançamento Mercado Turbo — importação de CSV
// ===========================================================================
const $ = (id) => document.getElementById(id);
let stores = [];
let parsed = null; // { account, orders, revenue, cmv, tax, fee, freight, qty }

const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const todayStr = () => new Date().toLocaleDateString('en-CA');
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

// ---------- Número no formato brasileiro (R$ 1.234,56) ----------
function parseNum(v) {
  if (v == null) return 0;
  let s = String(v).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // milhar . / decimal ,
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ---------- Parser de CSV (detecta ; ou ,) ----------
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.indexOf('\n'));
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignora */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------- Localiza coluna por palavras-chave ----------
function findCol(headers, matchers) {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]);
    if (matchers(h)) return i;
  }
  return -1;
}

function aggregate(rows) {
  const headers = rows[0];
  const col = {
    account: findCol(headers, (h) => h.includes('conta')),
    revenue: findCol(headers, (h) => h.includes('fatur') || (h.includes('receita'))),
    cmv: findCol(headers, (h) => h.includes('custo') && !h.includes('frete')),
    tax: findCol(headers, (h) => h.includes('imposto')),
    fee: findCol(headers, (h) => h.includes('tarifa') || h.includes('taxa')),
    freight: findCol(headers, (h) => h.includes('frete') && h.includes('vendedor')),
    qty: findCol(headers, (h) => h.includes('qtd') || h.includes('quantidade')),
    order: findCol(headers, (h) => h.includes('id da venda') || h.includes('id do carrinho')),
  };
  const body = rows.slice(1);
  let revenue = 0, cmv = 0, tax = 0, fee = 0, freight = 0, qty = 0;
  const accounts = {}, orderSet = new Set();
  for (const r of body) {
    revenue += col.revenue >= 0 ? parseNum(r[col.revenue]) : 0;
    cmv += col.cmv >= 0 ? parseNum(r[col.cmv]) : 0;
    tax += col.tax >= 0 ? parseNum(r[col.tax]) : 0;
    fee += col.fee >= 0 ? parseNum(r[col.fee]) : 0;
    freight += col.freight >= 0 ? parseNum(r[col.freight]) : 0;
    qty += col.qty >= 0 ? parseNum(r[col.qty]) : 0;
    if (col.account >= 0) { const a = (r[col.account] || '').trim(); if (a) accounts[a] = (accounts[a] || 0) + 1; }
    if (col.order >= 0) { const o = (r[col.order] || '').trim(); if (o) orderSet.add(o); }
  }
  const account = Object.keys(accounts).sort((a, b) => accounts[b] - accounts[a])[0] || '';
  const orders = orderSet.size || body.length;
  return { account, orders, revenue, cmv, tax, fee, freight, qty: qty || orders };
}

// ---------- Fluxo de UI ----------
function refreshEnabled() {
  const hasStore = !!$('store-sel').value;
  $('pick-file').disabled = !hasStore;
  $('dropzone').classList.toggle('disabled', !hasStore);
  $('upload-hint').textContent = hasStore
    ? 'Arraste o CSV do Mercado Turbo ou clique para selecionar.'
    : 'Selecione a empresa antes de importar a planilha.';
}

function renderPreview() {
  const s = parsed;
  $('preview-step').hidden = false;
  const rows = [
    ['Empresa', storeName($('store-sel').value)],
    ['Conta na planilha', s.account || '—'],
    ['Pedidos', s.orders],
    ['Receita', money(s.revenue)],
    ['COGS (custo)', money(s.cmv)],
    ['Imposto', money(s.tax)],
    ['Taxas', money(s.fee)],
    ['Frete Subsidiado', money(s.freight)],
  ];
  $('summary').innerHTML = rows.map(([k, v]) => `<div class="sum-row"><span>${k}</span><b>${v}</b></div>`).join('');

  // Validação de conta x empresa
  const storeNm = norm(storeName($('store-sel').value));
  const acc = norm(s.account);
  const warn = $('account-warn');
  if (acc && storeNm && !acc.includes(storeNm) && !storeNm.includes(acc)) {
    warn.hidden = false;
    warn.innerHTML = `⚠️ A conta da planilha (<b>${s.account}</b>) parece diferente da empresa selecionada (<b>${storeName($('store-sel').value)}</b>).
      <label class="warn-check"><input type="checkbox" id="force-account" /> Confirmo que é a empresa correta</label>`;
    $('force-account').addEventListener('change', validateProcess);
  } else { warn.hidden = true; }
  validateProcess();
  $('preview-step').scrollIntoView({ behavior: 'smooth' });
}

function validateProcess() {
  const warn = $('account-warn');
  const needForce = !warn.hidden;
  const forced = needForce ? $('force-account')?.checked : true;
  $('process-btn').disabled = !(parsed && parsed.orders > 0 && forced);
}

const storeName = (id) => (stores.find((s) => s.id === id) || {}).name || '—';

async function handleFile(file) {
  if (!file) return;
  $('file-name').textContent = file.name;
  const text = await file.text();
  const rows = parseCSV(text);
  if (rows.length < 2) { alert('CSV vazio ou inválido.'); return; }
  parsed = aggregate(rows);
  if (parsed.revenue <= 0) { alert('Não foi possível ler a receita da planilha. Verifique o arquivo.'); return; }
  renderPreview();
}

// ---------- Gravação ----------
$('process-btn')?.addEventListener('click', async () => {
  const msg = $('process-msg'); msg.textContent = ''; msg.className = 'form-msg';
  const storeId = $('store-sel').value;
  const date = $('import-date').value || todayStr();
  const ads = Number($('ads-input').value) || 0;
  const payload = {
    date, store_id: storeId,
    qty: Math.round(parsed.qty), revenue: parsed.revenue, fee_mp: parsed.fee,
    freight: parsed.freight, cmv: parsed.cmv, ads_ml: ads, tax: parsed.tax,
  };
  $('process-btn').disabled = true;
  try {
    await api('/api/sales', { method: 'POST', body: JSON.stringify(payload) });
    await api('/api/imports', { method: 'POST', body: JSON.stringify({ date, store_id: storeId, orders: parsed.orders, revenue: parsed.revenue }) }).catch(() => {});
    showSuccess(parsed.orders, parsed.revenue, storeName(storeId));
    loadHistory();
  } catch (err) {
    if (/ja existe|já existe/i.test(err.message)) msg.textContent = 'Já existe lançamento para esta data e empresa. Escolha outra data ou edite no Lançamento Manual.';
    else msg.textContent = err.message;
    msg.classList.add('err');
    $('process-btn').disabled = false;
  }
});

function showSuccess(orders, revenue, empresa) {
  $('preview-step').hidden = true;
  $('success-box').hidden = false;
  $('success-body').innerHTML = `<h3>${orders} pedidos importados</h3>
    <div class="turbo-summary">
      <div class="sum-row"><span>Receita</span><b>${money(revenue)}</b></div>
      <div class="sum-row"><span>Empresa</span><b>${empresa}</b></div>
    </div>`;
  $('success-box').scrollIntoView({ behavior: 'smooth' });
}

$('new-import')?.addEventListener('click', () => location.reload());

// ---------- Histórico ----------
async function loadHistory() {
  try {
    const { imports } = await api('/api/imports');
    const tb = document.querySelector('#history-table tbody');
    if (!imports || imports.length === 0) { tb.innerHTML = `<tr><td colspan="5" class="empty">Nenhuma importação ainda.</td></tr>`; return; }
    tb.innerHTML = imports.map((i) => {
      const [y, m, d] = i.date.split('-');
      return `<tr><td>${d}/${m}/${y}</td><td>${storeName(i.store_id)}</td><td>${i.orders}</td><td>${money(i.revenue)}</td><td><span class="badge-ok">Concluído</span></td></tr>`;
    }).join('');
  } catch (_) {}
}

// ---------- Eventos ----------
$('store-sel').addEventListener('change', refreshEnabled);
$('pick-file').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (e) => handleFile(e.target.files[0]));
$('ads-input')?.addEventListener('input', validateProcess);

const dz = $('dropzone');
['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); if (!dz.classList.contains('disabled')) dz.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', (e) => { if (dz.classList.contains('disabled')) return; handleFile(e.dataTransfer.files[0]); });

// ---------- Init ----------
(async () => {
  const session = await initShell('turbo');
  if (!session) return;
  $('import-date').value = todayStr();
  const { stores: st } = await api('/api/stores');
  stores = st || [];
  $('store-sel').innerHTML = `<option value="">Selecione a empresa</option>` +
    stores.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  refreshEnabled();
  loadHistory();
})();
