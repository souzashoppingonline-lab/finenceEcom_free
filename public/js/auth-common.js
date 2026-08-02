// ===========================================================================
// Configuracao compartilhada de autenticacao (Supabase Auth)
// A chave publishable/anon e PUBLICA por design — pode ficar no frontend.
// ===========================================================================
const SUPABASE_URL = 'https://mremizvqbqzfcukfbbqo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_mCkI-5vcDYczSP43njiE5Q_IglVzqJh';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ---------- Regras de senha ----------
function passwordChecks(pw) {
  const len = (pw || '').length >= 10;
  const upper = /[A-Z]/.test(pw);
  const lower = /[a-z]/.test(pw);
  const num = /[0-9]/.test(pw);
  const passed = [len, upper, lower, num].filter(Boolean).length;
  return { len, upper, lower, num, ok: len && upper && lower && num, score: passed };
}

function strengthLabel(score) {
  return ['Muito fraca', 'Fraca', 'Média', 'Boa', 'Senha forte'][score] || 'Muito fraca';
}

// Renderiza a barra de forca + checklist num container
function renderStrength(pw, barEl, listEl) {
  const c = passwordChecks(pw);
  if (barEl) {
    barEl.style.width = (c.score / 4) * 100 + '%';
    barEl.className = 'pw-bar-fill ' + (c.score <= 1 ? 'pw-weak' : c.score <= 3 ? 'pw-mid' : 'pw-strong');
  }
  if (listEl) {
    const item = (ok, txt) => `<li class="${ok ? 'ok' : ''}">${ok ? '✔' : '○'} ${txt}</li>`;
    listEl.innerHTML =
      item(c.len, 'Mínimo de 10 caracteres') +
      item(c.upper, '1 letra maiúscula') +
      item(c.lower, '1 letra minúscula') +
      item(c.num, '1 número');
  }
  return c;
}

// Alterna visibilidade de um input de senha
function toggleReveal(inputEl, btnEl) {
  const isPw = inputEl.type === 'password';
  inputEl.type = isPw ? 'text' : 'password';
  btnEl.textContent = isPw ? '🙈' : '👁';
}

// Redireciona para o app se ja estiver logado (usar em entrar/criar-conta)
async function redirectIfLogged(to = '/app.html') {
  const { data } = await sb.auth.getSession();
  if (data.session) location.href = to;
}

// Protege paginas internas: exige sessao, senao manda para o login
async function requireSession(loginUrl = '/entrar.html') {
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.href = loginUrl; return null; }
  return data.session;
}
