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

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = theme === 'dark' ? '☀️ Tema claro' : '🌙 Tema escuro';
}

function renderSidebar(active) {
  const user = _session.user;
  const meta = user.user_metadata || {};
  const first = (meta.full_name || user.email || 'Conta').split(' ')[0];
  const link = (href, key, icon, label) =>
    `<a href="${href}" class="side-link ${active === key ? 'is-active' : ''}" title="${label}"><span class="side-ico">${icon}</span><span class="side-txt">${label}</span></a>`;
  const root = document.getElementById('sidebar-root');
  root.innerHTML = `
    <aside class="sidebar">
      <div class="side-top">
        <span class="side-logo"><span class="side-txt">FinanceEcom <strong>Free</strong></span><strong class="side-mini">F</strong></span>
        <button id="side-collapse" class="side-collapse" title="Recolher/expandir menu" aria-label="Recolher menu">«</button>
      </div>
      <div class="side-user"><span class="side-ico">👤</span><span class="side-txt">${first}</span></div>
      <nav class="side-nav">
        ${link('/app.html', 'dash', '📊', 'Dashboard')}
        ${link('/empresas.html', 'empresas', '🏢', 'Empresas')}
        ${link('/vendas.html', 'vendas', '💰', 'Vendas e Custos')}
        ${link('/fluxo.html', 'fluxo', '💵', 'Fluxo de Caixa')}
        ${link('/projecao.html', 'projecao', '🔮', 'Projeção de Caixa')}
        ${link('/recebimentos.html', 'receb', '📥', 'Recebimentos')}
        ${link('/boletos.html', 'boletos', '📄', 'Boletos e Dívidas')}
        ${link('/cartoes.html', 'cartoes', '💳', 'Cartões')}
        ${link('/despesas.html', 'despesas', '🧾', 'Despesas')}
        ${link('/dre.html', 'dre', '📈', 'DRE')}
      </nav>
      <div class="side-bottom">
        <button id="theme-toggle" class="side-link side-btn"></button>
        <button id="side-logout" class="side-link side-btn"><span class="side-ico">🚪</span><span class="side-txt">Sair</span></button>
      </div>
    </aside>
    <button id="side-open" class="side-open" aria-label="Menu">☰</button>`;

  applyCollapsed(localStorage.getItem('sidebar_collapsed') === '1');
  document.getElementById('side-collapse').addEventListener('click', () => {
    applyCollapsed(!(localStorage.getItem('sidebar_collapsed') === '1'));
  });
  applyTheme(localStorage.getItem('theme') || 'light');
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
  document.getElementById('side-logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.href = '/entrar.html';
  });
  document.getElementById('side-open').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
  });
}

// Inicializa o shell. Retorna a sessao (ou redireciona para login).
async function initShell(active) {
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.href = '/entrar.html'; return null; }
  _session = data.session;
  renderSidebar(active);
  return _session;
}

// Header de autorizacao com o token atual (sempre fresco).
async function authHeader() {
  const { data } = await sb.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}
