// ===========================================================================
// DRE — Demonstração de Resultado
// ===========================================================================
const $ = (id) => document.getElementById(id);
function selMonth() { return `${$('sel-year').value}-${String(+$('sel-month').value).padStart(2, '0')}`; }

function setLoading(on) {
  const b = document.getElementById('loadbar');
  if (b) b.classList.toggle('active', on);
}

// Contagem animada dos números (count-up)
function animateCounts(nodes) {
  nodes.forEach((el) => {
    const txt = el.textContent.trim();
    if (!/\d/.test(txt)) return;
    const isPct = txt.includes('%');
    const isMoney = txt.includes('R$');
    let num = parseFloat(txt.replace(/[^\d,-]/g, '').replace(',', '.'));
    if (isNaN(num)) return;
    const fmt = (v) => isMoney
      ? (v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : isPct ? v.toFixed(1) + '%' : Math.round(v).toLocaleString('pt-BR');
    const dur = 650, start = performance.now();
    function step(t) {
      const p = Math.min((t - start) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(num * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

async function refresh() {
  setLoading(true);
  await loadFinance();
  renderGrid();
  renderCards();
  renderTrend();
  renderReport();
  renderHistory();
  setLoading(false);
  animateCounts(document.querySelectorAll('#dre-cards .stat-value, #dre-annual-tot b'));
}

function renderTrend() {
  const rows = annualDRE($('sel-year').value);
  trendChart($('dre-trend'), [
    { name: 'Receita', color: '#1e6fff', values: rows.map((r) => r.receita) },
    { name: 'Lucro', color: '#17915f', values: rows.map((r) => r.resultado) },
  ], MONTHS);
}

// ---------- Grade anual ----------
function renderGrid() {
  const year = $('sel-year').value;
  $('year-lbl').textContent = year;
  $('dre-mes-lbl').textContent = selMonth();
  const rows = annualDRE(year);
  $('dre-grid').innerHTML = rows.map((r) => {
    const cls = !r.hasData ? 'nd' : r.resultado >= 0 ? 'pos-bg' : 'neg-bg';
    const cur = r.month === selMonth() ? 'is-cur' : '';
    return `<div class="dre-cell ${cls} ${cur}" data-month="${r.i + 1}">
      <span class="dre-cell-m">${r.label}</span>
      <span class="dre-cell-r">${r.hasData ? money(r.receita) : '—'}</span>
      <span class="dre-cell-l ${r.resultado >= 0 ? 'pos' : 'neg'}">${r.hasData ? (r.resultado >= 0 ? '+' : '') + money(r.resultado) : ''}</span>
    </div>`;
  }).join('');
  const totE = rows.reduce((a, r) => a + r.receita, 0), totC = rows.reduce((a, r) => a + r.custosTotais, 0), totR = totE - totC;
  $('dre-annual-tot').innerHTML = `
    <div><span class="muted">Receita anual</span><b>${money(totE)}</b></div>
    <div><span class="muted">Custos totais</span><b class="neg">${money(totC)}</b></div>
    <div><span class="muted">Lucro acumulado</span><b class="${totR >= 0 ? 'pos' : 'neg'}">${money(totR)}</b></div>`;
}
$('dre-grid').addEventListener('click', (e) => { const c = e.target.closest('[data-month]'); if (!c) return; $('sel-month').value = c.dataset.month; refresh(); });

// ---------- Cards comparativos ----------
function prevMonth(m) { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function variacao(cur, prev) { if (!prev) return null; return ((cur - prev) / Math.abs(prev)) * 100; }

function renderCards() {
  const m = selMonth();
  const d = dreForMonth(m), p = dreForMonth(prevMonth(m));
  const card = (label, val, sub, varPct, cls = '') => {
    const arrow = varPct == null ? '' : (varPct >= 0 ? `<span class="pos">▲ ${Math.abs(varPct).toFixed(1)}%</span>` : `<span class="neg">▼ ${Math.abs(varPct).toFixed(1)}%</span>`);
    return `<div class="stat-card"><span class="stat-label">${label}</span><span class="stat-value ${cls}" style="font-size:1.5rem">${val}</span><span class="muted">${sub} ${arrow}</span></div>`;
  };
  const mcH = healthBadge(d.mcPct), luH = healthBadge(d.lucroPct);
  $('dre-cards').innerHTML =
    card('Receita Total', money(d.receita), 'vs mês ant.', variacao(d.receita, p.receita)) +
    card('Saída Total', money(d.custosTotais), 'custos+despesas', variacao(d.custosTotais, p.custosTotais), 'neg') +
    card('Margem Contrib.', money(d.mc), `${d.mcPct.toFixed(1)}% · ${mcH.label}`, variacao(d.mc, p.mc), mcH.cls) +
    card('Lucro Líquido', money(d.lucro), `${d.lucroPct.toFixed(1)}% · ${luH.label}`, variacao(d.lucro, p.lucro), luH.cls);
}

// ---------- DRE completo ----------
function renderReport() {
  const d = dreForMonth(selMonth());
  const pctOf = (v) => d.receita > 0 ? (v / d.receita) * 100 : 0;
  const line = (label, val, pct, neg = true, bold = false) => `<div class="dre-line ${bold ? 'dre-sub' : ''}"><span>${label}</span><span class="dre-pct">${pct.toFixed(1)}%</span><span class="${neg ? 'neg' : (val >= 0 ? 'pos' : 'neg')}">${neg ? '(' + money(val) + ')' : money(val)}</span></div>`;
  let html = `<div class="dre-block"><h4>1. Receita</h4>${line('Receita Bruta', d.receita, 100, false)}</div>`;
  html += `<div class="dre-block"><h4>2. Custos Operacionais</h4>`;
  for (const c of VAR_COSTS) html += line(c.label, d.custos[c.key], pctOf(d.custos[c.key]));
  html += line('= Margem de Contribuição', d.mc, d.mcPct, false, true) + '</div>';
  html += `<div class="dre-block"><h4>3. Despesas</h4>`;
  if (d.expenses.length === 0) html += `<div class="dre-line"><span class="muted">Sem despesas</span><span></span><span></span></div>`;
  else d.expenses.forEach((e) => { html += line(e.description, e.value, pctOf(e.value)); });
  html += line('Total Despesas', d.despesas, pctOf(d.despesas)) + '</div>';
  html += `<div class="dre-line dre-final"><span>= Lucro Líquido</span><span class="dre-pct">${d.lucroPct.toFixed(1)}%</span><span class="${d.lucro >= 0 ? 'pos' : 'neg'}">${money(d.lucro)}</span></div>`;
  $('dre-lines').innerHTML = html;

  // Composição da receita
  const parts = [
    ...VAR_COSTS.map((c, i) => ({ label: c.label, val: d.custos[c.key], color: ['#d64545', '#e0873a', '#e0b02e', '#c0b02e', '#8e6bc1'][i] })),
    { label: 'Despesas', val: d.despesas, color: '#8895a7' },
    { label: 'Lucro', val: Math.max(d.lucro, 0), color: '#2bb37e' },
  ].filter((p) => p.val > 0);
  const totalComp = parts.reduce((a, p) => a + p.val, 0) || 1;
  $('dre-composition').innerHTML = `<h4>Composição da Receita</h4>` + (d.receita > 0 ? parts.map((p) =>
    `<div class="comp-row"><span>${p.label}</span><div class="comp-bar"><div style="width:${(p.val / totalComp) * 100}%;background:${p.color}"></div></div><span>${money(p.val)}</span></div>`).join('')
    : '<p class="muted">Sem dados no período.</p>') +
    `<div class="dre-kpis"><div><span class="muted">Total Custos</span><b class="neg">${money(d.custosTotais)}</b></div><div><span class="muted">Resultado</span><b class="${d.lucro >= 0 ? 'pos' : 'neg'}">${money(d.lucro)}</b></div></div>`;
}

// ---------- Histórico ----------
function renderHistory() {
  const rows = annualDRE($('sel-year').value).filter((r) => r.hasData);
  const tb = document.querySelector('#dre-history tbody');
  if (rows.length === 0) { tb.innerHTML = `<tr><td colspan="6" class="empty">Sem dados no ano.</td></tr>`; return; }
  tb.innerHTML = rows.map((r) => {
    const h = healthBadge(r.lucroPct);
    return `<tr data-month="${r.i + 1}" style="cursor:pointer">
      <td><b>${r.label}</b></td><td>${money(r.receita)}</td><td class="neg">(${money(r.custosTotais)})</td>
      <td class="${r.resultado >= 0 ? 'pos' : 'neg'}">${(r.resultado >= 0 ? '+' : '') + money(r.resultado)}</td>
      <td>${r.lucroPct.toFixed(1)}%</td><td class="${h.cls}">${h.label}</td></tr>`;
  }).join('');
}
document.querySelector('#dre-history tbody').addEventListener('click', (e) => { const tr = e.target.closest('[data-month]'); if (!tr) return; $('sel-month').value = tr.dataset.month; refresh(); });

exportButtons($('export-box'), () => {
  const d = dreForMonth(selMonth());
  const rows = [['Receita Bruta', '100%', d.receita]];
  VAR_COSTS.forEach((c) => rows.push([c.label, ((d.custos[c.key] / (d.receita || 1)) * 100).toFixed(1) + '%', -d.custos[c.key]]));
  rows.push(['= Margem de Contribuição', d.mcPct.toFixed(1) + '%', d.mc]);
  d.expenses.forEach((e) => rows.push([e.description, ((e.value / (d.receita || 1)) * 100).toFixed(1) + '%', -e.value]));
  rows.push(['Total Despesas', ((d.despesas / (d.receita || 1)) * 100).toFixed(1) + '%', -d.despesas]);
  rows.push(['= Lucro Líquido', d.lucroPct.toFixed(1) + '%', d.lucro]);
  return { filename: `dre-${selMonth()}`, title: `DRE ${selMonth()}`, subtitle: 'FinanceEcom Free — Demonstração de Resultado', headers: ['Linha', '%', 'Valor (R$)'], rows };
});

$('sel-month').addEventListener('change', refresh);
$('sel-year').addEventListener('change', refresh);

(async () => {
  const session = await initShell('dre');
  if (!session) return;
  const now = new Date();
  $('sel-month').innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}" ${i === now.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
  const yr = now.getFullYear();
  $('sel-year').innerHTML = [yr - 1, yr, yr + 1].map((y) => `<option ${y === yr ? 'selected' : ''}>${y}</option>`).join('');
  await refresh();
})();
