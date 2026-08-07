// ===========================================================================
// Análise de Produtos — Fase 1 (página + tokens + CRUD)
// ===========================================================================
const $ = (id) => document.getElementById(id);
const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let products = [];
let activeId = null;
let aiState = { provider: 'anthropic', has_anthropic: false, has_openai: false };

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
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
  $('ext-token').value = s.ext_token || '';
  // status resumo no cabeçalho do card
  const keyOk = (s.provider === 'openai' && s.has_openai) || (s.provider === 'anthropic' && s.has_anthropic);
  $('ia-status').textContent = keyOk ? '✅ IA configurada' : '⚠️ IA não configurada';
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

$('save-ia').addEventListener('click', async () => {
  const provider = document.querySelector('#prov-select .status-btn.is-active').dataset.p;
  const body = { provider };
  const ak = $('key-anthropic').value.trim();
  const ok = $('key-openai').value.trim();
  if (ak) body.anthropic_key = ak;   // só envia se digitou algo (não apaga o salvo à toa)
  if (ok) body.openai_key = ok;
  $('save-ia').disabled = true;
  try {
    await api('/api/ai-settings', { method: 'PUT', body: JSON.stringify(body) });
    $('key-anthropic').value = ''; $('key-openai').value = '';
    $('ia-msg').textContent = 'Configurações salvas ✅'; $('ia-msg').className = 'form-msg c-ok';
    await loadAiSettings();
    renderProducts(); // atualiza estado dos botões "Analisar com IA"
  } catch (e) { $('ia-msg').textContent = e.message; $('ia-msg').className = 'form-msg c-danger'; }
  $('save-ia').disabled = false;
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
  const iaBtn = iaReady()
    ? '<button class="btn-inline" data-ia="1">🤖 Analisar com IA</button>'
    : '<button class="btn-ghost" disabled title="Configure seu token de IA acima">🤖 IA (configure o token)</button>';
  el.innerHTML = products.map((p) => {
    const isActive = String(p.id) === String(activeId);
    return `<div class="card period-card" data-id="${p.id}">
      <div class="dash-head-row">
        <h4 style="margin:0">${esc(p.produto)}</h4>
        ${isActive ? '<span class="c-ok" style="font-size:.8rem">🟢 Em coleta</span>' : ''}
      </div>
      <p class="muted" style="margin:6px 0">${p.fornecedor ? esc(p.fornecedor) + ' · ' : ''}Compra: ${money(p.preco_compra)}</p>
      <div class="head-actions" style="margin-top:10px;flex-wrap:wrap;gap:8px">
        <button class="btn-inline" data-open="${p.id}">Abrir</button>
        ${iaBtn}
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.open)));
  el.querySelectorAll('[data-ia]').forEach((b) => b.addEventListener('click', () => runAnalysis(b.dataset.ia, b)));
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

async function runAnalysis(productId, btn) {
  if (!iaReady()) { alert('Configure seu token de IA nas Configurações acima.'); return; }
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '🤖 Analisando…'; }
  openModal('🤖 Análise por IA', '<p class="muted">A IA está analisando o anúncio, aguarde alguns segundos…</p>');
  try {
    const r = await api(`/api/analise/products/${productId}/analyze`, { method: 'POST' });
    const when = r.at ? new Date(r.at).toLocaleString('pt-BR') : '';
    openModal(`🤖 Análise por IA <small class="muted" style="font-weight:400">(${r.provider === 'openai' ? 'ChatGPT' : 'Claude'} · ${when})</small>`, mdToHtml(r.analysis));
  } catch (e) {
    openModal('🤖 Análise por IA', `<p class="c-danger">${esc(e.message)}</p>`);
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
  $('view-list').hidden = true; $('view-detail').hidden = false;

  $('detail-head').innerHTML = `<div class="card" style="margin-top:12px">
    <div class="dash-head-row">
      <h2 style="margin:0">${esc(p.produto)}</h2>
      <div class="head-actions" style="flex-wrap:wrap;gap:8px">
        ${iaReady()
          ? `<button class="btn-inline" data-ia="${p.id}">🤖 Analisar com IA</button>`
          : '<button class="btn-ghost" disabled title="Configure seu token de IA acima">🤖 IA (configure o token)</button>'}
        ${isActive
          ? `<button class="btn-ghost" data-finalize="${p.id}">⏹ Finalizar coleta</button>`
          : `<button class="btn-inline" data-activate="${p.id}">▶ Coleta ativa</button>`}
        <button class="btn-ghost" data-edit="${p.id}">Editar</button>
        <button class="btn-ghost" data-del="${p.id}">Excluir</button>
      </div>
    </div>
    <p class="muted">${p.fornecedor ? esc(p.fornecedor) + ' · ' : ''}Compra ${money(p.preco_compra)} · Taxa MP ${(Number(p.taxa_mp) || 0)}% · Imposto ${(Number(p.imposto) || 0)}%</p>
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

  // última análise salva (se houver)
  if (p.analise_ia) {
    const when = p.analise_ia_at ? new Date(p.analise_ia_at).toLocaleString('pt-BR') : '';
    $('detail-head').insertAdjacentHTML('beforeend', `<div class="card ia-saved"><div class="dash-head-row"><h4 style="margin:0">🤖 Última análise por IA</h4><small class="muted">${when}</small></div><div class="ia-modal-body">${mdToHtml(p.analise_ia)}</div></div>`);
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
    if (!h.length) { container.innerHTML = '<p class="muted">Sem histórico ainda. A cada dia que a extensão recoletar, um ponto de preço é gravado aqui. Use “⚡ Forçar recoleta” no popup da extensão para gravar um ponto agora.</p>'; return; }
    const first = h[0].preco, last = h[h.length - 1].preco, delta = last - first;
    const menor = Math.min(...h.map((p) => p.preco)), maior = Math.max(...h.map((p) => p.preco));
    const deltaTxt = delta === 0 ? '➡️ estável' : (delta > 0 ? `🔺 subiu ${money(delta)}` : `🔻 caiu ${money(-delta)}`);
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
        <div class="ad-price">${a.preco != null ? money(a.preco) : '—'} ${a.preco_original && a.preco_original > a.preco ? `<s class="muted">${money(a.preco_original)}</s>` : ''}<span class="ad-price-tag">último preço</span></div>
        <div class="ad-meta">
          <span>⭐ ${a.nota && a.nota > 0 ? a.nota : 'sem nota'}${a.comentarios ? ` (${a.comentarios})` : ''}</span>
          ${a.vendas ? `<span>📦 ${esc(a.vendas)}</span>` : ''}
          ${a.vendedor ? `<span>🏷️ ${esc(a.vendedor)}</span>` : ''}
          ${a.cidade ? `<span>📍 ${esc(a.cidade)}${a.estado ? '/' + esc(a.estado) : ''}</span>` : ''}
          ${a.data_criacao ? `<span>🗓️ criado ${esc(a.data_criacao)}</span>` : ''}
        </div>
        <div class="ad-badges">${badges}</div>
      </div>
    </div>
    <div class="ad-sections">
      ${kws.length ? `<div class="ad-sec"><b>🔑 SEO / palavras-chave</b><div class="ad-kws">${kws.map((k) => `<span class="kw">${esc(k)}</span>`).join('')}</div></div>` : ''}
      ${ficha.length ? `<details class="ad-sec"><summary><b>📋 Ficha técnica</b> (${ficha.length})</summary><ul class="ad-ficha">${ficha.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}
      ${a.aval_dist ? `<div class="ad-sec"><b>⭐ Avaliações:</b> ${a.nota ? a.nota + ' · ' : ''}${a.comentarios || 0} no total<div class="ad-kws" style="margin-top:5px">${esc(a.aval_dist).split('·').map((d) => `<span class="kw">${esc(d.trim())}</span>`).join('')}</div></div>` : ''}
      ${a.comentarios_texto ? `<details class="ad-sec"><summary><b>💬 Avaliações (texto)</b></summary><div class="ad-desc">${esc(a.comentarios_texto).replace(/\n/g, '<br>')}</div></details>` : ''}
      ${a.descricao ? `<details class="ad-sec"><summary><b>📝 Descrição do anúncio</b></summary><div class="ad-desc">${esc(a.descricao).replace(/\n/g, '<br>')}</div></details>` : ''}
      ${a.observacoes ? `<div class="ad-sec"><b>🗒️ Minhas anotações:</b> ${esc(a.observacoes)}</div>` : ''}
    </div>
    <div class="ad-review-edit" data-edit-wrap="${a.id}" hidden>
      <label>💬 Avaliações do concorrente (cole os textos — a IA usa na análise)
        <textarea data-review-input="${a.id}" rows="5" placeholder="Cole aqui as avaliações, principalmente as de 1 a 3 estrelas (o que reclamam, o que falta)">${esc(a.comentarios_texto || '')}</textarea>
      </label>
      <div class="head-actions">
        <button class="btn-cadastrar" style="max-width:160px" data-review-save="${a.id}">Salvar</button>
        <button class="btn-ghost" data-review-cancel="${a.id}">Cancelar</button>
      </div>
    </div>
    <div class="ad-actions">
      <label class="switch-sm"><input type="checkbox" data-mon="${a.id}" ${a.monitorar ? 'checked' : ''}/> atualizar 1×/dia</label>
      <div class="head-actions" style="gap:6px">
        ${a.ml_id ? `<button class="btn-ghost" data-hist-btn="${esc(a.ml_id)}" data-hist-title="${esc(a.titulo || a.ml_id)}">📈 Preço</button>` : ''}
        <button class="btn-ghost" data-review-btn="${a.id}">💬 Avaliações</button>
        <button class="btn-ghost" data-del-ad="${a.id}">Remover</button>
      </div>
    </div>
  </div>`;
}

function renderAds(productId, ads) {
  $('detail-ads').innerHTML = `
    <div class="dash-head-row" style="margin-top:18px">
      <h3 style="margin:0">Concorrentes (${ads.length}/10)</h3>
      <div class="head-actions" style="gap:8px">
        <button id="ad-refresh" class="btn-ghost">🔄 Atualizar</button>
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
    ${ads.length === 0 ? '<p class="muted" style="margin-top:12px">Nenhum concorrente salvo ainda. Clique em “+ Adicionar concorrente”.</p>'
      : `<div class="ad-grid">${ads.map(adCard).join('')}</div>`}`;

  $('ad-refresh').addEventListener('click', () => openDetail(productId));
  // histórico de preço: abre modal com gráfico animado
  $('detail-ads').querySelectorAll('[data-hist-btn]').forEach((b) => b.addEventListener('click', () => {
    openModal(`📈 Histórico de preço <small class="muted" style="font-weight:400">${esc(b.dataset.histTitle || '')}</small>`, '<p class="muted">Carregando…</p>');
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

// ---------------------------------------------------------------------------
(async () => {
  const session = await initShell('analise');
  if (!session) return;
  await loadAiSettings();
  await loadProducts();
})();
