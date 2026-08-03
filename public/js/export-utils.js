// ===========================================================================
// Utilitário de exportação: CSV, XLSX (SheetJS) e PDF (janela de impressão)
// ===========================================================================
function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}

async function _ensureXLSX() {
  if (window.XLSX) return;
  await _loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
}

// Exporta uma ou mais abas para .xlsx. sheets = [{name, headers, rows}]
async function exportXLSX(filename, sheets) {
  await _ensureXLSX();
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sh.headers, ...sh.rows]);
    XLSX.utils.book_append_sheet(wb, ws, (sh.name || 'Dados').slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
}

// Exporta uma tabela para PDF (via impressão do navegador -> Salvar como PDF)
function exportPDF(title, headers, rows, subtitle = '') {
  const th = headers.map((h) => `<th>${h}</th>`).join('');
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${c == null ? '' : String(c)}</td>`).join('')}</tr>`).join('');
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:system-ui,Arial,sans-serif;color:#1c2434;padding:24px;}
      h1{font-size:1.4rem;margin:0 0 2px;} .sub{color:#6b7686;margin:0 0 18px;font-size:.9rem;}
      table{width:100%;border-collapse:collapse;font-size:.82rem;}
      th,td{border:1px solid #e2e6ee;padding:7px 9px;text-align:left;}
      th{background:#f4f7fb;}
      @media print{ @page{ size:landscape; margin:12mm; } }
    </style></head><body>
    <h1>${title}</h1>${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
    <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
    <script>window.onload=function(){window.print();}<\/script>
    </body></html>`);
  w.document.close();
}

// Dropdown simples de exportação: cria os 3 botões dentro de um container
function exportButtons(container, getData) {
  container.innerHTML = `
    <button class="btn-ghost" data-exp="csv">CSV</button>
    <button class="btn-ghost" data-exp="xlsx">Excel</button>
    <button class="btn-ghost" data-exp="pdf">PDF</button>`;
  container.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-exp]'); if (!b) return;
    const { filename, title, headers, rows, subtitle } = getData();
    if (b.dataset.exp === 'csv') {
      const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = filename + '.csv'; a.click();
    } else if (b.dataset.exp === 'xlsx') {
      try { await exportXLSX(filename, [{ name: title, headers, rows }]); } catch (err) { alert('Erro ao gerar Excel: ' + err.message); }
    } else {
      exportPDF(title, headers, rows, subtitle);
    }
  });
}
