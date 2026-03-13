/**
 * ユーティリティ関数 - 汎用ヘルパー
 */

/**
 * HTML エスケープ
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 速度フォーマット (km/h)
 */
export function formatSpeed(kmh) {
  if (kmh == null || isNaN(kmh)) return '—';
  if (kmh < 1) return `${(kmh * 1000).toFixed(0)} m/h`;
  return `${kmh.toFixed(1)} km/h`;
}

/**
 * 時間フォーマット (時間・分)
 */
export function formatDuration(hours) {
  if (hours == null || isNaN(hours) || hours <= 0) return null;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}時間${m}分`;
  if (h > 0) return `${h}時間`;
  return `${m}分`;
}

/**
 * 距離計算 (Haversine)
 */
export function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, x)));
}

/**
 * 距離の2乗（近接判定用・高速）
 */
export function distSq(a, b) {
  const dx = (a[1] - b[1]) * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
  const dy = a[0] - b[0];
  return dx * dx + dy * dy;
}

/**
 * HTML ミニファイ（ストレージ容量削減用）
 */
export function minifyHtml(html) {
  if (!html || typeof html !== 'string') return html;
  return html
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

/**
 * データサイズ推定 (Bytes)
 */
export function estimateDataSize(obj) {
  const str = JSON.stringify(obj);
  return new Blob([str]).size;
}

/**
 * Firestore エラーメッセージフォーマット
 */
export function formatFirestoreError(err) {
  const msg = err?.message || '';
  const code = err?.code ?? err?.cause?.code;

  if (code === 5 || /code:\s*5|NOT_FOUND|5\s*NOT_FOUND/i.test(msg)) {
    console.error('Firestore エラー詳細:', { code, message: msg, err });
    return 'Firestore エラー(5): scripts/firestore-check.html で診断するか、console.firebase.google.com/project/airgo-trip/firestore で「データベースを作成」→ ネイティブモード・asia-northeast1';
  }

  if (code === 'data-too-large' || /payload|size|1\s*MB|limit/i.test(msg)) {
    return msg || 'トリップのデータが大きすぎます（1MB制限）。写真を減らすか、旅行記・アニメを省略してください。';
  }

  if (/permission|denied|unauthenticated|insufficient/i.test(msg)) {
    return 'Firestore 権限エラー: 1) Google でログインしているか確認 2) ターミナルで firebase deploy --only firestore:rules を実行';
  }

  return msg || 'Firestore への保存に失敗しました';
}

/**
 * Firestore 用にオブジェクトをサニタイズ（undefined・非シリアライズ可能な値を除去）
 */
export function sanitizeForFirestore(obj, seen = new WeakSet()) {
  if (obj == null || typeof obj === 'number' || typeof obj === 'boolean' || typeof obj === 'string') {
    return obj;
  }

  if (Number.isNaN(obj) || obj === Infinity || obj === -Infinity) {
    return null;
  }

  if (typeof obj === 'function' || obj instanceof File || obj instanceof Blob) {
    return undefined;
  }

  if (Array.isArray(obj)) {
    return obj.map(v => sanitizeForFirestore(v, seen)).filter(v => v !== undefined);
  }

  if (typeof obj === 'object') {
    if (seen.has(obj)) return undefined;
    seen.add(obj);

    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const s = sanitizeForFirestore(v, seen);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }

  return obj;
}
