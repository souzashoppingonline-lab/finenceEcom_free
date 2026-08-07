// ===========================================================================
// FinanceEcom — Análise de Produtos — content script (lê a página do anúncio)
// ===========================================================================
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const txt = (el) => (el ? el.textContent.trim() : '');

  function parseMoney(s) {
    if (!s) return null;
    const m = String(s).replace(/\s/g, '').match(/([\d.]+),?(\d{2})?/);
    if (!m) return null;
    const int = m[1].replace(/\./g, '');
    return Number(int + (m[2] ? '.' + m[2] : ''));
  }

  function getJsonLd() {
    for (const s of $$('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent);
        const arr = Array.isArray(j) ? j : [j];
        const prod = arr.find((x) => x['@type'] === 'Product') || arr[0];
        if (prod) return prod;
      } catch (_) {}
    }
    return null;
  }

  function getMlId() {
    const m = (location.href.match(/MLB-?(\d{6,})/i) || [])[1];
    if (m) return 'MLB' + m;
    const meta = $('meta[itemprop="productID"]');
    if (meta && /MLB\d+/.test(meta.content)) return meta.content;
    return null;
  }

  function getPrice() {
    const el = $('.ui-pdp-price__second-line .andes-money-amount__fraction')
      || $('[data-testid="price-part"] .andes-money-amount__fraction')
      || $('.andes-money-amount__fraction');
    const cents = $('.ui-pdp-price__second-line .andes-money-amount__cents');
    if (!el) return null;
    return Number(txt(el).replace(/\./g, '') + '.' + (cents ? txt(cents) : '00'));
  }

  function getOriginalPrice() {
    const el = $('.ui-pdp-price__original-value .andes-money-amount__fraction')
      || $('s .andes-money-amount__fraction');
    return el ? Number(txt(el).replace(/\./g, '') + '.00') : null;
  }

  function getRating() {
    const el = $('.ui-pdp-review__rating') || $('.ui-review-capability__rating__average')
      || $('[data-testid="rating"] .ui-pdp-review__rating');
    const v = parseFloat(txt(el).replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  function getReviewsCount() {
    const el = $('.ui-pdp-review__amount') || $('.ui-review-capability__rating__label');
    const n = (txt(el).match(/\d+/) || [])[0];
    return n ? Number(n) : null;
  }

  function getVendas() {
    const sub = txt($('.ui-pdp-subtitle')) || txt($('.ui-pdp-header__subtitle'));
    const m = sub.match(/([+\d.]+)\s*vendid/i);
    return m ? m[0] : null;
  }

  function getSeller() {
    return txt($('.ui-pdp-seller__link-trigger-button'))
      || txt($('.ui-seller-data-header__title'))
      || txt($('.ui-pdp-seller__header__title'))
      || txt($('.ui-box-component-pdp__visible--desktop .ui-pdp-color--BLUE'))
      || null;
  }

  function getReputacao() {
    const t = (txt($('.ui-pdp-seller__header__subtitle')) || txt($('.ui-seller-data-status__title')) || '').trim();
    if (/mercadol[ií]der/i.test(t)) return t;
    if ($('.ui-pdp-seller__header__title-mercado-lider') || $('[class*="mercado-lider"]')) {
      return txt($('[class*="mercado-lider"]')) || 'MercadoLíder';
    }
    return t || null;
  }

  function getLocation() {
    // procura "Cidade, UF" no bloco de vendedor/localização
    const blocks = ['.ui-seller-info', '.ui-pdp-seller', '.ui-vip-location', '.ui-pdp-color--GRAY'];
    for (const b of blocks) {
      for (const el of $$(b)) {
        const m = txt(el).match(/([A-Za-zÀ-ú.\s]+),\s*([A-Z]{2})\b/);
        if (m) return { cidade: m[1].trim(), estado: m[2] };
      }
    }
    return { cidade: null, estado: null };
  }

  function getFullFlex() {
    const html = document.body.innerHTML;
    const is_full = !!$('.ui-pdp-icon--full') || / FULL/i.test(txt($('.ui-pdp-buybox')) || '') || !!$('[class*="full-icon"]');
    const is_flex = /flex/i.test(txt($('.ui-pdp-buybox')) || '') || /entrega no mesmo dia/i.test(html);
    return { is_full, is_flex };
  }

  function getFotos() {
    const set = new Set();
    $$('.ui-pdp-gallery__figure img, .ui-pdp-image, figure.ui-pdp-gallery__figure img').forEach((img) => {
      const src = img.getAttribute('data-zoom') || img.getAttribute('src');
      if (src && /http/.test(src)) set.add(src.replace(/-[A-Z]\.(jpg|webp|png)/i, '-F.$1'));
    });
    return Array.from(set).slice(0, 8);
  }

  function getDescricao() {
    return txt($('.ui-pdp-description__content')) || txt($('[data-testid="content"]')) || null;
  }

  function getHighlights() {
    const out = [];
    // ficha técnica em tabelas de especificações
    $$('.andes-table__row, .ui-pdp-specs__table tr, .ui-vpp-striped-specs__row').forEach((row) => {
      const k = txt(row.querySelector('th, .andes-table__header, .ui-vpp-striped-specs__label'));
      const v = txt(row.querySelector('td, .andes-table__column, .ui-vpp-striped-specs__value'));
      if (k && v) out.push(`${k}: ${v}`);
    });
    // destaques em lista
    $$('.ui-vpp-highlighted-specs__key-value, .ui-pdp-highlighted-specs__attribute').forEach((el) => {
      const t = txt(el); if (t) out.push(t);
    });
    return out.slice(0, 40);
  }

  function getReviews() {
    // SÓ quantidade + distribuição de estrelas (5..1). Textos ficam no campo manual.
    const dist = [];
    $$('.ui-review-capability-histogram__bar, .ui-review-capability-filters__pill, [class*="histogram"] [class*="bar"]').forEach((el) => {
      const t = (el.getAttribute('aria-label') || txt(el)).replace(/\s+/g, ' ');
      const m = t.match(/(\d)\s*estrela.*?(\d+)/i) || t.match(/(\d).*?\((\d+)\)/) || t.match(/(\d)\D+(\d+)/);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 5) dist.push(`${m[1]}★: ${m[2]}`);
    });
    return { count: getReviewsCount(), dist: dist.length ? dist.join(' · ') : null };
  }

  function collectAll() {
    const jsonLd = getJsonLd();
    const reviews = getReviews();
    const loc = getLocation();
    const ff = getFullFlex();
    const extracted = {
      ml_id: getMlId(),
      link: location.href.split('#')[0],
      titulo: txt($('.ui-pdp-title')) || (jsonLd && jsonLd.name) || document.title,
      preco: getPrice() ?? (jsonLd && jsonLd.offers && parseMoney(jsonLd.offers.price)),
      preco_original: getOriginalPrice(),
      nota: getRating() ?? (jsonLd && jsonLd.aggregateRating && Number(jsonLd.aggregateRating.ratingValue)),
      vendas: getVendas(),
      perguntas: null,
      comentarios: reviews.count,
      aval_dist: reviews.dist,
      vendedor: getSeller(),
      cidade: loc.cidade,
      estado: loc.estado,
      reputacao: getReputacao(),
      is_full: ff.is_full,
      is_flex: ff.is_flex,
      fotos: getFotos(),
      descricao: getDescricao(),
      highlights: getHighlights(),
    };
    return {
      url: extracted.link,
      title: extracted.titulo,
      pageText: (document.body.innerText || '').slice(0, 4000),
      jsonLd,
      extracted,
    };
  }

  // Espera a página "amadurecer" (ML pinta o preço via JS após o load)
  function waitMature(maxMs = 8000) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        const ok = getMlId() && (getPrice() != null || $('.ui-pdp-title'));
        if (ok || Date.now() - t0 > maxMs) resolve(collectAll());
        else setTimeout(tick, 400);
      };
      tick();
    });
  }

  // ----- Auto-captura (recoleta em aba oculta, Fase 4) -----
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'auto_capture') {
      waitMature().then((rawData) => sendResponse({ ok: true, rawData }));
      return true; // resposta assíncrona
    }
    if (msg && msg.action === 'collect_now') {
      sendResponse({ ok: true, rawData: collectAll() });
      return true;
    }
  });

  // ----- Painel flutuante com botão "Salvar na análise" -----
  if (!getMlId()) return; // só em página de anúncio
  if (document.getElementById('fec-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'fec-panel';
  panel.innerHTML = `
    <div id="fec-head">🔎 FinanceEcom <span id="fec-min">—</span></div>
    <div id="fec-body">
      <div id="fec-target" class="fec-muted">carregando alvo…</div>
      <button id="fec-save">💾 Salvar na análise</button>
      <div id="fec-msg"></div>
    </div>`;
  document.body.appendChild(panel);

  const style = document.createElement('style');
  style.textContent = `
    #fec-panel{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:230px;
      background:#0a1428;color:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.4);
      font-family:system-ui,sans-serif;font-size:13px;overflow:hidden}
    #fec-head{background:linear-gradient(120deg,#1e6fff,#22d3ee);padding:8px 12px;font-weight:700;
      display:flex;justify-content:space-between;cursor:pointer}
    #fec-body{padding:12px}
    #fec-target{margin-bottom:8px;font-size:12px}
    .fec-muted{color:#9fb3d0}
    #fec-save{width:100%;background:#1e6fff;color:#fff;border:0;border-radius:8px;padding:10px;
      font-weight:700;cursor:pointer;font-size:13px}
    #fec-save:hover{background:#1657d6}
    #fec-save:disabled{opacity:.6;cursor:default}
    #fec-msg{margin-top:8px;font-size:12px;min-height:14px}
    #fec-panel.min #fec-body{display:none}`;
  document.head.appendChild(style);

  document.getElementById('fec-head').addEventListener('click', () => panel.classList.toggle('min'));

  const msg = (t, color) => { const m = document.getElementById('fec-msg'); m.textContent = t; m.style.color = color || '#9fb3d0'; };

  // mostra o produto ativo
  chrome.runtime.sendMessage({ action: 'get_target' }, (r) => {
    const el = document.getElementById('fec-target');
    if (chrome.runtime.lastError || !r) { el.textContent = 'Configure o token na extensão'; return; }
    if (r.error) { el.textContent = r.error; el.className = 'fec-muted'; }
    else if (r.produto) { el.innerHTML = 'Alvo: <b>' + (r.produto.nome || '—') + '</b>'; }
    else { el.textContent = 'Nenhum produto em coleta. Ative um no painel.'; }
  });

  document.getElementById('fec-save').addEventListener('click', () => {
    const btn = document.getElementById('fec-save');
    btn.disabled = true; msg('Lendo o anúncio…');
    const rawData = collectAll();
    chrome.runtime.sendMessage({ action: 'collect_data', rawData }, (r) => {
      btn.disabled = false;
      if (chrome.runtime.lastError) { msg('Erro de conexão com a extensão.', '#ff8a8a'); return; }
      if (r && r.ok) msg('✅ Concorrente salvo!', '#7ee6b0');
      else msg((r && r.error) || 'Erro ao salvar.', '#ff8a8a');
    });
  });
})();
