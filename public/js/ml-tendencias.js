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

// ===========================================================================
// Abas de inteligência (Buy Box, Dores, Barreira, Nichos, Perfeito, Descobrir)
// ===========================================================================
const catHead = (cat, extra = '') =>
  `<div class="ci-head"><span class="muted">Categoria:</span> <b>${esc((cat && (cat.nome || cat.id)) || '—')}</b>${extra}</div>`;

const INTEL = {
  buybox: {
    url: (p) => '/api/ml/buybox?' + p,
    render: (r) => {
      if (!r.linhas || !r.linhas.length) return '<p class="muted">Nenhum produto de catálogo com disputa de Buy Box nesta categoria. Tente uma busca mais específica.</p>';
      return catHead(r.categoria, ` <span class="ci-comp">🥇 ${r.linhas.length} produtos com Buy Box</span>`) +
        '<div class="bb-grid">' + r.linhas.map((l) => `
          <div class="bb-card">
            <div class="bb-thumb">${l.thumb ? `<img src="${esc(l.thumb)}" alt="" loading="lazy"/>` : ''}</div>
            <div class="bb-info">
              <a class="bb-title" href="${esc(l.link || '#')}" target="_blank" rel="noopener">${esc((l.title || '').slice(0, 70))}</a>
              <div class="bb-nums">
                <span class="bb-win">Vencedor ${money(l.vencedor)}</span>
                <span class="bb-2nd">2º ${l.segundo != null ? money(l.segundo) : '—'}</span>
                <span class="bb-gap ${l.gap <= 1 ? 'bb-hot' : ''}">Folga ${money(l.gap)}</span>
              </div>
              <div class="muted" style="font-size:.8rem">${l.concorrentes} vendedores disputando · preço p/ vencer ≈ <b>${money(l.alvo)}</b></div>
            </div>
          </div>`).join('') + '</div>';
    },
  },
  dores: {
    url: (p) => '/api/ml/reviews?' + p,
    render: (r) => {
      const total = [1,2,3,4,5].reduce((a, n) => a + (r.dist[n] || 0), 0) || 1;
      const bars = [5,4,3,2,1].map((n) => {
        const c = r.dist[n] || 0;
        return `<div class="fx-row"><span class="fx-label">${'⭐'.repeat(n)}</span>
          <div class="fx-bar-wrap"><div class="fx-bar ${n<=2?'fx-bad':''}" style="width:${(c/total*100).toFixed(0)}%"></div></div>
          <span class="fx-count">${c}</span></div>`;
      }).join('');
      const neg = (r.negativos || []).map((x) => `<div class="dor-item"><span class="dor-nota">${'⭐'.repeat(x.nota)}</span><p>${esc(x.texto)}</p><span class="muted" style="font-size:.75rem">${esc((x.produto||'').slice(0,50))}</span></div>`).join('');
      return catHead(r.categoria, r.media ? ` <span class="ci-comp">⭐ ${r.media} · ${Number(r.total_avaliacoes).toLocaleString('pt-BR')} avaliações</span>` : '') +
        `<div class="dor-cols">
          <div class="card"><h3 class="v-section-title" style="margin-top:0">Distribuição de notas</h3><div class="fx-chart">${bars}</div></div>
          <div class="card"><h3 class="v-section-title" style="margin-top:0">😖 O que reclamam (nota ≤ 3)</h3>${neg || '<p class="muted">Sem reclamações públicas coletadas — bom sinal, ou avaliações ainda escassas.</p>'}</div>
        </div>`;
    },
  },
  barreira: {
    url: (p) => '/api/ml/barrier?' + p,
    render: (r) => {
      const cor = r.score >= 66 ? '#e5484d' : r.score >= 33 ? '#f5b301' : '#30a46c';
      const vend = (r.vendedores || []).map((v) => `<tr><td>${esc(v.nick||'—')}</td><td>${esc(v.status||v.level||'—')}</td><td>${v.vendas!=null?Number(v.vendas).toLocaleString('pt-BR'):'—'}</td><td>${esc(v.cidade||'—')}</td></tr>`).join('');
      return catHead(r.categoria) +
        `<div class="bar-kpis">
          <div class="bar-gauge"><div class="bar-score" style="color:${cor}">${r.score}<span>/100</span></div><div class="bar-lvl" style="color:${cor}">${esc(r.nivelDif)}</div></div>
          <div class="fin-grid" style="grid-template-columns:repeat(3,1fr);flex:1">
            <div class="fin-kpi"><span>Anúncios no Full</span><b>${r.pctFull}%</b></div>
            <div class="fin-kpi"><span>Vendedores Platinum</span><b>${r.platinum}</b></div>
            <div class="fin-kpi"><span>Vendedores Gold</span><b>${r.gold}</b></div>
          </div>
        </div>
        <h3 class="v-section-title">Quem domina a categoria</h3>
        <div class="card" style="overflow-x:auto"><table class="mini-table"><thead><tr><th>Vendedor</th><th>Reputação</th><th>Vendas</th><th>Estado</th></tr></thead><tbody>${vend || '<tr><td colspan="4" class="muted">Sem dados de vendedores.</td></tr>'}</tbody></table></div>`;
    },
  },
  nichos: {
    url: (p) => '/api/ml/niches?' + p,
    render: (r) => {
      if (!r.nichos || !r.nichos.length) return catHead(r.categoria) + '<p class="muted">Esta categoria não tem subcategorias expostas. Tente uma categoria mais ampla.</p>';
      const max = Math.max(...r.nichos.map((n) => n.total || 0), 1);
      const rows = r.nichos.map((n) => `<div class="fx-row"><span class="fx-label" style="min-width:180px">${esc(n.nome)}</span>
        <div class="fx-bar-wrap"><div class="fx-bar" style="width:${((n.total||0)/max*100).toFixed(0)}%"></div></div>
        <span class="fx-count">${n.total!=null?Number(n.total).toLocaleString('pt-BR'):'—'}</span></div>`).join('');
      return catHead(r.categoria, r.total_pai != null ? ` <span class="ci-comp">🏁 ${Number(r.total_pai).toLocaleString('pt-BR')} anúncios no total</span>` : '') +
        `<p class="muted" style="margin:12px 0 6px">Ordenado do <b>menos concorrido</b> (topo) ao mais concorrido — menos anúncios = mais espaço.</p>
         <div class="card"><div class="fx-chart">${rows}</div></div>`;
    },
  },
  perfeito: {
    url: (p) => '/api/ml/checklist?' + p,
    render: (r) => {
      const item = (a) => `<div class="ck-item"><b>${esc(a.nome)}</b>${a.catalogo?'<span class="ck-tag">catálogo</span>':''}${a.valores&&a.valores.length?`<span class="muted" style="font-size:.78rem">ex.: ${esc(a.valores.slice(0,4).join(', '))}</span>`:''}</div>`;
      return catHead(r.categoria) +
        `<div class="dor-cols">
          <div class="card"><h3 class="v-section-title" style="margin-top:0">🔴 Obrigatórios (${(r.obrigatorios||[]).length})</h3>${(r.obrigatorios||[]).map(item).join('') || '<p class="muted">Sem atributos obrigatórios.</p>'}</div>
          <div class="card"><h3 class="v-section-title" style="margin-top:0">🟢 Recomendados (${(r.recomendados||[]).length})</h3>${(r.recomendados||[]).map(item).join('') || '<p class="muted">Sem atributos recomendados.</p>'}</div>
        </div>`;
    },
  },
  descobrir: {
    url: (p) => '/api/ml/catalog-search?' + p,
    render: (r) => {
      if (!r.produtos || !r.produtos.length) return '<p class="muted">Nenhum produto de catálogo encontrado para esta busca.</p>';
      return `<p class="muted" style="margin-bottom:10px">${Number(r.total).toLocaleString('pt-BR')} produtos no catálogo · mostrando ${r.produtos.length}</p>
        <div class="op-grid">` + r.produtos.map((p) => `
          <a class="op-card" href="${esc(p.link||'#')}" target="_blank" rel="noopener">
            <div class="op-thumb">${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy"/>` : ''}</div>
            <div class="op-info"><div class="op-title">${esc((p.nome||'').slice(0,80))}</div>
              <div class="op-badges"><span class="op-vd">${p.preco!=null?money(p.preco):'—'}</span><span class="op-full">CATÁLOGO</span></div>
            </div></a>`).join('') + '</div>';
    },
  },
};

document.querySelectorAll('.intel-form').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = form.dataset.endpoint;
    const cfg = INTEL[key];
    const box = form.closest('.tab-panel').querySelector('.intel-results');
    const q = (form.q && form.q.value.trim()) || '';
    const cat = (form.cat && form.cat.value.trim()) || '';
    if (!q && !cat) { box.innerHTML = '<p class="c-danger">Preencha ao menos a categoria ou a palavra-chave.</p>'; return; }
    box.innerHTML = '<p class="muted">Consultando o Mercado Livre… (pode levar alguns segundos)</p>';
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (cat) params.set('category', cat);
      const r = await api(cfg.url(params.toString()));
      box.innerHTML = cfg.render(r);
    } catch (err) { box.innerHTML = `<p class="c-danger">${esc(err.message)}</p>`; }
  });
});

(async () => {
  const session = await initShell('mltend');
  if (!session) return;
  await checkStatus();
})();
