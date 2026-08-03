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

function renderChart(series) {
  const el = document.getElementById('chart');
  if (!series || series.length === 0) { el.innerHTML = '<p class="empty">Sem dados ainda.</p>'; return; }

  const W = 720, H = 220, padL = 30, padB = 26, padT = 10, padR = 10;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(1, ...series.map((d) => Math.max(d.visits, d.signups)));
  const n = series.length;
  const slot = plotW / n;
  const barW = Math.min(14, slot / 3);

  const y = (v) => padT + plotH - (v / max) * plotH;
  const gridVals = [0, Math.ceil(max / 2), max];

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">`;
  // grades + eixo Y
  for (const g of gridVals) {
    svg += `<line x1="${padL}" y1="${y(g)}" x2="${W - padR}" y2="${y(g)}" class="grid"/>`;
    svg += `<text x="${padL - 6}" y="${y(g) + 3}" class="axis-y">${g}</text>`;
  }
  series.forEach((d, i) => {
    const cx = padL + slot * i + slot / 2;
    // visitas (barra clara) e cadastros (barra escura) lado a lado
    svg += `<rect x="${cx - barW - 1}" y="${y(d.visits)}" width="${barW}" height="${plotH + padT - y(d.visits)}" class="bar-visits"><title>${d.date}: ${d.visits} visitas</title></rect>`;
    svg += `<rect x="${cx + 1}" y="${y(d.signups)}" width="${barW}" height="${plotH + padT - y(d.signups)}" class="bar-signups"><title>${d.date}: ${d.signups} cadastros</title></rect>`;
    // rotulo dia (dd/mm) a cada ~n/7
    if (n <= 14 || i % Math.ceil(n / 10) === 0) {
      const [ , mm, dd] = d.date.split('-');
      svg += `<text x="${cx}" y="${H - 8}" class="axis-x">${dd}/${mm}</text>`;
    }
  });
  svg += `</svg>`;
  el.innerHTML = svg;
}

async function loadDashboard() {
  const stats = await api('/api/stats');
  document.getElementById('stat-total').textContent = stats.total;
  document.getElementById('stat-last7').textContent = stats.last7days;
  document.getElementById('stat-visits').textContent = stats.visits ?? 0;
  document.getElementById('stat-conversion').textContent = (stats.conversion ?? 0) + '%';

  const { series } = await api('/api/timeseries?days=14');
  renderChart(series);

  loadHealth();

  const settings = await api('/api/settings');
  document.getElementById('support-input').value = formatWhats(settings.support_whatsapp);

  const { leads } = await api('/api/leads');
  currentLeads = leads;
  renderTable();
}

async function loadHealth() {
  const list = document.getElementById('health-list');
  const overall = document.getElementById('health-overall');
  try {
    const h = await api('/api/health-status');
    overall.textContent = h.overall === 'ok' ? 'Tudo operacional' : 'Atenção';
    overall.className = 'health-overall ' + (h.overall === 'ok' ? 'ok' : 'warn');
    list.innerHTML = h.services.map((s) => `
      <div class="health-row">
        <span class="health-dot ${s.ok ? 'up' : 'down'}"></span>
        <div class="health-info"><b>${escapeHtml(s.name)}</b><span class="muted">${escapeHtml(s.detail || '')}</span></div>
        <span class="health-status ${s.ok ? 'ok' : 'warn'}">${escapeHtml(s.status)}</span>
      </div>`).join('');
    document.getElementById('health-time').textContent = 'Verificado às ' + new Date(h.checkedAt).toLocaleTimeString('pt-BR');
  } catch (err) {
    list.innerHTML = `<p class="muted">Não foi possível verificar (${escapeHtml(err.message)}).</p>`;
  }
}
document.getElementById('health-refresh')?.addEventListener('click', loadHealth);

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

// Salvar WhatsApp de suporte
document.getElementById('support-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('support-msg');
  msg.textContent = '';
  msg.className = 'form-msg';
  try {
    const res = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ support_whatsapp: document.getElementById('support-input').value }),
    });
    document.getElementById('support-input').value = formatWhats(res.support_whatsapp);
    msg.textContent = 'WhatsApp de suporte salvo!';
    msg.classList.add('ok');
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add('err');
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
