// ===========================================================================
// Despesas & DRE Integrado
// ===========================================================================
const $ = (id) => document.getElementById(id);
let curMonthSel = '';
let editingExp = null;
const todayStr = () => new Date().toLocaleDateString('en-CA');

function selectedMonth() { return `${$('sel-year').value}-${String(+$('sel-month').value).padStart(2, '0')}`; }

// Moeda compacta para a mini-tabela (cabe no sidebar estreito)
function moneyK(v) {
  const n = Number(v) || 0, a = Math.abs(n);
  if (a >= 1000) return (n < 0 ? '-' : '') + 'R$' + (a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  return money(n);
}

// tabs
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x === t));
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
  if (t.dataset.tab === 'be') renderBreakEven();
}));

async function refresh() {
  await loadFinance();
  curMonthSel = selectedMonth();
  renderExpenses();
  renderMiniDre();
  renderDonut();
  renderDetail();
  if (!$('be-content').closest('[hidden]')) renderBreakEven();
}

// ---------- Tabela de despesas ----------
function renderExpenses() {
  const exps = expensesForMonth(curMonthSel).sort((a, b) => a.type.localeCompare(b.type));
  $('lanc-title').textContent = `Lançamentos — ${curMonthSel}`;
  const tb = document.querySelector('#exp-table tbody');
  if (exps.length === 0) { tb.innerHTML = `<tr><td colspan="5" class="empty">Nenhuma despesa neste mês.</td></tr>`; return; }
  tb.innerHTML = exps.map((e) => `<tr>
    <td><b>${escH(e.description)}</b>${e.recurring ? ' <span class="mini-badge proj">Recorrente</span>' : ''}</td>
    <td>${escH(e.category || '—')}</td>
    <td>${e.type === 'fixed' ? '<span class="type-badge">Custo Fixo</span>' : '<span class="type-badge badge-cartao">Operacional</span>'}</td>
    <td class="neg"><b>-${money(e.value)}</b></td>
    <td><button class="btn-del" data-edit="${e.id}">✏️</button><button class="btn-del" data-del="${e.id}">🗑</button></td>
  </tr>`).join('');
}

// ---------- DRE resumida anual ----------
function renderMiniDre() {
  const year = $('sel-year').value;
  $('dre-year-title').textContent = `DRE Resumida — ${year}`;
  const rows = annualDRE(year);
  $('mini-dre-body').innerHTML = `<tr class="mini-dre-head"><td>Mês</td><td>Entradas</td><td>Custos</td><td>Resultado</td></tr>` +
    rows.map((r) => `<tr class="mini-dre-row ${r.month === curMonthSel ? 'is-cur' : ''}" data-month="${r.i + 1}">
      <td>${r.label}</td>
      <td>${r.hasData ? moneyK(r.receita) : '—'}</td>
      <td>${r.hasData ? moneyK(r.custosTotais) : '—'}</td>
      <td class="${r.resultado >= 0 ? 'pos' : 'neg'}">${r.hasData ? (r.resultado >= 0 ? '+' : '') + moneyK(r.resultado) : '—'}</td>
    </tr>`).join('');
  const totE = rows.reduce((a, r) => a + r.receita, 0), totC = rows.reduce((a, r) => a + r.custosTotais, 0), totR = totE - totC;
  $('mini-dre-tot').innerHTML = `
    <div><span>Total Entradas</span><b class="pos">${money(totE)}</b></div>
    <div><span>Total Custos</span><b class="neg">${money(totC)}</b></div>
    <div><span>Resultado Acumulado</span><b class="${totR >= 0 ? 'pos' : 'neg'}">${money(totR)}</b></div>`;
}
$('mini-dre-body').addEventListener('click', (e) => {
  const tr = e.target.closest('[data-month]'); if (!tr) return;
  $('sel-month').value = tr.dataset.month; refresh();
});

// ---------- Donut de despesas por categoria ----------
function renderDonut() {
  const exps = expensesForMonth(curMonthSel);
  const byCat = {};
  for (const e of exps) { const k = e.category || 'Sem categoria'; byCat[k] = (byCat[k] || 0) + (+e.value); }
  const items = Object.entries(byCat).map(([label, value]) => ({ label, value }));
  donutChart($('exp-donut'), items);
}

// ---------- DRE detalhada ----------
function renderDetail() {
  const d = dreForMonth(curMonthSel);
  const line = (label, val, pct, neg = true) => `<div class="dre-line"><span>${label}</span><span class="dre-pct">${pct.toFixed(1)}%</span><span class="${neg ? 'neg' : ''}">${neg ? '(' + money(val) + ')' : money(val)}</span></div>`;
  const pctOf = (v) => d.receita > 0 ? (v / d.receita) * 100 : 0;
  const mcH = healthBadge(d.mcPct), luH = healthBadge(d.lucroPct);
  let html = `<div class="dre-block"><h4>1. Receita</h4>${line('Receita Bruta', d.receita, 100, false)}</div>`;
  html += `<div class="dre-block"><h4>2. Custos Operacionais (variáveis)</h4>`;
  for (const c of VAR_COSTS) html += line(c.label, d.custos[c.key], pctOf(d.custos[c.key]));
  html += `<div class="dre-line dre-sub"><span>= Margem de Contribuição</span><span class="dre-pct ${mcH.cls}">${d.mcPct.toFixed(1)}% · ${mcH.label}</span><span class="${d.mc >= 0 ? 'pos' : 'neg'}">${money(d.mc)}</span></div></div>`;
  html += `<div class="dre-block"><h4>3. Despesas</h4>`;
  const exps = expensesForMonth(curMonthSel);
  if (exps.length === 0) html += `<div class="dre-line"><span class="muted">Nenhuma despesa cadastrada</span><span></span><span></span></div>`;
  else exps.forEach((e) => { html += line(e.description, e.value, pctOf(e.value)); });
  html += `<div class="dre-line dre-sub"><span>Total Despesas</span><span class="dre-pct">${pctOf(d.despesas).toFixed(1)}%</span><span class="neg">(${money(d.despesas)})</span></div></div>`;
  html += `<div class="dre-line dre-final"><span>= Lucro Líquido</span><span class="dre-pct ${luH.cls}">${d.lucroPct.toFixed(1)}% · ${luH.label}</span><span class="${d.lucro >= 0 ? 'pos' : 'neg'}">${money(d.lucro)}</span></div>`;
  $('dre-detail').innerHTML = html;
}

// ---------- Ponto de Equilíbrio ----------
function renderBreakEven() {
  const be = breakEven(curMonthSel);
  const pct = Math.min(be.pctAtingido, 100);
  const barCls = be.pctAtingido >= 100 ? 'bar-ok' : be.pctAtingido >= 80 ? 'bar-warn' : 'bar-danger';
  const kpi = (l, v, sub = '', cls = '') => `<div class="stat-card"><span class="stat-label">${l}</span><span class="stat-value ${cls}" style="font-size:1.5rem">${v}</span>${sub ? `<span class="muted">${sub}</span>` : ''}</div>`;
  $('be-content').innerHTML = `
    <div class="card be-premium">
      <div class="be-head">
        <div><span class="stat-label">Ponto de Equilíbrio (${curMonthSel})</span><div class="be-value">${money(be.pe)}</div></div>
        <span class="health-overall ${be.status.cls === 'c-ok' ? 'ok' : 'warn'}">${be.status.label} · ${be.pctAtingido.toFixed(1)}%</span>
      </div>
      <div class="goal-bar"><div class="goal-bar-fill ${barCls}" style="width:${pct}%"></div></div>
      <p class="muted">${be.faltaOuUltrapassa >= 0
        ? `Você já ultrapassou o ponto de equilíbrio em <b class="pos">${money(be.faltaOuUltrapassa)}</b> (lucro).`
        : `Faltam <b class="neg">${money(-be.faltaOuUltrapassa)}</b> de faturamento para cobrir os custos fixos.`}
        · Média diária necessária: <b>${money(be.mediaDiaria)}</b></p>
    </div>
    <div class="stats-grid" style="margin-top:16px">
      ${kpi('Faturamento atual', money(be.receita))}
      ${kpi('Margem de contribuição', money(be.mc), be.mcPct.toFixed(1) + '%')}
      ${kpi('Custos fixos', money(be.custosFixos))}
      ${kpi('Custos variáveis', money(be.custosVar))}
    </div>
    <div class="card" style="margin-top:16px">
      <h4>Como é calculado</h4>
      <p class="muted">Margem de Contribuição % = (Receita − Custos Variáveis) ÷ Receita<br>
      Ponto de Equilíbrio = Custos Fixos ÷ Margem de Contribuição %<br>
      Com margem de <b>${be.mcPct.toFixed(1)}%</b> e custos fixos de <b>${money(be.custosFixos)}</b>, você precisa faturar <b>${money(be.pe)}</b> para não ter prejuízo.</p>
    </div>`;
}

// ---------- Form ----------
$('tipo-select').addEventListener('click', (e) => {
  const b = e.target.closest('.status-btn'); if (!b) return;
  document.querySelectorAll('#tipo-select .status-btn').forEach((x) => x.classList.remove('is-active'));
  b.classList.add('is-active'); $('exp-form').type.value = b.dataset.t;
});
$('exp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('exp-msg'); msg.textContent = ''; msg.className = 'form-msg';
  const f = e.target;
  const payload = { date: f.date.value, description: f.description.value.trim(), category: f.category.value.trim(), type: f.type.value, value: +f.value.value, recurring: f.recurring.checked };
  try {
    if (editingExp) await dreApi(`/api/expenses/${editingExp}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await dreApi('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });
    f.reset(); f.date.value = todayStr(); f.type.value = 'fixed';
    document.querySelectorAll('#tipo-select .status-btn').forEach((x) => x.classList.toggle('is-active', x.dataset.t === 'fixed'));
    editingExp = null; $('save-exp').textContent = '+ Cadastrar'; $('exp-cancel').hidden = true;
    await refresh(); msg.textContent = 'Despesa salva!'; msg.classList.add('ok');
  } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
});
$('exp-cancel').addEventListener('click', () => { editingExp = null; $('exp-form').reset(); $('exp-form').date.value = todayStr(); $('save-exp').textContent = '+ Cadastrar'; $('exp-cancel').hidden = true; });
document.querySelector('#exp-table tbody').addEventListener('click', async (e) => {
  const ed = e.target.closest('[data-edit]'); const dl = e.target.closest('[data-del]');
  if (ed) { const x = financeData.expenses.find((v) => v.id === ed.dataset.edit); if (!x) return; const f = $('exp-form'); f.date.value = x.date; f.description.value = x.description; f.category.value = x.category || ''; f.value.value = x.value; f.recurring.checked = x.recurring; f.type.value = x.type; document.querySelectorAll('#tipo-select .status-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.t === x.type)); editingExp = x.id; $('save-exp').textContent = 'Salvar alterações'; $('exp-cancel').hidden = false; window.scrollTo({ top: 0, behavior: 'smooth' }); }
  if (dl) { if (!confirm('Excluir esta despesa?')) return; await dreApi(`/api/expenses/${dl.dataset.del}`, { method: 'DELETE' }); refresh(); }
});

$('sel-month').addEventListener('change', refresh);
$('sel-year').addEventListener('change', refresh);

// ---------- Init ----------
(async () => {
  const session = await initShell('despesas');
  if (!session) return;
  const now = new Date();
  $('sel-month').innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
  const yr = now.getFullYear();
  $('sel-year').innerHTML = [yr - 1, yr, yr + 1].map((y) => `<option ${y === yr ? 'selected' : ''}>${y}</option>`).join('');
  $('exp-form').date.value = todayStr();
  await refresh();
})();
