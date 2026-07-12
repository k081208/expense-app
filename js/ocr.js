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

// コントラストの弱いレシート写真でも読み取りやすくするため、
// 白黒二値化(大津の手法)してからOCRにかける
async function preprocessImage(file) {
  // iPhoneのカメラ写真はEXIFに回転情報を持つことが多く、それを無視すると
  // 文字が横倒し・上下逆になりOCRが全く合わなくなるため、明示的に補正する
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const maxDim = 1800;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);

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

  const threshold = otsuThreshold(hist, pixelCount);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const v = gray[p] < threshold ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function otsuThreshold(hist, total) {
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];

  let sumB = 0;
  let weightB = 0;
  let maxVariance = 0;
  let threshold = 127;

  for (let t = 0; t < 256; t += 1) {
    weightB += hist[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;

    sumB += t * hist[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) * (meanB - meanF);
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}

export async function recognizeReceipt(file) {
  const worker = await getWorker();
  const image = await preprocessImage(file).catch(() => file);
  const { data } = await worker.recognize(image);
  const text = data.text || '';
  const debugImage = image instanceof HTMLCanvasElement ? image.toDataURL('image/png') : null;
  return {
    rawText: text,
    date: extractDate(text),
    amount: extractAmount(text),
    place: extractPlace(text),
    debugImage,
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
