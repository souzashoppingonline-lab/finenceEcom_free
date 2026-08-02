// Registra uma visita na pagina de cadastro (1x por sessao para nao inflar)
if (!sessionStorage.getItem('visit_sent')) {
  sessionStorage.setItem('visit_sent', '1');
  fetch('/api/visit', { method: 'POST' }).catch(() => {});
}

// Botao flutuante de suporte via WhatsApp (numero configurado no painel admin)
fetch('/api/public-settings')
  .then((r) => r.json())
  .then((s) => {
    const num = (s.support_whatsapp || '').replace(/\D/g, '');
    if (!num) return;
    const full = num.length <= 11 ? '55' + num : num; // adiciona DDI Brasil se faltar
    const a = document.createElement('a');
    a.href = `https://wa.me/${full}?text=${encodeURIComponent('Olá! Preciso de ajuda com o FinanceEcom Free.')}`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'wa-float';
    a.setAttribute('aria-label', 'Suporte pelo WhatsApp');
    a.innerHTML = '<svg viewBox="0 0 32 32" width="30" height="30" fill="#fff"><path d="M16 3C9 3 3.5 8.5 3.5 15.5c0 2.3.6 4.4 1.7 6.3L3 29l7.4-2.1c1.8 1 3.9 1.5 6 1.5 7 0 12.5-5.5 12.5-12.5S23 3 16 3zm0 22.6c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-4.4 1.2 1.2-4.3-.3-.4c-1-1.7-1.6-3.6-1.6-5.6C5.2 9.5 10 5 16 5s10.8 4.5 10.8 10.5S22 25.6 16 25.6zm5.9-7.8c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.3-.7.1c-1.9-.9-3.1-1.7-4.4-3.8-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.6s-.7-1.7-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-1.3 1.4-1.3 3.3.9 6 2.2 2.8 4 4.1 6.5 5 .9.3 1.6.5 2.1.4.7-.1 1.9-.8 2.2-1.6.3-.8.3-1.4.2-1.6-.1-.1-.3-.2-.6-.3z"/></svg>';
    document.body.appendChild(a);
  })
  .catch(() => {});

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
