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

// ---------- Inteligência da Categoria ----------
function rankCard(x) {
  return `<a class="op-card" href="${esc(x.link || '#')}" target="_blank" rel="noopener">
    <span class="op-rank">${x.rank}</span>
    <div class="op-thumb">${x.thumb ? `<img src="${esc(x.thumb)}" alt="" loading="lazy"/>` : ''}</div>
    <div class="op-info">
      <div class="op-title">${esc((x.title || '').slice(0, 80))}</div>
      <div class="op-badges">
        <span class="op-vd">${x.price != null ? money(x.price) : '—'}</span>
        ${x.full ? '<span class="op-full">FULL</span>' : ''}
        ${x.sold ? `<span class="op-new">${x.sold} vendas</span>` : ''}
      </div>
    </div>
  </a>`;
}

function faixasHtml(faixas, stats) {
  if (!faixas || !faixas.length) return '';
  const maxC = Math.max(...faixas.map((f) => f.count), 1);
  const sweet = faixas.reduce((a, b) => (b.count > a.count ? b : a), faixas[0]);
  const bars = faixas.map((f) => {
    const isSweet = f === sweet && f.count > 0;
    return `<div class="fx-row">
      <span class="fx-label">${money(f.lo)}–${money(f.hi)}</span>
      <div class="fx-bar-wrap"><div class="fx-bar ${isSweet ? 'fx-sweet' : ''}" style="width:${(f.count / maxC * 100).toFixed(0)}%"></div></div>
      <span class="fx-count">${f.count}</span>
    </div>`;
  }).join('');
  const kpi = (l, v) => `<div class="fin-kpi"><span>${l}</span><b>${v}</b></div>`;
  return `
    <div class="fin-grid" style="grid-template-columns:repeat(4,1fr);max-width:640px">
      ${kpi('Menor', money(stats.min))}${kpi('Mediana', money(stats.median))}${kpi('Média', money(stats.media))}${kpi('Maior', money(stats.max))}
    </div>
    <p class="muted" style="margin:12px 0 6px">🎯 <b>Faixa vencedora:</b> ${money(sweet.lo)}–${money(sweet.hi)} concentra ${sweet.count} dos ${stats.count} campeões.</p>
    <div class="fx-chart">${bars}</div>`;
}

$('op-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cat = $('op-cat').value.trim(), q = $('op-q').value.trim();
  if (!cat && !q) { $('op-msg').textContent = 'Preencha ao menos a categoria ou a palavra-chave.'; return; }
  $('op-msg').textContent = '';
  $('op-results').innerHTML = '<p class="muted">Analisando a categoria… (pode levar alguns segundos)</p>';
  try {
    const p = new URLSearchParams({ q, category: cat });
    const r = await api('/api/ml/category-intel?' + p.toString());
    let html = `<div class="ci-head"><span class="muted">Categoria:</span> <b>${esc(r.categoria.nome || r.categoria.id)}</b>`;
    if (r.total_anuncios != null) html += ` <span class="ci-comp">🏁 ${Number(r.total_anuncios).toLocaleString('pt-BR')} anúncios competindo</span>`;
    html += `</div>`;

    if (r.marcas && r.marcas.length) {
      html += `<h3 class="v-section-title">🥇 Marcas que dominam</h3><div class="card" style="margin-bottom:18px"><div class="chips">${r.marcas.map((m) => `<span class="chip-b">${esc(m.nome)} <b>${m.count}</b></span>`).join('')}</div></div>`;
    }
    if (r.atributos && r.atributos.length) {
      html += `<h3 class="v-section-title">🧬 Atributos vencedores <span class="muted" style="font-weight:400;font-size:.85rem">(o que os campeões têm em comum)</span></h3><div class="card" style="margin-bottom:18px"><div class="chips">${r.atributos.map((a) => `<span class="chip-a">${esc(a.k)} <b>${a.count}</b></span>`).join('')}</div></div>`;
    }
    if (r.stats) {
      html += `<h3 class="v-section-title">💰 Faixa de preço vencedora</h3><div class="card" style="margin-bottom:18px">${faixasHtml(r.faixas, r.stats)}</div>`;
    }
    html += `<h3 class="v-section-title">🏆 Ranking de mais vendidos (${r.ranking.length})</h3>`;
    html += r.ranking.length ? '<div class="op-grid">' + r.ranking.map(rankCard).join('') + '</div>'
      : '<p class="muted">O Mercado Livre não expôs o ranking desta categoria. Tente uma categoria mais específica.</p>';
    $('op-results').innerHTML = html;
  } catch (err) { $('op-results').innerHTML = `<p class="c-danger">${esc(err.message)}</p>`; }
});

(async () => {
  const session = await initShell('mltend');
  if (!session) return;
  await checkStatus();
})();
