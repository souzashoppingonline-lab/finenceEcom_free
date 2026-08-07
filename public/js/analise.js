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
  el.querySelectorAll('[data-ia]').forEach((b) => b.addEventListener('click', () => {
    alert('A análise por IA será ativada na Fase 2. Seu token já está configurado e pronto.');
  }));
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

  renderAds(id, ads);
}

function renderAds(productId, ads) {
  const rows = ads.map((a) => `<tr>
    <td>${a.link ? `<a href="${esc(a.link)}" target="_blank" rel="noopener">${esc(a.titulo || a.ml_id || '—')}</a>` : esc(a.titulo || a.ml_id || '—')}</td>
    <td>${a.preco != null ? money(a.preco) : '—'}</td>
    <td>${a.nota != null && a.nota > 0 ? '⭐ ' + a.nota : '—'}</td>
    <td>${esc(a.vendedor || '—')}</td>
    <td>${esc(a.vendas || '—')}</td>
    <td><label class="switch-sm"><input type="checkbox" data-mon="${a.id}" ${a.monitorar ? 'checked' : ''}/> monitorar</label></td>
    <td><button class="btn-ghost" data-del-ad="${a.id}">✕</button></td>
  </tr>`).join('');

  $('detail-ads').innerHTML = `
    <div class="dash-head-row" style="margin-top:18px">
      <h3 style="margin:0">Concorrentes (${ads.length}/10)</h3>
      <button id="ad-new" class="btn-inline">+ Adicionar concorrente</button>
    </div>
    <form id="ad-form" class="card" hidden style="margin-top:12px">
      <h4>Novo concorrente (manual)</h4>
      <p class="muted">Na Fase 3, isso será feito com 1 clique pela extensão. Por enquanto, adicione à mão.</p>
      <div class="two-col">
        <label>Título<input name="titulo" placeholder="Nome do anúncio" /></label>
        <label>MLB<input name="ml_id" placeholder="MLB1234567890" /></label>
      </div>
      <label>Link do anúncio<input name="link" placeholder="https://produto.mercadolivre.com.br/MLB-..." /></label>
      <div class="two-col">
        <label>Preço (R$)<input name="preco" type="number" min="0" step="0.01" placeholder="0,00" /></label>
        <label>Nota<input name="nota" type="number" min="0" max="5" step="0.1" placeholder="0-5" /></label>
      </div>
      <div class="two-col">
        <label>Vendedor<input name="vendedor" placeholder="Opcional" /></label>
        <label>Vendas<input name="vendas" placeholder="Ex.: +1000 vendidos" /></label>
      </div>
      <div class="head-actions">
        <button type="submit" class="btn-cadastrar" style="max-width:200px">Adicionar</button>
        <button type="button" id="ad-cancel" class="btn-ghost">Cancelar</button>
      </div>
      <p id="ad-msg" class="form-msg"></p>
    </form>
    ${ads.length === 0 ? '<p class="muted" style="margin-top:12px">Nenhum concorrente salvo ainda.</p>' : `
    <div class="table-wrap" style="margin-top:12px"><table>
      <thead><tr><th>Anúncio</th><th>Preço</th><th>Nota</th><th>Vendedor</th><th>Vendas</th><th></th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`}`;

  $('ad-new').addEventListener('click', () => { $('ad-form').hidden = false; });
  $('ad-cancel').addEventListener('click', () => { $('ad-form').hidden = true; });
  $('ad-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const body = {};
    ['titulo', 'ml_id', 'link', 'preco', 'nota', 'vendedor', 'vendas'].forEach((k) => { if (f[k].value) body[k] = f[k].value; });
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
