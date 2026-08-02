// Registra uma visita na pagina de cadastro (1x por sessao para nao inflar)
if (!sessionStorage.getItem('visit_sent')) {
  sessionStorage.setItem('visit_sent', '1');
  fetch('/api/visit', { method: 'POST' }).catch(() => {});
}

const form = document.getElementById('signup-form');
const msg = document.getElementById('form-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = '';
  msg.className = 'form-msg';

  const data = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    whatsapp: form.whatsapp.value.trim(),
    marketplace: form.marketplace.value || null,
    consent: form.consent.checked,
  };

  const btn = form.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erro ao cadastrar.');

    msg.textContent = body.message || 'Cadastro realizado!';
    msg.classList.add('ok');
    form.reset();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add('err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Quero acesso grátis';
  }
});
