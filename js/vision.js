// Google Cloud Vision API を使った高精度なレシート文字認識
// (無料枠: 月1000リクエストまで無料。要Googleアカウントの請求先設定)
import { getAccessToken } from './auth.js';
import { extractDate, extractAmount, extractPlace, matchKnownStore } from './ocr.js';

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

function fileToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// アップロード時間を短くするため、送信前に縮小・再圧縮する
async function resizeForUpload(file, maxDim = 2000, quality = 0.85) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('画像の変換に失敗しました'));
    }, 'image/jpeg', quality);
  });
}

export async function recognizeReceiptCloud(file, storeList = []) {
  const token = getAccessToken();
  if (!token) throw new Error('未ログインです');

  const resized = await resizeForUpload(file).catch(() => file);
  const base64 = await fileToBase64(resized);

  const res = await fetch(VISION_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['ja'] },
        },
      ],
    }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('Vision APIの権限がありません。設定からログインし直してください。');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Vision API エラー (${res.status}): ${body}`);
  }

  const data = await res.json();
  const result = data.responses && data.responses[0];
  if (result && result.error) {
    throw new Error(result.error.message || 'Vision APIエラー');
  }

  const text = (result && result.fullTextAnnotation && result.fullTextAnnotation.text) || '';
  const matchedStore = matchKnownStore(text, storeList);
  return {
    rawText: text,
    date: extractDate(text),
    amount: extractAmount(text),
    place: matchedStore || extractPlace(text),
    debugImage: null,
    source: 'cloud',
  };
}
