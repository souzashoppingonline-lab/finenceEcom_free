// ===========================================================================
// Ponte entre o painel FinanceEcom (página web) e a extensão.
// Roda só em app.financeecom.com.br. Repassa pedidos da página ao background.
// ===========================================================================
(function () {
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__fec !== 'req') return;
    const { id, action, url } = e.data;
    try {
      chrome.runtime.sendMessage({ action, url }, (resp) => {
        const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
        window.postMessage({ __fec: 'res', id, resp: err ? { error: err } : (resp || { error: 'sem resposta' }) }, '*');
      });
    } catch (ex) {
      window.postMessage({ __fec: 'res', id, resp: { error: String(ex && ex.message || ex) } }, '*');
    }
  });
  // avisa a página que a extensão está presente
  window.postMessage({ __fec: 'ready' }, '*');
})();
