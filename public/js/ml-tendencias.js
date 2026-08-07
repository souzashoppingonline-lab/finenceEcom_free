// ===========================================================================
// ML Tendências — palavras em alta + mais vendidos (API oficial do ML)
// ===========================================================================
const $ = (id) => document.getElementById(id);
const money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

async function checkStatus() {
  try {
    const s = await api('/api/ml/status');
    if (s.connected) { $('ml-status').innerHTML = ''; return true; }
    $('ml-status').innerHTML = `<div class="card" style="border-left:4px solid #f5b301;margin-bottom:16px">
      <b>⚠️ Mercado Livre ainda não conectado.</b>
      <p class="muted">${s.configured ? 'O administrador precisa autorizar o app uma vez.' : 'Configure ML_CLIENT_ID / ML_CLIENT_SECRET no servidor.'}</p>
    </div>`;
    return false;
  } catch (_) { return false; }
}

function renderTrends(trends) {
  if (!trends || !trends.length) { $('ml-trends').innerHTML = '<p class="muted">Sem palavras em alta para esta categoria.</p>'; return; }
  $('ml-trends').innerHTML = '<ol class="ml-kw">' + trends.map((t) => {
    const kw = t.keyword || t.keyword || t;
    return `<li>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(kw)}</a>` : esc(kw)}</li>`;
  }).join('') + '</ol>';
}

function renderTop(items) {
  if (!items || !items.length) { $('ml-top').innerHTML = '<p class="muted">Sem ranking de mais vendidos para esta categoria.</p>'; return; }
  $('ml-top').innerHTML = '<div class="ml-top-grid">' + items.map((b, i) => `
    <a class="ml-top-card" href="${esc(b.link || '#')}" target="_blank" rel="noopener">
      <span class="ml-rank">${i + 1}</span>
      <div class="ml-thumb">${b.thumb ? `<img src="${esc(b.thumb)}" alt="" loading="lazy"/>` : ''}</div>
      <div class="ml-info">
        <div class="ml-title">${esc((b.title || '').slice(0, 70))}</div>
        <div class="ml-price">${b.price != null ? money(b.price) : '—'}</div>
        ${b.sold ? `<div class="muted" style="font-size:.78rem">${b.sold} vendidos</div>` : ''}
      </div>
    </a>`).join('') + '</div>';
}

$('ml-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('ml-q').value.trim();
  $('ml-trends').innerHTML = '<p class="muted">Carregando…</p>';
  $('ml-top').innerHTML = '<p class="muted">Carregando…</p>';
  $('ml-cat').textContent = '';
  try {
    const r = await api(`/api/ml/trends?q=${encodeURIComponent(q)}`);
    if (r.categoria) $('ml-cat').innerHTML = `Categoria detectada: <b>${esc(r.categoria.nome || r.categoria.id)}</b>${r.cached ? ' <span class="muted">(cache)</span>' : ''}`;
    renderTrends(r.trends);
    renderTop(r.mais_vendidos);
  } catch (err) {
    $('ml-trends').innerHTML = `<p class="c-danger">${esc(err.message)}</p>`;
    $('ml-top').innerHTML = '';
  }
});

// ---------- Abas ----------
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x === t));
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== t.dataset.tab; });
}));

// ---------- Caça Oportunidade ----------
function opCard(x) {
  const novo = x.ageDays <= 30;
  return `<a class="op-card" href="${esc(x.link || '#')}" target="_blank" rel="noopener">
    <div class="op-thumb">${x.thumb ? `<img src="${esc(x.thumb)}" alt="" loading="lazy"/>` : ''}</div>
    <div class="op-info">
      <div class="op-title">${esc((x.title || '').slice(0, 80))}</div>
      <div class="op-badges">
        <span class="op-vd">🔥 ${x.vendasDia}/dia</span>
        ${novo ? '<span class="op-new">🆕 novo</span>' : ''}
        ${x.full ? '<span class="op-full">FULL</span>' : ''}
      </div>
      <div class="op-meta">
        <span>💰 ${x.price != null ? money(x.price) : '—'}</span>
        <span>📦 ${x.sold} vendas</span>
        <span>🗓️ ${x.ageDays} dias</span>
      </div>
    </div>
  </a>`;
}

$('op-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cat = $('op-cat').value.trim(), q = $('op-q').value.trim();
  if (!cat && !q) { $('op-msg').textContent = 'Preencha ao menos a categoria ou a palavra-chave.'; return; }
  const age = $('op-age').value, minSales = $('op-sales').value;
  $('op-msg').textContent = '';
  $('op-results').innerHTML = '<p class="muted">Buscando e calculando vendas/dia… (pode levar alguns segundos)</p>';
  try {
    const p = new URLSearchParams({ q, category: cat, age, minSales });
    const r = await api('/api/ml/opportunities?' + p.toString());
    if (!r.itens.length) { $('op-results').innerHTML = '<p class="muted">Nenhum anúncio bateu os filtros. Tente afrouxar (mais dias ou menos vendas).</p>'; return; }
    const head = `<p class="muted" style="margin-bottom:10px">${r.total} oportunidades${r.categoria ? ' · categoria <b>' + esc(r.categoria.nome || r.categoria.id) + '</b>' : ''} · ordenado por vendas/dia</p>`;
    $('op-results').innerHTML = head + '<div class="op-grid">' + r.itens.map(opCard).join('') + '</div>';
  } catch (err) { $('op-results').innerHTML = `<p class="c-danger">${esc(err.message)}</p>`; }
});

(async () => {
  const session = await initShell('mltend');
  if (!session) return;
  await checkStatus();
})();
