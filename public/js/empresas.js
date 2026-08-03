// ===========================================================================
// Empresas (stores) — cadastro com CNPJ, endereço e marketplace
// ===========================================================================
const $ = (id) => document.getElementById(id);
let stores = [];
let editingId = null;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, options = {}) {
  const h = await authHeader();
  const res = await fetch(path, { ...options, headers: { ...h, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (res.status === 401) { location.href = '/entrar.html'; throw new Error('Sessão expirada.'); }
  if (!res.ok) { let m = 'Erro.'; try { m = (await res.json()).error || m; } catch (_) {} throw new Error(m); }
  return res.status === 204 ? {} : res.json();
}

function renderMktOptions() {
  $('mkt-sel').innerHTML = `<option value="">Selecione</option>` + (window.MARKETPLACES || []).map((m) => `<option>${esc(m)}</option>`).join('');
}

async function loadStores() {
  const { stores: s } = await api('/api/stores');
  stores = s || [];
  const tb = document.querySelector('#empresas-table tbody');
  if (stores.length === 0) { tb.innerHTML = `<tr><td colspan="5" class="empty">Nenhuma empresa cadastrada.</td></tr>`; return; }
  tb.innerHTML = stores.map((s) => `<tr>
    <td><span class="dot" style="background:${s.color || '#1d7a5f'}"></span><b>${esc(s.name)}</b></td>
    <td>${esc(s.cnpj || '—')}</td>
    <td>${s.marketplace ? `<span class="type-badge">${esc(s.marketplace)}</span>` : '—'}</td>
    <td>${esc(s.address || '—')}</td>
    <td>
      <button class="btn-del" data-edit="${s.id}" title="Editar">✏️</button>
      <button class="btn-del" data-del="${s.id}" title="Excluir">🗑</button>
    </td></tr>`).join('');
}

function resetForm() {
  const f = $('empresa-form'); f.reset(); f.color.value = '#1d7a5f';
  editingId = null;
  $('emp-form-title').textContent = 'Cadastrar empresa';
  $('save-emp').textContent = '+ Cadastrar empresa';
  $('emp-cancel').hidden = true;
}

function editStore(id) {
  const s = stores.find((x) => x.id === id); if (!s) return;
  const f = $('empresa-form');
  f.name.value = s.name; f.cnpj.value = s.cnpj || ''; f.address.value = s.address || '';
  f.marketplace.value = s.marketplace || ''; f.color.value = s.color || '#1d7a5f';
  editingId = id;
  $('emp-form-title').textContent = 'Editar empresa';
  $('save-emp').textContent = 'Salvar alterações';
  $('emp-cancel').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('empresa-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('emp-msg'); msg.textContent = ''; msg.className = 'form-msg';
  const f = e.target;
  const payload = {
    name: f.name.value.trim(), cnpj: f.cnpj.value.trim(), address: f.address.value.trim(),
    marketplace: f.marketplace.value, color: f.color.value,
  };
  if (!payload.cnpj) { msg.textContent = 'CNPJ é obrigatório.'; msg.classList.add('err'); return; }
  try {
    if (editingId) await api(`/api/stores/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
    else await api('/api/stores', { method: 'POST', body: JSON.stringify(payload) });
    resetForm(); await loadStores();
    msg.textContent = 'Empresa salva!'; msg.classList.add('ok');
  } catch (err) { msg.textContent = err.message; msg.classList.add('err'); }
});
$('emp-cancel').addEventListener('click', resetForm);

document.querySelector('#empresas-table tbody').addEventListener('click', async (e) => {
  const ed = e.target.closest('[data-edit]'); const dl = e.target.closest('[data-del]');
  if (ed) return editStore(ed.dataset.edit);
  if (dl) {
    if (!confirm('Excluir esta empresa e TODOS os lançamentos vinculados?')) return;
    await api(`/api/stores/${dl.dataset.del}`, { method: 'DELETE' }); return loadStores();
  }
});

(async () => {
  const session = await initShell('empresas');
  if (!session) return;
  renderMktOptions();
  await loadStores();
})();
