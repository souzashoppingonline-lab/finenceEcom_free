// ===========================================================================
// Análise de Produtos — Fase 1 (página + tokens + CRUD)
// ===========================================================================
const $ = (id) => document.getElementById(id);
const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let products = [];
let activeId = null;
let lastAds = [];
let lastProductId = null;
let lastProduct = null;
let aiState = { provider: 'anthropic', has_anthropic: false, has_openai: false };

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

// ---------------------------------------------------------------------------
// Ponte com a extensão (recoleta imediata de um anúncio)
// ---------------------------------------------------------------------------
let extBridgeReady = false;
window.addEventListener('message', (e) => {
  if (e.source === window && e.data && e.data.__fec === 'ready') extBridgeReady = true;
});
function recollectAd(url) {
  return new Promise((resolve) => {
    const id = 'r' + Date.now() + Math.random().toString(36).slice(2, 6);
    const onMsg = (e) => {
      if (e.source === window && e.data && e.data.__fec === 'res' && e.data.id === id) {
        window.removeEventListener('message', onMsg); resolve(e.data.resp || { error: 'sem resposta' });
      }
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ __fec: 'req', id, action: 'recollect_one', url }, '*');
    setTimeout(() => { window.removeEventListener('message', onMsg); resolve({ error: 'tempo esgotado' }); }, 30000);
  });
}

// ---------------------------------------------------------------------------
// Config de IA + extensão
// ---------------------------------------------------------------------------
async function loadAiSettings() {
  const s = await api('/api/ai-settings');
  aiState = s;
  // provider
  document.querySelectorAll('#prov-select .status-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.p === s.provider));
  // máscaras
  $('mask-anthropic').textContent = s.has_anthropic ? `Salvo: ${s.anthropic_mask}` : 'Nenhuma chave salva.';
  $('mask-openai').textContent = s.has_openai ? `Salvo: ${s.openai_mask}` : 'Nenhuma chave salva.';
  if ($('ai-level')) { $('ai-level').value = s.ai_level || 3; updateLevelLabel(); }
  if ($('monitor-hour')) $('monitor-hour').value = (s.monitor_hour != null ? String(s.monitor_hour) : '');
  $('ext-token').value = s.ext_token || '';
  // status resumo no cabeçalho do card
  const keyOk = (s.provider === 'openai' && s.has_openai) || (s.provider === 'anthropic' && s.has_anthropic);
  $('ia-status').textContent = keyOk ? 'IA configurada' : '⚠️ IA não configurada';
  $('ia-status').className = keyOk ? 'c-ok' : 'c-warn';
}

$('ia-toggle').addEventListener('click', () => {
  const b = $('ia-body');
  b.hidden = !b.hidden;
});
document.querySelectorAll('#prov-select .status-btn').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#prov-select .status-btn').forEach((x) => x.classList.remove('is-active'));
  b.classList.add('is-active');
}));

const LEVELS = {
  1: ['Econômico', 'até 3 concorrentes · menos tokens · mais barato'],
  2: ['Leve', 'até 5 concorrentes · custo baixo'],
  3: ['Padrão', 'até 7 concorrentes · equilíbrio (recomendado)'],
  4: ['Detalhado', 'até 9 concorrentes · mais tokens'],
  5: ['Profundo', 'até 10 concorrentes · máximo de tokens · mais caro'],
};
function updateLevelLabel() {
  const lv = Number($('ai-level').value) || 3;
  const [name, desc] = LEVELS[lv];
  $('level-name').textContent = `Nível ${lv} — ${name}`;
  $('level-desc').textContent = desc;
}
$('ai-level')?.addEventListener('input', updateLevelLabel);

$('save-ia').addEventListener('click', async () => {
  const provider = document.querySelector('#prov-select .status-btn.is-active').dataset.p;
  const body = { provider, ai_level: Number($('ai-level').value) || 3 };
  const ak = $('key-anthropic').value.trim();
  const ok = $('key-openai').value.trim();
  if (ak) body.anthropic_key = ak;   // só envia se digitou algo (não apaga o salvo à toa)
  if (ok) body.openai_key = ok;
  $('save-ia').disabled = true;
  try {
    await api('/api/ai-settings', { method: 'PUT', body: JSON.stringify(body) });
    $('key-anthropic').value = ''; $('key-openai').value = '';
    $('ia-msg').textContent = 'Configurações salvas'; $('ia-msg').className = 'form-msg c-ok';
    await loadAiSettings();
    renderProducts(); // atualiza estado dos botões "Analisar com IA"
  } catch (e) { $('ia-msg').textContent = e.message; $('ia-msg').className = 'form-msg c-danger'; }
  $('save-ia').disabled = false;
});

$('token-help').addEventListener('click', () => {
  openModal('Como configurar o token de IA', `
    <p class="muted">Você usa a sua própria chave — o custo do uso fica na sua conta do provedor. Escolha um dos dois:</p>

    <h3 class="ia-h">🔵 Claude (Anthropic)</h3>
    <ol class="help-list">
      <li>Acesse <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> e faça login.</li>
      <li>No menu, vá em <b>Settings → API Keys</b> (ou <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">clique aqui</a>).</li>
      <li>Clique em <b>Create Key</b>, dê um nome (ex.: "FinanceEcom") e <b>copie</b> a chave — ela começa com <code>sk-ant-api03-...</code> e só aparece uma vez.</li>
      <li>Adicione saldo em <b>Billing → Add credits</b> (a API é pré-paga; US$ 5 já dá pra muitas análises). ⚠️ É separado da assinatura do Claude.ai/Claude Code.</li>
      <li>Aqui na página: selecione <b>Claude (Anthropic)</b>, cole no campo <b>Token Claude</b> e clique <b>Salvar</b>.</li>
    </ol>

    <h3 class="ia-h">🟢 ChatGPT (OpenAI)</h3>
    <ol class="help-list">
      <li>Acesse <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a> e faça login.</li>
      <li>Clique em <b>Create new secret key</b>, dê um nome e <b>copie</b> — começa com <code>sk-...</code> (só aparece uma vez).</li>
      <li>Adicione saldo em <b>Settings → Billing</b> (também é pré-paga, separada do ChatGPT Plus).</li>
      <li>Aqui: selecione <b>ChatGPT (OpenAI)</b>, cole no campo <b>Token ChatGPT</b> e <b>Salvar</b>.</li>
    </ol>

    <div class="help-box">
      <b>Segurança:</b> sua chave é guardada criptografada e nunca é exibida de novo (só mascarada, ex.: <code>sk-ant••••1234</code>).<br>
      <b>Erros comuns:</b> "insufficient credits/balance" = falta carregar saldo · "invalid x-api-key" = chave errada, gere outra · use a <b>API Key do Console</b>, não o token do Claude Code.
    </div>`);
});

$('copy-token').addEventListener('click', () => {
  $('ext-token').select();
  navigator.clipboard?.writeText($('ext-token').value);
  $('copy-token').textContent = 'Copiado!';
  setTimeout(() => ($('copy-token').textContent = 'Copiar'), 1500);
});
$('regen-token').addEventListener('click', async () => {
  if (!confirm('Gerar um novo token vai desconectar a extensão atual. Continuar?')) return;
  const r = await api('/api/ai-settings/regen-token', { method: 'POST' });
  $('ext-token').value = r.ext_token;
});

// Preenche o seletor de horário (00h–23h) e salva
(function fillHours() {
  const sel = $('monitor-hour');
  if (!sel) return;
  for (let h = 0; h < 24; h++) {
    const o = document.createElement('option');
    o.value = String(h);
    o.textContent = String(h).padStart(2, '0') + ':00';
    sel.appendChild(o);
  }
})();
$('save-hour')?.addEventListener('click', async () => {
  const v = $('monitor-hour').value;
  const msg = $('hour-msg');
  $('save-hour').disabled = true;
  try {
    await api('/api/ai-settings', { method: 'PUT', body: JSON.stringify({ monitor_hour: v === '' ? null : Number(v) }) });
    msg.textContent = v === '' ? 'Atualização a qualquer hora salva.' : `Atualização diária a partir das ${String(v).padStart(2, '0')}:00.`;
    msg.className = 'c-ok';
  } catch (e) { msg.textContent = e.message; msg.className = 'c-danger'; }
  $('save-hour').disabled = false;
});

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------
function iaReady() {
  return (aiState.provider === 'openai' && aiState.has_openai) || (aiState.provider === 'anthropic' && aiState.has_anthropic);
}

async function loadProducts() {
  const r = await api('/api/analise/products');
  products = r.products || []; activeId = r.active_id;
  renderProducts();
}

function renderProducts() {
  const el = $('prod-grid');
  if (products.length === 0) {
    el.innerHTML = '<p class="muted">Nenhum produto ainda. Clique em “+ Novo produto” para começar.</p>';
    return;
  }
  el.innerHTML = products.map((p) => {
    const isActive = String(p.id) === String(activeId);
    const iaBtn = iaReady()
      ? `<button class="btn-inline" data-ia="${p.id}">Analisar com IA</button>`
      : '<button class="btn-ghost" disabled title="Configure seu token de IA acima">IA (configure o token)</button>';
    return `<div class="card period-card" data-id="${p.id}">
      <div class="dash-head-row">
        <h4 style="margin:0">${esc(p.produto)}</h4>
        ${isActive ? '<span class="c-ok" style="font-size:.8rem">🟢 Em coleta</span>' : ''}
      </div>
      <p class="muted" style="margin:6px 0">${p.fornecedor ? esc(p.fornecedor) + ' · ' : ''}Compra: ${money(p.preco_compra)}</p>
      <div class="head-actions" style="margin-top:10px;flex-wrap:wrap;gap:8px">
        <button class="btn-inline" data-open="${p.id}">Abrir</button>
        ${iaBtn}
        <button class="btn-ghost" data-del-prod="${p.id}" title="Excluir produto">Excluir</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.open)));
  el.querySelectorAll('[data-ia]').forEach((b) => b.addEventListener('click', () => runAnalysis(b.dataset.ia, b)));
  el.querySelectorAll('[data-del-prod]').forEach((b) => b.addEventListener('click', async () => {
    const p = products.find((x) => String(x.id) === String(b.dataset.delProd));
    if (!confirm(`Excluir "${p ? p.produto : 'este produto'}" e todos os concorrentes/dados dele?`)) return;
    b.disabled = true;
    try { await api(`/api/analise/products/${b.dataset.delProd}`, { method: 'DELETE' }); await loadProducts(); }
    catch (e) { alert(e.message); b.disabled = false; }
  }));
}

// ---------------------------------------------------------------------------
// Análise por IA
// ---------------------------------------------------------------------------
// Mini renderizador de markdown (títulos, negrito, listas, tabelas simples)
function mdToHtml(md) {
  const lines = String(md).split('\n');
  let html = '', inUl = false, inTable = false;
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  const closeUl = () => { if (inUl) { html += '</ul>'; inUl = false; } };
  const closeTable = () => { if (inTable) { html += '</tbody></table></div>'; inTable = false; } };
  for (let raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*\|(.+)\|\s*$/.test(line)) {
      const cells = line.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim());
      if (/^[-:\s|]+$/.test(line.replace(/\|/g, ''))) continue; // separador ---
      if (!inTable) { closeUl(); html += '<div class="table-wrap"><table><tbody>'; inTable = true; }
      html += '<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
      continue;
    } else closeTable();
    if (/^###?\s+/.test(line)) { closeUl(); html += `<h3 class="ia-h">${inline(line.replace(/^#+\s+/, ''))}</h3>`; }
    else if (/^\s*[-*]\s+/.test(line)) { if (!inUl) { html += '<ul>'; inUl = true; } html += `<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`; }
    else if (/^\s*\d+\.\s+/.test(line)) { if (!inUl) { html += '<ul>'; inUl = true; } html += `<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`; }
    else if (line.trim() === '') { closeUl(); }
    else { closeUl(); html += `<p>${inline(line)}</p>`; }
  }
  closeUl(); closeTable();
  return html;
}

function openModal(title, html) {
  $('ia-modal-title').innerHTML = title;
  $('ia-modal-body').innerHTML = html;
  $('ia-modal').hidden = false;
}
$('ia-modal-close').addEventListener('click', () => { $('ia-modal').hidden = true; });
$('ia-modal').addEventListener('click', (e) => { if (e.target.id === 'ia-modal') $('ia-modal').hidden = true; });

const money2 = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Donut de score (0-100)
function scoreDonut(score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const r = 34, c = 2 * Math.PI * r, off = c * (1 - s / 100);
  const col = s >= 70 ? '#22c55e' : s >= 45 ? '#f5b301' : '#ef4444';
  return `<svg viewBox="0 0 90 90" class="score-donut" width="90" height="90">
    <circle cx="45" cy="45" r="${r}" fill="none" stroke="#e2e6ee" stroke-width="9"/>
    <circle cx="45" cy="45" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 45 45)" class="score-arc"/>
    <text x="45" y="42" text-anchor="middle" class="score-num">${s}</text>
    <text x="45" y="58" text-anchor="middle" class="score-lbl">/100</text>
  </svg>`;
}

function ul(items) {
  if (!Array.isArray(items) || !items.length) return '<p class="muted" style="font-size:.85rem">—</p>';
  return '<ul class="ia-list">' + items.map((i) => `<li>${esc(i)}</li>`).join('') + '</ul>';
}

// Renderiza o painel estruturado (schema: comentarios/financeiro/decisao/score)
// Barra mostrando onde o preço sugerido cai no range dos concorrentes
function priceBar(ads, P, breakEven) {
  const prices = (ads || []).map((a) => Number(a.preco)).filter((v) => v > 0).sort((a, b) => a - b);
  if (prices.length < 2) return '';
  const min = prices[0], max = prices[prices.length - 1], span = max - min || 1;
  const media = prices.reduce((a, b) => a + b, 0) / prices.length;
  const pos = (v) => Math.max(0, Math.min(100, (v - min) / span * 100));
  const dots = prices.map((v) => `<span class="pb-dot" style="left:${pos(v)}%" title="Concorrente: ${money2(v)}"></span>`).join('');
  // marcadores acima (sugerido) e abaixo (equilíbrio) pra não colidir
  const markTop = (v, cls, label) => (v > 0 ? `<span class="pb-mark ${cls}" style="left:${pos(v)}%"><span class="pb-lbl pb-top">${label}<br><b>${money2(v)}</b></span></span>` : '');
  const markBot = (v, cls, label) => (v > 0 ? `<span class="pb-mark ${cls}" style="left:${pos(v)}%"><span class="pb-lbl pb-bot"><b>${money2(v)}</b><br>${label}</span></span>` : '');
  // posição do seu preço vs mercado
  let situa = 'no meio da faixa';
  if (P) { if (P <= media * 0.97) situa = 'mais barato que a média'; else if (P >= media * 1.03) situa = 'mais caro que a média'; }
  return `<div class="pb-card">
    <div class="pb-title">Seu preço vs. concorrentes <span class="muted">— ${prices.length} anúncios · média ${money2(media)}</span></div>
    <div class="pb-track">
      ${dots}
      ${markTop(P, 'pb-p', 'Sugerido')}
      ${markBot(breakEven, 'pb-be', 'Equilíbrio')}
    </div>
    <div class="pb-ends"><span>menor ${money2(min)}</span><span>maior ${money2(max)}</span></div>
    ${P ? `<p class="pb-note">Seu preço sugerido (${money2(P)}) está <b>${situa}</b>.</p>` : ''}
  </div>`;
}

function analysisHtml(d, when, prod, ads) {
  const dec = d.decisao || {};
  const f = d.financeiro || {};
  const com = d.comentarios || {};
  // CÁLCULO DETERMINÍSTICO (não confia na conta da IA)
  const compra = Number(prod?.preco_compra) || 0, frete = Number(prod?.frete_entrada) || 0, emb = Number(prod?.embalagem) || 0;
  const taxaPct = Number(prod?.taxa_mp) || 0, impPct = Number(prod?.imposto) || 0;
  const custoFixo = compra + frete + emb;                 // custo direto
  const P = Number(f.preco_sugerido) || 0;                 // preço sugerido pela IA
  const taxaVal = P * taxaPct / 100;                       // taxa ML sobre a venda
  const impVal = P * impPct / 100;                         // imposto sobre a venda
  const lucro = P ? (P - custoFixo - taxaVal - impVal) : 0;
  const margem = P ? (lucro / P * 100) : 0;
  const custoReal = custoFixo;
  // Ponto de equilíbrio e preço para margem-alvo (15%)
  const pctVar = (taxaPct + impPct) / 100;
  const ALVO = 15;
  const breakEven = pctVar < 1 ? custoFixo / (1 - pctVar) : 0;
  const precoAlvo = (pctVar + ALVO / 100) < 1 ? custoFixo / (1 - pctVar - ALVO / 100) : 0;
  const breakdown = prod ? `
    <p class="ia-p" style="font-size:.78rem;margin-top:8px;color:var(--muted)">
      <b>Custo fixo</b> = Compra ${money2(compra)} + Frete ${money2(frete)} + Embalagem ${money2(emb)} = ${money2(custoFixo)}<br>
      <b>Sobre a venda ${money2(P)}</b>: Taxa ML ${taxaPct}% (${money2(taxaVal)}) + Imposto ${impPct}% (${money2(impVal)})<br>
      <b>Lucro</b> = ${money2(P)} − ${money2(custoFixo)} − ${money2(taxaVal)} − ${money2(impVal)} = <b>${money2(lucro)}</b>
    </p>
    <div class="be-grid">
      <div class="be-box"><span>Preço de equilíbrio</span><b>${money2(breakEven)}</b><small>margem 0% (nem lucro nem prejuízo)</small></div>
      <div class="be-box"><span>Preço p/ margem ${ALVO}%</span><b>${money2(precoAlvo)}</b><small>lucro de ${money2(precoAlvo * ALVO / 100)}/un.</small></div>
    </div>
    <div class="sim no-print" data-custo="${custoFixo}" data-taxa="${taxaPct}" data-imp="${impPct}">
      <label>Simular preço de venda
        <input type="number" id="sim-preco" min="0" step="0.01" value="${P ? P.toFixed(2) : ''}" placeholder="Digite um preço" />
      </label>
      <div class="sim-out">
        <div><span class="muted">Lucro/un.</span><b id="sim-lucro">—</b></div>
        <div><span class="muted">Margem líq.</span><b id="sim-margem">—</b></div>
      </div>
    </div>` : '';
  const score = (d.score && d.score.valor != null) ? d.score.valor : (typeof d.score === 'number' ? d.score : 0);
  const verd = {
    VALE: { t: 'Vale a pena', c: 'v-ok', i: '🟢' },
    ATENCAO: { t: 'Atenção', c: 'v-warn', i: '🟡' },
    NAO_VALE: { t: 'Não vale', c: 'v-bad', i: '🔴' },
  }[String(dec.veredito || '').toUpperCase()] || { t: dec.veredito || '—', c: 'v-warn', i: '•' };
  const kpi = (l, v) => `<div class="fin-kpi"><span>${l}</span><b>${v}</b></div>`;
  return `
  <div class="ia-report-actions no-print"><button class="btn-ghost" id="ia-pdf">Baixar PDF</button></div>
  <div class="ia-hero">
    ${scoreDonut(score)}
    <div class="ia-hero-txt">
      <span class="verd ${verd.c}">${verd.i} ${esc(verd.t)}</span>
      ${dec.justificativa ? `<p class="ia-resumo">${esc(dec.justificativa)}</p>` : ''}
      ${(d.score && d.score.explicacao) ? `<p class="ia-detalhe">${esc(d.score.explicacao)}</p>` : ''}
      <small class="muted">Análise por IA · ${when}</small>
    </div>
  </div>
  <div class="ia-cols">
    <div class="ia-col">
      <h4>Comentários</h4>
      <p class="ia-p">${esc(com.resumo || '—')}</p>
      <h5 class="ia-sub sub-bad">Reclamações</h5>${ul(com.reclamacoes)}
      <h5 class="ia-sub sub-ok">Elogios</h5>${ul(com.elogios)}
      <h5 class="ia-sub sub-op">Oportunidades</h5>${ul(com.oportunidades)}
    </div>
    <div class="ia-col">
      <h4>Financeiro</h4>
      <div class="fin-grid">
        ${kpi('Custo total', money2(custoReal))}
        ${kpi('Preço sugerido', money2(P))}
        ${kpi('Margem líq.', margem.toFixed(2) + '%')}
        ${kpi('Lucro/un.', money2(lucro))}
      </div>
      ${breakdown}
      <p class="ia-p" style="margin-top:10px">${esc(f.explicacao || '')}</p>
    </div>
    <div class="ia-col">
      <h4>Decisão</h4>
      <h5 class="ia-sub sub-bad">Riscos</h5>${ul(dec.riscos)}
      <h5 class="ia-sub sub-op">Próximos passos</h5>${ul(dec.proximos_passos)}
    </div>
  </div>
  ${priceBar(ads, P, breakEven)}`;
}

// Simulador de preço: recalcula lucro/margem ao vivo (sem IA)
function bindSimulator() {
  const box = document.querySelector('.sim');
  const inp = $('sim-preco');
  if (!box || !inp) return;
  const custo = Number(box.dataset.custo) || 0, taxa = Number(box.dataset.taxa) || 0, imp = Number(box.dataset.imp) || 0;
  const calc = () => {
    const P = Number(inp.value) || 0;
    const lucro = P ? (P - custo - P * taxa / 100 - P * imp / 100) : 0;
    const margem = P ? (lucro / P * 100) : 0;
    const lel = $('sim-lucro'), mel = $('sim-margem');
    lel.textContent = money2(lucro); mel.textContent = margem.toFixed(2) + '%';
    const col = lucro > 0 ? '#17915f' : (lucro < 0 ? '#e04545' : 'var(--muted)');
    lel.style.color = col; mel.style.color = col;
  };
  inp.addEventListener('input', calc);
  calc();
}

// Baixar a análise em PDF (paisagem, com cabeçalho e tabela de concorrentes)
function exportAnalysisPDF(titleText) {
  const rep = document.querySelector('.ia-report');
  if (!rep) return;
  const clone = rep.cloneNode(true);
  clone.querySelectorAll('.no-print').forEach((el) => el.remove());

  // tabela de concorrentes a partir dos dados carregados
  const ads = lastAds || [];
  const compRows = ads.map((a) => `<tr>
    <td>${esc((a.titulo || a.ml_id || '—')).slice(0, 60)}</td>
    <td>${a.preco != null ? money2(a.preco) : '—'}</td>
    <td>${a.nota ? '' + a.nota : '—'}</td>
    <td>${a.comentarios || '—'}</td>
    <td>${a.vendas_30d != null ? a.vendas_30d : '—'}</td>
    <td>${a.is_full ? 'FULL' : ''}</td>
    <td>${esc(a.vendedor || '—')}</td>
    <td>${esc(a.cidade ? a.cidade + (a.estado ? '/' + a.estado : '') : '—')}</td>
  </tr>`).join('');
  const compTable = ads.length ? `
    <h2 class="pdf-h2">Concorrentes monitorados (${ads.length})</h2>
    <table class="pdf-table">
      <thead><tr><th>Anúncio</th><th>Preço</th><th>Nota</th><th>Avaliações</th><th>Vendas 30d</th><th>Envio</th><th>Vendedor</th><th>Local</th></tr></thead>
      <tbody>${compRows}</tbody>
    </table>` : '';

  const when = new Date().toLocaleString('pt-BR');
  const w = window.open('', '_blank');
  if (!w) { alert('Permita pop-ups para baixar o PDF.'); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <title>Análise — ${esc(titleText)}</title>
    <link rel="stylesheet" href="${location.origin}/css/style.css">
    <style>
      @page{size:A4 landscape;margin:10mm}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{background:#fff;padding:0;color:#1c2434}
      .pdf-head{display:flex;align-items:center;gap:12px;border-bottom:2px solid #1e6fff;padding-bottom:10px;margin-bottom:14px}
      .pdf-head img{width:38px;height:38px}
      .pdf-head h1{font-size:18px;margin:0}
      .pdf-head .sub{font-size:11px;color:#6b7686}
      .pdf-head .when{margin-left:auto;font-size:11px;color:#6b7686;text-align:right}
      .ia-report{box-shadow:none;border:none;padding:0}
      .ia-cols{grid-template-columns:1fr 1fr 1fr;gap:14px}
      .ia-col{background:#f4f7fb!important;break-inside:avoid}
      .no-print{display:none!important}
      .pdf-h2{font-size:14px;margin:18px 0 8px;color:#1e6fff}
      .pdf-table{width:100%;border-collapse:collapse;font-size:11px}
      .pdf-table th{background:#eef2f7;text-align:left;padding:6px 8px;border:1px solid #e2e6ee}
      .pdf-table td{padding:5px 8px;border:1px solid #e2e6ee}
      .ia-report-actions{display:none}
    </style>
    </head><body>
    <div class="pdf-head">
      <img src="${location.origin}/img/logo-mark.svg" alt="">
      <div><h1>Análise de Produto — ${esc(titleText)}</h1><div class="sub">FinanceEcom · Inteligência de Concorrência</div></div>
      <div class="when">Gerado em<br>${esc(when)}</div>
    </div>
    <div class="ia-report">${clone.innerHTML}</div>
    ${compTable}
    </body></html>`);
  w.document.close();
  w.focus();
  const go = () => { try { w.print(); } catch (_) {} };
  if (w.document.readyState === 'complete') setTimeout(go, 500); else w.onload = () => setTimeout(go, 500);
}

async function runAnalysis(productId, btn) {
  if (!iaReady()) { alert('Configure seu token de IA nas Configurações acima.'); return; }
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Analisando…'; }
  try {
    await api(`/api/analise/products/${productId}/analyze`, { method: 'POST' });
    loadUsage();
    await openDetail(productId); // recarrega -> análise aparece acima dos cards
    document.querySelector('.ia-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = original; }
    alert(e.message);
  }
}

// ---- Criativos (opcional, gasta crédito) ----
const CREATIVES_N = 7;
function creativesHtml(list) {
  if (!Array.isArray(list) || !list.length) return '<p class="muted">Nenhum criativo.</p>';
  return `<div class="crea-grid">` + list.map((c, i) => {
    const json = JSON.stringify(c, null, 2);
    const cp = c.elementos_visual_copy || {};
    const ang = c.angulo || c.objecao || '';
    return `<div class="crea-card">
      <div class="dash-head-row"><span class="crea-tag">${i + 1}. ${esc(ang)}</span>
        <button class="btn-ghost crea-copy" data-json='${esc(json)}'>Copiar</button></div>
      ${c.objetivo ? `<p class="crea-obj">${esc(c.objetivo)}</p>` : ''}
      ${Array.isArray(c.imagens_referencia) && c.imagens_referencia.length ? `<div class="crea-refs"><span class="muted">Base:</span>${c.imagens_referencia.slice(0, 4).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="ref" loading="lazy"/></a>`).join('')}</div>` : ''}
      ${cp.texto_principal ? `<p class="crea-h">“${esc(cp.texto_principal)}”</p>` : ''}
      ${cp.texto_secundario ? `<p class="muted" style="font-size:.82rem">${esc(cp.texto_secundario)}</p>` : ''}
      <details style="margin-top:8px"><summary class="muted">Ver JSON completo</summary>
        <pre class="crea-json">${esc(json)}</pre></details>
    </div>`;
  }).join('') + `</div>`;
}

function bindCreativeCopies() {
  document.querySelectorAll('.crea-copy').forEach((b) => b.addEventListener('click', () => {
    navigator.clipboard?.writeText(b.dataset.json);
    const o = b.textContent; b.textContent = 'Copiado!'; setTimeout(() => (b.textContent = o), 1500);
  }));
}

async function runCreatives(productId, btn) {
  if (!iaReady()) { alert('Configure seu token de IA nas Configurações acima.'); return; }
  if (!confirm(`Gerar ${CREATIVES_N} criativos usa a IA e consome créditos da sua chave. Deseja continuar?`)) return;
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
  const out = $('crea-out');
  if (out) out.innerHTML = '<p class="muted">A IA está montando os briefs (quebrando as objeções dos comentários)…</p>';
  try {
    const vision = $('crea-vision') ? $('crea-vision').checked : true;
    const r = await api(`/api/analise/products/${productId}/creatives`, { method: 'POST', body: JSON.stringify({ vision }) });
    if (out) { out.innerHTML = creativesHtml(r.criativos); bindCreativeCopies(); }
    loadUsage();
  } catch (e) {
    if (out) out.innerHTML = `<p class="c-danger">${esc(e.message)}</p>`;
  }
  if (btn) { btn.disabled = false; btn.textContent = original; }
}

// Form novo/editar produto
$('btn-new').addEventListener('click', () => { openProdForm(); });
$('prod-cancel').addEventListener('click', () => { $('prod-form').hidden = true; });

function openProdForm(p) {
  const f = $('prod-form');
  f.hidden = false;
  f.reset();
  $('prod-form-title').textContent = p ? 'Editar produto' : 'Novo produto';
  if (p) {
    f.id.value = p.id;
    ['produto', 'fornecedor', 'preco_compra', 'taxa_mp', 'imposto', 'frete_entrada', 'embalagem', 'observacoes'].forEach((k) => { if (f[k]) f[k].value = p[k] ?? ''; });
  } else f.id.value = '';
  f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

$('prod-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {};
  ['produto', 'fornecedor', 'preco_compra', 'taxa_mp', 'imposto', 'frete_entrada', 'embalagem', 'observacoes'].forEach((k) => { body[k] = f[k].value; });
  const id = f.id.value;
  try {
    if (id) await api(`/api/analise/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/analise/products', { method: 'POST', body: JSON.stringify(body) });
    f.hidden = true;
    await loadProducts();
  } catch (err) { $('prod-msg').textContent = err.message; $('prod-msg').className = 'form-msg c-danger'; }
});

// ---------------------------------------------------------------------------
// Detalhe do produto + concorrentes
// ---------------------------------------------------------------------------
async function openDetail(id) {
  const r = await api(`/api/analise/products/${id}`);
  const p = r.product; const ads = r.ads || []; const isActive = String(p.id) === String(r.active_id);
  lastProduct = p;
  $('view-list').hidden = true; $('view-detail').hidden = false;

  $('detail-head').innerHTML = `<div class="card" style="margin-top:12px">
    <div class="dash-head-row">
      <h2 style="margin:0">${esc(p.produto)}</h2>
      <div class="head-actions" style="flex-wrap:wrap;gap:8px">
        ${iaReady()
          ? `<button class="btn-inline" data-ia="${p.id}">Analisar com IA</button>`
          : '<button class="btn-ghost" disabled title="Configure seu token de IA acima">IA (configure o token)</button>'}
        ${isActive
          ? `<button class="btn-ghost" data-finalize="${p.id}">Finalizar coleta</button>`
          : `<button class="btn-inline" data-activate="${p.id}">▶ Coleta ativa</button>`}
        <button class="btn-ghost" data-edit="${p.id}">Editar</button>
        <button class="btn-ghost" data-del="${p.id}">Excluir</button>
      </div>
    </div>
    <p class="muted">${p.fornecedor ? esc(p.fornecedor) + ' · ' : ''}Compra ${money(p.preco_compra)} · Taxa ML ${(Number(p.taxa_mp) || 0)}% · Imposto ${(Number(p.imposto) || 0)}%</p>
    ${isActive ? '<p class="c-ok">🟢 Este produto está marcado como “em coleta”. A extensão vai recoletar os concorrentes salvos 1×/dia (Fase 4).</p>' : ''}
  </div>`;

  $('detail-head').querySelector('[data-activate]')?.addEventListener('click', async (e) => { await api(`/api/analise/products/${e.target.dataset.activate}/activate`, { method: 'POST' }); openDetail(id); });
  $('detail-head').querySelector('[data-finalize]')?.addEventListener('click', async (e) => { await api(`/api/analise/products/${e.target.dataset.finalize}/finalize`, { method: 'POST' }); openDetail(id); });
  $('detail-head').querySelector('[data-edit]')?.addEventListener('click', () => { backToList(); openProdForm(p); });
  $('detail-head').querySelector('[data-del]')?.addEventListener('click', async (e) => {
    if (!confirm('Excluir este produto e todos os concorrentes?')) return;
    await api(`/api/analise/products/${e.target.dataset.del}`, { method: 'DELETE' });
    backToList();
  });
  $('detail-head').querySelector('[data-ia]')?.addEventListener('click', (e) => runAnalysis(p.id, e.target));

  // ANÁLISE POR IA — aparece acima dos cards, com todos os detalhes
  if (p.analise_ia) {
    const when = p.analise_ia_at ? new Date(p.analise_ia_at).toLocaleString('pt-BR') : '';
    let data = null;
    try { data = JSON.parse(p.analise_ia); } catch (_) {}
    const inner = (data && data.decisao)
      ? analysisHtml(data, when, p, ads)
      : `<div class="dash-head-row"><h3 style="margin:0">Análise por IA</h3><small class="muted">${when}</small></div>
         <p class="muted">Esta análise foi gerada numa versão anterior e ficou incompleta. Clique em <b>Analisar com IA</b> para gerar de novo no novo formato.</p>`;
    $('detail-head').insertAdjacentHTML('beforeend', `<div class="ia-report">${inner}</div>`);
    bindSimulator();
    $('detail-head').querySelector('#ia-pdf')?.addEventListener('click', () => exportAnalysisPDF(p.produto));
  }
  // CRIATIVOS p/ imagem — banner (opcional, gasta crédito)
  if (iaReady()) {
    let saved = null;
    try { saved = p.creativos_json ? (JSON.parse(p.creativos_json).criativos || []) : null; } catch (_) {}
    const n = CREATIVES_N;
    $('detail-head').insertAdjacentHTML('beforeend', `
      <div class="crea-banner" id="crea-banner">
        <div class="crea-bn-txt">
          <h3>Criativos p/ imagem <span class="muted">(${n} JSONs pro ChatGPT)</span></h3>
          <p class="muted">Cada JSON quebra uma objeção dos comentários. Clique em <b>Copiar</b> e cole no ChatGPT (com suas fotos) pra gerar a imagem.</p>
        </div>
        <div class="crea-actions">
          <label class="crea-vis"><input type="checkbox" id="crea-vision" checked /> Usar imagens (visão) <span class="muted">— mais fiel, gasta mais</span></label>
          <button class="crea-gen" data-creatives="${p.id}">Gerar ${n} criativos</button>
        </div>
      </div>
      <div id="crea-out">${saved ? creativesHtml(saved) : ''}</div>`);
    $('detail-head').querySelector('[data-creatives]').addEventListener('click', (e) => runCreatives(p.id, e.target));
    bindCreativeCopies();
  }

  renderAds(id, ads);
}

// Palavras-chave do título (SEO) — remove ruído e conta as principais
function seoKeywords(titulo) {
  const stop = new Set(['de', 'da', 'do', 'para', 'com', 'e', 'a', 'o', 'os', 'as', 'em', 'un', 'kit', 'the', 'un.']);
  return String(titulo || '').toLowerCase().replace(/[^\wà-ú\s]/gi, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && !stop.has(w)).slice(0, 12);
}

function fichaList(highlights) {
  let arr = highlights;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (_) { arr = arr.split('\n'); } }
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => (typeof x === 'object' ? `${x.name || x.key || ''}: ${x.value || ''}` : String(x))).filter(Boolean);
}

function firstFoto(fotos) {
  let arr = fotos;
  if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (_) { return arr; } }
  if (Array.isArray(arr) && arr.length) return typeof arr[0] === 'object' ? (arr[0].url || arr[0].src) : arr[0];
  return null;
}

// Gráfico grande, animado e colorido do histórico de preço (data × preço)
function priceChart(points) {
  const w = 640, h = 280, padL = 64, padR = 20, padT = 24, padB = 44;
  const iw = w - padL - padR, ih = h - padT - padB;
  const vals = points.map((p) => p.preco);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15; min -= pad; max += pad;
  const n = points.length;
  const x = (i) => padL + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => padT + ih - ((v - min) / (max - min)) * ih;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.preco).toFixed(1)}`).join(' ');
  const area = `M${x(0).toFixed(1)},${(padT + ih).toFixed(1)} ` + points.map((p, i) => `L${x(i).toFixed(1)},${y(p.preco).toFixed(1)}`).join(' ') + ` L${x(n - 1).toFixed(1)},${(padT + ih).toFixed(1)} Z`;
  // grades + rótulos de preço (eixo Y)
  const yticks = 4; let grid = '';
  for (let t = 0; t <= yticks; t++) {
    const v = min + ((max - min) * t) / yticks; const yy = y(v);
    grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${w - padR}" y2="${yy.toFixed(1)}" class="pc-grid"/>`;
    grid += `<text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" class="pc-ylab">${money(v)}</text>`;
  }
  // rótulos de data (eixo X) — no máx. 7
  const step = Math.max(1, Math.ceil(n / 7)); let xlab = '';
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const dt = new Date(p.snap_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    xlab += `<text x="${x(i).toFixed(1)}" y="${h - 16}" class="pc-xlab">${dt}</text>`;
  });
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.preco).toFixed(1)}" r="4" class="pc-dot" style="animation-delay:${(0.6 + i * 0.05).toFixed(2)}s"><title>${new Date(p.snap_date + 'T00:00:00').toLocaleDateString('pt-BR')}: ${money(p.preco)}</title></circle>`).join('');
  const lineLen = 2000;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" class="price-chart" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1e6fff" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.02"/>
      </linearGradient>
      <linearGradient id="pcStroke" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#1e6fff"/><stop offset="100%" stop-color="#22d3ee"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#pcFill)" class="pc-area"/>
    <path d="${line}" fill="none" stroke="url(#pcStroke)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
      class="pc-line" style="stroke-dasharray:${lineLen};stroke-dashoffset:${lineLen}"/>
    ${dots}${xlab}
  </svg>`;
}

async function loadHistory(mlId, container) {
  container.innerHTML = '<p class="muted">Carregando…</p>';
  try {
    const r = await api(`/api/analise/monitor/${encodeURIComponent(mlId)}`);
    const h = (r.historico || []).map((s) => ({ ...s, preco: Number(s.preco) }));
    if (!h.length) { container.innerHTML = '<p class="muted">Sem histórico ainda. A cada dia que a extensão recoletar, um ponto de preço é gravado aqui. Use “Forçar recoleta” no popup da extensão para gravar um ponto agora.</p>'; return; }
    const first = h[0].preco, last = h[h.length - 1].preco, delta = last - first;
    const menor = Math.min(...h.map((p) => p.preco)), maior = Math.max(...h.map((p) => p.preco));
    const deltaTxt = delta === 0 ? 'estável' : (delta > 0 ? `subiu ${money(delta)}` : `caiu ${money(-delta)}`);
    const kpi = (l, v) => `<div class="pc-kpi"><span class="muted">${l}</span><b>${v}</b></div>`;
    const rows = h.slice(-30).reverse().map((s) => `<tr><td>${new Date(s.snap_date + 'T00:00:00').toLocaleDateString('pt-BR')}</td><td>${money(s.preco)}</td></tr>`).join('');
    container.innerHTML = `
      ${priceChart(h)}
      <div class="pc-kpis">
        ${kpi('Atual', money(last))}${kpi('Variação', deltaTxt)}
        ${kpi('Menor', money(menor))}${kpi('Maior', money(maior))}${kpi('Dias', h.length)}
      </div>
      <details style="margin-top:12px"><summary class="muted">Ver tabela (data × preço)</summary>
        <div class="table-wrap" style="margin-top:8px"><table class="hist-table"><thead><tr><th>Data</th><th>Preço</th></tr></thead><tbody>${rows}</tbody></table></div>
      </details>`;
  } catch (e) { container.innerHTML = `<p class="c-danger">${esc(e.message)}</p>`; }
}

// Modal de vendas reais (7/15/21/30 dias) — quantidade + valor médio
function openVendas(adId, productId) {
  const a = (lastAds || []).find((x) => String(x.id) === String(adId)) || {};
  const row = (l, qk, pk) => `<tr>
    <td>${l}</td>
    <td><input type="number" min="0" id="v_${qk}" value="${a[qk] != null ? a[qk] : ''}" placeholder="un." /></td>
    <td><input type="number" min="0" step="0.01" id="v_${pk}" value="${a[pk] != null ? a[pk] : ''}" placeholder="R$" /></td>
  </tr>`;
  const html = `
    <p class="muted">Preencha as vendas dos últimos períodos (do Shopping de Preço). Isso dá <b>peso máximo</b> à análise da IA — ela avalia a tendência de vendas.</p>
    <div class="table-wrap"><table class="vendas-table">
      <thead><tr><th>Período</th><th>Qtd. de vendas</th><th>Valor médio por venda</th></tr></thead>
      <tbody>
        ${row('Últimos 7 dias', 'vendas_7d', 'preco_medio_7d')}
        ${row('Últimos 15 dias', 'vendas_15d', 'preco_medio_15d')}
        ${row('Últimos 21 dias', 'vendas_21d', 'preco_medio_21d')}
        ${row('Últimos 30 dias', 'vendas_30d', 'preco_medio_30d')}
      </tbody>
    </table></div>
    <button class="btn-cadastrar" id="vendas-save" style="max-width:220px">Salvar vendas</button>
    <p id="vendas-msg" class="form-msg"></p>`;
  openModal('Vendas dos últimos 30 dias', html);
  $('vendas-save').addEventListener('click', async () => {
    const body = {};
    ['vendas_7d', 'vendas_15d', 'vendas_21d', 'vendas_30d', 'preco_medio_7d', 'preco_medio_15d', 'preco_medio_21d', 'preco_medio_30d'].forEach((k) => { body[k] = $('v_' + k).value; });
    $('vendas-save').disabled = true;
    try {
      await api(`/api/analise/ads/${adId}`, { method: 'PUT', body: JSON.stringify(body) });
      $('ia-modal').hidden = true;
      openDetail(productId);
    } catch (e) { $('vendas-msg').textContent = e.message; $('vendas-msg').className = 'form-msg c-danger'; $('vendas-save').disabled = false; }
  });
}

// Mini-histórico dos últimos preços coletados (aparece no card, sem clicar)
function recentPrices(list) {
  if (!Array.isArray(list) || !list.length) return '';
  const pts = list.filter((p) => p.preco != null).slice(-5);
  if (pts.length < 1) return '';
  const fmtD = (d) => { const [ , m, day] = String(d).split('-'); return day && m ? `${day}/${m}` : String(d).slice(5); };
  const items = pts.map((p, i) => {
    const prev = i > 0 ? Number(pts[i - 1].preco) : null;
    const cur = Number(p.preco);
    const cls = prev == null ? 'ph-flat' : cur > prev ? 'ph-up' : cur < prev ? 'ph-down' : 'ph-flat';
    const arrow = prev == null ? '' : cur > prev ? '▲' : cur < prev ? '▼' : '';
    return `<div class="ph-item ${cls}">
      <span class="ph-date">${esc(fmtD(p.snap_date))}</span>
      <span class="ph-price">${money(cur)} <em>${arrow}</em></span>
    </div>`;
  }).join('<span class="ph-sep">›</span>');
  return `<div class="ph-block">
    <div class="ph-head">Histórico de preço <span class="muted">(últimas ${pts.length} coletas)</span></div>
    <div class="ph-track">${items}</div>
  </div>`;
}

// Mini-histórico de vendas coletadas (aparece no card)
function recentSales(list) {
  if (!Array.isArray(list) || !list.length) return '';
  const pts = list.filter((p) => p.vendas != null).slice(-5);
  if (!pts.length) return '';
  const fmtD = (d) => { const [ , m, day] = String(d).split('-'); return day && m ? `${day}/${m}` : String(d).slice(5); };
  const nf = (v) => Number(v).toLocaleString('pt-BR');
  const items = pts.map((p, i) => {
    const prev = i > 0 ? Number(pts[i - 1].vendas) : null;
    const cur = Number(p.vendas);
    const cls = prev == null ? 'ph-flat' : cur > prev ? 'ph-up-good' : cur < prev ? 'ph-down-bad' : 'ph-flat';
    const arrow = prev == null ? '' : cur > prev ? '▲' : cur < prev ? '▼' : '';
    return `<div class="ph-item ${cls}">
      <span class="ph-date">${esc(fmtD(p.snap_date))}</span>
      <span class="ph-price">${nf(cur)} <em>${arrow}</em></span>
    </div>`;
  }).join('<span class="ph-sep">›</span>');
  return `<div class="ph-block ph-sales">
    <div class="ph-head">📦 Histórico de vendas <span class="muted">(últimas ${pts.length} coletas)</span></div>
    <div class="ph-track">${items}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Análise de SEO dos concorrentes (palavras-chave + sugestão de títulos)
// ---------------------------------------------------------------------------
const titleCase = (s) => String(s).toLowerCase().replace(/\b([a-zà-ú])/g, (m, c) => c.toUpperCase());

function buildTitles(ranked, produto) {
  const core = seoKeywords(produto || '').slice(0, 4);
  const words = [];
  core.forEach((w) => { if (!words.includes(w)) words.push(w); });
  ranked.forEach(({ w }) => { if (!words.includes(w)) words.push(w); });
  const head = words.slice(0, core.length);
  const rest = words.slice(core.length);
  const out = [];
  for (let i = 0; i < rest.length && out.length < 5; i++) {
    const rot = rest.slice(i).concat(rest.slice(0, i));
    const seq = head.concat(rot);
    let t = '';
    for (const w of seq) { const cand = (t ? t + ' ' : '') + w; if (cand.length <= 60) t = cand; }
    t = titleCase(t.trim());
    if (t && t.length >= 15 && !out.includes(t)) out.push(t);
  }
  return out;
}

function analyzeSeo() {
  const ads = (lastAds || []).filter((a) => a.titulo);
  if (!ads.length) { alert('Adicione e salve os concorrentes primeiro — a análise usa os títulos deles.'); return; }
  const docFreq = {}, rawFreq = {};
  ads.forEach((a) => {
    const kws = seoKeywords(a.titulo);
    [...new Set(kws)].forEach((w) => { docFreq[w] = (docFreq[w] || 0) + 1; });
    kws.forEach((w) => { rawFreq[w] = (rawFreq[w] || 0) + 1; });
  });
  const ranked = Object.entries(docFreq)
    .sort((a, b) => (b[1] - a[1]) || ((rawFreq[b[0]] || 0) - (rawFreq[a[0]] || 0)))
    .map(([w, n]) => ({ w, n }));
  const top = ranked.slice(0, 24);
  const total = ads.length;
  const titles = buildTitles(ranked, lastProduct && lastProduct.produto);

  const chips = top.map((k) => {
    const pctv = Math.round(k.n / total * 100);
    const hot = pctv >= 50 ? 'kw-hot' : '';
    return `<span class="kw seo-kw ${hot}" data-kw="${esc(k.w)}">${esc(k.w)} <b>${k.n}/${total}</b></span>`;
  }).join('');
  const titleRows = titles.map((t, i) => `
    <div class="seo-title-row">
      <span class="seo-title-n">${i + 1}</span>
      <span class="seo-title-txt">${esc(t)}</span>
      <span class="seo-title-len">${t.length}/60</span>
      <button class="btn-ghost seo-copy" data-copy="${esc(t)}">Copiar</button>
    </div>`).join('');

  openModal('🔤 SEO dos concorrentes', `
    <p class="muted">Analisei os títulos de <b>${total} concorrentes</b>. Quanto mais alto o número, em mais anúncios a palavra aparece — priorize as mais usadas no seu título.</p>
    <h3 class="ia-h">Palavras-chave mais usadas</h3>
    <div class="ad-kws seo-kws">${chips}</div>
    <h3 class="ia-h">5 títulos sugeridos <span class="muted" style="font-weight:400">(até 60 caracteres, prontos pra usar de referência)</span></h3>
    <div class="seo-titles">${titleRows || '<p class="muted">Sem títulos suficientes para gerar sugestões.</p>'}</div>
    <p class="muted" style="font-size:.82rem;margin-top:12px">💡 Dica: comece o título pelo produto + as 3-4 palavras mais usadas. Evite repetir palavra e use os 60 caracteres.</p>`);

  $('ia-modal-body').querySelectorAll('.seo-copy').forEach((b) => b.addEventListener('click', () => {
    navigator.clipboard?.writeText(b.dataset.copy);
    const o = b.textContent; b.textContent = 'Copiado!'; setTimeout(() => (b.textContent = o), 1200);
  }));
}

// converte "+5 mil vendas" / "1,2 mil" / "500 vendidos" -> número
function parseVendasN(txt) {
  if (txt == null) return null;
  const s = String(txt).toLowerCase();
  const m = s.match(/([\d.,]+)\s*(mil|mi|k)?/);
  if (!m) return null;
  let n = Number(m[1].replace(/\.(?=\d{3})/g, '').replace(',', '.'));
  if (isNaN(n)) return null;
  if (m[2] === 'mil' || m[2] === 'k') n *= 1000; else if (m[2] === 'mi') n *= 1000000;
  return Math.round(n);
}

// Painel: tamanho do mercado (faturamento estimado do nicho)
function marketPanel(ads) {
  const rows = ads.map((a) => ({ t: a.titulo, preco: Number(a.preco) || 0, v: parseVendasN(a.vendas), v30: a.vendas_30d != null ? Number(a.vendas_30d) : null }))
    .filter((r) => r.preco > 0 && r.v != null);
  if (!rows.length) return '';
  const gmv = rows.reduce((s, r) => s + r.v * r.preco, 0);
  const lider = rows.reduce((a, b) => (b.v * b.preco > a.v * a.preco ? b : a), rows[0]);
  const mensalRows = rows.filter((r) => r.v30 != null && r.v30 > 0);
  const gmvMes = mensalRows.reduce((s, r) => s + r.v30 * r.preco, 0);
  const kpi = (l, v, sub) => `<div class="mk-kpi"><span>${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  return `<div class="mk-panel">
    <div class="mk-head">📊 Tamanho do mercado <span class="muted">— estimativa com ${rows.length} concorrentes</span></div>
    <div class="mk-kpis">
      ${kpi('Faturamento acumulado do nicho', money(gmv), 'vendas totais × preço (histórico do ML)')}
      ${mensalRows.length ? kpi('Estimativa mensal', money(gmvMes), `com base em ${mensalRows.length} c/ vendas 30d`) : ''}
      ${kpi('Líder do nicho', money(lider.v * lider.preco), esc((lider.t || '').slice(0, 40)))}
    </div>
    <p class="muted mk-note">O ML mostra vendas <b>acumuladas</b> (desde o início do anúncio), então o "acumulado" é o total histórico. Para o giro atual, use a estimativa mensal (vendas dos últimos 30 dias).</p>
  </div>`;
}

// Painel: alertas (preço baixou / sem estoque / adicionados recentemente)
function alertsPanel(ads) {
  const drops = [];
  ads.forEach((a) => {
    const h = (a.precos_recentes || []).filter((p) => p.preco != null);
    if (h.length >= 2) {
      const cur = Number(h[h.length - 1].preco), prev = Number(h[h.length - 2].preco);
      if (cur < prev) drops.push({ t: a.titulo, de: prev, para: cur, pct: Math.round((1 - cur / prev) * 100) });
    }
  });
  const oos = ads.filter((a) => a.estoque === 0 || a.estoque === '0');
  const now = Date.now();
  const novos = ads.filter((a) => a.created_at && (now - Date.parse(a.created_at)) < 7 * 86400000);
  if (!drops.length && !oos.length && !novos.length) return '';
  const parts = [];
  if (drops.length) parts.push(`<span class="al-item al-drop">▼ ${drops.length} baixaram o preço</span>`);
  if (oos.length) parts.push(`<span class="al-item al-oos">${oos.length} sem estoque</span>`);
  if (novos.length) parts.push(`<span class="al-item al-new" title="Concorrentes que VOCÊ adicionou nos últimos 7 dias (o sistema não descobre novos vendedores sozinho)">${novos.length} que você adicionou (7 dias)</span>`);
  const dropList = drops.slice(0, 5).map((d) => `<li><b>${esc((d.t || '').slice(0, 50))}</b> — ${money(d.de)} → <span class="c-ok">${money(d.para)}</span> (-${d.pct}%)</li>`).join('');
  return `<div class="al-panel">
    <div class="al-head">⚠️ Alertas dos concorrentes</div>
    <div class="al-chips">${parts.join('')}</div>
    ${dropList ? `<ul class="al-list">${dropList}</ul>` : ''}
  </div>`;
}

function adCard(a) {
  const foto = firstFoto(a.fotos);
  const kws = seoKeywords(a.titulo);
  const ficha = fichaList(a.highlights);
  const badges = [
    a.is_full ? '<span class="ad-badge b-full">FULL</span>' : '',
    a.is_flex ? '<span class="ad-badge b-flex">FLEX</span>' : '',
    a.reputacao ? `<span class="ad-badge">${esc(a.reputacao)}</span>` : '',
  ].filter(Boolean).join('');
  return `<div class="ad-card">
    <div class="ad-card-top">
      <div class="ad-thumb">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy" />` : '<span class="ad-noimg">sem imagem</span>'}</div>
      <div class="ad-info">
        <div class="ad-title">${a.link ? `<a href="${esc(a.link)}" target="_blank" rel="noopener">${esc(a.titulo || a.ml_id || 'Concorrente')}</a>` : esc(a.titulo || a.ml_id || 'Concorrente')}</div>
        <div class="ad-price">${a.preco != null ? money(a.preco) : '—'} ${a.preco_original && a.preco_original > a.preco ? `<s class="muted">${money(a.preco_original)}</s>` : ''}${a.desconto_pct ? `<span class="ad-off">-${a.desconto_pct}%</span>` : ''}<span class="ad-price-tag">último preço</span></div>
        ${a.parcelamento ? `<div class="ad-parc">${esc(a.parcelamento)}</div>` : ''}
        <div class="ad-meta">
          <span>${a.nota && a.nota > 0 ? a.nota : 'sem nota'}${a.comentarios ? ` (${a.comentarios})` : ''}</span>
          ${a.vendas ? `<span>${esc(a.vendas)}</span>` : ''}
          ${a.estoque != null ? `<span>estoque: ${Number(a.estoque).toLocaleString('pt-BR')}</span>` : ''}
          ${a.perguntas != null ? `<span>${a.perguntas} pergunta(s)</span>` : ''}
          ${a.vendedor ? `<span>${esc(a.vendedor)}</span>` : ''}
          ${a.cidade ? `<span>${esc(a.cidade)}${a.estado ? '/' + esc(a.estado) : ''}</span>` : ''}
          ${a.data_criacao ? `<span>criado ${esc(a.data_criacao)}</span>` : ''}
        </div>
        <div class="ad-badges">${badges}</div>
      </div>
    </div>
    ${recentPrices(a.precos_recentes)}
    ${recentSales(a.vendas_recentes)}
    <div class="ad-sections">
      ${kws.length ? `<div class="ad-sec"><b>SEO / palavras-chave</b><div class="ad-kws">${kws.map((k) => `<span class="kw">${esc(k)}</span>`).join('')}</div></div>` : ''}
      ${ficha.length ? `<details class="ad-sec"><summary><b>Ficha técnica</b> (${ficha.length})</summary><ul class="ad-ficha">${ficha.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}
      ${a.aval_dist ? `<div class="ad-sec"><b>Avaliações:</b> ${a.nota ? a.nota + ' · ' : ''}${a.comentarios || 0} no total<div class="ad-kws" style="margin-top:5px">${esc(a.aval_dist).split('·').map((d) => `<span class="kw">${esc(d.trim())}</span>`).join('')}</div></div>` : ''}
      ${a.comentarios_texto ? `<details class="ad-sec"><summary><b>Avaliações (texto)</b></summary><div class="ad-desc">${esc(a.comentarios_texto).replace(/\n/g, '<br>')}</div></details>` : ''}
      ${a.descricao ? `<details class="ad-sec"><summary><b>Descrição do anúncio</b></summary><div class="ad-desc">${esc(a.descricao).replace(/\n/g, '<br>')}</div></details>` : ''}
      ${a.observacoes ? `<div class="ad-sec"><b>Minhas anotações:</b> ${esc(a.observacoes)}</div>` : ''}
    </div>
    <div class="ad-review-edit" data-edit-wrap="${a.id}" hidden>
      <label>Avaliações do concorrente (cole os textos — a IA usa na análise)
        <textarea data-review-input="${a.id}" rows="5" placeholder="Cole aqui as avaliações, principalmente as de 1 a 3 estrelas (o que reclamam, o que falta)">${esc(a.comentarios_texto || '')}</textarea>
      </label>
      <div class="head-actions">
        <button class="btn-cadastrar" style="max-width:160px" data-review-save="${a.id}">Salvar</button>
        <button class="btn-ghost" data-review-cancel="${a.id}">Cancelar</button>
      </div>
    </div>
    ${(a.vendas_30d != null || a.vendas_7d != null) ? `<div class="ad-sec ad-vendas"><b>Vendas:</b> ${[['7d', a.vendas_7d], ['15d', a.vendas_15d], ['21d', a.vendas_21d], ['30d', a.vendas_30d]].filter(([, v]) => v != null).map(([l, v]) => `${l}: <b>${v}</b>`).join(' · ')}</div>` : ''}
    <div class="ad-actions">
      <div class="mon-wrap">
        <label class="switch-sm" title="Quando ligado, a extensão recoleta este anúncio 1×/dia automaticamente, só com o navegador aberto."><input type="checkbox" data-mon="${a.id}" ${a.monitorar ? 'checked' : ''}/> Atualizar automaticamente</label>
        <span class="mon-hint">Funciona mesmo com o produto fora de coleta — só depende deste botão.</span>
      </div>
      <div class="head-actions" style="gap:6px">
        ${a.link ? `<button class="btn-ghost" data-recollect="${esc(a.link)}" data-recollect-id="${a.id}">🔄 Recoletar agora</button>` : ''}
        <button class="btn-ghost" data-vendas="${a.id}">Vendas 30d</button>
        ${a.ml_id ? `<button class="btn-ghost" data-hist-btn="${esc(a.ml_id)}" data-hist-title="${esc(a.titulo || a.ml_id)}">Preço</button>` : ''}
        <button class="btn-ghost" data-review-btn="${a.id}">Avaliações</button>
        <button class="btn-ghost" data-del-ad="${a.id}">Remover</button>
      </div>
    </div>
  </div>`;
}

let adFilter = 'all';
let adSort = 'default';
function renderAds(productId, ads) {
  lastAds = ads; lastProductId = productId;
  let shown = ads.filter((a) => adFilter === 'full' ? a.is_full : adFilter === 'flex' ? a.is_flex : true);
  const num = (v) => (v == null ? NaN : Number(v));
  const cmp = {
    cheap: (a, b) => (num(a.preco) || Infinity) - (num(b.preco) || Infinity),
    exp: (a, b) => (num(b.preco) || -Infinity) - (num(a.preco) || -Infinity),
    rating: (a, b) => (num(b.nota) || -1) - (num(a.nota) || -1),
    reviews: (a, b) => (num(b.comentarios) || -1) - (num(a.comentarios) || -1),
  }[adSort];
  if (cmp) shown = [...shown].sort(cmp);
  $('detail-ads').innerHTML = `
    <div class="dash-head-row" style="margin-top:18px">
      <h3 style="margin:0">Concorrentes (${shown.length}/${ads.length})</h3>
      <div class="head-actions" style="gap:8px;flex-wrap:wrap">
        <select id="ad-filter" class="filter-inp">
          <option value="all"${adFilter === 'all' ? ' selected' : ''}>Todos</option>
          <option value="full"${adFilter === 'full' ? ' selected' : ''}>Só FULL</option>
        </select>
        <select id="ad-sort" class="filter-inp">
          <option value="default"${adSort === 'default' ? ' selected' : ''}>Ordenar…</option>
          <option value="cheap"${adSort === 'cheap' ? ' selected' : ''}>Mais barato</option>
          <option value="exp"${adSort === 'exp' ? ' selected' : ''}>Mais caro</option>
          <option value="rating"${adSort === 'rating' ? ' selected' : ''}>Melhor nota</option>
          <option value="reviews"${adSort === 'reviews' ? ' selected' : ''}>Mais avaliações</option>
        </select>
        <label class="ad-hour" title="Horário em que a extensão atualiza os preços marcados (1×/dia)">Monitorar às
          <select id="ad-monitor-hour" class="filter-inp">
            <option value="">qualquer hora</option>
            ${Array.from({ length: 24 }, (_, h) => `<option value="${h}"${String(aiState.monitor_hour) === String(h) ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}
          </select>
        </label>
        <button id="ad-seo" class="btn-inline">🔤 Analisar SEO</button>
        <button id="ad-recollect-all" class="btn-ghost">🔄 Recoletar todos</button>
        <button id="ad-refresh" class="btn-ghost">Atualizar</button>
        <button id="ad-new" class="btn-inline">+ Adicionar concorrente</button>
      </div>
    </div>
    <form id="ad-form" class="card" hidden style="margin-top:12px">
      <h4>Novo concorrente</h4>
      <p class="muted">Com a extensão (Fase 3) isso será 1 clique dentro do anúncio. Manualmente, preencha o que tiver.</p>
      <div class="two-col">
        <label>Título do anúncio (SEO)<input name="titulo" placeholder="Título completo do concorrente" /></label>
        <label>MLB<input name="ml_id" placeholder="MLB1234567890" /></label>
      </div>
      <label>Link do anúncio<input name="link" placeholder="https://produto.mercadolivre.com.br/MLB-..." /></label>
      <div class="two-col">
        <label>Preço (R$)<input name="preco" type="number" min="0" step="0.01" placeholder="0,00" /></label>
        <label>Nota do anúncio<input name="nota" type="number" min="0" max="5" step="0.1" placeholder="0-5" /></label>
      </div>
      <div class="two-col">
        <label>Vendedor<input name="vendedor" placeholder="Nome do vendedor" /></label>
        <label>Vendas<input name="vendas" placeholder="Ex.: +1000 vendidos" /></label>
      </div>
      <div class="two-col">
        <label>Reputação<input name="reputacao" placeholder="Ex.: MercadoLíder Platinum" /></label>
        <label>URL da imagem principal<input name="foto" placeholder="https://..." /></label>
      </div>
      <div class="two-col">
        <label>Cidade do vendedor<input name="cidade" placeholder="Ex.: Franca" /></label>
        <label>Estado (UF)<input name="estado" placeholder="Ex.: SP" maxlength="2" /></label>
      </div>
      <label>Data de criação do anúncio<input name="data_criacao" placeholder="Ex.: 07/08/2026" /></label>
      <p class="muted" style="margin-top:8px">As vendas dos últimos 7/15/21/30 dias você preenche depois, no botão <b>Vendas 30d</b> de cada card.</p>
      <label class="checkbox" style="display:inline-flex;margin-right:18px"><input type="checkbox" name="is_full" /> <span>Full</span></label>
      <label class="checkbox" style="display:inline-flex"><input type="checkbox" name="is_flex" /> <span>Flex</span></label>
      <label>Ficha técnica (uma por linha, ex.: "Peso: 3kg")<textarea name="ficha" rows="3" placeholder="Marca: Quatree&#10;Peso: 3kg&#10;Indicação: Gatos castrados"></textarea></label>
      <label>Avaliações (o que reclamam / gostam)<textarea name="comentarios_texto" rows="3" placeholder="Cole aqui trechos das avaliações do concorrente"></textarea></label>
      <label>Descrição do anúncio<textarea name="descricao" rows="4" placeholder="Cole aqui a descrição do concorrente"></textarea></label>
      <label>Minhas anotações<input name="observacoes" placeholder="O que ele faz de diferente pra vender mais?" /></label>
      <div class="head-actions">
        <button type="submit" class="btn-cadastrar" style="max-width:200px">Salvar concorrente</button>
        <button type="button" id="ad-cancel" class="btn-ghost">Cancelar</button>
      </div>
      <p id="ad-msg" class="form-msg"></p>
    </form>
    ${ads.length ? alertsPanel(ads) + marketPanel(ads) : ''}
    ${ads.length === 0 ? '<p class="muted" style="margin-top:12px">Nenhum concorrente salvo ainda. Clique em “+ Adicionar concorrente”.</p>'
      : shown.length === 0 ? '<p class="muted" style="margin-top:12px">Nenhum concorrente com esse filtro.</p>'
      : `<div class="ad-grid">${shown.map(adCard).join('')}</div>`}`;

  $('ad-filter').addEventListener('change', (e) => { adFilter = e.target.value; renderAds(lastProductId, lastAds); });
  $('ad-sort').addEventListener('change', (e) => { adSort = e.target.value; renderAds(lastProductId, lastAds); });
  $('ad-refresh').addEventListener('click', () => openDetail(productId));
  $('ad-seo')?.addEventListener('click', analyzeSeo);
  // recoletar TODOS os concorrentes (sequencial, via extensão)
  $('ad-recollect-all')?.addEventListener('click', async () => {
    const alvos = (lastAds || []).filter((a) => a.link);
    if (!alvos.length) return;
    const btn = $('ad-recollect-all'); btn.disabled = true;
    let ok = 0, fail = 0;
    for (let i = 0; i < alvos.length; i++) {
      btn.textContent = `🔄 Recoletando ${i + 1}/${alvos.length}…`;
      const r = await recollectAd(alvos[i].link);
      if (r && r.ok) ok++; else fail++;
    }
    btn.textContent = `✅ ${ok} atualizados${fail ? ` · ${fail} falhas` : ''}`;
    setTimeout(() => openDetail(productId), 1200);
  });
  $('ad-monitor-hour')?.addEventListener('change', async (e) => {
    const v = e.target.value;
    e.target.disabled = true;
    try {
      await api('/api/ai-settings', { method: 'PUT', body: JSON.stringify({ monitor_hour: v === '' ? null : Number(v) }) });
      aiState.monitor_hour = v === '' ? null : Number(v);
      if ($('monitor-hour')) $('monitor-hour').value = v; // mantém o outro seletor em sincronia
    } catch (_) {}
    e.target.disabled = false;
  });
  // histórico de preço: abre modal com gráfico animado
  $('detail-ads').querySelectorAll('[data-hist-btn]').forEach((b) => b.addEventListener('click', () => {
    openModal(`Histórico de preço <small class="muted" style="font-weight:400">${esc(b.dataset.histTitle || '')}</small>`, '<p class="muted">Carregando…</p>');
    loadHistory(b.dataset.histBtn, $('ia-modal-body'));
  }));
  $('ad-new').addEventListener('click', () => { $('ad-form').hidden = false; });
  $('ad-cancel').addEventListener('click', () => { $('ad-form').hidden = true; });
  $('ad-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const body = {};
    ['titulo', 'ml_id', 'link', 'preco', 'nota', 'vendedor', 'vendas', 'reputacao', 'cidade', 'estado', 'data_criacao', 'comentarios_texto', 'descricao', 'observacoes'].forEach((k) => { if (f[k].value) body[k] = f[k].value; });
    if (f.foto.value.trim()) body.foto = f.foto.value.trim();
    if (f.ficha.value.trim()) body.ficha = f.ficha.value.trim();
    body.is_full = f.is_full.checked; body.is_flex = f.is_flex.checked;
    try {
      await api(`/api/analise/products/${productId}/ads`, { method: 'POST', body: JSON.stringify(body) });
      openDetail(productId);
    } catch (err) { $('ad-msg').textContent = err.message; $('ad-msg').className = 'form-msg c-danger'; }
  });
  $('detail-ads').querySelectorAll('[data-mon]').forEach((c) => c.addEventListener('change', async () => {
    await api(`/api/analise/ads/${c.dataset.mon}/monitorar`, { method: 'POST', body: JSON.stringify({ monitorar: c.checked }) });
  }));
  $('detail-ads').querySelectorAll('[data-del-ad]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Remover este concorrente?')) return;
    await api(`/api/analise/ads/${b.dataset.delAd}`, { method: 'DELETE' });
    openDetail(productId);
  }));
  // recoleta imediata via extensão
  $('detail-ads').querySelectorAll('[data-recollect]').forEach((b) => b.addEventListener('click', async () => {
    const url = b.dataset.recollect;
    const orig = b.textContent;
    b.disabled = true; b.textContent = '🔄 Recoletando…';
    const r = await recollectAd(url);
    if (r && r.ok) { b.textContent = '✅ Atualizado'; setTimeout(() => openDetail(productId), 800); }
    else {
      b.disabled = false; b.textContent = orig;
      alert(r && r.error ? `Não foi possível recoletar: ${r.error}\n\nVerifique se a extensão FinanceEcom (v1.3.2+) está instalada e ativa.` : 'Falha ao recoletar. A extensão está instalada?');
    }
  }));
  // modal de vendas (7/15/21/30 dias) por card
  $('detail-ads').querySelectorAll('[data-vendas]').forEach((b) => b.addEventListener('click', () => openVendas(b.dataset.vendas, productId)));
  // editor de avaliações por card
  $('detail-ads').querySelectorAll('[data-review-btn]').forEach((b) => b.addEventListener('click', () => {
    const w = $('detail-ads').querySelector(`[data-edit-wrap="${b.dataset.reviewBtn}"]`);
    if (w) w.hidden = !w.hidden;
  }));
  $('detail-ads').querySelectorAll('[data-review-cancel]').forEach((b) => b.addEventListener('click', () => {
    const w = $('detail-ads').querySelector(`[data-edit-wrap="${b.dataset.reviewCancel}"]`); if (w) w.hidden = true;
  }));
  $('detail-ads').querySelectorAll('[data-review-save]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.reviewSave;
    const val = $('detail-ads').querySelector(`[data-review-input="${id}"]`).value;
    b.disabled = true;
    try { await api(`/api/analise/ads/${id}`, { method: 'PUT', body: JSON.stringify({ comentarios_texto: val }) }); openDetail(productId); }
    catch (e) { alert(e.message); b.disabled = false; }
  }));
}

function backToList() {
  $('view-detail').hidden = true; $('view-list').hidden = false;
  loadProducts();
}
$('back-list').addEventListener('click', backToList);

async function loadUsage() {
  try {
    const u = await api('/api/ai-usage');
    const brl = (usd) => 'US$ ' + (Number(usd) || 0).toFixed(2);
    if (!u.total.calls) { $('ia-usage').hidden = true; return; }
    $('ia-usage').hidden = false;
    $('ia-usage').innerHTML = `
      <span class="usage-title">Gastos de IA</span>
      <span class="usage-item"><b>${u.total.calls}</b> chamadas</span>
      <span class="usage-item"><b>${u.analises}</b> análises</span>
      <span class="usage-item"><b>${u.criativos}</b> criativos</span>
      <span class="usage-item">mês: <b>${brl(u.mes.cost_usd)}</b></span>
      <span class="usage-item usage-total">Total: <b>${brl(u.total.cost_usd)}</b></span>`;
  } catch (_) { $('ia-usage').hidden = true; }
}

// ---------------------------------------------------------------------------
(async () => {
  const session = await initShell('analise');
  if (!session) return;
  await loadAiSettings();
  await loadUsage();
  await loadProducts();
})();
