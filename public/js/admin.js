const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const tokenInput = document.getElementById('token-input');
const loginBtn = document.getElementById('login-btn');
const loginMsg = document.getElementById('login-msg');
const logoutBtn = document.getElementById('logout');

let currentLeads = [];

function getToken() {
  return sessionStorage.getItem('admin_token') || '';
}

async function apiGet(pathname) {
  const res = await fetch(pathname, { headers: { 'x-admin-token': getToken() } });
  if (res.status === 401) throw new Error('Token inválido.');
  if (!res.ok) throw new Error('Erro ao carregar dados.');
  return res.json();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatWhats(w) {
  if (!w) return '';
  const d = String(w).replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return w;
}

async function loadDashboard() {
  const stats = await apiGet('/api/stats');
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-last7').textContent = stats.last7days;

  const { leads } = await apiGet('/api/leads');
  currentLeads = leads;
  const tbody = document.querySelector('#leads-table tbody');
  tbody.innerHTML = leads.map((l) => `
    <tr>
      <td>${escapeHtml(l.name)}</td>
      <td>${escapeHtml(l.email)}</td>
      <td>${formatWhats(l.whatsapp)}</td>
      <td>${escapeHtml(l.marketplace || '—')}</td>
      <td>${formatDate(l.created_at)}</td>
    </tr>`).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
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
