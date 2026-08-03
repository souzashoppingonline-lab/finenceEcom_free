// ===========================================================================
// Motor de gráficos SVG (donut + tendência) — sem dependências
// ===========================================================================
window.CHART_COLORS = ['#1e6fff', '#22d3ee', '#6a5cff', '#f59e0b', '#e0873a', '#e04545', '#17915f', '#8895a7', '#d946ef', '#0ea5e9'];

const _money = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Donut: items = [{label, value, color?}]
function donutChart(el, items) {
  items = items.filter((i) => i.value > 0);
  if (items.length === 0) { el.innerHTML = '<p class="muted">Sem dados.</p>'; return; }
  const total = items.reduce((a, i) => a + i.value, 0) || 1;
  const r = 52, C = 2 * Math.PI * r, cx = 70, cy = 70;
  let off = 0, circles = '';
  items.forEach((it, idx) => {
    const color = it.color || CHART_COLORS[idx % CHART_COLORS.length];
    const len = (it.value / total) * C;
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="20"
      stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"><title>${it.label}: ${_money(it.value)}</title></circle>`;
    off += len;
  });
  const legend = items.map((it, idx) => {
    const color = it.color || CHART_COLORS[idx % CHART_COLORS.length];
    return `<div class="lg-item"><span class="lg-dot" style="background:${color}"></span><span class="lg-lbl">${it.label}</span><b>${_money(it.value)}</b> <span class="muted">${((it.value / total) * 100).toFixed(0)}%</span></div>`;
  }).join('');
  el.innerHTML = `<div class="donut-wrap">
    <svg viewBox="0 0 140 140" class="donut-svg">${circles}
      <text x="70" y="66" text-anchor="middle" class="donut-c1">Total</text>
      <text x="70" y="84" text-anchor="middle" class="donut-c2">${_money(total)}</text>
    </svg>
    <div class="donut-legend">${legend}</div>
  </div>`;
}

// Tendência mensal: series = [{name, color, values:[12]}], labels = [12]
function trendChart(el, series, labels, { height = 220 } = {}) {
  const W = 720, H = height, padL = 54, padB = 26, padT = 12, padR = 12;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 0), min = Math.min(...all, 0);
  const range = (max - min) || 1;
  const n = labels.length;
  const x = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (v) => padT + plotH - ((v - min) / range) * plotH;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="xMidYMid meet">`;
  [max, (max + min) / 2, min].forEach((g) => {
    svg += `<line x1="${padL}" y1="${y(g)}" x2="${W - padR}" y2="${y(g)}" stroke="var(--border)" stroke-width="1"/>`;
    svg += `<text x="${padL - 6}" y="${y(g) + 3}" class="axis-y">${_money(g)}</text>`;
  });
  for (const s of series) {
    const line = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    svg += `<path d="${line}" fill="none" stroke="${s.color}" stroke-width="2.5"/>`;
    s.values.forEach((v, i) => { svg += `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="${s.color}"/>`; });
  }
  labels.forEach((l, i) => { if (n <= 12 || i % 2 === 0) svg += `<text x="${x(i)}" y="${H - 8}" class="axis-x">${l}</text>`; });
  svg += `</svg>`;
  const leg = series.map((s) => `<span class="lg-item"><span class="lg-dot" style="background:${s.color}"></span>${s.name}</span>`).join('');
  el.innerHTML = `<div class="trend-legend">${leg}</div><div class="chart">${svg}</div>`;
}
