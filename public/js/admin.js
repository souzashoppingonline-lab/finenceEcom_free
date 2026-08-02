const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const tokenInput = document.getElementById('token-input');
const loginBtn = document.getElementById('login-btn');
const loginMsg = document.getElementById('login-msg');
const logoutBtn = document.getElementById('logout');
const searchInput = document.getElementById('search-input');

let currentLeads = [];

function getToken() {
  return sessionStorage.getItem('admin_token') || '';
}

async function api(pathname, options = {}) {
  const res = await fetch(pathname, {
    ...options,
    headers: { 'x-admin-token': getToken(), 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (res.status === 401) throw new Error('Token inválido.');
  if (!res.ok) {
    let msg = 'Erro na operação.';
    try { msg = (await res.json()).error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.status === 204 ? {} : res.json();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatWhats(w) {
  if (!w) return '—';
  const d = String(w).replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return w;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderTable() {
  const term = (searchInput.value || '').trim().toLowerCase();
  const rows = currentLeads.filter((l) =>
    !term || l.name.toLowerCase().includes(term) || l.email.toLowerCase().includes(term)
  );
  const tbody = document.querySelector('#leads-table tbody');
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Nenhum cliente encontrado.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((l) => `
    <tr>
      <td>${escapeHtml(l.name)}</td>
      <td>${escapeHtml(l.email)}</td>
      <td>${formatWhats(l.whatsapp)}</td>
      <td>${escapeHtml(l.marketplace || '—')}</td>
      <td>${formatDate(l.created_at)}</td>
      <td><button class="btn-del" data-id="${escapeHtml(l.id)}" title="Excluir">🗑</button></td>
    </tr>`).join('');
}

async function loadDashboard() {
  const stats = await api('/api/stats');
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-last7').textContent = stats.last7days;
  document.getElementById('stat-visits').textContent = stats.visits ?? 0;
  document.getElementById('stat-conversion').textContent = (stats.conversion ?? 0) + '%';

  const { leads } = await api('/api/leads');
  currentLeads = leads;
  renderTable();
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  logoutBtn.hidden = false;
}

loginBtn.addEventListener('click', async () => {
  loginMsg.textContent = '';
  sessionStorage.setItem('admin_token', tokenInput.value.trim());
  try {
    await loadDashboard();
    showDashboard();
  } catch (err) {
    loginMsg.textContent = err.message;
    loginMsg.classList.add('err');
    sessionStorage.removeItem('admin_token');
  }
});

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('admin_token');
  location.reload();
});

searchInput.addEventListener('input', renderTable);

// Criar cliente
document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = document.getElementById('create-msg');
  msg.textContent = '';
  msg.className = 'form-msg';
  try {
    await api('/api/admin/leads', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        whatsapp: form.whatsapp.value.trim(),
        marketplace: form.marketplace.value || null,
      }),
    });
    msg.textContent = 'Cliente adicionado!';
    msg.classList.add('ok');
    form.reset();
    await loadDashboard();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add('err');
  }
});

// Excluir cliente (delegação de evento)
document.querySelector('#leads-table tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-del');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!confirm('Excluir este cliente? Esta ação não pode ser desfeita.')) return;
  try {
    await api(`/api/leads/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadDashboard();
  } catch (err) {
    alert(err.message);
  }
});

// Exportar CSV
document.getElementById('export-btn').addEventListener('click', () => {
  const header = ['Nome', 'Email', 'WhatsApp', 'Marketplace', 'Cadastro'];
  const rows = currentLeads.map((l) => [
    l.name, l.email, l.whatsapp, l.marketplace || '', l.created_at,
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clientes-financeecom-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Auto-login se token ja estiver na sessao
if (getToken()) {
  loadDashboard().then(showDashboard).catch(() => sessionStorage.removeItem('admin_token'));
}
