// ===========================================================================
// Shell do app logado: sidebar, tema claro/escuro, sessao e logout.
// Requer que auth-common.js (com `sb`) tenha carregado antes.
// ===========================================================================
let _session = null;

function applyCollapsed(collapsed) {
  document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
  localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0');
  const btn = document.getElementById('side-collapse');
  if (btn) btn.textContent = collapsed ? '»' : '«';
}

const THEME_ORDER = ['light', 'dark', 'sepia', 'emerald', 'oled'];
function applyTheme(theme) {
  if (!THEME_ORDER.includes(theme)) theme = 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  document.querySelectorAll('.tp-dot').forEach((d) => d.classList.toggle('is-active', d.dataset.theme === theme));
}

const SVG = (p) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICONS = {
  user: SVG('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"/>'),
  dash: SVG('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  empresas: SVG('<path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M15 9h2a2 2 0 0 1 2 2v10"/><path d="M8 7h2M8 11h2M8 15h2"/>'),
  vendas: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v10M14.5 9.3c-.6-.8-1.6-1.1-2.6-1.1-1.4 0-2.4.8-2.4 1.9 0 2.7 5.2 1.4 5.2 4 0 1.2-1.1 2-2.6 2-1.1 0-2.2-.4-2.8-1.2"/>'),
  metas: SVG('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'),
  fluxo: SVG('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v6M18 9v6"/>'),
  projecao: SVG('<path d="M3 3v18h18"/><path d="M7 14l3.5-4 3 2.5L20 7"/><path d="M20 7v4M20 7h-4"/>'),
  receb: SVG('<path d="M12 3v11m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  boletos: SVG('<path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v5h5"/><path d="M8 13h8M8 17h5"/>'),
  cartoes: SVG('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19"/><path d="M6 15h4"/>'),
  despesas: SVG('<path d="M6 2.5l1.5 1.5L9 2.5 10.5 4 12 2.5 13.5 4 15 2.5 16.5 4 18 2.5V21l-1.5-1.5L15 21l-1.5-1.5L12 21l-1.5-1.5L9 21l-1.5-1.5L6 21z"/><path d="M9 8h6M9 12h6"/>'),
  dre: SVG('<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>'),
  fechamento: SVG('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="m9 15 2 2 4-4"/>'),
  analise: SVG('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  mltend: SVG('<path d="M3 3v18h18"/><path d="M6 15l4-5 3.5 3L20 8"/>'),
};
function renderSidebar(active) {
  const user = _session.user;
  const meta = user.user_metadata || {};
  const first = (meta.full_name || user.email || 'Conta').split(' ')[0];
  const link = (href, key, _icon, label) =>
    `<a href="${href}" class="side-link ${active === key ? 'is-active' : ''}" title="${label}"><span class="side-ico">${ICONS[key] || ''}</span><span class="side-txt">${label}</span></a>`;
  const root = document.getElementById('sidebar-root');
  root.innerHTML = `
    <aside class="sidebar">
      <div class="side-top">
        <span class="side-logo"><img src="/img/logo-mark.svg" alt="" class="side-brand-mark" /><span class="side-txt">FinanceEcom <strong>Free</strong></span></span>
        <button id="side-collapse" class="side-collapse" title="Recolher/expandir menu" aria-label="Recolher menu">«</button>
      </div>
      <div class="side-user"><span class="side-ico">${ICONS.user}</span><span class="side-txt">${first}</span></div>
      <nav class="side-nav">
        ${link('/app.html', 'dash', '📊', 'Dashboard')}
        ${link('/empresas.html', 'empresas', '🏢', 'Empresas')}
        ${link('/vendas.html', 'vendas', '💰', 'Vendas e Custos')}
        ${link('/metas.html', 'metas', '🎯', 'Metas')}
        ${link('/fluxo.html', 'fluxo', '💵', 'Fluxo de Caixa')}
        ${link('/projecao.html', 'projecao', '🔮', 'Projeção de Caixa')}
        ${link('/recebimentos.html', 'receb', '📥', 'Recebimentos')}
        ${link('/boletos.html', 'boletos', '📄', 'Boletos e Dívidas')}
        ${link('/cartoes.html', 'cartoes', '💳', 'Cartões')}
        ${link('/despesas.html', 'despesas', '🧾', 'Despesas')}
        ${link('/dre.html', 'dre', '📈', 'DRE')}
        ${link('/fechamento.html', 'fechamento', '📅', 'Fechamento Mensal')}
        ${link('/analise.html', 'analise', '🔎', 'Análise de Produtos')}
        ${link('/ml-tendencias.html', 'mltend', '📊', 'ML Tendências')}
      </nav>
      <div class="side-bottom">
        <div class="theme-picker" id="theme-picker" title="Escolher tema">
          <span class="side-txt tp-label">🎨 Tema</span>
          <div class="tp-dots">
            <button type="button" class="tp-dot" data-theme="light"   title="Claro"   style="background:linear-gradient(135deg,#eef1f7 50%,#1e6fff 50%)"></button>
            <button type="button" class="tp-dot" data-theme="dark"    title="Escuro"  style="background:linear-gradient(135deg,#0e1525 50%,#22d3ee 50%)"></button>
            <button type="button" class="tp-dot" data-theme="sepia"   title="Sépia"   style="background:linear-gradient(135deg,#f3ead7 50%,#b06a2c 50%)"></button>
            <button type="button" class="tp-dot" data-theme="emerald" title="Verde"   style="background:linear-gradient(135deg,#081712 50%,#35c486 50%)"></button>
            <button type="button" class="tp-dot" data-theme="oled"    title="Black (OLED)" style="background:linear-gradient(135deg,#000 50%,#3b82f6 50%)"></button>
          </div>
        </div>
        <button id="side-logout" class="side-link side-btn"><span class="side-ico">${SVG('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>')}</span><span class="side-txt">Sair</span></button>
      </div>
    </aside>
    <button id="side-open" class="side-open" aria-label="Menu">☰</button>`;

  applyCollapsed(localStorage.getItem('sidebar_collapsed') === '1');
  document.getElementById('side-collapse').addEventListener('click', () => {
    applyCollapsed(!(localStorage.getItem('sidebar_collapsed') === '1'));
  });
  applyTheme(localStorage.getItem('theme') || 'light');
  document.querySelectorAll('.tp-dot').forEach((d) =>
    d.addEventListener('click', () => applyTheme(d.dataset.theme)));
  document.getElementById('side-logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.href = '/entrar.html';
  });
  document.getElementById('side-open').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
  });
}

// Barra de carregamento no topo (decorativa)
function setLoad(on) {
  let b = document.getElementById('loadbar');
  if (!b) { b = document.createElement('div'); b.id = 'loadbar'; b.className = 'loadbar'; document.body.prepend(b); }
  b.classList.toggle('active', on);
}
window.setLoad = setLoad;

// Contagem animada (count-up) — anima os numeros de um container
window.animateCounts = function (nodes) {
  (nodes || document.querySelectorAll('.stat-value')).forEach((el) => {
    const txt = el.textContent.trim();
    if (!/\d/.test(txt) || el.dataset.animated === txt) return;
    el.dataset.animated = txt;
    const isPct = txt.includes('%'), isMoney = txt.includes('R$');
    let num = parseFloat(txt.replace(/[^\d,-]/g, '').replace(',', '.'));
    if (isNaN(num)) return;
    const fmt = (v) => isMoney ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : isPct ? v.toFixed(1) + '%' : Math.round(v).toLocaleString('pt-BR');
    const dur = 650, start = performance.now();
    (function step(t) { const p = Math.min((t - start) / dur, 1), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(num * e); if (p < 1) requestAnimationFrame(step); else el.dataset.animated = txt; })(performance.now());
  });
};

// Inicializa o shell. Retorna a sessao (ou redireciona para login).
async function initShell(active) {
  setLoad(true);
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.href = '/entrar.html'; return null; }
  _session = data.session;
  renderSidebar(active);
  setTimeout(() => setLoad(false), 1200);
  return _session;
}

// Header de autorizacao com o token atual (sempre fresco).
async function authHeader() {
  const { data } = await sb.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}
