// ===========================================================================
// FinanceEcom Monitor — popup (interface/config)
// ===========================================================================
const $ = (id) => document.getElementById(id);
const DEF = { backendUrl: 'https://app.financeecom.com.br', extToken: '', monitorEnabled: true };

function msg(t, ok) { const m = $('msg'); m.textContent = t; m.style.color = ok ? '#7ee6b0' : '#ff8a8a'; }

async function load() {
  const c = await chrome.storage.local.get(DEF);
  $('backendUrl').value = c.backendUrl || DEF.backendUrl;
  $('extToken').value = c.extToken || '';
  $('monitorEnabled').checked = c.monitorEnabled !== false;
  refreshStatus();
}

function send(action, extra = {}) {
  return new Promise((resolve) => chrome.runtime.sendMessage({ action, ...extra }, (r) => resolve(r || {})));
}

async function refreshStatus() {
  const t = await send('get_target');
  $('target').textContent = t.error ? t.error : (t.produto ? (t.produto.nome || '—') : 'nenhum produto em coleta');
  const s = await send('get_monitor_status');
  $('cycle').textContent = s && s.at ? `${s.ok || 0} ok / ${s.fail || 0} falhou (${new Date(s.at).toLocaleTimeString('pt-BR')})` : '—';
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    backendUrl: $('backendUrl').value.trim() || DEF.backendUrl,
    extToken: $('extToken').value.trim(),
    monitorEnabled: $('monitorEnabled').checked,
  });
  msg('Salvo ✅', true);
  refreshStatus();
});

$('test').addEventListener('click', async () => {
  await chrome.storage.local.set({ backendUrl: $('backendUrl').value.trim() || DEF.backendUrl, extToken: $('extToken').value.trim() });
  const r = await send('test_token');
  if (r.error) msg(r.error, false);
  else msg('Conectado ✅ ' + (r.produto ? `(alvo: ${r.produto.nome})` : '(sem produto em coleta)'), true);
  refreshStatus();
});

$('monitorEnabled').addEventListener('change', () => chrome.storage.local.set({ monitorEnabled: $('monitorEnabled').checked }));

$('sync').addEventListener('click', async () => { msg('Sincronizando…', true); const r = await send('run_monitor_now'); msg(r.error ? r.error : `Ciclo: ${r.ok || 0} ok / ${r.fail || 0} falhou`, !r.error); refreshStatus(); });
$('force').addEventListener('click', async () => { msg('Recoletando todos…', true); const r = await send('run_monitor_force'); msg(r.error ? r.error : `Ciclo: ${r.ok || 0} ok / ${r.fail || 0} falhou`, !r.error); refreshStatus(); });

load();
