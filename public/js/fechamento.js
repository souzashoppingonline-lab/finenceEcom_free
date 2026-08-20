// ===========================================================================
// Fechamento Mensal — consolida o resultado de cada mês
// ===========================================================================
const $ = (id) => document.getElementById(id);
const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => (Number(v) || 0).toFixed(1) + '%';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const ST_LABEL = { open: 'Aberto', in_progress: 'Em fechamento', closed: 'Fechado' };

const CHECKLIST = [
  { k: 'vendas', label: 'Vendas do mês conferidas', req: true },
  { k: 'despesas', label: 'Despesas lançadas', req: true },
  { k: 'fluxo', label: 'Fluxo de caixa conciliado', req: true },
  { k: 'boletos', label: 'Boletos pagos/pendentes revisados', req: true },
  { k: 'sku', label: 'Custos por produto (SKU) atualizados', req: true },
  { k: 'dre', label: 'DRE do mês conferido', req: true },
  { k: 'ads', label: 'Investimento em anúncios (Ads) lançado', req: true },
  { k: 'estoque', label: 'Estoque / CMV revisado (opcional)', req: false },
];

let state = { year: new Date().getFullYear(), byMonth: {}, current: null, report: null, tab: 'resumo' };

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

// ---------------------------------------------------------------------------
// Carregamento + render das listas
// ---------------------------------------------------------------------------
async function load() {
  const { closings } = await api(`/api/closing?year=${state.year}`);
  state.byMonth = {};
  (closings || []).forEach((c) => { state.byMonth[c.month] = c; });
  renderSummary();
  renderGrid();
  renderHistory();
}

function renderSummary() {
  const closed = Object.values(state.byMonth).filter((c) => c.status === 'closed');
  const sum = (f) => closed.reduce((a, c) => a + (Number(f(c)) || 0), 0);
  const receita = sum((c) => c.revenue_gross);
  const mc = sum((c) => c.contribution_margin);
  const ll = sum((c) => c.net_profit);
  const vendas = sum((c) => c.total_sales);
  const card = (label, value, sub, cls) => `
    <div class="fc-card">
      <span class="fc-card-lbl">${label}</span>
      <b class="fc-card-val ${cls || ''}">${value}</b>
      ${sub ? `<span class="fc-card-sub">${sub}</span>` : ''}
    </div>`;
  $('fc-summary').innerHTML =
    card('Ano Fiscal', state.year, `${closed.length}/12 meses fechados`) +
    card('Receita Fechada', money(receita), 'somatório dos meses fechados') +
    card('Margem de Contribuição', money(mc), receita ? pct(mc / receita * 100) + ' da receita' : '—') +
    card('Lucro Líquido', money(ll), receita ? pct(ll / receita * 100) + ' da receita' : '—', ll >= 0 ? 'pos' : 'neg') +
    card('Vendas Fechadas', vendas.toLocaleString('pt-BR'), 'unidades');
}

function renderGrid() {
  const now = new Date();
  const cells = MESES.map((nome, i) => {
    const m = i + 1;
    const c = state.byMonth[m];
    const status = c ? c.status : 'open';
    const isFuture = state.year > now.getFullYear() || (state.year === now.getFullYear() && m > now.getMonth() + 1);
    return `<button class="fc-cell st-${status} ${isFuture ? 'is-future' : ''}" data-month="${m}">
      <span class="fc-cell-dot st-${status}"></span>
      <span class="fc-cell-name">${nome}</span>
      <span class="fc-cell-st">${ST_LABEL[status]}</span>
      ${c && c.status === 'closed' ? `<span class="fc-cell-val">${money(c.revenue_gross)}</span>` : ''}
    </button>`;
  }).join('');
  $('fc-grid').innerHTML = cells;
  $('fc-grid').querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => openMonth(Number(b.dataset.month))));
}

function renderHistory() {
  const rows = [];
  for (let m = 12; m >= 1; m--) {
    const c = state.byMonth[m];
    const status = c ? c.status : 'open';
    rows.push(`<div class="fc-hist-row">
      <span class="fc-dot st-${status}"></span>
      <div class="fc-hist-info">
        <b>${MESES_FULL[m - 1]} / ${state.year}</b>
        <span class="muted">${ST_LABEL[status]}${c && c.status === 'closed' ? ' · ' + money(c.revenue_gross) + ' · LL ' + money(c.net_profit) : ''}</span>
      </div>
      <button class="btn-ghost" data-open="${m}">${status === 'closed' ? 'Relatório' : 'Abrir'}</button>
    </div>`);
  }
  $('fc-history').innerHTML = rows.join('');
  $('fc-history').querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openMonth(Number(b.dataset.open))));
}

// ---------------------------------------------------------------------------
// Modal de fechamento
// ---------------------------------------------------------------------------
async function openMonth(month) {
  state.current = month; state.tab = 'resumo';
  $('fc-modal-title').textContent = `Fechamento — ${MESES_FULL[month - 1]} / ${state.year}`;
  $('fc-modal-body').innerHTML = '<p class="muted">Calculando o resultado do mês…</p>';
  $('fc-modal').hidden = false;
  try {
    const { report, closing } = await api(`/api/closing/compute?year=${state.year}&month=${month}`);
    state.report = report;
    state.closing = closing || { status: 'open', checklist: {}, notes: '' };
    renderModal();
  } catch (e) { $('fc-modal-body').innerHTML = `<p class="c-danger">${esc(e.message)}</p>`; }
}

function renderModal() {
  const r = state.report, c = state.closing;
  const status = c.status || 'open';
  const checklist = c.checklist || {};
  const kpi = (l, v, cls) => `<div class="fc-kpi"><span>${l}</span><b class="${cls || ''}">${v}</b></div>`;

  const kpis = `<div class="fc-kpis">
    ${kpi('Receita Bruta', money(r.receita_bruta))}
    ${kpi('Margem de Contribuição', money(r.margem_contrib), r.margem_contrib >= 0 ? 'pos' : 'neg')}
    ${kpi('Fluxo de Caixa', money(r.cash_flow.saldo), r.cash_flow.saldo >= 0 ? 'pos' : 'neg')}
    ${kpi('Boletos Pendentes', money(r.boletos.pend_total), r.boletos.pend_total > 0 ? 'neg' : '')}
  </div>`;

  const reqDone = CHECKLIST.filter((i) => i.req).every((i) => checklist[i.k]);
  const checkHtml = `<div class="fc-check">${CHECKLIST.map((i) => `
    <label class="fc-check-item ${checklist[i.k] ? 'is-on' : ''}">
      <input type="checkbox" data-chk="${i.k}" ${checklist[i.k] ? 'checked' : ''} ${status === 'closed' ? 'disabled' : ''}/>
      <span>${esc(i.label)}${i.req ? ' <em class="fc-req">*</em>' : ''}</span>
    </label>`).join('')}</div>`;

  let actions = '';
  if (status === 'open') actions = `<button class="btn-cadastrar" id="fc-start">Iniciar Fechamento</button>`;
  else if (status === 'in_progress') actions = `<button class="btn-cadastrar" id="fc-finish" ${reqDone ? '' : 'disabled title="Marque todos os itens obrigatórios"'}>Finalizar Fechamento</button>`;
  else actions = `<div class="fc-closed-badge">Mês fechado ${state.closing.closed_at ? 'em ' + new Date(state.closing.closed_at).toLocaleDateString('pt-BR') : ''}</div><button class="btn-ghost" id="fc-reopen">Reabrir Mês</button>`;

  $('fc-modal-body').innerHTML = `
    <div class="fc-status-line st-${status}">Status: <b>${ST_LABEL[status]}</b></div>
    ${kpis}
    <div class="fc-tabs">
      ${['resumo', 'dre', 'custos', 'boletos', 'categorias', 'obs'].map((t) => `<button class="fc-tab ${state.tab === t ? 'is-active' : ''}" data-tab="${t}">${{ resumo: 'Resumo', dre: 'DRE', custos: 'Custos', boletos: 'Boletos', categorias: 'Categorias', obs: 'Observações' }[t]}</button>`).join('')}
    </div>
    <div class="fc-tab-body">${renderTab(state.tab)}</div>
    <hr />
    <h4 class="fc-h">Checklist de conferência</h4>
    ${checkHtml}
    <div class="fc-actions">
      ${actions}
      <div class="fc-export">
        <button class="btn-ghost" id="fc-csv">Exportar CSV</button>
        <button class="btn-ghost" id="fc-pdf">Exportar PDF</button>
      </div>
    </div>`;

  // eventos
  $('fc-modal-body').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; renderModal(); }));
  $('fc-modal-body').querySelectorAll('[data-chk]').forEach((cb) => cb.addEventListener('change', () => {
    state.closing.checklist = state.closing.checklist || {};
    state.closing.checklist[cb.dataset.chk] = cb.checked;
    renderModal();
  }));
  $('fc-obs-input')?.addEventListener('input', (e) => { state.closing.notes = e.target.value; });
  $('fc-start')?.addEventListener('click', () => saveClosing('in_progress'));
  $('fc-finish')?.addEventListener('click', () => saveClosing('closed'));
  $('fc-reopen')?.addEventListener('click', () => { if (confirm('Reabrir este mês? Ele sairá do resultado consolidado até ser fechado de novo.')) saveClosing('open'); });
  $('fc-csv')?.addEventListener('click', exportCSV);
  $('fc-pdf')?.addEventListener('click', exportPDF);
}

function renderTab(tab) {
  const r = state.report;
  const line = (l, v, cls, strong) => `<div class="fc-dre-row ${strong ? 'is-strong' : ''}"><span>${l}</span><b class="${cls || ''}">${v}</b></div>`;
  if (tab === 'resumo') {
    const metaBar = r.meta > 0 ? `<div class="fc-meta">
      <div class="fc-meta-head"><span>Meta de faturamento</span><b>${money(r.receita_bruta)} / ${money(r.meta)} (${pct(r.meta_pct)})</b></div>
      <div class="fc-meta-bar"><div class="fc-meta-fill" style="width:${Math.min(100, r.meta_pct).toFixed(0)}%"></div></div>
    </div>` : '<p class="muted">Nenhuma meta definida para o mês.</p>';
    const comp = r.comparativo ? `<div class="fc-comp">
      ${compRow('Receita', r.receita_bruta, r.comparativo.receita)}
      ${compRow('Margem Contrib.', r.margem_contrib, r.comparativo.margem_contrib)}
      ${compRow('Lucro Líquido', r.lucro_liquido, r.comparativo.lucro_liquido)}
    </div>` : '<p class="muted">Sem mês anterior fechado para comparar.</p>';
    return `${metaBar}
      <h4 class="fc-h">Comparativo com o mês anterior</h4>${comp}`;
  }
  if (tab === 'dre') {
    return `<div class="fc-dre">
      ${line('Receita Bruta', money(r.receita_bruta))}
      ${line('(−) Impostos sobre vendas', '- ' + money(r.impostos), 'neg')}
      ${line('Receita Líquida', money(r.receita_liquida), '', true)}
      ${line('(−) CMV / COGS', '- ' + money(r.cogs), 'neg')}
      ${line('Lucro Bruto', money(r.lucro_bruto), '', true)}
      ${line('(−) Taxas Marketplace', '- ' + money(r.taxas_mp), 'neg')}
      ${line('(−) Frete Subsidiado', '- ' + money(r.frete), 'neg')}
      ${line('(−) Ads', '- ' + money(r.ads), 'neg')}
      ${line('Margem de Contribuição', money(r.margem_contrib) + ' (' + pct(r.margem_contrib_pct) + ')', r.margem_contrib >= 0 ? 'pos' : 'neg', true)}
      ${line('(−) Custos Fixos', '- ' + money(r.custos_fixos), 'neg')}
      ${line('(−) Custos Variáveis', '- ' + money(r.custos_variaveis), 'neg')}
      ${line('Lucro Líquido', money(r.lucro_liquido) + ' (' + pct(r.margem_liquida_pct) + ')', r.lucro_liquido >= 0 ? 'pos' : 'neg', true)}
    </div>`;
  }
  if (tab === 'custos') {
    return `<div class="fc-dre">
      ${line('CMV / COGS', money(r.cogs))}
      ${line('Taxas Marketplace', money(r.taxas_mp))}
      ${line('Frete Subsidiado', money(r.frete))}
      ${line('Ads (ML + externo)', money(r.ads))}
      ${line('Custos Fixos', money(r.custos_fixos))}
      ${line('Custos Variáveis', money(r.custos_variaveis))}
      ${line('Impostos', money(r.impostos))}
      ${line('Total de custos', money(r.cogs + r.taxas_mp + r.frete + r.ads + r.custos_fixos + r.custos_variaveis + r.impostos), '', true)}
    </div>`;
  }
  if (tab === 'boletos') {
    const b = r.boletos;
    const rows = (b.lista || []).map((x) => `<tr><td>${esc(x.name || '—')}</td><td>${money(x.value)}</td><td>${x.due_date ? x.due_date.split('-').reverse().join('/') : '—'}</td><td>${x.status === 'pago' ? '<span class="c-ok">pago</span>' : '<span class="c-warn">pendente</span>'}</td></tr>`).join('');
    return `<div class="fc-kpis" style="grid-template-columns:1fr 1fr">
      ${`<div class="fc-kpi"><span>Pagos (${b.pagos_count})</span><b class="pos">${money(b.pagos_total)}</b></div>`}
      ${`<div class="fc-kpi"><span>Pendentes (${b.pend_count})</span><b class="neg">${money(b.pend_total)}</b></div>`}
    </div>
    <table class="mini-table" style="margin-top:12px"><thead><tr><th>Boleto</th><th>Valor</th><th>Venc.</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">Nenhum boleto no mês.</td></tr>'}</tbody></table>`;
  }
  if (tab === 'categorias') {
    const total = r.categorias.reduce((a, c) => a + c.valor, 0) || 1;
    const rows = r.categorias.map((c) => `<div class="fc-cat-row">
      <span class="fc-cat-name">${esc(c.nome)}</span>
      <div class="fc-cat-bar"><div class="fc-cat-fill" style="width:${(c.valor / total * 100).toFixed(0)}%"></div></div>
      <span class="fc-cat-val">${money(c.valor)}</span>
    </div>`).join('');
    return `<div class="fc-kpis" style="grid-template-columns:1fr 1fr 1fr">
      ${`<div class="fc-kpi"><span>Vendas</span><b>${(r.qtd || 0).toLocaleString('pt-BR')} un.</b></div>`}
      ${`<div class="fc-kpi"><span>Ticket Médio</span><b>${money(r.ticket_medio)}</b></div>`}
      ${`<div class="fc-kpi"><span>Receita Bruta</span><b>${money(r.receita_bruta)}</b></div>`}
    </div>
    <h4 class="fc-h">Gastos por categoria</h4>
    ${rows || '<p class="muted">Nenhuma despesa por categoria no mês.</p>'}`;
  }
  if (tab === 'obs') {
    const ro = state.closing.status === 'closed';
    return `<label class="fc-obs-label">Observações do fechamento (máx. 500)
      <textarea id="fc-obs-input" rows="6" maxlength="500" ${ro ? 'readonly' : ''} placeholder="Anote qualquer ajuste, pendência ou explicação sobre o resultado do mês.">${esc(state.closing.notes || '')}</textarea>
    </label>`;
  }
  return '';
}

function compRow(label, cur, prev) {
  const diff = prev ? ((cur - prev) / Math.abs(prev)) * 100 : null;
  const cls = diff == null ? '' : diff >= 0 ? 'pos' : 'neg';
  const arrow = diff == null ? '' : diff >= 0 ? '▲' : '▼';
  return `<div class="fc-comp-row"><span>${label}</span><b>${money(cur)}</b><span class="fc-comp-prev">ant. ${money(prev)}</span><span class="fc-comp-diff ${cls}">${diff == null ? '—' : arrow + ' ' + pct(Math.abs(diff))}</span></div>`;
}

async function saveClosing(status) {
  try {
    await api('/api/closing', {
      method: 'PUT',
      body: JSON.stringify({ year: state.year, month: state.current, status, checklist: state.closing.checklist || {}, notes: state.closing.notes || '' }),
    });
    state.closing.status = status;
    if (status === 'closed') state.closing.closed_at = new Date().toISOString();
    await load();
    // recarrega o modal com o novo estado
    const { report, closing } = await api(`/api/closing/compute?year=${state.year}&month=${state.current}`);
    state.report = report; state.closing = closing || state.closing;
    renderModal();
  } catch (e) { alert(e.message); }
}

// ---------------------------------------------------------------------------
// Exportações
// ---------------------------------------------------------------------------
function exportCSV() {
  const r = state.report;
  const rows = [
    ['Fechamento', `${MESES_FULL[state.current - 1]}/${state.year}`],
    ['Receita Bruta', r.receita_bruta], ['Impostos', r.impostos], ['Receita Líquida', r.receita_liquida],
    ['CMV/COGS', r.cogs], ['Lucro Bruto', r.lucro_bruto], ['Taxas Marketplace', r.taxas_mp],
    ['Frete Subsidiado', r.frete], ['Ads', r.ads], ['Custos Fixos', r.custos_fixos], ['Custos Variáveis', r.custos_variaveis],
    ['Margem de Contribuição', r.margem_contrib], ['Lucro Líquido', r.lucro_liquido],
    ['Fluxo de Caixa (saldo)', r.cash_flow.saldo], ['Boletos Pendentes', r.boletos.pend_total],
    ['Vendas (un.)', r.qtd], ['Ticket Médio', r.ticket_medio], ['Meta', r.meta],
  ];
  const csv = rows.map((r2) => r2.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fechamento-${state.year}-${String(state.current).padStart(2, '0')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportPDF() {
  const r = state.report;
  const when = new Date().toLocaleString('pt-BR');
  const w = window.open('', '_blank');
  if (!w) { alert('Permita pop-ups para baixar o PDF.'); return; }
  const line = (l, v, strong) => `<tr class="${strong ? 's' : ''}"><td>${l}</td><td style="text-align:right">${v}</td></tr>`;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>Fechamento ${MESES_FULL[state.current - 1]}/${state.year}</title>
    <style>
      @page{size:A4;margin:14mm}*{-webkit-print-color-adjust:exact}
      body{font-family:system-ui,Arial,sans-serif;color:#16202e}
      .h{display:flex;align-items:center;gap:12px;border-bottom:2px solid #12905a;padding-bottom:10px;margin-bottom:16px}
      .h img{width:36px}.h h1{font-size:18px;margin:0}.h .sub{font-size:11px;color:#6b7686}
      .h .when{margin-left:auto;font-size:11px;color:#6b7686;text-align:right}
      h2{font-size:13px;color:#12905a;margin:18px 0 6px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      td{padding:6px 8px;border-bottom:1px solid #e6ebf2}
      tr.s td{font-weight:700;background:#f4f7fb}
    </style></head><body>
    <div class="h"><img src="${location.origin}/img/logo-mark.svg" alt="">
      <div><h1>Fechamento Mensal — ${MESES_FULL[state.current - 1]} / ${state.year}</h1><div class="sub">FinanceEcom · Resultado consolidado</div></div>
      <div class="when">Gerado em<br>${when}</div></div>
    <h2>DRE do mês</h2>
    <table>
      ${line('Receita Bruta', money(r.receita_bruta))}
      ${line('(−) Impostos', '- ' + money(r.impostos))}
      ${line('Receita Líquida', money(r.receita_liquida), true)}
      ${line('(−) CMV/COGS', '- ' + money(r.cogs))}
      ${line('Lucro Bruto', money(r.lucro_bruto), true)}
      ${line('(−) Taxas Marketplace', '- ' + money(r.taxas_mp))}
      ${line('(−) Frete Subsidiado', '- ' + money(r.frete))}
      ${line('(−) Ads', '- ' + money(r.ads))}
      ${line('Margem de Contribuição', money(r.margem_contrib) + ' (' + pct(r.margem_contrib_pct) + ')', true)}
      ${line('(−) Custos Fixos', '- ' + money(r.custos_fixos))}
      ${line('(−) Custos Variáveis', '- ' + money(r.custos_variaveis))}
      ${line('Lucro Líquido', money(r.lucro_liquido) + ' (' + pct(r.margem_liquida_pct) + ')', true)}
    </table>
    <h2>Indicadores</h2>
    <table>
      ${line('Fluxo de Caixa (saldo)', money(r.cash_flow.saldo))}
      ${line('Boletos pagos', money(r.boletos.pagos_total) + ' (' + r.boletos.pagos_count + ')')}
      ${line('Boletos pendentes', money(r.boletos.pend_total) + ' (' + r.boletos.pend_count + ')')}
      ${line('Vendas', (r.qtd || 0).toLocaleString('pt-BR') + ' un.')}
      ${line('Ticket Médio', money(r.ticket_medio))}
      ${line('Meta', money(r.meta) + (r.meta ? ' (' + pct(r.meta_pct) + ')' : ''))}
    </table>
    </body></html>`);
  w.document.close(); w.focus();
  const go = () => { try { w.print(); } catch (_) {} };
  if (w.document.readyState === 'complete') setTimeout(go, 400); else w.onload = () => setTimeout(go, 400);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
$('fc-close').addEventListener('click', () => { $('fc-modal').hidden = true; });
$('fc-modal').addEventListener('click', (e) => { if (e.target === $('fc-modal')) $('fc-modal').hidden = true; });
$('fc-refresh').addEventListener('click', load);
$('fc-year').addEventListener('change', (e) => { state.year = Number(e.target.value); load(); });

(async () => {
  const session = await initShell('fechamento');
  if (!session) return;
  const y = new Date().getFullYear();
  $('fc-year').innerHTML = [y + 1, y, y - 1, y - 2].map((yy) => `<option value="${yy}"${yy === state.year ? ' selected' : ''}>${yy}</option>`).join('');
  await load();
})();
