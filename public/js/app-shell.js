// ===========================================================================
// Shell do app logado: sidebar, tema claro/escuro, sessao e logout.
// Requer que auth-common.js (com `sb`) tenha carregado antes.
// ===========================================================================
let _session = null;

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
  const root = document.getElementById('sidebar-root');
  root.innerHTML = `
    <aside class="sidebar">
      <div class="side-top">
        <span class="side-logo">FinanceEcom <strong>Free</strong></span>
        <div class="side-user">👤 ${first}</div>
      </div>
      <nav class="side-nav">
        <a href="/app.html" class="side-link ${active === 'dash' ? 'is-active' : ''}">📊 Dashboard</a>
        <a href="/vendas.html" class="side-link ${active === 'vendas' ? 'is-active' : ''}">💰 Vendas e Custos</a>
        <a href="/fluxo.html" class="side-link ${active === 'fluxo' ? 'is-active' : ''}">💵 Fluxo de Caixa</a>
        <a href="/boletos.html" class="side-link ${active === 'boletos' ? 'is-active' : ''}">📄 Boletos e Dívidas</a>
      </nav>
      <div class="side-bottom">
        <button id="theme-toggle" class="side-link side-btn"></button>
        <button id="side-logout" class="side-link side-btn">🚪 Sair</button>
      </div>
    </aside>
    <button id="side-open" class="side-open" aria-label="Menu">☰</button>`;

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
