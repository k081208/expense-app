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
    });
  }
  return workerPromise;
}

export async function recognizeReceipt(file) {
  const worker = await getWorker();
  const { data } = await worker.recognize(file);
  const text = data.text || '';
  return {
    rawText: text,
    date: extractDate(text),
    amount: extractAmount(text),
    place: extractPlace(text),
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
