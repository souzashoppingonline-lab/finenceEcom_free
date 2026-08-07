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

(async () => {
  const session = await initShell('mltend');
  if (!session) return;
  await checkStatus();
})();
