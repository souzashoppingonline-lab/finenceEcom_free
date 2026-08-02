redirectIfLogged();

const $ = (id) => document.getElementById(id);
let userEmail = '';
let userMeta = {};

function show(step) {
  ['step-data', 'step-code', 'step-pass'].forEach((s) => { $(s).hidden = s !== step; });
}

// ---------- ETAPA 1: enviar codigo ----------
$('form-data').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('msg-data'); msg.textContent = ''; msg.className = 'form-msg';
  const f = e.target;
  userEmail = f.email.value.trim().toLowerCase();
  userMeta = {
    full_name: f.full_name.value.trim(),
    company: f.company.value.trim(),
    phone: f.phone.value.trim(),
  };
  const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    const { error } = await sb.auth.signInWithOtp({
      email: userEmail,
      options: { shouldCreateUser: true, data: userMeta },
    });
    if (error) throw error;
    $('email-shown').textContent = userEmail;
    show('step-code');
  } catch (err) {
    msg.textContent = traduz(err.message); msg.classList.add('err');
  } finally { btn.disabled = false; btn.textContent = 'Continuar'; }
});

// ---------- ETAPA 2: verificar codigo ----------
$('form-code').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('msg-code'); msg.textContent = ''; msg.className = 'form-msg';
  const code = e.target.code.value.trim();
  const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Verificando...';
  try {
    const { error } = await sb.auth.verifyOtp({ email: userEmail, token: code, type: 'email' });
    if (error) throw error;
    $('email-ro').value = userEmail;
    show('step-pass');
  } catch (err) {
    msg.textContent = 'Código inválido ou expirado.'; msg.classList.add('err');
  } finally { btn.disabled = false; btn.textContent = 'Verificar'; }
});

$('resend').addEventListener('click', async (e) => {
  e.preventDefault();
  const msg = $('msg-code');
  await sb.auth.signInWithOtp({ email: userEmail, options: { shouldCreateUser: true, data: userMeta } });
  msg.textContent = 'Código reenviado.'; msg.className = 'form-msg ok';
});

// ---------- ETAPA 3: definir senha ----------
const pw = $('pw'), pw2 = $('pw2');
pw.addEventListener('input', () => {
  const c = renderStrength(pw.value, $('pw-bar'), $('pw-list'));
  $('pw-strength').textContent = strengthLabel(c.score);
  checkMatch();
});
pw2.addEventListener('input', checkMatch);
function checkMatch() {
  const el = $('pw-match');
  if (!pw2.value) { el.textContent = ''; return; }
  if (pw.value === pw2.value) { el.textContent = '✔ As senhas coincidem'; el.className = 'form-msg ok'; }
  else { el.textContent = '❌ As senhas são diferentes'; el.className = 'form-msg err'; }
}
$('eye1').addEventListener('click', () => toggleReveal(pw, $('eye1')));
$('eye2').addEventListener('click', () => toggleReveal(pw2, $('eye2')));

$('form-pass').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('msg-pass'); msg.textContent = ''; msg.className = 'form-msg';
  const c = passwordChecks(pw.value);
  if (!c.ok) { msg.textContent = 'A senha não atende aos requisitos mínimos.'; msg.classList.add('err'); return; }
  if (pw.value !== pw2.value) { msg.textContent = 'As senhas são diferentes.'; msg.classList.add('err'); return; }
  const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Criando...';
  try {
    const { error } = await sb.auth.updateUser({ password: pw.value, data: userMeta });
    if (error) throw error;
    location.href = '/app.html';
  } catch (err) {
    msg.textContent = traduz(err.message); msg.classList.add('err');
    btn.disabled = false; btn.textContent = 'Criar conta';
  }
});

function traduz(m) {
  if (/already registered|already exists/i.test(m)) return 'Este e-mail já possui conta. Faça login.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (/should be at least/i.test(m)) return 'A senha não atende aos requisitos.';
  return m;
}
