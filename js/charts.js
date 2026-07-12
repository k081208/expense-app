// 外部ライブラリなしで描く軽量なCanvasグラフ（カテゴリ別横棒グラフ / 月別推移の縦棒グラフ）
const PALETTE = ['#2563eb', '#f97316', '#16a34a', '#dc2626', '#9333ea', '#0891b2', '#ca8a04', '#db2777', '#4b5563'];

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, width: rect.width, height: rect.height };
}

export function drawCategoryBarChart(canvas, items) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  if (!items.length) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px sans-serif';
    ctx.fillText('データがありません', 12, 24);
    return;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  const rowH = Math.min(36, (height - 8) / items.length);
  const labelW = 92;
  const barMaxW = width - labelW - 80;

  items.forEach((item, i) => {
    const y = i * rowH + 6;
    ctx.fillStyle = '#374151';
    ctx.font = '13px sans-serif';
    ctx.textBaseline = 'middle';
    const label = item.label.length > 7 ? item.label.slice(0, 6) + '…' : item.label;
    ctx.fillText(label, 0, y + rowH / 2 - 2);

    const barW = Math.max((item.value / max) * barMaxW, 2);
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    const barH = Math.max(rowH - 14, 8);
    roundRect(ctx, labelW, y, barW, barH, 4);
    ctx.fill();

    ctx.fillStyle = '#111827';
    ctx.font = '12px sans-serif';
    ctx.fillText(`¥${item.value.toLocaleString()}`, labelW + barW + 6, y + rowH / 2 - 2);
  });
}

export function drawMonthlyTrendChart(canvas, items) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  if (!items.length) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px sans-serif';
    ctx.fillText('データがありません', 12, 24);
    return;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  const padBottom = 24;
  const padTop = 10;
  const chartH = height - padBottom - padTop;
  const gap = 10;
  const barW = (width - gap * (items.length + 1)) / items.length;

  items.forEach((item, i) => {
    const barH = Math.max((item.value / max) * chartH, 2);
    const x = gap + i * (barW + gap);
    const y = padTop + (chartH - barH);
    ctx.fillStyle = PALETTE[0];
    roundRect(ctx, x, y, barW, barH, 4);
    ctx.fill();

    ctx.fillStyle = '#374151';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.label, x + barW / 2, height - 8);
  });
  ctx.textAlign = 'left';
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2 > 0 ? w / 2 : r);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
