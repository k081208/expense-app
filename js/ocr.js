// レシート画像から日付・金額・店名らしき文字列を抽出する
// Tesseract.js（オープンソース・完全にブラウザ内で完結するOCR）を使用し、画像は外部に送信しない
const VENDOR_BASE = './js/vendor/tesseract/';
const LANG_DATA_BASE = './lang-data/';

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = window.Tesseract.createWorker('jpn', 1, {
      workerPath: `${VENDOR_BASE}worker.min.js`,
      corePath: `${VENDOR_BASE}tesseract-core-simd-lstm.wasm.js`,
      langPath: LANG_DATA_BASE,
      gzip: true,
    }).then(async (worker) => {
      // 6 = レシートのような単一のまとまったテキストブロックとして読む(既定の全自動レイアウト解析より安定する)
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      return worker;
    });
  }
  return workerPromise;
}

// 元画像(またはcanvas)を指定サイズに収まるよう縮小してcanvasに描画する
function drawToCanvas(source, sourceW, sourceH, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(sourceW, sourceH));
  const w = Math.max(1, Math.round(sourceW * scale));
  const h = Math.max(1, Math.round(sourceH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(source, 0, 0, w, h);
  return canvas;
}

// 傾き検出の候補角度を比較する用: キャンバスサイズを固定した正方形に白背景で
// 回転描画する。角度ごとにキャンバスの大きさが変わると行の分散を公平に比較
// できず、はみ出た余白が透明(黒扱い)になるとノイズにもなるため、これを避ける
function rotateIntoFixedCanvas(srcCanvas, angleDeg, size) {
  const angle = (angleDeg * Math.PI) / 180;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.rotate(angle);
  ctx.drawImage(srcCanvas, -srcCanvas.width / 2, -srcCanvas.height / 2);
  return canvas;
}

// OCR本番に使う画像に実際に傾き補正をかける用: はみ出さないようキャンバス
// 自体を必要な大きさまで広げ、余白は白で塗る
function rotateCanvasFit(srcCanvas, angleDeg) {
  if (!angleDeg) return srcCanvas;
  const angle = (angleDeg * Math.PI) / 180;
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const newW = Math.max(1, Math.round(w * cos + h * sin));
  const newH = Math.max(1, Math.round(w * sin + h * cos));

  const canvas = document.createElement('canvas');
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, newW, newH);
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(angle);
  ctx.drawImage(srcCanvas, -w / 2, -h / 2);
  return canvas;
}

// 「文字の行がまっすぐ水平に揃っているほど、行ごとのインク量(暗さ)の
// 偏りが大きくなる」という性質を利用して、傾き補正の良し悪しを評価する
function rowInkVariance(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const { data } = canvas.getContext('2d').getImageData(0, 0, w, h);
  const rowSums = new Float64Array(h);
  for (let y = 0; y < h; y += 1) {
    let sum = 0;
    const rowStart = y * w * 4;
    for (let x = 0; x < w; x += 1) {
      const idx = rowStart + x * 4;
      sum += 255 - (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    }
    rowSums[y] = sum;
  }
  let mean = 0;
  for (let y = 0; y < h; y += 1) mean += rowSums[y];
  mean /= h;
  let variance = 0;
  for (let y = 0; y < h; y += 1) {
    const diff = rowSums[y] - mean;
    variance += diff * diff;
  }
  return variance / h;
}

// レシートを斜めに撮影しても文字の行が水平になるよう、傾き角度を推定する。
// 小さく縮小した画像に対して候補角度を総当たりし、行ごとのインク量の分散が
// 最大になる(=文字行が最もくっきり水平に並ぶ)角度を採用する
function estimateSkewAngle(bitmap) {
  const small = drawToCanvas(bitmap, bitmap.width, bitmap.height, 360);
  const size = Math.ceil(Math.sqrt((small.width ** 2) + (small.height ** 2)));
  const scoreAt = (angle) => rowInkVariance(rotateIntoFixedCanvas(small, angle, size));

  const baseScore = scoreAt(0);
  let best = { angle: 0, score: baseScore };
  for (let angle = -90; angle <= 90; angle += 5) {
    if (angle === 0) continue;
    const score = scoreAt(angle);
    if (score > best.score) best = { angle, score };
  }

  let refined = best;
  for (let angle = best.angle - 4; angle <= best.angle + 4; angle += 1) {
    const score = scoreAt(angle);
    if (score > refined.score) refined = { angle, score };
  }

  // 角度0(補正なし)より明らかに良くない場合は、誤検出で綺麗な写真を
  // 崩さないよう補正しない
  if (refined.score < baseScore * 1.15) {
    return 0;
  }
  return refined.angle;
}

// 白黒に完全二値化すると、レシート背後の背景(テーブル等)が黒い塊になって
// ノイズになり、かえって精度が落ちることが分かったため、階調を残したまま
// コントラストだけを強めるグレースケール変換にする
async function preprocessImage(file) {
  // iPhoneのカメラ写真はEXIFに回転情報を持つことが多く、それを無視すると
  // 文字が横倒し・上下逆になりOCRが全く合わなくなるため、明示的に補正する
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  // レシートが斜めに写っている場合でも文字行が水平になるよう傾きを補正する
  const skewAngle = estimateSkewAngle(bitmap);

  const scaled = drawToCanvas(bitmap, bitmap.width, bitmap.height, 1800);
  const canvas = Math.abs(skewAngle) >= 1 ? rotateCanvasFit(scaled, skewAngle) : scaled;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;
  const pixelCount = w * h;
  const gray = new Uint8ClampedArray(pixelCount);
  const hist = new Array(256).fill(0);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[p] = g;
    hist[g] += 1;
  }

  // 極端に暗い/明るい外れ値(背景や影)に引っ張られないよう、
  // 上下2%を除いた範囲を0〜255に引き伸ばす
  const low = percentileValue(hist, pixelCount, 0.02);
  const high = percentileValue(hist, pixelCount, 0.98);
  const range = Math.max(high - low, 1);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const stretched = Math.min(255, Math.max(0, Math.round(((gray[p] - low) / range) * 255)));
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }
  ctx.putImageData(imageData, 0, 0);
  return { canvas, skewAngle };
}

function percentileValue(hist, total, percentile) {
  const target = total * percentile;
  let cumulative = 0;
  for (let v = 0; v < 256; v += 1) {
    cumulative += hist[v];
    if (cumulative >= target) return v;
  }
  return 255;
}

// レシートOCRの文字化けに強いよう、事前に登録した「よく行く店」の名前と、
// 生テキストに含まれる文字の重なり具合を比較して一番近いものを採用する。
// 一部の文字が誤読されても、店名の文字が十分残っていればマッチする
function charOverlapRatio(name, text) {
  const nameChars = Array.from(name);
  const textChars = Array.from(text);
  const used = new Array(textChars.length).fill(false);
  let matched = 0;
  nameChars.forEach((ch) => {
    const idx = textChars.findIndex((c, i) => !used[i] && c === ch);
    if (idx !== -1) {
      used[idx] = true;
      matched += 1;
    }
  });
  return nameChars.length ? matched / nameChars.length : 0;
}

export function matchKnownStore(text, storeList) {
  if (!storeList || !storeList.length || !text) return null;
  let best = null;
  storeList.forEach((name) => {
    const ratio = charOverlapRatio(name, text);
    if (ratio >= 0.6 && (!best || ratio > best.ratio)) {
      best = { name, ratio };
    }
  });
  return best ? best.name : null;
}

export async function recognizeReceipt(file, storeList = []) {
  const worker = await getWorker();
  const preprocessed = await preprocessImage(file).catch(() => ({ canvas: file, skewAngle: null }));
  const { canvas: image, skewAngle } = preprocessed;
  const { data } = await worker.recognize(image);
  const text = data.text || '';
  const debugImage = image instanceof HTMLCanvasElement ? image.toDataURL('image/png') : null;
  const matchedStore = matchKnownStore(text, storeList);
  return {
    rawText: text,
    date: extractDate(text),
    amount: extractAmount(text),
    place: matchedStore || extractPlace(text),
    debugImage,
    skewAngle,
  };
}

function toHalfWidthDigits(s) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function extractDate(text) {
  const t = toHalfWidthDigits(text);

  let m = t.match(/令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) {
    const year = 2018 + Number(m[1]);
    return `${year}-${pad2(m[2])}-${pad2(m[3])}`;
  }

  m = t.match(/(20\d{2})[/\-年](\d{1,2})[/\-月](\d{1,2})/);
  if (m) {
    return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  }

  m = t.match(/(\d{1,2})[/\-](\d{1,2})/);
  if (m) {
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const year = new Date().getFullYear();
      return `${year}-${pad2(mm)}-${pad2(dd)}`;
    }
  }
  return null;
}

const TOTAL_KEYWORDS = /(合計金額|お会計|ご請求|請求金額|総合計|合計|小計)/;

function extractAmount(text) {
  const t = toHalfWidthDigits(text);
  const lines = t.split(/\n/);

  let candidate = null;
  for (const line of lines) {
    if (TOTAL_KEYWORDS.test(line)) {
      const nums = line.match(/[\d,]{2,}/g);
      if (nums && nums.length) {
        const n = Number(nums[nums.length - 1].replace(/,/g, ''));
        if (!Number.isNaN(n) && n > 0) candidate = n;
      }
    }
  }
  if (candidate) return candidate;

  const moneyMatches = [...t.matchAll(/[¥￥]\s*([\d,]{2,})|([\d,]{2,})\s*円/g)];
  const amounts = moneyMatches
    .map((mm) => Number((mm[1] || mm[2] || '').replace(/,/g, '')))
    .filter((n) => !Number.isNaN(n) && n > 0);
  if (amounts.length) return Math.max(...amounts);

  return null;
}

const IGNORE_LINE_PATTERNS = [
  /^\s*$/,
  /レシート|領収書|明細|お買上げ|ありがとう/,
  /^[\d\-\s]+$/,
  /TEL|電話|FAX/i,
  /〒\s*\d/,
  /[\d,]+\s*円/,
  /合計|小計|お預り|お釣り|点数/,
];

function extractPlace(text) {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 8)) {
    if (IGNORE_LINE_PATTERNS.some((re) => re.test(line))) continue;
    if (line.length < 2 || line.length > 20) continue;
    return line;
  }
  return null;
}
