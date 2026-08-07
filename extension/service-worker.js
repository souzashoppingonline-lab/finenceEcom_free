// ===========================================================================
// FinanceEcom Monitor — service worker (o "cérebro" / background, MV3)
// ===========================================================================
const DEFAULTS = { backendUrl: 'https://app.financeecom.com.br', extToken: '', monitorEnabled: true, batchSize: 5, maxTabs: 3, tabTimeoutMs: 20000 };

async function cfg() {
  const c = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...c };
}

async function apiFetch(path, options = {}) {
  const { backendUrl, extToken } = await cfg();
  if (!extToken) throw new Error('Token não configurado. Abra a extensão e cole seu token.');
  const res = await fetch(backendUrl.replace(/\/$/, '') + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-ext-token': extToken, ...(options.headers || {}) },
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ----- Mensagens vindas do content script / popup -----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.action === 'get_target') {
        const r = await apiFetch('/extension/produto-ativo');
        sendResponse(r);
      } else if (msg.action === 'collect_data') {
        const r = await apiFetch('/extension/anuncio', { method: 'POST', body: JSON.stringify({ rawData: msg.rawData }) });
        sendResponse(r);
      } else if (msg.action === 'run_monitor_now') {
        const r = await runMonitorCycle(false); sendResponse(r);
      } else if (msg.action === 'run_monitor_force') {
        const r = await runMonitorCycle(true); sendResponse(r);
      } else if (msg.action === 'get_monitor_status') {
        const s = await chrome.storage.local.get({ lastCycle: null });
        sendResponse(s.lastCycle || { ok: 0, fail: 0, at: null });
      } else if (msg.action === 'test_token') {
        const r = await apiFetch('/extension/produto-ativo'); sendResponse({ ok: true, produto: r.produto });
      } else {
        sendResponse({ error: 'ação desconhecida' });
      }
    } catch (e) {
      sendResponse({ error: e.message });
    }
  })();
  return true; // resposta assíncrona
});

// ----- Recoleta automática (Fase 4) -----
async function captureInHiddenTab(url, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    chrome.tabs.create({ url, active: false }, (tab) => {
      const tabId = tab.id;
      const timer = setTimeout(() => finish(null), timeoutMs);
      function finish(rawData) {
        if (done) return; done = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.remove(tabId).catch(() => {});
        resolve(rawData);
      }
      function listener(id, info) {
        if (id === tabId && info.status === 'complete') {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: 'auto_capture' }, (resp) => {
              if (chrome.runtime.lastError || !resp || !resp.ok) finish(null);
              else finish(resp.rawData);
            });
          }, 1200);
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function runMonitorCycle(force) {
  const c = await cfg();
  if (!c.monitorEnabled && !force) return { skipped: true };
  let itens = [];
  try {
    const r = await apiFetch(`/extension/monitoramento/proximos?limit=${c.batchSize}${force ? '&force=1' : ''}`);
    itens = r.itens || [];
  } catch (e) { return { ok: 0, fail: 0, error: e.message, at: Date.now() }; }

  let ok = 0, fail = 0;
  // pool com no máximo maxTabs abas simultâneas
  const queue = itens.slice();
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      const rawData = await captureInHiddenTab(item.url, c.tabTimeoutMs);
      if (!rawData) { fail++; continue; }
      try { await apiFetch('/extension/monitoramento', { method: 'POST', body: JSON.stringify({ rawData }) }); ok++; }
      catch (_) { fail++; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(c.maxTabs, itens.length) || 1 }, worker));
  const lastCycle = { ok, fail, total: itens.length, at: Date.now() };
  await chrome.storage.local.set({ lastCycle });
  return lastCycle;
}

// Alarm a cada 15 min
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('fec-monitor', { periodInMinutes: 15 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('fec-monitor', { periodInMinutes: 15 }));
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'fec-monitor') runMonitorCycle(false); });
