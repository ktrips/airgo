/* === Airgo — 写真と地図の旅 === */

const DB_NAME = 'airgo';
const DB_VERSION = 5;
const AI_PROVIDER_STORAGE_KEY = 'airgo_ai_provider';
const AI_MODEL_STORAGE_KEY = 'airgo_ai_model';
const AI_API_KEY_STORAGE_KEY = 'airgo_ai_api_key';

const AI_MODELS = {
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash（高速・低価格）' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro（高性能）' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini（高速・低価格）' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo（高性能）' },
  ],
  claude: [
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku（高速・低価格）' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus（高性能）' },
  ],
};
const PUBLIC_TRIP_CONFIG_KEY = 'airgo_public_trip_config';
const MY_TRIP_LIST_ORDER_KEY = 'airgo_my_trip_list_order';
const DELETED_TRIP_IDS_KEY = 'airgo_deleted_trip_ids';
const STAMP_PHOTOS_KEY = 'airgo_stamp_photos';
const TRAVELOGUE_INFO_KEY = 'airgo_travelogue_info';
const HIDDEN_ANIME_IDS_KEY = 'airgo_hidden_anime_ids';
const ANIME_CHARACTER_PHOTOS_KEY = 'airgo_anime_character_photos';
const POPUP_FEATURES = 'width=720,height=600,scrollbars=yes,resizable=yes';

let _webviewModalLastBlobUrl = null;

/** URL をデスクトップではポップアップ、モバイルではモーダルで開く。動画URLはiframeで表示できないため常に新しいタブで開く */
function openUrlInPopupOrModal(url, title = 'ブログ') {
  if (!url) return;
  const isVideo = title === '動画';
  if (isVideo || !isMobileView()) {
    window.open(url, '_blank', POPUP_FEATURES);
    return;
  }
  const modal = document.getElementById('webviewModal');
  const iframe = document.getElementById('webviewModalIframe');
  const titleEl = document.getElementById('webviewModalTitle');
  if (modal && iframe && titleEl) {
    if (_webviewModalLastBlobUrl) {
      URL.revokeObjectURL(_webviewModalLastBlobUrl);
      _webviewModalLastBlobUrl = null;
    }
    _webviewModalLastBlobUrl = url.startsWith('blob:') ? url : null;
    titleEl.textContent = title;
    iframe.src = url;
    modal.classList.add('open');
  }
}

function closeWebviewModal() {
  const modal = document.getElementById('webviewModal');
  const iframe = document.getElementById('webviewModalIframe');
  if (iframe) iframe.src = 'about:blank';
  if (_webviewModalLastBlobUrl) {
    URL.revokeObjectURL(_webviewModalLastBlobUrl);
    _webviewModalLastBlobUrl = null;
  }
  if (modal) modal.classList.remove('open');
}
const ANIME_IMAGE_GEN = { aspectRatio: '9:16', imageSize: '1K' };
const ANIME_THUMB_W = 360;
const ANIME_THUMB_H = 640;
let _lastTravelogueHtmlUrl = null;
let _lastTravelogueHtmlContent = null;
let _lastTravelogueTripId = null;

function getTravelogueInfo(tripId) {
  if (!tripId) return null;
  try {
    const raw = localStorage.getItem(TRAVELOGUE_INFO_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map[tripId] || null;
  } catch { return null; }
}

function setTravelogueInfo(tripId, info) {
  if (!tripId) return;
  try {
    const raw = localStorage.getItem(TRAVELOGUE_INFO_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[tripId] = info;
    localStorage.setItem(TRAVELOGUE_INFO_KEY, JSON.stringify(map));
  } catch (_) {}
}

function isEditor() {
  return !!(window.firebaseAuth?.currentUser);
}

function setEditor(ok) {
  // 編集権限は Firebase Auth の状態で判定（isEditor 参照）
}

function getHiddenAnimeIds() {
  try {
    const raw = localStorage.getItem(HIDDEN_ANIME_IDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function setAnimeHidden(id, hidden) {
  const set = getHiddenAnimeIds();
  if (hidden) set.add(id);
  else set.delete(id);
  localStorage.setItem(HIDDEN_ANIME_IDS_KEY, JSON.stringify([...set]));
}

function getCharacterPhotos(tripId) {
  try {
    const raw = localStorage.getItem(ANIME_CHARACTER_PHOTOS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map[tripId] || [];
  } catch { return []; }
}

function setCharacterPhotos(tripId, photos) {
  try {
    const raw = localStorage.getItem(ANIME_CHARACTER_PHOTOS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (photos.length === 0) delete map[tripId];
    else map[tripId] = photos;
    localStorage.setItem(ANIME_CHARACTER_PHOTOS_KEY, JSON.stringify(map));
  } catch (_) {}
}

function getAiApiProvider() {
  const v = localStorage.getItem(AI_PROVIDER_STORAGE_KEY) || 'gemini';
  const legacy = { 'openai-mini': 'openai', 'openai-pro': 'openai', 'gemini-flash': 'gemini', 'gemini-pro': 'gemini' };
  return legacy[v] || (['gemini', 'openai', 'claude'].includes(v) ? v : 'gemini');
}

function setAiApiProvider(v) {
  localStorage.setItem(AI_PROVIDER_STORAGE_KEY, v || 'gemini');
}

function getAiApiModel() {
  const provider = getAiApiProvider();
  const stored = localStorage.getItem(AI_MODEL_STORAGE_KEY);
  const models = AI_MODELS[provider] || AI_MODELS.gemini;
  const valid = models.some(m => m.id === stored);
  return valid ? stored : (models[0]?.id || 'gemini-2.0-flash');
}

function setAiApiModel(v) {
  if (v) localStorage.setItem(AI_MODEL_STORAGE_KEY, v);
  else localStorage.removeItem(AI_MODEL_STORAGE_KEY);
}

function getAiApiKey() {
  return localStorage.getItem(AI_API_KEY_STORAGE_KEY) || '';
}

function setAiApiKey(v) {
  if (v) localStorage.setItem(AI_API_KEY_STORAGE_KEY, v);
  else localStorage.removeItem(AI_API_KEY_STORAGE_KEY);
}

function updateAiSettingsUI() {
  const providerSelect = document.getElementById('aiProviderSelect');
  const modelSelect = document.getElementById('aiModelSelect');
  const apiKeyInput = document.getElementById('aiApiKeyInput');
  if (!providerSelect || !apiKeyInput) return;
  providerSelect.value = getAiApiProvider();
  const models = AI_MODELS[providerSelect.value] || AI_MODELS.gemini;
  if (modelSelect) {
    modelSelect.innerHTML = models.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
    modelSelect.value = getAiApiModel();
    if (!models.some(m => m.id === modelSelect.value)) modelSelect.value = models[0]?.id || '';
  }
  apiKeyInput.value = getAiApiKey();
  const placeholders = { gemini: 'API Key を入力', openai: 'sk-... を入力', claude: 'sk-ant-... を入力' };
  apiKeyInput.placeholder = placeholders[providerSelect.value] || 'API Key を入力';
}

/** ウェブ（localhost 以外）でアクセスしているか */
function isWebDeployment() {
  const h = window.location.hostname;
  return h !== 'localhost' && h !== '127.0.0.1';
}

/** オンライン時は Firestore を優先して使用するか */
function useFirestoreAsPrimary() {
  return navigator.onLine && !!window.firebaseDb && !!window.firebaseAuth?.currentUser;
}

/** DB インジケーターを更新（IndexedDB / Firestore / オフライン） */
function updateDbIndicator() {
  const el = document.getElementById('dbIndicator');
  if (!el) return;
  if (!navigator.onLine) {
    el.textContent = 'オフライン (IndexedDB)';
    el.className = 'db-indicator offline';
    el.title = 'オフラインのためローカルの IndexedDB を使用しています';
  } else if (useFirestoreAsPrimary()) {
    el.textContent = '☁️ Firestore';
    el.className = 'db-indicator firestore';
    el.title = 'オンライン: Firestore に接続中。直近のデータを表示しています';
  } else {
    el.textContent = '💾 IndexedDB';
    el.className = 'db-indicator indexeddb';
    el.title = 'ローカルの IndexedDB を使用しています。Google ログインで Firestore に同期';
  }
}

function updateEditorUI() {
  const isEd = isEditor();
  const authBtn = document.getElementById('authBtn');
  const hint = document.getElementById('editorOnlyHint');

  if (authBtn) {
    if (isEd && window.firebaseAuth?.currentUser) {
      authBtn.textContent = `ログアウト (${window.firebaseAuth.currentUser.email || 'Google'})`;
    } else {
      authBtn.textContent = 'Googleでログイン';
    }
  }
  document.querySelectorAll('.editor-only').forEach(el => {
    el.style.display = isEd ? '' : 'none';
  });
  document.querySelectorAll('.login-required').forEach(el => {
    el.style.display = isEd ? '' : 'none';
  });
  if (hint) hint.style.display = isEd ? 'none' : 'block';
  if (document.getElementById('allPhotosThumbnails')?.classList.contains('visible')) {
    renderAllPhotosStrip();
  }
  if (map && photos.length > 0) addPhotoMarkers();
  if (photoPopup && map && photos[currentIndex] != null) {
    photoPopup.setContent(buildPhotoPopupHtml(photos[currentIndex], currentIndex));
  }
  if (photos.length > 0) renderPublicTripsPanel();
  updateSaveButtonState();
  const syncBtn = document.getElementById('syncLocalToFirestoreBtn');
  const showSync = isEd && window.firebaseDb && window.firebaseAuth?.currentUser && !isWebDeployment();
  if (syncBtn) syncBtn.style.display = showSync ? '' : 'none';
  updateDbIndicator();
  updateSyncIndicator();
}

const STORE_NAME = 'trips';
const TRAVELOGUE_STORE = 'travelogueHtml';
const DATA_ANIME_STORE = 'dataAnime';

let map = null;
let markers = [];
let _publicTripMarkerUrls = []; // 公開トリップマーカー用blob URL（revoke用）
let _publicTripRouteLayers = []; // 公開トリップのルートレイヤー（削除用）
let photoPopup = null; // 地図上の写真ポップアップ（GPSなし用）
let gpxLayer = null;
let routeLayer = null;
let osmLayer = null;
let aerialLayer = null;
let aerialLabelsLayer = null; // 航空写真上の地名・道路名ラベル（ハイブリッド用）
let photos = []; // { file?, url, lat, lng, name, data? }
let currentIndex = 0;
let playTimer = null;
let playAnimationFrame = null;
let isPlaying = false;
let currentTripId = null;
let isNewTrip = false; // 新規ボタンで開始した時のみ true
let gpxData = null;
let gpxTrackPoints = []; // { lat, lon, time, ele, speed, temp, hr } - 各trkptの詳細データ
let publicTrips = []; // デプロイ時に含まれる公開トリップ（public-trips.json）
let firestoreTrips = []; // Firebase が有効な場合の Firestore trips コレクション
let _currentViewingTripId = null; // スタンプ保存用（loadTrip/loadTripAndShowPhotoで設定）
let _currentTripColor = null; // 表示中トリップの色（ルート・マーカー用）
let _addPointMode = false;
let _addPointMapClickHandler = null;
let _pendingExportBlob = null;
let _pendingExportCount = 0;
let _pendingExportFilename = 'public-trips.json.gz';
let firestoreUnsubscribe = null; // Firestore リアルタイムリスナーの解除関数
let offlineQueue = []; // オフライン時の保存キュー { action, trip?, id?, timestamp }

const DEFAULT_CENTER = [35.6812, 139.7671]; // 東京
const DEFAULT_ZOOM = 5;

/* GPXルートのスタイル（目立つように） */
const ROUTE_STYLE = {
  outline: { color: '#ffffff', weight: 14, opacity: 0.95, lineCap: 'round', lineJoin: 'round' },
  main: { color: '#e1306c', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' },
};

function createStyledRouteLayer(route) {
  if (!route || route.length < 2) return null;
  const group = L.layerGroup();
  group.addLayer(L.polyline(route, ROUTE_STYLE.outline));
  group.addLayer(L.polyline(route, ROUTE_STYLE.main));
  return group;
}

/** トリップ毎のルート用カラーパレット（ピンク→濃い紫のレインボー順・12色） */
const PUBLIC_TRIP_COLORS = ['#e1306c', '#ec4899', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#6b21a8'];

/** トリップまたはIDから色を返す（trip.color があればそれ、なければIDハッシュ） */
function getTripColor(tripOrId) {
  if (tripOrId == null) return PUBLIC_TRIP_COLORS[0];
  if (typeof tripOrId === 'object' && tripOrId.color) return tripOrId.color;
  const id = String(typeof tripOrId === 'object' ? tripOrId.id : tripOrId).replace(/^public_/, '');
  if (!id) return PUBLIC_TRIP_COLORS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PUBLIC_TRIP_COLORS[h % PUBLIC_TRIP_COLORS.length];
}

function createStyledRouteLayerWithColor(route, color) {
  if (!route || route.length < 2) return null;
  const group = L.layerGroup();
  const outline = { ...ROUTE_STYLE.outline, color: '#ffffff' };
  const main = { ...ROUTE_STYLE.main, color: color || ROUTE_STYLE.main.color };
  group.addLayer(L.polyline(route, outline));
  group.addLayer(L.polyline(route, main));
  return group;
}

/** トリップからルートポイントを取得（GPXまたは写真順） */
function getRoutePointsFromTrip(trip) {
  if (trip.gpxData) {
    try {
      const doc = new DOMParser().parseFromString(trip.gpxData, 'text/xml');
      const pts = [];
      doc.querySelectorAll('trkpt, rtept').forEach(pt => {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) pts.push([lat, lon]);
      });
      if (pts.length >= 2) return pts;
    } catch (_) {}
  }
  const withGps = (trip.photos || []).filter(p => p.lat != null && p.lng != null);
  return withGps.map(p => [p.lat, p.lng]);
}

/* --- IndexedDB --- */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => {
      const err = req.error;
      if (err && err.name === 'VersionError') {
        setStatus('IndexedDB のバージョンが古いです。ページを強制再読み込み（Ctrl+Shift+R / Cmd+Shift+R）するか、開発者ツールで airgo データベースを削除してから再読み込みしてください。', true);
      }
      reject(err);
    };
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(TRAVELOGUE_STORE)) {
        db.createObjectStore(TRAVELOGUE_STORE, { keyPath: 'tripId' });
      }
      if (!db.objectStoreNames.contains(DATA_ANIME_STORE)) {
        db.createObjectStore(DATA_ANIME_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function saveTripToDB(trip) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(trip);
    req.onsuccess = () => {
      console.log('IndexedDB 保存成功:', trip.id);
      resolve();
    };
    req.onerror = () => {
      console.error('IndexedDB 保存エラー:', trip.id, req.error);
      reject(req.error);
    };
  });
}

async function loadTripsFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** Firebase が有効かつログイン中の場合、Firestore の trips コレクションから自分のトリップを取得 */
async function loadTripsFromFirestore() {
  if (!window.firebaseDb || !window.firebaseAuth?.currentUser) return [];
  try {
    const uid = window.firebaseAuth.currentUser.uid;
    const snapshot = await window.firebaseDb.collection('trips').where('userId', '==', uid).get();
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, _fromFirestore: true }));
  } catch (err) {
    console.warn('Firestore トリップ読み込みエラー:', err);
    return [];
  }
}

/** Firestore からパブリックトリップを取得（ログイン不要） */
async function loadPublicTripsFromFirestore() {
  if (!window.firebaseDb) return [];
  try {
    console.log('Firestore からパブリックトリップを読み込み中...');
    const snapshot = await window.firebaseDb.collection('trips')
      .where('public', '==', true)
      .orderBy('updatedAt', 'desc')
      .get();
    const trips = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, _fromFirestore: true }));
    console.log(`Firestore からパブリックトリップを ${trips.length}件読み込みました`);
    return trips;
  } catch (err) {
    console.warn('Firestore パブリックトリップ読み込みエラー:', err);
    return [];
  }
}

/** Firestore から指定 ID のトリップを1件取得（ウェブアクセス時用） */
async function loadTripFromFirestore(id) {
  if (!window.firebaseDb || !window.firebaseAuth?.currentUser) return null;
  try {
    const doc = await window.firebaseDb.collection('trips').doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (data.userId !== window.firebaseAuth.currentUser.uid) return null;
    return { ...data, id: doc.id, _fromFirestore: true };
  } catch (err) {
    console.warn('Firestore トリップ読み込みエラー:', err);
    return null;
  }
}

async function loadTripFromDB(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteTripFromDB(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Firestore 用にオブジェクトをサニタイズ（undefined・非シリアライズ可能な値を除去） */
function sanitizeForFirestore(obj, seen = new WeakSet()) {
  if (obj == null || typeof obj === 'number' || typeof obj === 'boolean' || typeof obj === 'string') return obj;
  if (Number.isNaN(obj) || obj === Infinity || obj === -Infinity) return null;
  if (typeof obj === 'function' || obj instanceof File || obj instanceof Blob) return undefined;
  if (Array.isArray(obj)) return obj.map(v => sanitizeForFirestore(v, seen)).filter(v => v !== undefined);
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

/** Firestore エラーをユーザー向けメッセージに変換 */
function formatFirestoreError(err) {
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

/** データのおおよそのバイトサイズを計算 */
function estimateDataSize(obj) {
  const str = JSON.stringify(obj);
  return new Blob([str]).size;
}

/** Firebase が有効かつログイン中の場合、Firestore にトリップを保存 */
async function saveTripToFirestore(trip) {
  if (!window.firebaseDb || !window.firebaseAuth?.currentUser) {
    console.log('Firestore 保存スキップ: 未ログインまたはFirebaseが無効');
    return;
  }

  const data = sanitizeForFirestore({ ...trip, userId: window.firebaseAuth.currentUser.uid });
  if (!data || typeof data !== 'object') throw new Error('Firestore に保存するデータが不正です');

  // データサイズチェック（Firestoreの制限は1MB）
  const dataSize = estimateDataSize(data);
  const MAX_FIRESTORE_SIZE = 1000000; // 1MB = 1,000,000 bytes

  if (dataSize > MAX_FIRESTORE_SIZE) {
    console.warn(`Firestore 保存スキップ: データサイズ ${(dataSize / 1000000).toFixed(2)}MB が制限の1MBを超えています`);
    const err = new Error('トリップのデータが大きすぎます（1MB制限）。写真を減らすか、旅行記・アニメを省略してください。');
    err.code = 'data-too-large';
    throw err;
  }

  console.log('Firestore に保存中:', trip.id, `(${(dataSize / 1000).toFixed(1)}KB)`);
  await window.firebaseDb.collection('trips').doc(trip.id).set(data, { merge: true });
  console.log('Firestore 保存完了:', trip.id);
}

/** Firebase が有効かつログイン中の場合、Firestore からトリップを削除 */
async function deleteTripFromFirestore(id) {
  if (!window.firebaseDb || !window.firebaseAuth?.currentUser) return;
  try {
    const doc = await window.firebaseDb.collection('trips').doc(id).get();
    if (doc.exists && doc.data()?.userId === window.firebaseAuth.currentUser.uid) {
      await window.firebaseDb.collection('trips').doc(id).delete();
    }
  } catch (err) {
    console.warn('Firestore 削除エラー:', err);
  }
}

/** Firestore の変更を IndexedDB に同期（リアルタイムリスナー用） */
async function syncFirestoreToLocal(firestoreTrip) {
  try {
    const localTrip = await loadTripFromDB(firestoreTrip.id);

    if (!localTrip) {
      // ローカルに存在しない → Firestore から追加
      await saveTripToDB(firestoreTrip);
      console.log('Firestore → Local: 新規追加', firestoreTrip.id);
      return;
    }

    const fsUpdated = firestoreTrip.updatedAt || 0;
    const localUpdated = localTrip.updatedAt || 0;

    if (fsUpdated > localUpdated) {
      // Firestore の方が新しい → ローカルを上書き
      await saveTripToDB(firestoreTrip);
      console.log('Firestore → Local: 更新', firestoreTrip.id);
    } else if (localUpdated > fsUpdated && navigator.onLine) {
      // ローカルの方が新しい → Firestore に反映（オフライン中の変更）
      await saveTripToFirestore(localTrip);
      console.log('Local → Firestore: オフライン中の変更を反映', localTrip.id);
    }
  } catch (err) {
    console.error('同期エラー:', firestoreTrip.id, err);
  }
}

/** Firestore の全トリップをローカルに同期（ログイン時の初期同期） */
async function syncFirestoreToLocalAll() {
  if (!window.firebaseDb || !window.firebaseAuth?.currentUser) return;

  try {
    setStatus('Firestore からデータを取得中...');
    const fsTrips = await loadTripsFromFirestore();

    let synced = 0;
    for (const fsTrip of fsTrips) {
      await syncFirestoreToLocal(fsTrip);
      synced++;
    }

    console.log(`Firestore → Local: ${synced}件のトリップを同期しました`);
    setStatus(`${synced}件のトリップを同期しました`);
  } catch (err) {
    console.error('初期同期エラー:', err);
    setStatus('同期エラーが発生しました', true);
  }
}

/** IndexedDB の全トリップを Firestore に同期（手動同期ボタン用） */
async function syncAllLocalToFirestore() {
  if (!window.firebaseDb || !window.firebaseAuth?.currentUser) {
    setStatus('Firestore に同期するにはログインしてください', true);
    return;
  }

  try {
    setStatus('Firestore に同期中...');
    const localTrips = await loadTripsFromDB();
    let synced = 0;
    let skipped = 0;

    for (const trip of localTrips) {
      try {
        const fsTrip = await loadTripFromFirestore(trip.id);

        if (!fsTrip || (trip.updatedAt || 0) > (fsTrip.updatedAt || 0)) {
          await saveTripToFirestore(trip);
          synced++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error('同期失敗:', trip.id, err);
      }
    }

    setStatus(`同期完了: ${synced}件アップロード, ${skipped}件スキップ`);
    await refreshTripList();
  } catch (err) {
    console.error('一括同期エラー:', err);
    setStatus('同期エラーが発生しました', true);
  }
}

/** Firestore の変更をリアルタイムで監視 */
function subscribeToFirestoreTrips() {
  if (!window.firebaseDb || !window.firebaseAuth?.currentUser) return;

  // 既存のリスナーを解除
  if (firestoreUnsubscribe) firestoreUnsubscribe();

  const uid = window.firebaseAuth.currentUser.uid;

  // トリップコレクションの変更をリアルタイム監視
  firestoreUnsubscribe = window.firebaseDb
    .collection('trips')
    .where('userId', '==', uid)
    .onSnapshot(async (snapshot) => {
      console.log('Firestore 変更検知:', snapshot.docChanges().length, '件');

      let hasChanges = false;
      for (const change of snapshot.docChanges()) {
        const trip = { ...change.doc.data(), id: change.doc.id, _fromFirestore: true };

        if (change.type === 'added' || change.type === 'modified') {
          // Firestore の変更を IndexedDB に反映
          await syncFirestoreToLocal(trip);
          hasChanges = true;
        } else if (change.type === 'removed') {
          // Firestore で削除されたら IndexedDB からも削除
          await deleteTripFromDB(change.doc.id);
          hasChanges = true;
        }
      }

      // UI を更新
      if (hasChanges) {
        await refreshTripList();

        // 現在表示中のトリップが変更された場合はリロード
        if (currentTripId && snapshot.docChanges().some(c => c.doc.id === currentTripId)) {
          const trip = await getTripById(currentTripId);
          if (trip) {
            console.log('表示中のトリップが更新されました:', currentTripId);
            // 必要に応じて自動リロードまたは通知を表示
          }
        }
      }
    }, (error) => {
      console.error('Firestore リスナーエラー:', error);
      setStatus('リアルタイム同期エラーが発生しました', true);
    });

  console.log('Firestore リアルタイム同期を開始しました');
  updateSyncIndicator();
}

/** リアルタイムリスナーを解除 */
function unsubscribeFromFirestore() {
  if (firestoreUnsubscribe) {
    firestoreUnsubscribe();
    firestoreUnsubscribe = null;
    console.log('Firestore リスナーを解除しました');
  }
  updateSyncIndicator();
}

/** オフライン時の保存キューを処理 */
async function processOfflineQueue() {
  if (offlineQueue.length === 0) return;
  if (!navigator.onLine || !window.firebaseDb || !window.firebaseAuth?.currentUser) return;

  const queueSize = offlineQueue.length;
  console.log(`オフラインキューを処理中: ${queueSize}件`);
  setStatus(`オフライン中の変更を同期中... (${queueSize}件)`);

  let processed = 0;
  let failed = 0;

  while (offlineQueue.length > 0) {
    const task = offlineQueue.shift();

    try {
      if (task.action === 'save') {
        await saveTripToFirestore(task.trip);
        processed++;
      } else if (task.action === 'delete') {
        await deleteTripFromFirestore(task.id);
        processed++;
      }
    } catch (err) {
      console.error('キュー処理エラー:', task, err);
      // エラー時はキューに戻す（次回のオンライン時に再試行）
      offlineQueue.unshift(task);
      failed++;
      break;
    }
  }

  if (offlineQueue.length === 0) {
    console.log(`オフラインキュー処理完了: ${processed}件`);
    setStatus(`オフライン中の変更を同期しました (${processed}件)`);
  } else {
    console.warn(`オフラインキュー処理中断: ${processed}件成功, ${failed}件失敗`);
    setStatus(`一部の変更を同期できませんでした`, true);
  }

  await refreshTripList();
  updateSyncIndicator();
}

/** オフライン対応の保存関数 */
async function saveTripWithOfflineSupport(trip) {
  // 常に IndexedDB に保存
  await saveTripToDB(trip);
  invalidateMergedTripsCache();

  if (navigator.onLine && window.firebaseDb && window.firebaseAuth?.currentUser) {
    // オンライン → Firestore に即座に保存
    try {
      await saveTripToFirestore(trip);
      console.log('Firestore 保存成功:', trip.id);
    } catch (err) {
      console.error('Firestore 保存エラー:', err);

      // データサイズエラーの場合は、キューに追加せず、エラーを投げる
      if (err.code === 'data-too-large') {
        console.warn('データが大きすぎるため、Firestore への保存をスキップします（IndexedDBには保存済み）');
        throw err; // エラーを上位に伝播
      }

      // その他のエラーの場合はキューに追加（IndexedDBには保存済み）
      offlineQueue.push({ action: 'save', trip: { ...trip }, timestamp: Date.now() });
      updateSyncIndicator();
      // エラーを投げない（IndexedDBには保存できているので成功扱い）
      console.warn('Firestore への同期は後ほど行われます');
    }
  } else {
    // オフライン or 未ログイン
    if (window.firebaseAuth?.currentUser) {
      // ログイン済みの場合はオフラインキューに追加
      offlineQueue.push({ action: 'save', trip: { ...trip }, timestamp: Date.now() });
      console.log('オフラインキューに追加:', trip.id);
      updateSyncIndicator();
    } else {
      // 未ログインの場合はIndexedDBのみ
      console.log('IndexedDB のみに保存（未ログイン）:', trip.id);
    }
  }
}

/** オフライン対応の削除関数 */
async function deleteTripWithOfflineSupport(id) {
  // 常に IndexedDB から削除
  await deleteTripFromDB(id);
  invalidateMergedTripsCache();

  if (navigator.onLine && window.firebaseDb && window.firebaseAuth?.currentUser) {
    // オンライン → Firestore から即座に削除
    try {
      await deleteTripFromFirestore(id);
    } catch (err) {
      console.error('Firestore 削除エラー:', err);
      // Firestore 削除失敗時はキューに追加
      offlineQueue.push({ action: 'delete', id, timestamp: Date.now() });
      updateSyncIndicator();
    }
  } else {
    // オフライン or 未ログイン
    if (window.firebaseAuth?.currentUser) {
      // ログイン済みの場合はオフラインキューに追加
      offlineQueue.push({ action: 'delete', id, timestamp: Date.now() });
      console.log('オフラインキューに追加 (削除):', id);
      updateSyncIndicator();
    } else {
      // 未ログインの場合はIndexedDBのみから削除済み
      console.log('IndexedDB から削除（未ログイン）:', id);
    }
  }
}

/** 同期インジケーターを更新 */
function updateSyncIndicator() {
  const indicator = document.getElementById('syncIndicator');
  const queueCount = document.getElementById('offlineQueueCount');

  if (indicator) {
    if (firestoreUnsubscribe && navigator.onLine) {
      indicator.textContent = 'リアルタイム同期中';
      indicator.className = 'sync-active';
    } else if (!navigator.onLine) {
      indicator.textContent = 'オフライン';
      indicator.className = 'sync-offline';
    } else {
      indicator.textContent = '同期停止';
      indicator.className = 'sync-inactive';
    }
  }

  if (queueCount) {
    const count = offlineQueue.length;
    if (count > 0) {
      queueCount.style.display = '';
      queueCount.querySelector('span').textContent = count;
    } else {
      queueCount.style.display = 'none';
    }
  }
}

/** 削除済みトリップID一覧を取得（公開トリップに同名がある場合も非表示にするため） */
function getDeletedTripIds() {
  try {
    const raw = localStorage.getItem(DELETED_TRIP_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}

/** 削除済みトリップIDを記録 */
function addDeletedTripId(tripId) {
  if (!tripId || tripId.startsWith('public_')) return;
  const set = getDeletedTripIds();
  set.add(tripId);
  try {
    localStorage.setItem(DELETED_TRIP_IDS_KEY, JSON.stringify([...set]));
  } catch (_) {}
}

/** トリップ保存時に削除済みリストから除外（再インポート等に対応） */
function removeFromDeletedTripIds(tripId) {
  if (!tripId) return;
  const rawId = tripId.replace(/^public_/, '');
  const set = getDeletedTripIds();
  if (!set.has(rawId)) return;
  set.delete(rawId);
  try {
    localStorage.setItem(DELETED_TRIP_IDS_KEY, JSON.stringify([...set]));
  } catch (_) {}
}

/** トリップ削除時に紐づくスタンプ・旅行記・アニメ・並び順設定も削除 */
async function cleanupTripRelatedData(tripId) {
  if (!tripId || tripId.startsWith('public_')) return;
  try {
    addDeletedTripId(tripId);
    const config = getMyTripListOrder();
    if (config) {
      let changed = false;
      if (Array.isArray(config.rootOrder)) {
        const next = config.rootOrder.filter(id => id !== tripId);
        if (next.length !== config.rootOrder.length) {
          config.rootOrder = next;
          changed = true;
        }
      }
      if (config.childrenOrder && typeof config.childrenOrder === 'object') {
        const next = { ...config.childrenOrder };
        for (const [parentId, order] of Object.entries(next)) {
          const filtered = order.filter(id => id !== tripId);
          if (filtered.length !== order.length) {
            next[parentId] = filtered;
            changed = true;
          }
        }
        config.childrenOrder = next;
        if (Object.keys(next).length === 0) delete config.childrenOrder;
      }
      if (changed) saveMyTripListOrder(config);
    }
    await deleteTravelogueFromDB(tripId);
    await deleteAnimeByTripIdFromDB(tripId);
    deleteStampPhotosForTrip(tripId);
  } catch (e) {
    console.warn('cleanupTripRelatedData:', e);
  }
}

async function deleteTravelogueFromDB(tripId) {
  if (!tripId) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRAVELOGUE_STORE, 'readwrite');
    const store = tx.objectStore(TRAVELOGUE_STORE);
    const req = store.delete(tripId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteAnimeByTripIdFromDB(tripId) {
  if (!tripId) return;
  const list = await listAnimeFromDB();
  const toDelete = list.filter(a => a.tripId === tripId);
  if (toDelete.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_ANIME_STORE, 'readwrite');
    const store = tx.objectStore(DATA_ANIME_STORE);
    for (const a of toDelete) store.delete(a.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function deleteStampPhotosForTrip(tripId) {
  const all = getStampPhotos();
  const prefix = tripId + '_';
  let changed = false;
  for (const key of Object.keys(all)) {
    if (key.startsWith(prefix)) {
      delete all[key];
      changed = true;
    }
  }
  if (changed) localStorage.setItem(STAMP_PHOTOS_KEY, JSON.stringify(all));
}

/** 写真削除時にスタンプを1つ削除し、以降のインデックスをスライド */
function deleteStampPhotoAndShift(tripId, deletedIndex) {
  const all = getStampPhotos();
  const prefix = tripId + '_';
  const updates = {};
  let changed = false;
  for (const key of Object.keys(all)) {
    if (!key.startsWith(prefix)) {
      updates[key] = all[key];
      continue;
    }
    const rest = key.slice(prefix.length);
    const idx = parseInt(rest, 10);
    if (isNaN(idx)) {
      updates[key] = all[key];
      continue;
    }
    if (idx === deletedIndex) {
      changed = true;
      continue;
    }
    if (idx > deletedIndex) {
      updates[prefix + (idx - 1)] = all[key];
      changed = true;
    } else {
      updates[key] = all[key];
    }
  }
  if (changed) localStorage.setItem(STAMP_PHOTOS_KEY, JSON.stringify(updates));
}

/** 親の存在しない子トリップ（親が削除済みの孤立トリップ）を削除 */
async function deleteOrphanTrips() {
  const trips = await loadTripsFromDB();
  const parentIds = new Set(trips.map(t => t.id));
  const orphans = trips.filter(t => t.parentTripId && !parentIds.has(t.parentTripId));
  for (const t of orphans) {
    await deleteTripWithOfflineSupport(t.id);
    await cleanupTripRelatedData(t.id);
    if (currentTripId === t.id) clearCurrentTrip();
  }
  return orphans.length;
}

/** 存在しないトリップ・削除済み写真・非表示アニメに紐づく孤立データを削除して容量を節約 */
async function cleanupOrphanedStorage() {
  const trips = await loadTripsFromDB();
  const tripIds = new Set(trips.map(t => t.id));
  publicTrips.forEach(t => tripIds.add(t.id));
  const tripPhotoCount = new Map();
  for (const t of trips) {
    tripPhotoCount.set(t.id, (t.photos || []).length);
  }
  for (const t of publicTrips) {
    const n = (t.photos || []).length;
    if (n > (tripPhotoCount.get(t.id) || 0)) tripPhotoCount.set(t.id, n);
  }
  let removed = 0;
  const stampPhotos = getStampPhotos();
  const newStampPhotos = {};
  for (const key of Object.keys(stampPhotos)) {
    const parts = key.split('_');
    const tripId = parts.length >= 2 ? parts.slice(0, -1).join('_') : key;
    const photoIndex = parts.length >= 2 ? parseInt(parts[parts.length - 1], 10) : -1;
    const maxIdx = (tripPhotoCount.get(tripId) || 0) - 1;
    if (tripIds.has(tripId) && !isNaN(photoIndex) && photoIndex <= maxIdx) {
      newStampPhotos[key] = stampPhotos[key];
    } else {
      removed++;
    }
  }
  if (Object.keys(newStampPhotos).length !== Object.keys(stampPhotos).length) {
    localStorage.setItem(STAMP_PHOTOS_KEY, JSON.stringify(newStampPhotos));
  }
  const travelogues = await listTraveloguesFromDB();
  for (const t of travelogues) {
    if (t?.tripId && !tripIds.has(t.tripId)) {
      await deleteTravelogueFromDB(t.tripId);
      removed++;
    }
  }
  const animeList = await listAnimeFromDB();
  const hiddenIds = getHiddenAnimeIds();
  const db = await openDB();
  let hiddenCleaned = false;
  for (const a of animeList) {
    const orphaned = a?.tripId && !tripIds.has(a.tripId);
    const hidden = hiddenIds.has(a.id);
    if (orphaned || hidden) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DATA_ANIME_STORE, 'readwrite');
        tx.objectStore(DATA_ANIME_STORE).delete(a.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      removed++;
      if (hidden) {
        hiddenIds.delete(a.id);
        hiddenCleaned = true;
      }
    }
  }
  if (hiddenCleaned) {
    localStorage.setItem(HIDDEN_ANIME_IDS_KEY, JSON.stringify([...hiddenIds]));
  }
  try {
    const raw = localStorage.getItem(ANIME_CHARACTER_PHOTOS_KEY);
    const charMap = raw ? JSON.parse(raw) : {};
    let charChanged = false;
    for (const tid of Object.keys(charMap)) {
      if (!tripIds.has(tid)) {
        delete charMap[tid];
        charChanged = true;
        removed++;
      }
    }
    if (charChanged) localStorage.setItem(ANIME_CHARACTER_PHOTOS_KEY, JSON.stringify(charMap));
  } catch (_) {}
  try {
    const raw = localStorage.getItem(TRAVELOGUE_INFO_KEY);
    const infoMap = raw ? JSON.parse(raw) : {};
    let infoChanged = false;
    for (const tid of Object.keys(infoMap)) {
      if (!tripIds.has(tid)) {
        delete infoMap[tid];
        infoChanged = true;
        removed++;
      }
    }
    if (infoChanged) localStorage.setItem(TRAVELOGUE_INFO_KEY, JSON.stringify(infoMap));
  } catch (_) {}
  return removed;
}

/** HTML をミニファイしてストレージ容量を削減 */
function minifyHtmlForStorage(html) {
  if (!html || typeof html !== 'string') return html;
  return html
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

async function saveTravelogueHtmlToDB(tripId, html, tripName) {
  if (!tripId) return;
  const db = await openDB();
  const minified = minifyHtmlForStorage(html);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRAVELOGUE_STORE, 'readwrite');
    const store = tx.objectStore(TRAVELOGUE_STORE);
    const req = store.put({ tripId, tripName: tripName || '', html: minified, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadTravelogueHtmlFromDB(tripId) {
  if (!tripId) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRAVELOGUE_STORE, 'readonly');
    const store = tx.objectStore(TRAVELOGUE_STORE);
    const req = store.get(tripId);
    req.onsuccess = () => resolve(req.result?.html || null);
    req.onerror = () => reject(req.error);
  });
}

async function listTraveloguesFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TRAVELOGUE_STORE, 'readonly');
    const store = tx.objectStore(TRAVELOGUE_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function saveAnimeToDB(tripId, tripName, panels, thumbnail, pageImages, coverImage, opts = {}) {
  const { animeType = 'cover', half, order } = opts;
  const db = await openDB();
  const obj = {
    tripId,
    tripName: tripName || '',
    panels: panels || [],
    pageImages: pageImages || [],
    animeType,
    order: order != null ? order : Date.now(),
    createdAt: Date.now()
  };
  if (thumbnail && (thumbnail.data || thumbnail.mime)) obj.thumbnail = thumbnail;
  if (coverImage && (coverImage.data || coverImage.mime)) obj.coverImage = coverImage;
  if (half != null && half !== '') obj.half = half;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_ANIME_STORE, 'readwrite');
    const store = tx.objectStore(DATA_ANIME_STORE);
    const req = store.add(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function listAnimeFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_ANIME_STORE, 'readonly');
    const store = tx.objectStore(DATA_ANIME_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    req.onerror = () => reject(req.error);
  });
}

async function getAnimeByTripId(tripId) {
  if (!tripId) return null;
  const list = await listAnimeFromDB();
  const hidden = getHiddenAnimeIds();
  return list.find(a => a.tripId === tripId && !hidden.has(a.id)) || null;
}

/** トリップのカバー画像（表紙）を取得 */
async function getAnimeCoverByTripId(tripId) {
  if (!tripId) return null;
  const list = await listAnimeFromDB();
  const hidden = getHiddenAnimeIds();
  return list.find(a => a.tripId === tripId && !hidden.has(a.id) && (a.coverImage || a.animeType === 'cover')) || null;
}

/** トリップの漫画ページ一覧を取得（orderでソート） */
async function getAnimePagesByTripId(tripId) {
  if (!tripId) return [];
  const list = await listAnimeFromDB();
  const hidden = getHiddenAnimeIds();
  return list
    .filter(a => a.tripId === tripId && !hidden.has(a.id) && (a.animeType === 'page' || (a.pageImages?.length && !a.coverImage)))
    .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
}

/** トリップの表紙＋漫画ページを表示順で取得（orderでソート） */
async function getAnimeAllForTripDisplay(tripId, injectedList = null) {
  if (!tripId && !injectedList) return [];
  if (injectedList && Array.isArray(injectedList)) {
    const partLabels = { q1: '1/4', q2: '2/4', q3: '3/4', q4: '4/4', first: '前半', second: '後半' };
    return injectedList.map((a, i) => ({
      ...a,
      _displayLabel: a.coverImage || a.animeType === 'cover' ? '表紙' : (partLabels[a.half] || `${i + 1}`)
    }));
  }
  const list = await listAnimeFromDB();
  const hidden = getHiddenAnimeIds();
  const items = list
    .filter(a => a.tripId === tripId && !hidden.has(a.id))
    .sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
  const partLabels = { q1: '1/4', q2: '2/4', q3: '3/4', q4: '4/4', first: '前半', second: '後半' };
  return items.map((a, i) => ({
    ...a,
    _displayLabel: a.coverImage || a.animeType === 'cover' ? '表紙' : (partLabels[a.half] || `${i + 1}`)
  }));
}

async function updateAnimeOrderInDB(id, order) {
  const anime = await loadAnimeFromDB(id);
  if (!anime) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_ANIME_STORE, 'readwrite');
    const store = tx.objectStore(DATA_ANIME_STORE);
    anime.order = order;
    store.put(anime);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteAnimeFromDB(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_ANIME_STORE, 'readwrite');
    const store = tx.objectStore(DATA_ANIME_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadAnimeFromDB(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_ANIME_STORE, 'readonly');
    const store = tx.objectStore(DATA_ANIME_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 旅行記HTMLからpdfData（写真・地図・説明）を抽出 */
function extractPdfDataFromTravelogueHtml(html) {
  if (!html) return null;
  const m = html.match(/id="traveloguePdfData"[^>]*>([\s\S]*?)<\/scr\\?ipt>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch (_) {
    return null;
  }
}

/** トリップを取得
 * デプロイ時: Firestore（クラウド）のみ使用。IndexedDBは使わない
 * ローカル時: ログイン中は Firestore、未ログイン時は IndexedDB */
async function getTripById(id) {
  if (!id) return null;
  const fromCache = firestoreTrips.find(t => t.id === id);
  if (fromCache) return fromCache;
  if (isWebDeployment()) {
    return loadTripFromFirestore(id);
  }
  return useFirestoreAsPrimary() ? loadTripFromFirestore(id) : loadTripFromDB(id);
}

/** 写真のメタデータ（ランドマーク・説明・URL）をDBに直接保存。既存トリップの写真データを保持したまま更新。ポイントの場合は説明を名称としても使用 */
async function savePhotoMetadataToDB(tripId, photoIndex, metadata) {
  const trip = await getTripById(tripId);
  if (!trip) return false;
  if (!trip.photos || !trip.photos[photoIndex]) return false;
  const p = trip.photos[photoIndex];
  p.landmarkNo = metadata.landmarkNo;
  p.landmarkName = metadata.landmarkName;
  p.description = metadata.description;
  p.url = metadata.url;
  if (metadata.name != null) p.name = metadata.name;
  if (metadata.placeName != null) p.placeName = metadata.placeName;
  trip.updatedAt = Date.now();

  // オフライン対応の保存
  try {
    await saveTripWithOfflineSupport(trip);
  } catch (err) {
    console.error('メタデータ保存エラー:', err);
    // IndexedDB には保存できているので、Firestore 同期に失敗してもエラーとしない
  }

  return true;
}

function initMap() {
  if (map) return;
  map = L.map('map').setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
  });
  aerialLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri',
  });
  aerialLabelsLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri',
  });
  osmLayer.addTo(map);
}

function setMapToHybrid() {
  if (!map) return;
  if (osmLayer && map.hasLayer(osmLayer)) map.removeLayer(osmLayer);
  aerialLayer.addTo(map);
  aerialLabelsLayer.addTo(map);
}

function setMapToOsm() {
  if (!map) return;
  if (aerialLabelsLayer && map.hasLayer(aerialLabelsLayer)) map.removeLayer(aerialLabelsLayer);
  if (aerialLayer && map.hasLayer(aerialLayer)) map.removeLayer(aerialLayer);
  osmLayer.addTo(map);
}

/** 地図内の地名検索（Nominatim API・デスクトップのみ） */
function initMapSearch() {
  const input = document.getElementById('mapSearchInput');
  const resultsEl = document.getElementById('mapSearchResults');
  if (!input || !resultsEl || !map) return;

  let searchTimeout = null;
  const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

  function hideResults() {
    resultsEl.classList.remove('visible');
    resultsEl.innerHTML = '';
  }

  function showResults(items) {
    resultsEl.innerHTML = items.map((r) => {
      const name = escapeHtml(r.display_name || r.name || '');
      const type = escapeHtml(r.type || r.class || '');
      return `<div class="map-search-result-item" data-lat="${r.lat}" data-lng="${r.lon}"><span class="result-name">${name}</span>${type ? `<span class="result-type">${type}</span>` : ''}</div>`;
    }).join('');
    resultsEl.classList.add('visible');
  }

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) {
      hideResults();
      return;
    }
    searchTimeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, format: 'json', limit: '5', 'accept-language': 'ja' });
        const res = await fetch(`${NOMINATIM_URL}?${params}`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'AirGo/1.0 (map place search)',
          },
        });
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          showResults(data);
        } else {
          hideResults();
        }
      } catch (_) {
        hideResults();
      }
    }, 300);
  });

  input.addEventListener('blur', () => {
    setTimeout(hideResults, 150);
  });

  resultsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.map-search-result-item');
    if (!item) return;
    const lat = parseFloat(item.dataset.lat);
    const lng = parseFloat(item.dataset.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      map.setView([lat, lng], 15);
      input.value = item.querySelector('.result-name')?.textContent || '';
      hideResults();
      setStatus('');
    }
  });
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.style.color = isError ? '#f85149' : 'var(--text-muted)';
}

async function loadPhotoWithExif(file) {
  const url = URL.createObjectURL(file);
  let lat = null;
  let lng = null;
  let date = null;

  try {
    // exifr.gps() が JPG/JPEG の GPS 抽出に最適（DMS→十進度変換済み）
    const gps = await exifr.gps(file);
    if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      lat = gps.latitude;
      lng = gps.longitude;
    }
  } catch (_) {}

  if (lat == null || lng == null) {
    try {
      const exif = await exifr.parse(file, { pick: ['latitude', 'longitude', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef', 'DateTimeOriginal'] });
      lat = exif?.latitude;
      lng = exif?.longitude;
      date = exif?.DateTimeOriginal;

      if (lat == null && exif?.GPSLatitude) {
        lat = dmsToDecimal(exif.GPSLatitude, exif.GPSLatitudeRef);
      }
      if (lng == null && exif?.GPSLongitude) {
        lng = dmsToDecimal(exif.GPSLongitude, exif.GPSLongitudeRef);
      }
    } catch (_) {}
  } else {
    try {
      const exif = await exifr.parse(file, { pick: ['DateTimeOriginal'] });
      date = exif?.DateTimeOriginal;
    } catch (_) {}
  }

  return {
    file,
    url,
    lat: typeof lat === 'number' && !isNaN(lat) ? lat : null,
    lng: typeof lng === 'number' && !isNaN(lng) ? lng : null,
    date,
    name: file.name,
  };
}

function dmsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  const [d, m, s] = dms.map(Number);
  if (isNaN(d) || isNaN(m) || isNaN(s)) return null;
  let decimal = d + m / 60 + s / 3600;
  if (ref === 'S' || ref === 'W') decimal = -decimal;
  return decimal;
}

/* --- 逆ジオコーディング（GPS→地名） --- */
const _geocodeCache = {};
let _geocodeLastReq = 0;

async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (_geocodeCache[key]) return _geocodeCache[key];
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - _geocodeLastReq));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _geocodeLastReq = Date.now();
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ja`,
      { headers: { 'User-Agent': 'AirGo/1.0' } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const name = addr.village || addr.town || addr.city || addr.municipality || addr.suburb || addr.county || addr.state || addr.country || '';
    _geocodeCache[key] = name;
    return name;
  } catch {
    _geocodeCache[key] = '';
    return '';
  }
}

async function fetchPlaceNamesForPhotos() {
  const withGps = photos.filter(p => p.lat != null && p.lng != null && !p.placeName);
  const CONCURRENCY = 5;
  for (let i = 0; i < withGps.length; i += CONCURRENCY) {
    const batch = withGps.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(p => reverseGeocode(p.lat, p.lng)));
    batch.forEach((p, j) => { p.placeName = results[j]; });
  }
}

/* --- GPX順で写真をソート --- */
function getGpxRoutePointsFromXml(xml) {
  if (!xml) return [];
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const pts = [];
    doc.querySelectorAll('trkpt, rtept, wpt').forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lon)) pts.push([lat, lon]);
    });
    return pts;
  } catch {
    return [];
  }
}
function getGpxRoutePoints() {
  return getGpxRoutePointsFromXml(gpxData);
}

/* --- GPXトラックポイントの詳細データ（速度・気温・標高など）を取得 --- */
function parseGpxTrackPoints(xml) {
  if (!xml) return [];
  const pts = [];
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    doc.querySelectorAll('trkpt, rtept, wpt').forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      if (isNaN(lat) || isNaN(lon)) return;
      const data = { lat, lon, time: null, ele: null, speed: null, temp: null, hr: null };

      const eleEl = pt.querySelector('ele');
      if (eleEl) data.ele = parseFloat(eleEl.textContent);

      const timeEl = pt.querySelector('time');
      if (timeEl) data.time = new Date(timeEl.textContent.trim()).getTime();

      const speedEl = pt.querySelector('speed');
      if (speedEl) {
        const v = parseFloat(speedEl.textContent);
        if (!isNaN(v)) data.speed = v < 50 ? v * 3.6 : v;
      }

      const ext = pt.querySelector('extensions');
      if (ext) {
        for (const name of ['speed', 'atemp', 'temp', 'hr', 'heartrate']) {
          const n = ext.querySelector(`*[local-name()='${name}']`);
          if (n && n.textContent) {
            const v = parseFloat(n.textContent);
            if (!isNaN(v)) {
              if (name === 'speed') data.speed = v < 50 ? v * 3.6 : v;
              if (name === 'atemp' || name === 'temp') data.temp = v;
              if (name === 'hr' || name === 'heartrate') data.hr = Math.round(v);
            }
          }
        }
      }
      pts.push(data);
    });

    if (pts.length >= 2) {
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].speed == null && i < pts.length - 1 && pts[i].time && pts[i + 1].time) {
          const dt = (pts[i + 1].time - pts[i].time) / 3600000;
          if (dt > 0) {
            const km = haversineKm([pts[i].lat, pts[i].lon], [pts[i + 1].lat, pts[i + 1].lon]);
            pts[i].speed = km / dt;
          }
        }
      }
    }
  } catch (_) {}
  return pts;
}

function formatSpeed(kmh) {
  if (kmh == null || isNaN(kmh)) return '—';
  if (kmh < 1) return `${(kmh * 1000).toFixed(0)} m/h`;
  return `${kmh.toFixed(1)} km/h`;
}

function formatDuration(hours) {
  if (hours == null || isNaN(hours) || hours <= 0) return null;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}時間${m}分`;
  if (h > 0) return `${h}時間`;
  return `${m}分`;
}

function assignGpxDataToPhotos() {
  if (gpxTrackPoints.length === 0) return;
  const CLOSE_ENOUGH_SQ = 1e-12;
  photos.forEach(p => {
    if (p.lat == null || p.lng == null) return;
    let best = null;
    let bestDist = Infinity;
    for (const pt of gpxTrackPoints) {
      const d = distSq([p.lat, p.lng], [pt.lat, pt.lon]);
      if (d < bestDist) {
        bestDist = d;
        best = pt;
        if (d < CLOSE_ENOUGH_SQ) break;
      }
    }
    if (best) {
      p.gpxData = {
        speed: best.speed,
        temp: best.temp,
        ele: best.ele,
        hr: best.hr,
      };
    }
  });
}

function distSq(a, b) {
  const dx = (a[1] - b[1]) * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
  const dy = a[0] - b[0];
  return dx * dx + dy * dy;
}

/* --- ルート距離（km）計算 --- */
function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180;
  const lat2 = b[0] * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, x)));
}

function getRouteDistanceKm(xmlOverride) {
  const route = xmlOverride
    ? (() => {
        try {
          const doc = new DOMParser().parseFromString(xmlOverride, 'text/xml');
          const pts = [];
          doc.querySelectorAll('trkpt, rtept, wpt').forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lon = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lon)) pts.push([lat, lon]);
          });
          return pts;
        } catch { return []; }
      })()
    : getGpxRoutePoints();
  if (route.length >= 2) {
    let km = 0;
    for (let i = 0; i < route.length - 1; i++) {
      km += haversineKm(route[i], route[i + 1]);
    }
    return km;
  }
  if (!xmlOverride) {
    const withGps = photos.filter(p => p.lat != null && p.lng != null);
    if (withGps.length >= 2) {
      let km = 0;
      for (let i = 0; i < withGps.length - 1; i++) {
        km += haversineKm([withGps[i].lat, withGps[i].lng], [withGps[i + 1].lat, withGps[i + 1].lng]);
      }
      return km;
    }
  }
  return null;
}

/** GPXから日付・平均時速・距離を取得 */
function getGpxSummary(xmlOverride) {
  const xml = xmlOverride ?? gpxData;
  if (!xml) return null;
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const pts = [];
    doc.querySelectorAll('trkpt, rtept, wpt').forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      if (isNaN(lat) || isNaN(lon)) return;
      const data = { lat, lon, time: null };
      const timeEl = pt.querySelector('time');
      if (timeEl) data.time = new Date(timeEl.textContent.trim()).getTime();
      pts.push(data);
    });
    const distanceKm = getRouteDistanceKm(xml);
    if (pts.length === 0 && distanceKm == null) return null;
    let dateStr = null;
    const withTime = pts.filter(p => p.time != null);
    if (withTime.length > 0) {
      const first = Math.min(...withTime.map(p => p.time));
      const d = new Date(first);
      dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    let avgSpeedKmh = null;
    let durationHours = null;
    if (withTime.length >= 2) {
      const firstTime = Math.min(...withTime.map(p => p.time));
      const lastTime = Math.max(...withTime.map(p => p.time));
      durationHours = (lastTime - firstTime) / 3600000;
      if (durationHours > 0 && distanceKm != null && distanceKm > 0) avgSpeedKmh = distanceKm / durationHours;
    }
    return { dateStr, avgSpeedKmh, distanceKm, durationHours };
  } catch {
    return null;
  }
}

function positionAlongRoute(lat, lng, route) {
  if (route.length === 0) return 0;
  if (route.length === 1) return 0;
  let bestPos = 0;
  let bestDistSq = Infinity;
  let cumDist = 0;
  const p = [lat, lng];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const abx = b[1] - a[1];
    const aby = b[0] - a[0];
    const apx = p[1] - a[1];
    const apy = p[0] - a[0];
    const ab2 = abx * abx + aby * aby;
    const t = ab2 > 1e-10 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2)) : 0;
    const proj = [a[0] + t * aby, a[1] + t * abx];
    const d = distSq(p, proj);
    if (d < bestDistSq) {
      bestDistSq = d;
      const segLen = Math.sqrt(distSq(a, b));
      bestPos = cumDist + t * segLen;
    }
    cumDist += Math.sqrt(distSq(a, b));
  }
  return bestPos;
}

function sortPhotosByGpxOrder() {
  const route = getGpxRoutePoints();
  if (route.length < 2) return;
  const withGps = photos.filter(p => p.lat != null && p.lng != null);
  const withoutGps = photos.filter(p => p.lat == null || p.lng == null);
  withGps.sort((a, b) => positionAlongRoute(a.lat, a.lng, route) - positionAlongRoute(b.lat, b.lng, route));
  photos = [...withGps, ...withoutGps];
}

function buildPhotoPopupHtml(photo, index) {
  const hasGps = photo.lat != null && photo.lng != null;
  const hasLandmark = toLandmarkValue(photo.landmarkNo) != null || toLandmarkValue(photo.landmarkName) != null;
  const landmarkText = hasLandmark ? [photo.landmarkNo, photo.landmarkName].filter(Boolean).join(' ') : '';
  const landmarkHtml = hasLandmark
    ? `<div class="popup-photo-landmark-watermark">${escapeHtml(landmarkText)}</div>`
    : '';
  const placeOverlayText = hasGps && photo.placeName
    ? `📍 ${photo.placeName}`
    : (hasLandmark ? landmarkText : '');
  const placeOverlayHtml = placeOverlayText
    ? `<div class="popup-photo-place-overlay">${escapeHtml(placeOverlayText)}</div>`
    : '';
  const desc = photo.description ? photo.description.trim() : '';
  const hasDesc = desc.length > 0;
  const hasUrl = photo.photoUrl && photo.photoUrl.trim().length > 0;
  const showName = !hasDesc && !hasUrl;
  const descHtml = hasDesc
    ? `<div class="popup-desc">${escapeHtml(desc)}</div>`
    : '';
  const urlHtml = hasUrl
    ? `<div class="popup-url"><button type="button" class="popup-url-btn" data-url="${escapeHtml(photo.photoUrl)}">🔗 リンク</button></div>`
    : '';
  const imgHtml = photo.url
    ? `<div class="popup-photo-img-wrap popup-photo-clickable" data-photo-index="${index}" role="button" tabindex="0" title="クリックで大きく表示">${landmarkHtml}${placeOverlayHtml}<img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name)}" class="popup-photo-img"></div>`
    : (hasPhotoData(photo) ? '' : `<div class="popup-photo-point-placeholder">${landmarkHtml}${placeOverlayHtml}<span class="popup-photo-point-icon">📍</span><span class="popup-photo-point-name">${escapeHtml(photo.placeName || photo.landmarkName || photo.name || 'ポイント')}</span>${isEditor() ? '<button type="button" class="popup-photo-add-photo-btn" data-photo-index="' + index + '">写真を追加</button>' : ''}</div>`);
  const nameHtml = showName
    ? `<span class="popup-photo-name">${escapeHtml(photo.name)}</span>`
    : '';
  const editBtnHtml = isEditor()
    ? `<button type="button" class="popup-photo-edit" data-photo-index="${index}" title="詳細設定（ランドマーク・説明・URL・写真の更新）" aria-label="編集">✎</button>`
    : '';
  return `
    <div class="popup-photo-content">
      ${editBtnHtml}
      ${imgHtml}
      <div class="popup-photo-info">
        ${nameHtml}
      </div>
      ${descHtml}
      ${urlHtml}
    </div>
  `;
}

function startAddPointMode() {
  if (!isEditor()) {
    setStatus('ポイント追加にはログインが必要です', true);
    return;
  }
  if (!map) {
    setStatus('地図の読み込みを待っています…', true);
    return;
  }
  if (currentTripId?.startsWith('public_')) {
    setStatus('公開トリップにはポイントを追加できません', true);
    return;
  }
  if (!currentTripId && !isNewTrip) {
    setStatus('先に「新規」でトリップを作成するか、トリップを読み込んでください', true);
    return;
  }
  _addPointMode = true;
  setStatus('地図上をクリックしてポイントの位置を選択してください');
  if (_addPointMapClickHandler) {
    map.off('click', _addPointMapClickHandler);
  }
  _addPointMapClickHandler = (e) => {
    if (!_addPointMode) return;
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const name = prompt('ポイントの名称を入力してください', '');
    if (name == null) return;
    const trimmed = String(name).trim() || 'ポイント';
    _addPointMode = false;
    map.off('click', _addPointMapClickHandler);
    _addPointMapClickHandler = null;
    setStatus('');
    const point = {
      lat,
      lng,
      name: trimmed,
      placeName: trimmed,
      landmarkName: trimmed,
      description: null,
      photoUrl: null,
      url: null,
      data: null,
    };
    photos.push(point);
    photos.forEach((p, i) => { p._dbIndex = i; });
    currentIndex = photos.length - 1;
    addPhotoMarkers();
    renderAllPhotosStrip();
    showPhotoWithPopup(currentIndex);
    scheduleAutoSave();
    setStatus(`ポイント「${trimmed}」を追加しました`);
    if (document.getElementById('allPhotosThumbnails')?.classList.contains('visible')) {
      renderAllPhotosStrip();
    }
  };
  map.on('click', _addPointMapClickHandler);
}

function cancelAddPointMode() {
  _addPointMode = false;
  if (map && _addPointMapClickHandler) {
    map.off('click', _addPointMapClickHandler);
    _addPointMapClickHandler = null;
  }
  setStatus('');
}

/** ホーム画面用：指定トリップ一覧のGPSを地図に表示 */
async function addHomeMarkers(trips) {
  markers.forEach(m => { if (map && map.hasLayer(m)) map.removeLayer(m); });
  markers = [];
  _publicTripRouteLayers.forEach(l => { if (map && map.hasLayer(l)) map.removeLayer(l); });
  _publicTripRouteLayers = [];
  _publicTripMarkerUrls.forEach(u => { if (u?.startsWith?.('blob:')) URL.revokeObjectURL(u); });
  _publicTripMarkerUrls = [];

  if (!map || !trips?.length) return;
  const allPoints = [];
  const isMobile = isMobileView();
  const normId = (t) => (t._fromServer ? 'public_' + t.id : t.id);
  for (let ti = 0; ti < trips.length; ti++) {
    const trip = trips[ti];
    const tripPhotos = trip.photos || [];
    const route = getRoutePointsFromTrip(trip);
    const color = getTripColor(trip);
    if (route.length >= 2) {
      const routeLayer = createStyledRouteLayerWithColor(route, color);
      routeLayer.addTo(map);
      _publicTripRouteLayers.push(routeLayer);
    }
    for (let i = 0; i < tripPhotos.length; i++) {
      const p = tripPhotos[i];
      if (p.lat == null || p.lng == null) continue;
      const displayPhoto = { ...p };
      if (p.data) {
        const url = base64ToUrl(p.mime || 'image/jpeg', p.data);
        _publicTripMarkerUrls.push(url);
        displayPhoto.url = url;
      } else {
        displayPhoto.url = null;
      }
      allPoints.push({ photo: displayPhoto, tripId: normId(trip), photoIndex: i });
    }
  }
  if (allPoints.length > 0) {
    const bounds = L.latLngBounds(allPoints.map(x => [x.photo.lat, x.photo.lng]));
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }
  for (const { photo, tripId, photoIndex } of allPoints) {
    const trip = trips.find(t => normId(t) === tripId);
    const color = getTripColor(trip || tripId);
    const hasLandmarkNo = toLandmarkValue(photo.landmarkNo) != null;
    const displayText = hasLandmarkNo ? escapeHtml(String(photo.landmarkNo).trim()) : '';
    const sz = isMobile ? (hasLandmarkNo ? [17, 17] : [8, 8]) : (hasLandmarkNo ? [25, 25] : [13, 13]);
    const anchor = isMobile ? (hasLandmarkNo ? [9, 9] : [4, 4]) : (hasLandmarkNo ? [13, 13] : [7, 7]);
    const icon = L.divIcon({
      className: 'photo-marker photo-marker-' + (hasLandmarkNo ? 'landmark' : 'plain') + (isMobile ? ' photo-marker-mobile' : ''),
      html: hasLandmarkNo
        ? `<span class="landmark-marker-num" style="background:${color};border-color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.4),0 0 0 2px ${color}99;">${displayText}</span>`
        : `<span class="landmark-marker-plain" style="background:${color};border-color:${color};"></span>`,
      iconSize: sz,
      iconAnchor: anchor,
    });
    const marker = L.marker([photo.lat, photo.lng], { icon, zIndexOffset: hasLandmarkNo ? 1000 : 0 })
      .addTo(map)
      .bindPopup(buildPhotoPopupHtml(photo, photoIndex), {
        maxWidth: 488,
        className: 'photo-popup',
        autoClose: true,
        closeOnClick: false,
      });
    marker._publicTripId = tripId;
    marker._publicPhotoIndex = photoIndex;
    marker.on('click', () => loadTripAndShowPhoto(tripId, photoIndex));
    markers.push(marker);
  }
}

async function addPublicTripMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  _publicTripRouteLayers.forEach(l => { if (map && map.hasLayer(l)) map.removeLayer(l); });
  _publicTripRouteLayers = [];
  _publicTripMarkerUrls.forEach(u => { if (u?.startsWith?.('blob:')) URL.revokeObjectURL(u); });
  _publicTripMarkerUrls = [];

  if (!map) return;
  const trips = await getDisplayablePublicTrips();
  const allPoints = [];
  const isMobile = isMobileView();
  for (let ti = 0; ti < trips.length; ti++) {
    const trip = trips[ti];
    const tripPhotos = trip.photos || [];
    const route = getRoutePointsFromTrip(trip);
    const color = getTripColor(trip);
    if (route.length >= 2) {
      const routeLayer = createStyledRouteLayerWithColor(route, color);
      routeLayer.addTo(map);
      _publicTripRouteLayers.push(routeLayer);
    }
    for (let i = 0; i < tripPhotos.length; i++) {
      const p = tripPhotos[i];
      if (p.lat == null || p.lng == null) continue;
      const displayPhoto = { ...p };
      if (p.data) {
        const url = base64ToUrl(p.mime || 'image/jpeg', p.data);
        _publicTripMarkerUrls.push(url);
        displayPhoto.url = url;
      } else {
        displayPhoto.url = null;
      }
      allPoints.push({ photo: displayPhoto, tripId: trip.id, photoIndex: i });
    }
  }

  if (allPoints.length > 0) {
    const bounds = L.latLngBounds(allPoints.map(x => [x.photo.lat, x.photo.lng]));
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }

  for (const { photo, tripId, photoIndex } of allPoints) {
    const trip = trips.find(t => t.id === tripId);
    const color = getTripColor(trip || tripId);
    const hasLandmarkNo = toLandmarkValue(photo.landmarkNo) != null;
    const displayText = hasLandmarkNo ? escapeHtml(String(photo.landmarkNo).trim()) : '';
    const sz = isMobile ? (hasLandmarkNo ? [17, 17] : [8, 8]) : (hasLandmarkNo ? [25, 25] : [13, 13]);
    const anchor = isMobile ? (hasLandmarkNo ? [9, 9] : [4, 4]) : (hasLandmarkNo ? [13, 13] : [7, 7]);
    const icon = L.divIcon({
      className: 'photo-marker photo-marker-' + (hasLandmarkNo ? 'landmark' : 'plain') + (isMobile ? ' photo-marker-mobile' : ''),
      html: hasLandmarkNo
        ? `<span class="landmark-marker-num" style="background:${color};border-color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.4),0 0 0 2px ${color}99;">${displayText}</span>`
        : `<span class="landmark-marker-plain" style="background:${color};border-color:${color};"></span>`,
      iconSize: sz,
      iconAnchor: anchor,
    });
    const marker = L.marker([photo.lat, photo.lng], { icon, zIndexOffset: hasLandmarkNo ? 1000 : 0 })
      .addTo(map)
      .bindPopup(buildPhotoPopupHtml(photo, photoIndex), {
        maxWidth: 488,
        className: 'photo-popup',
        autoClose: true,
        closeOnClick: false,
      });
    marker._publicTripId = tripId;
    marker._publicPhotoIndex = photoIndex;
    markers.push(marker);
  }
}

/** 親トリップ選択時：子トリップのGPS・ルートを地図に表示 */
async function addParentTripChildMarkers(parentId) {
  if (!map) return;
  markers.forEach(m => { if (map.hasLayer(m)) map.removeLayer(m); });
  markers = [];
  _publicTripRouteLayers.forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
  _publicTripRouteLayers = [];
  _publicTripMarkerUrls.forEach(u => { if (u?.startsWith?.('blob:')) URL.revokeObjectURL(u); });
  _publicTripMarkerUrls = [];

  const allTrips = await getMergedTrips();
  const myTrips = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
  const publicTripsList = allTrips.filter(t => t.id?.startsWith('public_') || t._isPublic);
  const myChildren = myTrips.filter(t => t.parentTripId === parentId);
  const publicChildren = publicTripsList.filter(t => t.parentTripId === parentId);
  const children = [...myChildren, ...publicChildren];
  const orderConfig = getMyTripListOrder();
  const childrenOrder = orderConfig?.childrenOrder?.[parentId];
  const sorted = childrenOrder && childrenOrder.length > 0
    ? [...children].sort((a, b) => {
        const ai = childrenOrder.indexOf(a.id);
        const bi = childrenOrder.indexOf(b.id);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      })
    : children.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const allPoints = [];
  const boundsPoints = [];
  const isMobile = isMobileView();
  for (const trip of sorted) {
    const tripPhotos = trip.photos || [];
    const route = getRoutePointsFromTrip(trip);
    const color = getTripColor(trip);
    if (route.length >= 2) {
      const routeLayer = createStyledRouteLayerWithColor(route, color);
      routeLayer.addTo(map);
      _publicTripRouteLayers.push(routeLayer);
      route.forEach(([lat, lng]) => boundsPoints.push([lat, lng]));
    }
    for (let i = 0; i < tripPhotos.length; i++) {
      const p = tripPhotos[i];
      if (p.lat == null || p.lng == null) continue;
      boundsPoints.push([p.lat, p.lng]);
      const displayPhoto = { ...p };
      if (p.data) {
        const url = base64ToUrl(p.mime || 'image/jpeg', p.data);
        _publicTripMarkerUrls.push(url);
        displayPhoto.url = url;
      } else {
        displayPhoto.url = null;
      }
      allPoints.push({ photo: displayPhoto, tripId: trip.id, photoIndex: i, tripName: trip.name });
    }
  }

  if (boundsPoints.length > 0) {
    const bounds = L.latLngBounds(boundsPoints);
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
  } else {
    map.invalidateSize();
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }

  for (const { photo, tripId, photoIndex, tripName } of allPoints) {
    const trip = sorted.find(t => t.id === tripId);
    const color = getTripColor(trip || tripId);
    const hasLandmarkNo = toLandmarkValue(photo.landmarkNo) != null;
    const displayText = hasLandmarkNo ? escapeHtml(String(photo.landmarkNo).trim()) : '';
    const sz = isMobile ? (hasLandmarkNo ? [17, 17] : [8, 8]) : (hasLandmarkNo ? [25, 25] : [13, 13]);
    const anchor = isMobile ? (hasLandmarkNo ? [9, 9] : [4, 4]) : (hasLandmarkNo ? [13, 13] : [7, 7]);
    const icon = L.divIcon({
      className: 'photo-marker photo-marker-' + (hasLandmarkNo ? 'landmark' : 'plain') + (isMobile ? ' photo-marker-mobile' : ''),
      html: hasLandmarkNo
        ? `<span class="landmark-marker-num" style="background:${color};border-color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.4),0 0 0 2px ${color}99;">${displayText}</span>`
        : `<span class="landmark-marker-plain" style="background:${color};border-color:${color};"></span>`,
      iconSize: sz,
      iconAnchor: anchor,
    });
    const popupHtml = buildPhotoPopupHtml(photo, photoIndex) + (tripName ? `<p class="photo-popup-trip-name" style="margin-top:0.5rem;font-size:0.85rem;color:var(--text-muted);">${escapeHtml(tripName)}</p>` : '');
    const marker = L.marker([photo.lat, photo.lng], { icon, zIndexOffset: hasLandmarkNo ? 1000 : 0 })
      .addTo(map)
      .bindPopup(popupHtml, {
        maxWidth: 488,
        className: 'photo-popup',
        autoClose: true,
        closeOnClick: false,
      });
    marker._publicTripId = tripId;
    marker._publicPhotoIndex = photoIndex;
    marker._isChildMarker = true;
    marker.on('click', () => loadTripAndShowPhoto(tripId, photoIndex));
    markers.push(marker);
  }
}

function addPhotoMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  _publicTripRouteLayers.forEach(l => { if (map && map.hasLayer(l)) map.removeLayer(l); });
  _publicTripRouteLayers = [];
  _publicTripMarkerUrls.forEach(u => { if (u?.startsWith?.('blob:')) URL.revokeObjectURL(u); });
  _publicTripMarkerUrls = [];

  const withGps = photos.filter(p => p.lat != null && p.lng != null);

  if (withGps.length > 0) {
    const bounds = L.latLngBounds(withGps.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [150, 150], maxZoom: 16 });
  }

  if (withGps.length === 0) {
    addPublicTripMarkers();
    return;
  }

  const isMobile = isMobileView();
  const color = _currentTripColor || null;
  withGps.forEach((photo) => {
    const photoIndex = photos.indexOf(photo);
    const hasLandmarkNo = toLandmarkValue(photo.landmarkNo) != null;
    const displayText = hasLandmarkNo ? escapeHtml(String(photo.landmarkNo).trim()) : '';
    const sz = isMobile ? (hasLandmarkNo ? [17, 17] : [8, 8]) : (hasLandmarkNo ? [25, 25] : [13, 13]);
    const anchor = isMobile ? (hasLandmarkNo ? [9, 9] : [4, 4]) : (hasLandmarkNo ? [13, 13] : [7, 7]);
    const c = color || (hasLandmarkNo ? ROUTE_STYLE.main.color : '#999');
    const html = hasLandmarkNo
      ? `<span class="landmark-marker-num" style="background:${c};border-color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.4),0 0 0 2px ${c}99;">${displayText}</span>`
      : `<span class="landmark-marker-plain" style="background:${c};border-color:${c};"></span>`;
    const icon = L.divIcon({
      className: 'photo-marker photo-marker-' + (hasLandmarkNo ? 'landmark' : 'plain') + (isMobile ? ' photo-marker-mobile' : ''),
      html,
      iconSize: sz,
      iconAnchor: anchor,
    });
    const marker = L.marker([photo.lat, photo.lng], { icon, zIndexOffset: hasLandmarkNo ? 1000 : 0 })
      .addTo(map)
      .bindPopup(buildPhotoPopupHtml(photo, photoIndex), {
        maxWidth: 488,
        className: 'photo-popup',
      })
      .on('click', () => showPhotoWithPopup(photoIndex));
    marker.photoIndex = photoIndex;
    markers.push(marker);
  });
}

function showPhoto(index, options = {}) {
  currentIndex = index;
  const photo = photos[index];
  if (!photo) return;

  const popupOnly = options.popupOnly === true;
  const playOverlay = document.getElementById('playPhotoOverlay');

  if (photo.url) {
    if (!popupOnly && playOverlay) {
      const overlayImg = playOverlay.querySelector('.play-overlay-photo img');
      const overlayLandmark = document.getElementById('playOverlayLandmark');
      const overlayInfo = playOverlay.querySelector('.play-overlay-info');
      const overlayPlace = playOverlay.querySelector('.play-overlay-place');
      const overlayDesc = playOverlay.querySelector('.play-overlay-desc');
      const overlayUrl = playOverlay.querySelector('.play-overlay-url');
      if (overlayImg) overlayImg.src = photo.url;
      if (overlayLandmark) {
        const hasLandmark = toLandmarkValue(photo.landmarkNo) != null || toLandmarkValue(photo.landmarkName) != null;
        if (hasLandmark) {
          const text = [photo.landmarkNo, photo.landmarkName].filter(Boolean).join(' ');
          overlayLandmark.textContent = text;
          overlayLandmark.style.display = 'block';
        } else {
          overlayLandmark.textContent = '';
          overlayLandmark.style.display = 'none';
        }
      }
      if (overlayInfo) overlayInfo.textContent = photo.name;
      if (overlayPlace) {
        const parts = [];
        if (photo.placeName) parts.push(`📍 ${photo.placeName}`);
        if (photo.landmarkNo || photo.landmarkName) parts.push(`🏷️ ${[photo.landmarkNo, photo.landmarkName].filter(Boolean).join(' ')}`);
        overlayPlace.textContent = parts.join('  ');
      }
      if (overlayDesc) {
        overlayDesc.textContent = photo.description || '';
        overlayDesc.style.display = (photo.description && photo.description.trim()) ? 'block' : 'none';
      }
      if (overlayUrl) {
        if (photo.photoUrl) {
          overlayUrl.innerHTML = `<button type="button" class="popup-url-btn" data-url="${escapeHtml(photo.photoUrl)}">🔗 リンク</button>`;
          overlayUrl.style.display = 'block';
        } else {
          overlayUrl.innerHTML = '';
          overlayUrl.style.display = 'none';
        }
      }
      const overlayGpx = document.getElementById('playOverlayGpx');
      const gpxParts = [];
      if (photo.gpxData) {
        if (photo.gpxData.speed != null) gpxParts.push(`速度 ${formatSpeed(photo.gpxData.speed)}`);
        if (photo.gpxData.temp != null) gpxParts.push(`気温 ${photo.gpxData.temp.toFixed(1)}°C`);
        if (photo.gpxData.ele != null) gpxParts.push(`標高 ${Math.round(photo.gpxData.ele)} m`);
        if (photo.gpxData.hr != null) gpxParts.push(`心拍 ${photo.gpxData.hr} bpm`);
      }
      const gpxText = gpxParts.join('  ·  ');
      if (overlayGpx) {
        overlayGpx.textContent = gpxText;
        overlayGpx.style.display = gpxText ? 'block' : 'none';
      }
      if (!isPlaying) playOverlay.classList.add('visible');
    }
  }

  if (photo.lat != null && photo.lng != null && map) {
    if (!options.skipMapZoom) map.setView([photo.lat, photo.lng], Math.max(map.getZoom(), 14));
    const marker = markers.find(m => m.photoIndex === index);
    if (marker) marker.openPopup();
    if (photoPopup) {
      map.removeLayer(photoPopup);
      photoPopup = null;
    }
  } else if (popupOnly && map && (photo.url || (photo.lat != null && photo.lng != null))) {
    if (photoPopup) map.removeLayer(photoPopup);
    const center = map.getCenter();
    photoPopup = L.popup({ maxWidth: 488, className: 'photo-popup' })
      .setLatLng(center)
      .setContent(buildPhotoPopupHtml(photo, index))
      .openOn(map);
  }

  const strip = document.getElementById('allPhotosStrip');
  if (strip) strip.querySelectorAll('.all-photo-thumb').forEach((t, i) => t.classList.toggle('active', i === index));

  updatePhotoNav();
}

let _fullPhotoBlobUrl = null;

function showFullSizePhoto(index) {
  const photo = photos[index];
  if (!photo || !photo.url) return;
  currentIndex = index;
  if (photo.lat != null && photo.lng != null && map) {
    map.setView([photo.lat, photo.lng], Math.max(map.getZoom(), 14));
  }
  const strip = document.getElementById('allPhotosStrip');
  if (strip) strip.querySelectorAll('.all-photo-thumb').forEach((t, i) => t.classList.toggle('active', i === index));
  updatePhotoNav();
  if (_fullPhotoBlobUrl) {
    URL.revokeObjectURL(_fullPhotoBlobUrl);
    _fullPhotoBlobUrl = null;
  }
  const imgUrl = photo.file ? (_fullPhotoBlobUrl = URL.createObjectURL(photo.file)) : photo.url;
  const overlay = document.getElementById('fullPhotoOverlay');
  const img = document.getElementById('fullPhotoImg');
  if (overlay && img) {
    img.src = imgUrl;
    img.alt = photo.name || '';
    overlay.classList.add('visible');
  }
}

function closeFullSizePhoto() {
  if (_fullPhotoBlobUrl) {
    URL.revokeObjectURL(_fullPhotoBlobUrl);
    _fullPhotoBlobUrl = null;
  }
  const overlay = document.getElementById('fullPhotoOverlay');
  const img = document.getElementById('fullPhotoImg');
  if (overlay && img) {
    overlay.classList.remove('visible');
    img.src = '';
  }
  document.getElementById('playPhotoOverlay')?.classList.remove('visible');
  if (photos.length > 0 && currentIndex >= 0) {
    showPhoto(currentIndex, { popupOnly: true });
  }
}

function setPlayStopDisabled(playDisabled) {
  document.querySelectorAll('.play-btn').forEach(el => {
    el.disabled = playDisabled;
    updatePlayButtonLabel(el);
  });
}

function updatePlayButtonLabel(btn) {
  if (!btn) return;
  const playLabel = btn.querySelector('.play-btn-label-play');
  const stopLabel = btn.querySelector('.play-btn-label-stop');
  if (playLabel && stopLabel) {
    if (isPlaying) {
      playLabel.style.display = 'none';
      stopLabel.style.display = '';
    } else {
      playLabel.style.display = '';
      stopLabel.style.display = 'none';
    }
  }
}

function setSaveTripBtnDisabled(disabled) {
  const btn = document.getElementById('saveTripBtn');
  if (btn) btn.disabled = disabled;
}

function updateSaveButtonState() {
  if (!isEditor()) return;
  const name = document.getElementById('tripNameInput')?.value?.trim();
  const isParent = document.getElementById('tripParentInput')?.checked ?? false;
  const canSave = !!name && (photos.length > 0 || isParent);
  setSaveTripBtnDisabled(!canSave);
}

function updatePhotoNav() {
  const prevBtn = document.getElementById('photoPrevBtnHeader');
  const nextBtn = document.getElementById('photoNextBtnHeader');
  const menuPrevBtn = document.getElementById('menuPrevBtn');
  const menuNextBtn = document.getElementById('menuNextBtn');
  const menuAllPhotosBtn = document.getElementById('menuAllPhotosBtn');
  const mc = document.getElementById('menuMobileControls');
  if (photos.length === 0) {
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    if (menuPrevBtn) menuPrevBtn.disabled = true;
    if (menuNextBtn) menuNextBtn.disabled = true;
    if (menuAllPhotosBtn) {
      if (_lastTripForDisplay?.isParent) {
        menuAllPhotosBtn.textContent = `子トリップ（${_lastTripChildrenCount}件）`;
      } else {
        menuAllPhotosBtn.textContent = '写真（0枚）';
      }
    }
    if (mc) mc.style.display = _lastTripForDisplay?.isParent ? '' : 'none';
    if (!_lastTripForDisplay?.isParent) updateTripInfoDisplay(null);
    return;
  }
  const prevDisabled = currentIndex <= 0;
  const nextDisabled = currentIndex >= photos.length - 1;
  if (prevBtn) prevBtn.disabled = prevDisabled;
  if (nextBtn) nextBtn.disabled = nextDisabled;
  if (menuPrevBtn) menuPrevBtn.disabled = prevDisabled;
  if (menuNextBtn) menuNextBtn.disabled = nextDisabled;
  if (menuAllPhotosBtn) menuAllPhotosBtn.textContent = `写真（${photos.length}枚）`;
  if (mc) mc.style.display = '';
  updateTripInfoDisplay(null);
}

function fitMapToFullExtent() {
  if (!map) return;
  const withGps = photos.filter(p => p.lat != null && p.lng != null);
  if (withGps.length === 0) return;
  const bounds = L.latLngBounds(withGps.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [150, 150], maxZoom: 16 });
}

function movePhoto(fromIdx, toIdx) {
  if (!isEditor()) return;
  if (toIdx < 0 || toIdx >= photos.length) return;
  const [p] = photos.splice(fromIdx, 1);
  photos.splice(toIdx, 0, p);
  currentIndex = toIdx;
  renderAllPhotosStrip();
  addPhotoMarkers();
  showPhotoWithPopup(toIdx);
  if (document.getElementById('allPhotosThumbnails')?.classList.contains('visible')) {
    renderAllPhotosStrip();
  }
  setStatus('順番を変更しました');
  autoSaveTrip();
}

function deletePhoto(idx) {
  if (!isEditor()) return;
  if (photos.length <= 1) {
    setStatus('最後の1枚は削除できません', true);
    return;
  }
  const p = photos[idx];
  if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
  if (currentTripId) deleteStampPhotoAndShift(currentTripId, idx);
  photos.splice(idx, 1);
  currentIndex = Math.min(idx, photos.length - 1);
  if (currentIndex < 0) currentIndex = 0;
  renderAllPhotosStrip();
  addPhotoMarkers();
  if (photos.length > 0) showPhotoWithPopup(currentIndex);
  else {
    document.getElementById('playPhotoOverlay')?.classList.remove('visible');
    updatePhotoNav();
  }
  if (document.getElementById('allPhotosThumbnails')?.classList.contains('visible')) {
    renderAllPhotosStrip();
  }
  setStatus('写真を削除しました');
  autoSaveTrip();
}

function startPlay() {
  const indices = photos.map((p, i) => i).filter(i => photos[i].lat != null && photos[i].lng != null);
  if (indices.length === 0) {
    setStatus('GPS付きの写真がありません');
    return;
  }

  let routePoints = getGpxRoutePoints();
  if (routePoints.length < 2) routePoints = indices.map(i => [photos[i].lat, photos[i].lng]);

  const interval = parseInt(document.getElementById('intervalSelect').value, 10) * 1000;

  isPlaying = true;
  setPlayStopDisabled(false);
  setStatus('自動再生中（3D表示）…');

  if (map) setMapToHybrid();

  if (routeLayer) map.removeLayer(routeLayer);
  if (gpxLayer) {
    map.removeLayer(gpxLayer);
    gpxLayer = null;
  }
  const playColor = _currentTripColor || ROUTE_STYLE.main.color;
  routeLayer = createStyledRouteLayerWithColor(routePoints, playColor);
  if (routeLayer) routeLayer.addTo(map);

  const bounds = L.latLngBounds(routePoints);
  map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });

  document.getElementById('mainArea').classList.add('play-mode');
  document.getElementById('playPhotoOverlay').classList.add('play-mode');
  document.querySelector('.app')?.classList.add('play-mode');
  document.getElementById('allPhotosThumbnails')?.classList.remove('visible');

  const PLAY_ZOOM = 17;
  const PLAY_FLY_DURATION = 0.6;

  let idx = 1;
  function tick() {
    if (!isPlaying) return;
    if (idx >= indices.length) {
      stopPlay();
      return;
    }
    const photoIdx = indices[idx];
    const photo = photos[photoIdx];
    showPhotoWith3D(photoIdx);
    if (photo && photo.lat != null && photo.lng != null) {
      map.flyTo([photo.lat, photo.lng], PLAY_ZOOM, { duration: PLAY_FLY_DURATION, easeLinearity: 0.1 });
    }
    idx += 1;
    if (idx < indices.length) {
      playTimer = setTimeout(tick, interval);
    } else {
      stopPlay();
    }
  }
  showPhotoWith3D(indices[0]);
  if (photos[indices[0]]?.lat != null) {
    map.flyTo([photos[indices[0]].lat, photos[indices[0]].lng], PLAY_ZOOM, { duration: PLAY_FLY_DURATION, easeLinearity: 0.1 });
  }
  playTimer = setTimeout(tick, interval);
}

function showPhotoWith3D(index) {
  showPhoto(index, { popupOnly: true, skipMapZoom: isPlaying });
}

function showPhotoWithPopup(index) {
  showPhoto(index, { popupOnly: true });
}

function renderAllPhotosStrip() {
  const strip = document.getElementById('allPhotosStrip');
  if (!strip) return;
  strip.innerHTML = '';
  const canEdit = isEditor();
  const fragment = document.createDocumentFragment();
  const canAddPoint = canEdit && (currentTripId || isNewTrip) && !currentTripId?.startsWith('public_');
  if (canAddPoint) {
    const addWrap = document.createElement('div');
    addWrap.className = 'all-photo-thumb-wrap all-photo-add-point-wrap';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'all-photo-thumb all-photo-add-point';
    addBtn.title = '地図上をクリックしてポイントを追加';
    addBtn.innerHTML = '<span class="all-photo-add-point-icon">📍</span><span class="all-photo-add-point-label">+</span>';
    addWrap.appendChild(addBtn);
    fragment.appendChild(addWrap);
  }
  photos.forEach((photo, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'all-photo-thumb-wrap';
    const div = document.createElement('div');
    div.className = 'all-photo-thumb' + (i === currentIndex ? ' active' : '') + (!hasPhotoData(photo) ? ' all-photo-thumb-point' : '');
    div.title = photo.name || (photo.placeName || photo.landmarkName || 'ポイント');
    if (hasPhotoData(photo)) {
      const img = document.createElement('img');
      img.src = photo.url || '';
      img.alt = photo.name;
      img.loading = 'lazy';
      div.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'all-photo-thumb-placeholder';
      placeholder.innerHTML = '<span class="all-photo-thumb-placeholder-icon">📍</span><span class="all-photo-thumb-placeholder-name">' + escapeHtml((photo.placeName || photo.landmarkName || photo.name || 'ポイント').slice(0, 8)) + '</span>';
      div.appendChild(placeholder);
    }
    div.onclick = (e) => {
      if (!e.target.closest('.all-photo-thumb-actions')) {
        showPhotoWithPopup(i);
      }
    };
    wrap.appendChild(div);
    if (canEdit) {
      const actions = document.createElement('div');
      actions.className = 'all-photo-thumb-actions';
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'all-photo-thumb-btn';
      up.title = '上に移動';
      up.textContent = '↑';
      up.onclick = (e) => { e.stopPropagation(); movePhoto(i, i - 1); };
      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'all-photo-thumb-btn';
      down.title = '下に移動';
      down.textContent = '↓';
      down.onclick = (e) => { e.stopPropagation(); movePhoto(i, i + 1); };
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'all-photo-thumb-btn';
      edit.title = '詳細設定（ランドマーク・説明・URL）';
      edit.textContent = '✎';
      edit.onclick = (e) => { e.stopPropagation(); openPhotoEditModal(i); };
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'all-photo-thumb-btn all-photo-thumb-btn-del';
      del.title = '削除';
      del.textContent = '✕';
      del.onclick = (e) => { e.stopPropagation(); deletePhoto(i); };
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(edit);
      actions.appendChild(del);
      wrap.appendChild(actions);
    }
    fragment.appendChild(wrap);
  });
  strip.appendChild(fragment);
}

function isMobileView() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
}

function openAllPhotosThumbnails() {
  const el = document.getElementById('allPhotosThumbnails');
  if (el.classList.contains('visible')) return;
  fitMapToFullExtent();
  renderAllPhotosStrip();
  el.classList.add('visible');
}

function toggleAllPhotosThumbnails() {
  const el = document.getElementById('allPhotosThumbnails');
  if (el.classList.contains('visible')) {
    el.classList.remove('visible');
    return;
  }
  fitMapToFullExtent();
  renderAllPhotosStrip();
  el.classList.add('visible');
}

function stopPlay() {
  isPlaying = false;
  clearTimeout(playTimer);
  playTimer = null;
  if (playAnimationFrame) {
    cancelAnimationFrame(playAnimationFrame);
    playAnimationFrame = null;
  }
  if (map && typeof map.stop === 'function') {
    try { map.stop(); } catch (_) {}
  }
  if (routeLayer && map) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  if (gpxData && map) {
    applyGpxToMap(gpxData);
  }
  const withGps = photos.filter(p => p.lat != null && p.lng != null).length;
  setPlayStopDisabled(withGps === 0);
  setStatus('');

  if (map) setMapToOsm();

  if (routeLayer && map) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }

  document.getElementById('mainArea').classList.remove('play-mode');
  document.getElementById('playPhotoOverlay').classList.remove('visible', 'play-mode');
  document.querySelector('.app')?.classList.remove('play-mode');
}

const PHOTO_MAX_DIMENSION = 1920;
const PHOTO_JPEG_QUALITY = 0.85;
const EXPORT_TARGET_SIZE_MB = 20;

/** IndexedDB 保存用：容量削減のため小さめの解像度・品質 */
const DB_PHOTO_MAX_DIM = 1280;
const DB_PHOTO_QUALITY = 0.78;

/** 保存用に null/空 を省略した写真オブジェクトを構築（容量削減） */
function buildMinimalPhotoForDB(p) {
  const o = { name: p.name, data: p.data, mime: p.mime || 'image/jpeg' };
  if (p.lat != null && !isNaN(p.lat)) o.lat = p.lat;
  if (p.lng != null && !isNaN(p.lng)) o.lng = p.lng;
  if (p.placeName && String(p.placeName).trim()) o.placeName = p.placeName.trim();
  const ln = toLandmarkValue(p.landmarkNo);
  if (ln != null) o.landmarkNo = ln;
  const lm = toLandmarkValue(p.landmarkName);
  if (lm != null) o.landmarkName = lm;
  if (p.description && String(p.description).trim()) o.description = p.description.trim();
  const extUrl = (p.photoUrl || p.url || '').trim();
  if (extUrl && !extUrl.startsWith('blob:') && !extUrl.startsWith('data:')) o.url = extUrl;
  return o;
}

/** ポイント（写真なし）用の保存オブジェクトを構築 */
function buildMinimalPointForDB(p) {
  const o = { name: p.name || 'ポイント', lat: p.lat, lng: p.lng };
  if (p.placeName && String(p.placeName).trim()) o.placeName = p.placeName.trim();
  const ln = toLandmarkValue(p.landmarkNo);
  if (ln != null) o.landmarkNo = ln;
  const lm = toLandmarkValue(p.landmarkName);
  if (lm != null) o.landmarkName = lm;
  if (p.description && String(p.description).trim()) o.description = p.description.trim();
  // 外部リンクのみ保存（blob: や data: は保存しない）
  const extUrl = (p.photoUrl || p.url || '').trim();
  if (extUrl && !extUrl.startsWith('blob:') && !extUrl.startsWith('data:')) o.url = extUrl;
  return o;
}

/** 写真データがあるか（ポイントのみでないか） */
function hasPhotoData(p) {
  return !!(p?.file || p?.data || (p?.url && p.url.startsWith('data:')));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const m = String(reader.result).match(/^data:([^;]+);base64,(.+)$/);
      resolve(m ? { mime: m[1], data: m[2] } : null);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** 画像をリサイズ・圧縮して base64 を返す（表示に適したサイズ） */
async function resizeImageToBase64(fileOrBlob, maxW = PHOTO_MAX_DIMENSION, maxH = PHOTO_MAX_DIMENSION, quality = PHOTO_JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = fileOrBlob instanceof Blob ? URL.createObjectURL(fileOrBlob) : fileOrBlob;
    img.onload = () => {
      URL.revokeObjectURL?.(url);
      let w = img.width, h = img.height;
      if (w > maxW || h > maxH) {
        const r = Math.min(maxW / w, maxH / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const m = String(reader.result).match(/^data:([^;]+);base64,(.+)$/);
            resolve(m ? { mime: m[1], data: m[2] } : null);
          };
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL?.(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };
    img.src = url;
  });
}

/** base64 画像をリサイズ・圧縮 */
async function resizeBase64ToBase64(mime, data, maxW, maxH, quality) {
  const bin = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const blob = new Blob([bin], { type: mime || 'image/jpeg' });
  return resizeImageToBase64(blob, maxW, maxH, quality);
}

function base64ToUrl(mime, data) {
  const blob = new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: mime || 'image/jpeg' });
  return URL.createObjectURL(blob);
}

/** テキストをキャンバスで描画し { dataUrl, heightPx } を返す（日本語対応） */
function textToImageDataUrl(text, opts = {}) {
  const { width = 400, fontSize = 12, lineHeight = 1.4, padding = 8 } = opts;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = `${fontSize}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
  const lines = [];
  const words = text.split(/(\s+|\n)/).filter(Boolean);
  let line = '';
  for (const w of words) {
    if (w === '\n') {
      if (line) lines.push(line);
      lines.push('');
      line = '';
      continue;
    }
    const test = line + w;
    const m = ctx.measureText(test);
    if (m.width > width - padding * 2 && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const h = Math.max(2, Math.ceil(lines.length * fontSize * lineHeight) + padding * 2);
  canvas.width = Math.max(2, width + padding * 2);
  canvas.height = h;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#333333';
  ctx.font = `${fontSize}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => {
    ctx.fillText(l || ' ', padding, padding + i * fontSize * lineHeight);
  });
  try {
    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl || dataUrl.length < 100) return null;
    return { dataUrl, heightPx: h, widthPx: canvas.width };
  } catch { return null; }
}

/** ルートの SVG 地図を PNG data URL で返す（jsPDF は SVG を直接受け付けないため変換） */
function createRouteMapPngDataUrl() {
  const routePoints = getGpxRoutePoints();
  const withGps = photos.filter(p => p.lat != null && p.lng != null);
  const pts = routePoints.length >= 2 ? routePoints : withGps.map(p => [p.lat, p.lng]);
  if (pts.length < 2) return null;
  const lats = pts.map(p => p[0]);
  const lngs = pts.map(p => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const rangeLat = (maxLat - minLat) || 0.01;
  const rangeLng = (maxLng - minLng) || 0.01;
  const w = 400;
  const h = 280;
  const toX = (lng) => ((lng - minLng) / rangeLng) * (w - 40) + 20;
  const toY = (lat) => h - 20 - ((lat - minLat) / rangeLat) * (h - 40);
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p[1])} ${toY(p[0])}`).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect fill="#f5f5f5" width="${w}" height="${h}"/>
    <path d="${pathD}" fill="none" stroke="#e1306c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${toX(p[1])}" cy="${toY(p[0])}" r="${i === 0 || i === pts.length - 1 ? 6 : 4}" fill="${i === 0 ? '#22c55e' : i === pts.length - 1 ? '#ef4444' : '#e1306c'}"/>`).join('')}
  </svg>`;
  const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const img = new Image();
    const t = setTimeout(() => done(null), 5000);
    img.onload = () => {
      clearTimeout(t);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const png = canvas.toDataURL('image/png');
          done(png && png.length > 100 ? png : null);
        } else done(null);
      } catch { done(null); }
    };
    img.onerror = () => { clearTimeout(t); done(null); };
    img.src = svgDataUrl;
  });
}

/** リンクされた旅行ブログの本文を取得（CORS対応） */
async function fetchTravelBlogContent(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) return null;
  const MAX_LEN = 4000;
  try {
    let html = null;
    try {
      const res = await fetch(u, { cache: 'no-store', mode: 'cors', signal: AbortSignal.timeout(10000) });
      if (res.ok) html = await res.text();
    } catch (_) {}
    if (!html) {
      const proxyRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, { signal: AbortSignal.timeout(15000) });
      if (proxyRes.ok) html = await proxyRes.text();
    }
    if (!html) return null;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body;
    if (!body) return null;
    [ 'script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript' ].forEach((sel) => {
      body.querySelectorAll(sel).forEach((el) => el.remove());
    });
    let text = (body.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 0 ? text.slice(0, MAX_LEN) : null;
  } catch (_) {
    return null;
  }
}

/** AI で旅行記テキストを生成 */
async function generateTravelogueWithAI(tripName, tripDesc, tripUrl, photoSummaries, gpxMeta, blogContent = null, stampStatus = [], gpxDetail = null, travelogueContent = null) {
  const apiKey = getAiApiKey()?.trim();
  if (!apiKey) {
    throw new Error('AI API Key が設定されていません。ログイン後、メニュー → AI 設定 から API Key を入力してください。');
  }
  const provider = getAiApiProvider();
  const summaryParts = [
    `トリップ名: ${tripName}`,
    tripDesc ? `説明: ${tripDesc}` : '',
    tripUrl ? `リンク: ${tripUrl}` : '',
    gpxMeta ? `ルート情報（GPX）: ${gpxMeta}` : '',
    gpxDetail ? `GPX詳細（旅行記に必ず記述すること）: ${gpxDetail}` : '',
    '',
    '写真・場所の情報（位置情報から主な訪問地を把握し、「〇〇の旅」形式で冒頭に含めること）:',
    ...photoSummaries.map((p, i) => `[${i + 1}] ${p}`)
  ];
  if (blogContent) {
    summaryParts.push('', '--- リンクされた旅行ブログの内容（参考にしてください） ---', blogContent);
  }
  if (travelogueContent) {
    summaryParts.push('', '--- 子トリップの既存旅行記（参考にしつつ統合してまとめてください） ---', travelogueContent);
  }
  if (stampStatus.length > 0) {
    const stampLines = stampStatus.map(s => `${s.text}: ${s.filled ? '✅ 済' : '⬜ 未'}`).join('\n');
    const filledCount = stampStatus.filter(s => s.filled).length;
    summaryParts.push('', '--- スタンプラリーの状態 ---', `完了: ${filledCount}/${stampStatus.length}`, stampLines);
  }
  const summary = summaryParts.filter(Boolean).join('\n');

  const systemPrompt = `あなたは旅行記のライターです。与えられたトリップの情報（名前、説明、写真の場所・説明、GPXの日付・移動距離・所要時間${blogContent ? '、リンクされた旅行ブログの内容' : ''}${travelogueContent ? '、子トリップの既存旅行記' : ''}${stampStatus.length > 0 ? '、スタンプラリーの状態' : ''}）をもとに、読みやすい旅行記を日本語で書いてください。${blogContent ? ' 旅行ブログに書かれているエピソードや感想を活かしつつ、写真・場所の情報と整合する形でまとめてください。' : ''}${travelogueContent ? ' 子トリップの旅行記の内容を活かしつつ、全体として一つのまとまった旅行記に統合してください。' : ''}${stampStatus.length > 0 ? ' 締めの部分でスタンプラリーの達成状況（例：〇〇/16で完了）に触れてください。' : ''}

必ず以下の形式で出力してください：
---
旅の概要
（写真の位置情報から主な訪問地を把握し、「〇〇の旅」「〇〇と〇〇を巡る旅」のような形式で始めること。GPXの日付・移動距離・所要時間があれば必ず記述すること。旅の概要と印象を2〜3段落で）

[1]
（写真1の場所について、その場所を訪れた時の様子や感想を2〜4文で）

[2]
（写真2の場所について、同様に）

... 以降、写真の数だけ [3] [4] ... と続ける

締め
（旅の感想やおすすめポイントを1〜2段落で）
---

文体は「です・ます」調で、親しみやすく書いてください。`;
  const userPrompt = `以下のトリップ情報から旅行記を生成してください。\n\n${summary}`;

  const model = getAiApiModel();

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API エラー: ${res.status} ${err}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AI からの応答が空です');
    return text.trim();
  } else if (provider === 'openai') {
    const url = 'https://api.openai.com/v1/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2048
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API エラー: ${res.status} ${err}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('AI からの応答が空です');
    return text.trim();
  } else if (provider === 'claude') {
    const url = 'https://api.anthropic.com/v1/messages';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API エラー: ${res.status} ${err}`);
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error('AI からの応答が空です');
    return text.trim();
  } else {
    throw new Error(`未対応の AI プロバイダー: ${provider}`);
  }
}

/** 親トリップのサムネイル画像を取得（アニメの一番左 or 子トリップの写真から） */
async function getParentTripThumbnail(parentTrip, children = []) {
  if (!parentTrip?.isParent) return null;
  const animeList = await getAnimeAllForTripDisplay(parentTrip.id, parentTrip.animeList);
  const getAnimeThumb = (a) => {
    if (!a) return null;
    if (a?.thumbnail?.data) return { mime: a.thumbnail.mime || 'image/jpeg', data: a.thumbnail.data };
    if (a?.coverImage?.data) return { mime: 'image/jpeg', data: a.coverImage.data };
    if (a?.pageImages?.[0]?.data) return { mime: 'image/jpeg', data: a.pageImages[0].data };
    return null;
  };
  const getChildPhoto = (c, idx) => {
    const photos = c?.photos || [];
    const p = photos[idx ?? 0];
    return p?.data ? { mime: p.mime || 'image/jpeg', data: p.data } : null;
  };
  if (animeList.length > 0) {
    const t = getAnimeThumb(animeList[0]);
    if (t) return t;
  }
  for (const c of children) {
    const t = getChildPhoto(c, 0);
    if (t) return t;
  }
  return null;
}

/** 親トリップ用：旅行記生成に必要な全データを集約（親+子の写真・ブログ・旅行記・GPX） */
async function aggregateParentTripDataForTravelogue(parentTrip, parentId) {
  const allTrips = await getMergedTrips();
  const myTrips = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
  let children = myTrips.filter(t => t.parentTripId === parentId);
  const orderConfig = getMyTripListOrder();
  const childrenOrder = orderConfig?.childrenOrder?.[parentId];
  if (childrenOrder?.length) {
    children = [...children].sort((a, b) => {
      const ai = childrenOrder.indexOf(a.id);
      const bi = childrenOrder.indexOf(b.id);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return getTripGpsDateTimestamp(a) - getTripGpsDateTimestamp(b);
    });
  } else {
    children.sort((a, b) => getTripGpsDateTimestamp(a) - getTripGpsDateTimestamp(b));
  }
  const allPhotos = [];
  const routePoints = [];
  const gpxDetailParts = [];
  let blogContent = '';
  const travelogueIntros = [];
  const travelogueClosings = [];

  if (parentTrip?.photos?.length) {
    for (let i = 0; i < parentTrip.photos.length; i++) {
      const p = parentTrip.photos[i];
      if (p?.data) allPhotos.push({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        placeName: p.placeName || p.name || null,
        landmarkNo: toLandmarkValue(p.landmarkNo),
        landmarkName: toLandmarkValue(p.landmarkName),
        description: p.description || null,
        data: p.data,
        mime: p.mime || 'image/jpeg',
        _from: '親',
        _stampKey: `${parentId}_${i}`
      });
    }
  }

  const parentUrl = (parentTrip?.url || '').trim();
  if (parentUrl) {
    const bc = await fetchTravelBlogContent(parentUrl);
    if (bc) blogContent += `【親トリップ】\n${bc.slice(0, 1200)}\n\n`;
  }
  if (parentTrip?.gpxData) {
    const gs = getGpxSummary(parentTrip.gpxData);
    if (gs) {
      if (gs.dateStr) gpxDetailParts.push(`親: 日付 ${gs.dateStr}`);
      if (gs.distanceKm != null) gpxDetailParts.push(`親: 距離 ${gs.distanceKm < 1 ? (gs.distanceKm * 1000).toFixed(0) + 'm' : gs.distanceKm.toFixed(1) + 'km'}`);
    }
    routePoints.push(...getGpxRoutePointsFromXml(parentTrip.gpxData));
  }

  for (const c of children) {
    const childPhotos = (c.photos || []).map((p, idx) => ({
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      placeName: p.placeName || p.name || null,
      landmarkNo: toLandmarkValue(p.landmarkNo),
      landmarkName: toLandmarkValue(p.landmarkName),
      description: p.description || null,
      data: p.data,
      mime: p.mime || 'image/jpeg',
      _from: c.name,
      _stampKey: `${c.id}_${idx}`
    }));
    for (const p of childPhotos) allPhotos.push(p);

    if (c.gpxData) {
      const gs = getGpxSummary(c.gpxData);
      if (gs) {
        if (gs.dateStr) gpxDetailParts.push(`【${c.name}】日付: ${gs.dateStr}`);
        if (gs.distanceKm != null) gpxDetailParts.push(`【${c.name}】距離: ${gs.distanceKm < 1 ? (gs.distanceKm * 1000).toFixed(0) + 'm' : gs.distanceKm.toFixed(1) + 'km'}`);
        if (gs.durationHours != null) gpxDetailParts.push(`【${c.name}】所要時間: ${formatDuration(gs.durationHours)}`);
      }
      routePoints.push(...getGpxRoutePointsFromXml(c.gpxData));
    }

    const childUrl = (c.url || '').trim();
    if (childUrl) {
      const bc = await fetchTravelBlogContent(childUrl);
      if (bc) blogContent += `【${c.name}】\n${bc.slice(0, 800)}\n\n`;
    }

    const html = await loadTravelogueHtmlFromDB(c.id);
    const pdf = html ? extractPdfDataFromTravelogueHtml(html) : null;
    if (pdf?.intro) travelogueIntros.push(`【${c.name}】\n${pdf.intro}`);
    if (pdf?.closing) travelogueClosings.push(`【${c.name}】\n${pdf.closing}`);
  }

  if (routePoints.length < 2) {
    const withGps = allPhotos.filter(p => p.lat != null && p.lng != null);
    if (withGps.length > 0) routePoints.push(...withGps.map(p => [p.lat, p.lng]));
  }

  const photoSummaries = allPhotos.slice(0, 50).map((p, i) => {
    const parts = [];
    if (p.placeName) parts.push(p.placeName);
    if (p.landmarkNo || p.landmarkName) parts.push([p.landmarkNo, p.landmarkName].filter(Boolean).join(' '));
    if (p.description) parts.push(p.description);
    if (p._from) parts.push(`(${p._from})`);
    return parts.length ? parts.join(' — ') : `写真${i + 1}`;
  });

  const stampPhotos = getStampPhotos();
  const seen = new Set();
  const stampStatus = [];
  for (let i = 0; i < allPhotos.length; i++) {
    const p = allPhotos[i];
    const no = toLandmarkValue(p.landmarkNo);
    const nm = toLandmarkValue(p.landmarkName);
    const text = [no, nm].filter(Boolean).join(' ');
    if (text && !seen.has(text)) {
      seen.add(text);
      const key = p._stampKey || `${parentId}_${i}`;
      stampStatus.push({ text, filled: !!stampPhotos[key] });
      if (stampStatus.length >= 16) break;
    }
  }

  const gpxMetaParts = [];
  if (gpxDetailParts.length > 0) {
    const firstGs = parentTrip?.gpxData ? getGpxSummary(parentTrip.gpxData) : null;
    const firstChild = children[0];
    const childGs = firstChild?.gpxData ? getGpxSummary(firstChild.gpxData) : null;
    const gs = firstGs || childGs;
    if (gs?.dateStr) gpxMetaParts.push(gs.dateStr);
    let totalKm = 0;
    for (const c of [parentTrip, ...children]) {
      if (c?.gpxData) {
        const s = getGpxSummary(c.gpxData);
        if (s?.distanceKm != null) totalKm += s.distanceKm;
      }
    }
    if (totalKm > 0) gpxMetaParts.push(totalKm < 1 ? (totalKm * 1000).toFixed(0) + 'm' : totalKm.toFixed(1) + 'km');
  }

  return {
    photos: allPhotos,
    photoSummaries,
    blogContent: blogContent.trim() || null,
    gpxMeta: gpxMetaParts.join(' '),
    gpxDetail: gpxDetailParts.length > 0 ? gpxDetailParts.join('、') : null,
    routePoints: routePoints.length >= 2 ? routePoints : (allPhotos.filter(p => p.lat != null && p.lng != null).map(p => [p.lat, p.lng])),
    stampStatus,
    travelogueIntros: travelogueIntros.join('\n\n'),
    travelogueClosings: travelogueClosings.join('\n\n')
  };
}

/** 親トリップ用：子トリップの旅行記・ブログ・写真を全て集約したpdfDataを返す */
async function aggregateParentTripDataForAnime(parentId, parentName) {
  const allTrips = await getMergedTrips();
  const myTrips = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
  const children = myTrips.filter(t => t.parentTripId === parentId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (children.length === 0) return null;
  const allPhotos = [];
  const intros = [];
  const closings = [];
  let blogContent = '';
  for (const c of children) {
    let html = await loadTravelogueHtmlFromDB(c.id);
    const pdf = html ? extractPdfDataFromTravelogueHtml(html) : null;
    if (pdf?.photos?.length) {
      for (const p of pdf.photos) {
        if (p?.data) allPhotos.push({ ...p, _from: c.name });
      }
      if (pdf.intro) intros.push(`【${c.name}】\n${pdf.intro}`);
      if (pdf.closing) closings.push(`【${c.name}】\n${pdf.closing}`);
    }
    if (c.photos?.length) {
      for (const p of c.photos) {
        if (p?.data) allPhotos.push({
          placeName: p.placeName || p.name,
          placeDesc: p.description || '',
          data: p.data,
          mime: p.mime || 'image/jpeg',
          _from: c.name
        });
      }
    }
    if (c.url) {
      const bc = await fetchTravelBlogContent(c.url);
      if (bc) blogContent += `【${c.name}】\n${bc.slice(0, 800)}\n\n`;
    }
  }
  if (allPhotos.length === 0) return null;
  const firstChildId = children[0]?.id;
  return {
    tripName: parentName || '旅行',
    intro: intros.join('\n\n'),
    closing: closings.join('\n\n'),
    photos: allPhotos,
    blogContent: blogContent.trim() || null,
    firstChildId
  };
}

/** 旅行記HTMLを取得（親トリップの子トリップ集約は行わない） */
async function resolveTravelogueForAnime(tripId) {
  const rawTripId = (typeof tripId === 'string' && tripId.startsWith('public_')) ? tripId.slice(7) : tripId;
  let html = (_lastTravelogueTripId === tripId && _lastTravelogueHtmlContent) ? _lastTravelogueHtmlContent : null;
  if (!html) html = await loadTravelogueHtmlFromDB(tripId);
  if (!html) html = await loadTravelogueHtmlFromDB(rawTripId);
  if (html) return { tripId, html, pdfData: null };
  return null;
}

/** 旅行アニメ表紙を生成
 * @param {string} tripId
 * @param {string} coverStyle - 'aruku' 歩き方風 | 'jump' ジャンプ風 | 'popeye' 雑誌風 | 'spotlight' 注目スポット風
 */
async function generateTravelAnime(tripId, coverStyle = 'aruku') {
  const rawTripId = (typeof tripId === 'string' && tripId.startsWith('public_')) ? tripId.slice(7) : tripId;
  const apiKey = getAiApiKey()?.trim();
  if (!apiKey) {
    setStatus('AI API Key が設定されていません。メニュー → 設定 から Gemini API Key を入力してください。', true);
    return;
  }
  if (!getAiApiProvider().startsWith('gemini')) {
    setStatus('旅行アニメ生成には Gemini API が必要です。メニュー → 設定 で AI API を Gemini に切り替えてください。', true);
    return;
  }
  const resolved = await resolveTravelogueForAnime(tripId);
  if (!resolved) {
    setStatus('旅行記がありません。先に「旅行記生成」するか、子トリップに旅行記・写真を追加してください。', true);
    return;
  }
  const { tripId: sourceTripId, html, pdfData: aggregatedPdf } = resolved;
  const sourceRawId = (typeof sourceTripId === 'string' && sourceTripId.startsWith('public_')) ? sourceTripId.slice(7) : sourceTripId;
  const pdfData = aggregatedPdf || extractPdfDataFromTravelogueHtml(html);
  const charPhotoSourceId = aggregatedPdf?.firstChildId || sourceRawId;
  if (!pdfData || !pdfData.photos?.length) {
    setStatus('旅行記のデータを読み込めませんでした。', true);
    return;
  }
  const animeBtn = document.getElementById('tripMenuAnimeBtn');
  if (animeBtn) animeBtn.disabled = true;
  setStatus('旅行アニメを生成中…（Nano Banana Pro2）');
  const modal = document.getElementById('animeModal');
  const contentEl = document.getElementById('animeModalContent');
  if (contentEl) contentEl.innerHTML = '<p class="anime-loading">生成中…</p>';
  if (modal) modal.classList.add('open');
  try {
    const tripName = (pdfData.tripName || '旅行').slice(0, 30);
    const intro = (pdfData.intro || '').slice(0, 300);
    const closing = (pdfData.closing || '').slice(0, 150);
    const placeList = (pdfData.photos || []).slice(0, 8).map((p, i) =>
      `${i + 1}. ${(p.placeName || '').slice(0, 20)}: ${(p.placeDesc || '').slice(0, 80)}`
    ).join('\n');
    const routeInfo = pdfData.route?.length >= 2 ? 'ルート地図あり。' : '';
    const blogPart = pdfData.blogContent ? `ブログ参考:\n${pdfData.blogContent.slice(0, 500)}` : '';
    const storySummary = [intro, placeList, routeInfo, closing, blogPart].filter(Boolean).join('\n\n');

    let coverTitle = tripName;
    try {
      const provider = getAiApiProvider();
      const geminiModel = provider === 'gemini-pro' ? 'gemini-2.5-pro' : 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const tr = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `以下の旅行記から、短く印象的な題名を1つだけ生成してください。例：しまなみ、瀬戸内、尾道、道後温泉。3〜6文字程度の日本語で、他の説明は不要。\n\n${storySummary}` }] }],
          generationConfig: { maxOutputTokens: 32 }
        })
      });
      if (tr.ok) {
        const td = await tr.json();
        const t = td?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (t && t.length <= 12) coverTitle = t.replace(/^[「『"]|["』」]$/g, '');
      }
    } catch (_) {}

    const charPhotos = getCharacterPhotos(charPhotoSourceId).filter(p => p.data);
    const traveloguePhotos = (pdfData.photos || []).filter(p => p.data).slice(0, 2);
    const refPhotos = charPhotos.length > 0 ? charPhotos.slice(0, 3) : traveloguePhotos;
    const useCharPhotos = charPhotos.length > 0;
    const parts = [];
    for (const p of refPhotos) {
      parts.push({
        inlineData: { mimeType: p.mime || 'image/jpeg', data: p.data }
      });
    }
    const charInstruction = useCharPhotos
      ? 'CRITICAL: The reference photos above show the MAIN CHARACTER (主人公). Draw this person as the LARGE protagonist in the CENTER. Use their face, hair, body type, and clothing to create an anime version. This person MUST be the focal point.'
      : 'LARGE main character (protagonist) in the CENTER - draw the person/people from the reference photos above in anime style. Use their appearance, pose, and clothing as reference to create an anime version of them as the protagonist.';

    const coverPrompts = {
      aruku: `Create a single JPEG image in the style of "地球の歩き方" (Aruku / Earth's Walking Guide) - a famous Japanese travel guidebook series.

CRITICAL - Do NOT include any of these in the image: "ジャンプ", "集英社", "Shueisha", "Weekly Shonen Jump", "週刊少年ジャンプ", or similar real brand names. No magazine or manga publisher logos.

IMPORTANT: Use VERTICAL/PORTRAIT format (縦長). The image must be tall (height > width), like 9:16 aspect ratio, suitable for mobile viewing.

Layout requirements (地球の歩き方 style - BE FAITHFUL to this aesthetic):
- TOP-LEFT series logo: Display "K旅の歩き方" (NOT "地球の歩き方") in the top-left corner - this is the series branding, clean typography.
- TITLE: "${coverTitle}" - Display the title in the distinctive travel guide style: clean typography, often with a subtitle or series feel, elegant and readable. The title should feel like a travel guide cover, not a manga magazine.
- ${charInstruction}
- In the BACKGROUND: Travel scene illustrations - iconic destinations, landscapes, or journey moments in a travel guide aesthetic. Can include anime-style characters from the reference photos in travel settings.
- Overall: Travel guide book cover feel - clean, inviting, suitable for a trip guide. No manga magazine elements.

Story from the travelogue:
${storySummary}

Style: Mimic the 地球の歩き方 (Aruku) travel guide cover aesthetic FAITHFULLY - clean title treatment, travel-themed imagery, inviting and readable. The protagonist can be based on the reference photos. Output as high-quality JPEG in VERTICAL portrait format.`,
      jump: `Create a single JPEG image in the style of 週刊少年ジャンプ (Weekly Shonen Jump) manga magazine cover - bold, dynamic, high-energy anime style.

CRITICAL - Do NOT include "週刊少年ジャンプ", "集英社", "Shueisha", "Jump", or any real publisher/brand names in the image. Create a similar STYLE but use NO real brand text.

IMPORTANT: Use VERTICAL/PORTRAIT format (縦長). The image must be tall (height > width), like 9:16 aspect ratio, suitable for mobile viewing.

Layout requirements (週刊少年ジャンプ style - BE FAITHFUL to this aesthetic):
- Bold, dynamic composition - protagonist in the center, powerful pose, manga/anime style.
- TITLE: "${coverTitle}" - Display in bold, impactful typography typical of Shonen Jump covers. Dynamic and eye-catching.
- ${charInstruction}
- Background: Dynamic manga-style background - speed lines, dramatic lighting, action feel. Can include travel destinations as backdrop.
- Overall: Shonen Jump magazine cover feel - bold, energetic, manga magazine aesthetic. NO real brand logos or text.

Story from the travelogue:
${storySummary}

Style: Mimic the 週刊少年ジャンプ cover aesthetic FAITHFULLY - bold protagonist, dynamic composition, manga magazine energy. The protagonist can be based on the reference photos. Output as high-quality JPEG in VERTICAL portrait format.`,
      popeye: `Create a single JPEG image in the style of POPEYE magazine - the iconic Japanese men's lifestyle/culture magazine known for clean, modern, urban aesthetic.

IMPORTANT: Use VERTICAL/PORTRAIT format (縦長). The image must be tall (height > width), like 9:16 aspect ratio, suitable for mobile viewing.

Layout requirements (POPEYE magazine style - BE FAITHFUL to this aesthetic):
- Clean, editorial magazine cover feel - minimalist typography, sophisticated layout.
- TITLE: "${coverTitle}" - Display in POPEYE's distinctive style: clean sans-serif, modern, urban/culture magazine typography. Elegant and readable.
- ${charInstruction}
- Background: Urban travel aesthetic - cityscapes, lifestyle scenes, culture/travel imagery. Can blend illustration with magazine-cover feel. Travel destinations in a refined, editorial style.
- Overall: POPEYE magazine cover feel - clean, modern, urban lifestyle, culture/travel focus. Sophisticated and inviting.

Story from the travelogue:
${storySummary}

Style: Mimic the POPEYE magazine cover aesthetic FAITHFULLY - clean typography, modern editorial layout, urban travel culture. The protagonist can be based on the reference photos. Output as high-quality JPEG in VERTICAL portrait format.`,
      spotlight: `Create a single JPEG image in the style of a travel guide "注目スポット" (Notable Spots / Highlights) table-of-contents page - a cover-style layout that showcases the trip's main attractions and must-see spots.

IMPORTANT: Use VERTICAL/PORTRAIT format (縦長). The image must be tall (height > width), like 9:16 aspect ratio, suitable for mobile viewing.

Layout requirements (注目スポット風 - table of contents / highlights cover style):
- TITLE at top: "注目スポット" or "${coverTitle} の注目スポット" - Display prominently as a section header, like a travel guide's highlights index.
- MAIN CONTENT: A visually appealing layout showing 4-8 notable spots from the trip. Each spot should have:
  - Spot name/number (e.g. "1. 〇〇", "2. △△")
  - Brief visual representation - small illustration, icon, or thumbnail-style image for each spot
  - Clean, readable typography
- Layout: Grid or list format - spots arranged in an orderly, magazine-style table of contents. Can use numbered items, small frames, or card-like blocks for each spot.
- ${charInstruction}
- Overall: Travel guide "注目スポット" index/cover feel - inviting, informative, like a preview of the trip's highlights. Anime/illustration style, cohesive and readable.

Notable spots from this trip (include these in the layout):
${placeList}

Story context:
${storySummary}

Style: Travel guide 注目スポット (highlights) table-of-contents aesthetic - clean layout, numbered spots, inviting preview of the journey. The protagonist can appear small or as a guide. Output as high-quality JPEG in VERTICAL portrait format.`
    };

    const promptText = coverPrompts[coverStyle] || coverPrompts.aruku;
    parts.push({ text: promptText });

    const requestBody = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageGenerationConfig: ANIME_IMAGE_GEN
      }
    };
    const requestBodyFallback = {
      contents: [{ parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    };

    const IMAGE_MODELS = [
      'gemini-2.5-flash-preview-image',
      'gemini-2.0-flash-preview-image-generation',
      'gemini-3.1-flash-image-preview'
    ];
    let res;
    for (const IMAGE_MODEL of IMAGE_MODELS) {
      const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
      res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      if (res.ok) break;
      if (res.status === 400) {
        res = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBodyFallback)
        });
        if (res.ok) break;
      }
      if (res.status !== 404) {
        const errBody = await res.json().catch(() => ({}));
        const msg = errBody?.error?.message || errBody?.error?.details?.[0]?.errorMessage || `API ${res.status}`;
        throw new Error(msg);
      }
    }
    if (!res?.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || errBody?.error?.details?.[0]?.errorMessage || '画像生成モデルが見つかりません（404）。Google AI Studioで利用可能なモデルを確認してください。';
      throw new Error(msg);
    }
    const data = await res.json();
    const responseParts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = responseParts.find(x => x.inlineData || x.inline_data);
    const idata = imgPart?.inlineData || imgPart?.inline_data;
    if (!idata?.data) throw new Error('画像の生成に失敗しました');

    let jpegBase64 = idata.data;
    const mime = idata.mimeType || idata.mime_type || 'image/png';
    if (mime !== 'image/jpeg') {
      const blob = new Blob([Uint8Array.from(atob(idata.data), c => c.charCodeAt(0))], { type: mime });
      const canvas = document.createElement('canvas');
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = URL.createObjectURL(blob);
      });
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      jpegBase64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    }

    let thumbData = jpegBase64;
    try {
      const enc = await resizeBase64ToBase64('image/jpeg', jpegBase64, ANIME_THUMB_W, ANIME_THUMB_H, 0.85);
      if (enc?.data) thumbData = enc.data;
    } catch (_) {}

    const coverImage = { mime: 'image/jpeg', data: jpegBase64 };
    const thumbnail = { mime: 'image/jpeg', data: thumbData };
    let newId = null;
    try {
      newId = await saveAnimeToDB(tripId, tripName, [], thumbnail, [], coverImage, { animeType: 'cover', order: 0 });
    } catch (_) {}

    setStatus('旅行アニメ表紙を生成しました');
    if (newId) await openAnimeFromData(newId);
    await renderTripMenu();
    await renderPublicTripsPanel();
    refreshHeaderAnimeButton();
  } catch (err) {
    setStatus(err.message || '旅行アニメ表紙の生成に失敗しました', true);
    if (contentEl) contentEl.innerHTML = `<p class="anime-error">${escapeHtml(err.message || '生成に失敗しました')}</p>`;
  }
  if (animeBtn) animeBtn.disabled = false;
}

/** 旅行アニメページを生成（5コマ漫画・吹き出し入り） */
async function generateTravelAnimePage(tripId, part) {
  const rawTripId = (typeof tripId === 'string' && tripId.startsWith('public_')) ? tripId.slice(7) : tripId;
  const apiKey = getAiApiKey()?.trim();
  if (!apiKey) {
    setStatus('AI API Key が設定されていません。メニュー → 設定 から Gemini API Key を入力してください。', true);
    return;
  }
  if (!getAiApiProvider().startsWith('gemini')) {
    setStatus('旅行アニメページ生成には Gemini API が必要です。メニュー → 設定 で AI API を Gemini に切り替えてください。', true);
    return;
  }
  const resolved = await resolveTravelogueForAnime(tripId);
  if (!resolved) {
    setStatus('旅行記がありません。先に「旅行記生成」するか、子トリップに旅行記・写真を追加してください。', true);
    return;
  }
  const { html, pdfData: aggregatedPdf } = resolved;
  const sourceRawId = (typeof resolved.tripId === 'string' && resolved.tripId.startsWith('public_')) ? resolved.tripId.slice(7) : resolved.tripId;
  const pdfData = aggregatedPdf || extractPdfDataFromTravelogueHtml(html);
  const charPhotoSourceId = aggregatedPdf?.firstChildId || sourceRawId;
  if (!pdfData || !pdfData.photos?.length) {
    setStatus('旅行記のデータを読み込めませんでした。', true);
    return;
  }
  const n = pdfData.photos.length;
  const quarterMap = { q1: 0, q2: 1, q3: 2, q4: 3 };
  const q = quarterMap[part] ?? 0;
  const start = Math.floor((n * q) / 4);
  const end = Math.floor((n * (q + 1)) / 4);
  const halfPhotos = (pdfData.photos || []).slice(start, end).slice(0, 5);
  if (halfPhotos.length === 0) {
    setStatus(`${(q + 1)}/4の写真がありません`, true);
    return;
  }
  const tripName = (pdfData.tripName || '旅行').slice(0, 30);
  const tripUrl = (document.getElementById('tripUrlInput')?.value || '').trim();
  let blogContent = pdfData.blogContent || (tripUrl ? await fetchTravelBlogContent(tripUrl) : null);
  const intro = (pdfData.intro || '').slice(0, 200);
  const closing = (pdfData.closing || '').slice(0, 100);
  const placeList = halfPhotos.map((p, i) =>
    `${i + 1}. ${(p.placeName || '').slice(0, 20)}: ${(p.placeDesc || '').slice(0, 80)}`
  ).join('\n');
  const storySummary = [intro, placeList, closing, blogContent ? `ブログ参考: ${blogContent.slice(0, 500)}` : ''].filter(Boolean).join('\n\n');

  const animeBtn = document.getElementById('tripMenuAnimeBtn');
  if (animeBtn) animeBtn.disabled = true;
  setStatus('旅行アニメページを生成中…（5コマ漫画）');
  const modal = document.getElementById('animeModal');
  const contentEl = document.getElementById('animeModalContent');
  if (contentEl) contentEl.innerHTML = '<p class="anime-loading">生成中…</p>';
  if (modal) modal.classList.add('open');

  try {
    const charPhotos = getCharacterPhotos(charPhotoSourceId).filter(p => p.data);
    const scenePhotos = halfPhotos.filter(p => p.data).slice(0, 3);
    const useCharPhotos = charPhotos.length > 0;
    const refPhotos = useCharPhotos
      ? [...charPhotos.slice(0, 2), ...scenePhotos.slice(0, 2)].slice(0, 4)
      : scenePhotos;
    const parts = [];
    for (const p of refPhotos) {
      parts.push({ inlineData: { mimeType: p.mime || 'image/jpeg', data: p.data } });
    }
    const charInstruction = useCharPhotos
      ? 'CRITICAL: The first reference photo(s) show the MAIN CHARACTER (主人公). Draw this person in EVERY panel as the protagonist. Use their face, hair, and style. The other photos show trip scenes for background reference.'
      : 'Show scenes from the trip based on the reference photos - draw in anime/manga style. The people in the photos are the main characters.';
    parts.push({
      text: `Create a single JPEG image: ONE manga page with exactly 5 comic panels (5コマ漫画).

IMPORTANT requirements:
- VERTICAL/PORTRAIT format (縦長) - image must be tall (height > width), like 9:16 aspect ratio
- FULL COLOR (カラー) - vibrant colors, no grayscale or monochrome
- 1K resolution (1024px equivalent)

Layout: 5 panels stacked vertically or in a vertical grid. Each panel must:
- ${charInstruction}
- Include a speech bubble (吹き出し) with Japanese text - short dialogue, thought, or caption (1-2 short sentences per panel)
- Be clearly separated with panel borders
- Tell a coherent story of the journey in order

Story from the travelogue (part ${(q + 1)}/4 of the trip):
${storySummary}

Style: Shonen manga style (少年漫画風), full color, clear lines, expressive characters, readable speech bubbles. Do NOT include any real brand names (ジャンプ, 集英社, Shueisha, etc.) in the image. Output as high-quality JPEG in VERTICAL portrait format.`
    });

    const requestBodyWithConfig = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageGenerationConfig: ANIME_IMAGE_GEN
      }
    };
    const requestBodyFallback = {
      contents: [{ parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    };
    const IMAGE_MODELS = [
      'gemini-2.5-flash-preview-image',
      'gemini-2.0-flash-preview-image-generation',
      'gemini-3.1-flash-image-preview'
    ];
    let res;
    for (const IMAGE_MODEL of IMAGE_MODELS) {
      const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
      res = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBodyWithConfig) });
      if (res.ok) break;
      if (res.status === 400) {
        res = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBodyFallback) });
        if (res.ok) break;
      }
      if (res.status !== 404) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error?.message || `API ${res.status}`);
      }
    }
    if (!res?.ok) throw new Error('画像生成モデルが見つかりません');
    const data = await res.json();
    const imgPart = (data?.candidates?.[0]?.content?.parts || []).find(x => x.inlineData || x.inline_data);
    const idata = imgPart?.inlineData || imgPart?.inline_data;
    if (!idata?.data) throw new Error('画像の生成に失敗しました');

    let jpegBase64 = idata.data;
    const mime = idata.mimeType || idata.mime_type || 'image/png';
    if (mime !== 'image/jpeg') {
      const blob = new Blob([Uint8Array.from(atob(idata.data), c => c.charCodeAt(0))], { type: mime });
      const canvas = document.createElement('canvas');
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = URL.createObjectURL(blob);
      });
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      jpegBase64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    }

    let thumbData = jpegBase64;
    try {
      const enc = await resizeBase64ToBase64('image/jpeg', jpegBase64, ANIME_THUMB_W, ANIME_THUMB_H, 0.85);
      if (enc?.data) thumbData = enc.data;
    } catch (_) {}

    const pageImages = [{ mime: 'image/jpeg', data: jpegBase64 }];
    const thumbnail = { mime: 'image/jpeg', data: thumbData };
    const pages = await getAnimePagesByTripId(tripId);
    const order = pages.length > 0 ? Math.max(...pages.map(p => p.order ?? 0)) + 1 : Date.now();
    const newId = await saveAnimeToDB(tripId, tripName, [], thumbnail, pageImages, null, { animeType: 'page', half: part, order });

    setStatus('旅行アニメページを生成しました');
    await openAnimeFromData(newId);
    await renderTripMenu();
    await renderPublicTripsPanel();
    refreshHeaderAnimeButton();
  } catch (err) {
    setStatus(err.message || '旅行アニメページの生成に失敗しました', true);
    if (contentEl) contentEl.innerHTML = `<p class="anime-error">${escapeHtml(err.message || '生成に失敗しました')}</p>`;
  }
  if (animeBtn) animeBtn.disabled = false;
}

/** AI の旅行記テキストをパースして { intro, placeTexts, closing } に分割 */
function parseTravelogueText(text) {
  const result = { intro: '', placeTexts: [], closing: '' };
  const closingIdx = text.indexOf('締め');
  const mainPart = closingIdx >= 0 ? text.slice(0, closingIdx) : text;
  const closingPart = closingIdx >= 0 ? text.slice(closingIdx + 2).replace(/^[\s\n]*/, '') : '';
  result.closing = closingPart.trim();

  const blockRe = /\[(\d+)\]\s*\n?([\s\S]*?)(?=\[\d+\]|$)/g;
  let lastEnd = 0;
  let match;
  while ((match = blockRe.exec(mainPart)) !== null) {
    if (match.index > lastEnd) {
      const before = mainPart.slice(lastEnd, match.index).trim();
      if (before && !result.intro) result.intro = before;
    }
    const idx = parseInt(match[1], 10) - 1;
    result.placeTexts[idx] = (match[2] || '').trim();
    lastEnd = match.index + match[0].length;
  }
  if (!result.intro && mainPart.trim()) {
    const firstBlock = mainPart.match(/^([\s\S]*?)(?=\[\d+\])/);
    result.intro = (firstBlock ? firstBlock[1] : mainPart).trim();
  }
  result.intro = (result.intro || '').replace(/^(冒頭|旅の概要)\s*\n?/, '');
  return result;
}

/** ルート座標を取得（地図用） */
function getRoutePointsForMap() {
  const routePoints = getGpxRoutePoints();
  const withGps = photos.filter(p => p.lat != null && p.lng != null);
  return routePoints.length >= 2 ? routePoints : withGps.map(p => [p.lat, p.lng]);
}

/** Wikipedia から簡単なサマリーを取得（名所旧跡・観光地など） */
async function fetchWikipediaSummary(term) {
  if (!term || typeof term !== 'string') return null;
  const q = term.trim().slice(0, 50);
  if (!q) return null;
  try {
    const searchRes = await fetch(
      `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&utf8=1`
    );
    const searchData = await searchRes.json();
    const hits = searchData?.query?.search;
    if (!hits || hits.length === 0) return null;
    const title = hits[0].title;
    const extractRes = await fetch(
      `https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&titles=${encodeURIComponent(title)}&prop=extracts&exintro&explaintext&exsentences=4`
    );
    const extractData = await extractRes.json();
    const pages = extractData?.query?.pages;
    if (!pages) return null;
    const pageId = Object.keys(pages)[0];
    const extract = pages[pageId]?.extract;
    return (extract && typeof extract === 'string') ? extract.trim().slice(0, 400) : null;
  } catch (_) {
    return null;
  }
}

/** 旅行記 Web ページの HTML を生成（PDF 生成用データを埋め込み） */
async function buildTravelogueHtml(tripName, tripDesc, tripUrl, parsed, routePoints, stampStatus = [], photosOverride = null) {
  const photosToUse = photosOverride ?? photos;
  const hasPoints = routePoints && routePoints.length >= 1;
  const landmarkKey = (p) => {
    const no = toLandmarkValue(p.landmarkNo);
    const nm = toLandmarkValue(p.landmarkName);
    return [no, nm].filter(Boolean).join(' ') || '_other';
  };

  // 写真の表示順をキープしつつ、ランドマークが変わるタイミングでセクション分け
  const sections = [];
  let currentSection = null;
  let currentKey = null;

  for (let i = 0; i < photosToUse.length; i++) {
    const p = photosToUse[i];
    const imgSrc = p.data ? `data:${p.mime || 'image/jpeg'};base64,${p.data}` : '';
    if (!imgSrc) continue;

    const key = landmarkKey(p);
    const sectionTitle = key === '_other' ? 'その他' : [p.landmarkNo, p.landmarkName].filter(Boolean).join(' ');
    const placeName = p.placeName || p.landmarkName || p.name || `写真${i + 1}`;
    const desc = parsed.placeTexts[i] || '';

    if (key !== currentKey) {
      currentKey = key;
      currentSection = { sectionTitle, items: [] };
      sections.push(currentSection);
    }

    currentSection.items.push({ imgSrc, placeName, desc, photo: p, index: i });
  }

  const pdfSections = [];
  for (const sec of sections) {
    const photoData = [];
    for (const item of sec.items.slice(0, 8)) {
      const p = item.photo;
      if (!p.data) continue;
      try {
        const enc = await resizeBase64ToBase64(p.mime, p.data, 400, 300, 0.8);
        if (enc) photoData.push({
          mime: enc.mime || 'image/jpeg',
          data: enc.data,
          placeName: (p.placeName || p.landmarkName || p.name || `写真`).slice(0, 25),
          placeDesc: (parsed.placeTexts[item.index] || '').slice(0, 200)
        });
      } catch (_) {}
    }
    pdfSections.push({
      sectionTitle: sec.sectionTitle === 'その他' ? '' : sec.sectionTitle,
      photos: photoData
    });
  }

  const pdfData = {
    tripName,
    tripDesc: tripDesc || '',
    tripUrl: tripUrl || '',
    intro: parsed.intro || '',
    closing: parsed.closing || '',
    sections: pdfSections,
    photos: pdfSections.flatMap(s => s.photos),
    route: hasPoints ? routePoints : []
  };

  const routeJson = JSON.stringify(hasPoints ? routePoints : [[35.68, 139.76]]);
  const pdfDataJson = JSON.stringify(pdfData)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

  const sectionsHtml = sections.map(sec => {
    const titleHtml = sec.sectionTitle === 'その他' ? '' : `<h2 class="travelogue-section-title">${escapeHtml(sec.sectionTitle)}</h2>`;
    const itemsHtml = sec.items.map(({ imgSrc, placeName, desc }) => `
      <div class="travelogue-item">
        <div class="travelogue-photo"><img src="${imgSrc}" alt="${escapeHtml(placeName)}"></div>
        <div class="travelogue-text">
          <div class="travelogue-place">${escapeHtml(placeName)}</div>
          <p>${escapeHtml(desc).replace(/\n/g, '<br>')}</p>
        </div>
      </div>`).join('');
    return `<section class="travelogue-section">${titleHtml}<div class="travelogue-section-items">${itemsHtml}</div></section>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(tripName)} 旅行記</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; margin: 0; padding: 1rem; max-width: 900px; margin: 0 auto; color: #333; }
    h1 { font-size: 1.5rem; margin: 0 0 1rem; }
    .travelogue-intro, .travelogue-closing { margin: 1rem 0; line-height: 1.7; }
    #map { height: 400px; margin: 1rem 0; border-radius: 8px; overflow: hidden; }
    .travelogue-item { display: flex; gap: 1.5rem; margin: 2rem 0; align-items: flex-start; }
    .travelogue-photo { flex-shrink: 0; }
    .travelogue-photo img { max-width: 320px; width: 100%; height: auto; border-radius: 8px; display: block; }
    .travelogue-place { margin: 0 0 0.5rem; font-size: 0.8rem; color: #666; }
    .travelogue-text p { margin: 0; line-height: 1.7; }
    .travelogue-section { margin: 2.5rem 0; padding-top: 1.5rem; border-top: 1px solid #eee; }
    .travelogue-section-title { font-size: 1.25rem; margin: 0 0 1rem; color: #e1306c; }
    .travelogue-actions { margin: 2rem 0 1rem; }
    .travelogue-pdf-btn { padding: 0.6rem 1.5rem; font-size: 1.1rem; border: none; border-radius: 8px; cursor: pointer; background: #e1306c; color: #fff; }
    .travelogue-pdf-btn:hover { background: #c41e5a; }
    .travelogue-pdf-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .travelogue-stamps { margin: 2rem 0; padding: 1rem; background: #f8f8f8; border-radius: 8px; border-left: 4px solid #e1306c; }
    .travelogue-stamps-title { font-size: 1rem; margin: 0 0 0.75rem; color: #e1306c; }
    .travelogue-stamps-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .travelogue-stamp-item { padding: 0.25rem 0.5rem; font-size: 0.85rem; border-radius: 4px; background: #fff; }
    .travelogue-stamp-item.filled { border: 1px solid #e1306c; }
    .travelogue-stamp-item:not(.filled) { border: 1px dashed #ccc; color: #888; }
    @media (max-width: 600px) { .travelogue-item { flex-direction: column; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(tripName)} 旅行記</h1>
  <div id="travelogue-pdf-content">
  ${tripDesc ? `<p class="travelogue-intro">${escapeHtml(tripDesc).replace(/\n/g, '<br>')}</p>` : ''}
  ${parsed.intro ? `<div class="travelogue-intro">${parsed.intro.replace(/\n/g, '<br>')}</div>` : ''}
  ${hasPoints ? '<div id="map"></div>' : ''}
  <div class="travelogue-content">${sectionsHtml}</div>
  ${parsed.closing ? `<div class="travelogue-closing">${parsed.closing.replace(/\n/g, '<br>')}</div>` : ''}
  ${stampStatus.length > 0 ? `<div class="travelogue-stamps"><h3 class="travelogue-stamps-title">スタンプラリー</h3><p>${stampStatus.filter(s => s.filled).length}/${stampStatus.length} 達成</p><div class="travelogue-stamps-grid">${stampStatus.map(s => `<span class="travelogue-stamp-item ${s.filled ? 'filled' : ''}">${escapeHtml(s.text)} ${s.filled ? '✅' : '⬜'}</span>`).join('')}</div></div>` : ''}
  ${tripUrl ? `<p><a href="${escapeHtml(tripUrl)}" target="_blank" rel="noopener">旅ブログ</a></p>` : ''}
  <p class="travelogue-actions">
    <button type="button" id="pdfDownloadBtn" class="travelogue-pdf-btn">📄 PDFでダウンロード</button>
  </p>
  </div>
  ${hasPoints ? `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""><\/script>
  <script>
    var route = ${routeJson};
    if (route.length >= 2) {
      var map = L.map('map').setView(route[0], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
      L.polyline(route, { color: '#e1306c', weight: 4 }).addTo(map);
      var bounds = L.latLngBounds(route);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    } else if (route.length === 1) {
      var map = L.map('map').setView(route[0], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
      L.marker(route[0]).addTo(map);
    }
  <\/script>` : ''}
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>
  <script type="application/json" id="traveloguePdfData">${pdfDataJson}</scr${'\\'}ipt>
  <script>
    (function(){
      var pdfData = JSON.parse(document.getElementById('traveloguePdfData').textContent);
      var btn = document.getElementById('pdfDownloadBtn');
      if (!btn) return;
      btn.onclick = function(){
        btn.disabled = true;
        btn.textContent = 'PDF生成中…';
        function done(){ btn.disabled = false; btn.textContent = 'PDFでダウンロード'; }
        function fail(msg){ done(); alert(msg || 'PDF生成に失敗しました'); }
        function doPdf(){
          try {
            var jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jspdf || window.jsPDF);
            if (!jsPDF) { fail('jsPDFの読み込みに失敗しました'); return; }
            var doc = new jsPDF({unit:'mm',format:'a4'});
            var pageW = doc.internal.pageSize.getWidth();
            var pageH = doc.internal.pageSize.getHeight();
            var margin = 15;
            var contentW = pageW - margin * 2;
            var y = margin;
            function addText(txt, fs){
              if (!txt) return;
              var c = document.createElement('canvas');
              var ctx = c.getContext('2d');
              ctx.font = fs + 'px "Hiragino Sans","Noto Sans JP",Meiryo,sans-serif';
              var w = contentW * 3.78;
              var lines = [];
              var words = txt.split(/\\s+|\\n/);
              var line = '';
              for (var i = 0; i < words.length; i++) {
                var word = words[i];
                if (ctx.measureText(word).width > w) {
                  if (line) { lines.push(line); line = ''; }
                  for (var j = 0; j < word.length; j++) {
                    var ch = word[j];
                    var t = line + ch;
                    if (ctx.measureText(t).width > w && line) { lines.push(line); line = ch; }
                    else line = t;
                  }
                  continue;
                }
                var test = line ? line + ' ' + word : word;
                if (ctx.measureText(test).width > w && line) { lines.push(line); line = word; }
                else line = test;
              }
              if (line) lines.push(line);
              var h = Math.max(2, lines.length * fs * 1.4 + 8);
              c.width = w + 16;
              c.height = h;
              ctx.fillStyle = '#fff';
              ctx.fillRect(0,0,c.width,c.height);
              ctx.fillStyle = '#333';
              ctx.font = fs + 'px "Hiragino Sans","Noto Sans JP",Meiryo,sans-serif';
              lines.forEach(function(l,i){ ctx.fillText(l||' ',8,8+i*fs*1.4); });
              var imgH = Math.min(h/3.78, pageH - 20);
              if (y + imgH > pageH - margin) { doc.addPage(); y = margin; }
              doc.addImage(c.toDataURL('image/png'),'PNG',margin,y,contentW,imgH);
              y += imgH + 8;
            }
            addText(pdfData.tripName, 18);
            if (pdfData.tripDesc) addText(pdfData.tripDesc, 10);
            if (pdfData.intro) addText(pdfData.intro, 10);
            if (pdfData.route && pdfData.route.length >= 2) {
              var pts = pdfData.route;
              var lats = pts.map(function(p){ return p[0]; });
              var lngs = pts.map(function(p){ return p[1]; });
              var minLat = Math.min.apply(null,lats), maxLat = Math.max.apply(null,lats);
              var minLng = Math.min.apply(null,lngs), maxLng = Math.max.apply(null,lngs);
              var rLat = (maxLat-minLat)||0.01, rLng = (maxLng-minLng)||0.01;
              var W=400,H=280;
              var toX=function(lng){ return ((lng-minLng)/rLng)*(W-40)+20; };
              var toY=function(lat){ return H-20-((lat-minLat)/rLat)*(H-40); };
              var pathD = pts.map(function(p,i){ return (i?'L':'M')+' '+toX(p[1])+' '+toY(p[0]); }).join(' ');
              var svg = '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"'+W+'\" height=\"'+H+'\" viewBox=\"0 0 '+W+' '+H+'\"><rect fill=\"#f5f5f5\" width=\"'+W+'\" height=\"'+H+'\"/><path d=\"'+pathD+'\" fill=\"none\" stroke=\"#e1306c\" stroke-width=\"3\"/></svg>';
              var img = new Image();
              img.onload = function(){
                var c2 = document.createElement('canvas');
                c2.width = W; c2.height = H;
                c2.getContext('2d').drawImage(img,0,0);
                if (y + 60 < pageH - margin) {
                  doc.addImage(c2.toDataURL('image/png'),'PNG',margin,y,contentW,60);
                  y += 72;
                }
                addPhotos();
              };
              img.onerror = addPhotos;
              img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
            } else addPhotos();
            function addPhotos(){
              var photoW = 55, photoH = photoW * 0.75;
              var sections = pdfData.sections || (pdfData.photos ? [{ sectionTitle: '', wikiSummary: '', photos: pdfData.photos }] : []);
              for (var s = 0; s < sections.length; s++) {
                var sec = sections[s];
                if (sec.sectionTitle) {
                  if (y + 15 > pageH - margin) { doc.addPage(); y = margin; }
                  addText(sec.sectionTitle, 14);
                  y += 5;
                }
                if (sec.wikiSummary) {
                  if (y + 20 > pageH - margin) { doc.addPage(); y = margin; }
                  addText(sec.wikiSummary, 8);
                  y += 5;
                }
                for (var i = 0; i < (sec.photos||[]).length; i++) {
                  var p = sec.photos[i];
                  if (y + photoH + 20 > pageH - margin) { doc.addPage(); y = margin; }
                  try {
                    doc.addImage('data:'+(p.mime||'image/jpeg')+';base64,'+p.data,'JPEG',margin,y,photoW,photoH);
                    var txt = ((p.placeName||'') + '\\n\\n' + (p.placeDesc||'')).slice(0, 250);
                    if (txt) addText(txt, 9);
                    else y += 5;
                  } catch(e){}
                  y += Math.max(photoH, 25) + 8;
                }
              }
              if (pdfData.closing) addText(pdfData.closing, 10);
              var fn = (pdfData.tripName || 'travelogue').replace(/[^\\w\\u3040-\\u309f\\u30a0-\\u30ff\\u4e00-\\u9faf\\-]/g,'_').slice(0,50) + '_旅行記.pdf';
              doc.save(fn);
              done();
            }
          } catch(e) {
            fail('PDF生成に失敗しました: ' + (e.message || e));
          }
        }
        if (window.jspdf && window.jspdf.jsPDF) doPdf();
        else {
          var s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          s.onload = doPdf;
          s.onerror = function(){ fail('jsPDFの読み込みに失敗しました'); };
          document.head.appendChild(s);
        }
      };
    })();
  <\/script>
</body>
</html>`;
}

/** 旅行記 Web ページを生成（ログイン時のみ） */
async function generateTraveloguePdf() {
  if (!isEditor()) {
    setStatus('旅行記の生成にはログインが必要です', true);
    return;
  }
  const tripName = document.getElementById('tripNameInput')?.value?.trim() || 'トリップ';
  const tripDesc = (document.getElementById('tripDescInput')?.value || '').trim();
  const tripUrl = (document.getElementById('tripUrlInput')?.value || '').trim();
  const tripId = _currentViewingTripId || currentTripId || '';
  const rawTripId = (typeof tripId === 'string' && tripId.startsWith('public_')) ? tripId.slice(7) : tripId;
  const currentTrip = await getTripById(rawTripId) || await getTripById(tripId);

  let photoSummaries, gpxMeta, gpxDetail, blogContent, stampStatus, routePoints, photosForHtml, travelogueContent = null;

  if (currentTrip?.isParent) {
    if (photos.length === 0) {
      setStatus('親トリップのデータを集約中…');
    }
    const aggregated = await aggregateParentTripDataForTravelogue(currentTrip, rawTripId);
    if (!aggregated || aggregated.photos.length === 0) {
      setStatus('子トリップに写真がありません。子トリップに写真を追加してください。', true);
      return;
    }
    photoSummaries = aggregated.photoSummaries;
    gpxMeta = aggregated.gpxMeta;
    gpxDetail = aggregated.gpxDetail;
    blogContent = aggregated.blogContent;
    stampStatus = aggregated.stampStatus;
    routePoints = aggregated.routePoints;
    photosForHtml = aggregated.photos;
    travelogueContent = [aggregated.travelogueIntros, aggregated.travelogueClosings].filter(Boolean).join('\n\n') || null;
  } else {
    if (photos.length === 0) {
      setStatus('写真がありません', true);
      return;
    }
    const gpxSummary = getGpxSummary();
    gpxMeta = [
      gpxSummary?.dateStr,
      gpxSummary?.distanceKm != null ? (gpxSummary.distanceKm < 1 ? (gpxSummary.distanceKm * 1000).toFixed(0) + 'm' : gpxSummary.distanceKm.toFixed(1) + 'km') : null,
      gpxSummary?.avgSpeedKmh != null ? formatSpeed(gpxSummary.avgSpeedKmh) : null
    ].filter(Boolean).join(' ');
    const gpxDetailParts = [];
    if (gpxSummary?.dateStr) gpxDetailParts.push(`日付: ${gpxSummary.dateStr}`);
    if (gpxSummary?.distanceKm != null) gpxDetailParts.push(`移動距離: ${gpxSummary.distanceKm < 1 ? (gpxSummary.distanceKm * 1000).toFixed(0) + 'm' : gpxSummary.distanceKm.toFixed(1) + 'km'}`);
    if (gpxSummary?.durationHours != null) gpxDetailParts.push(`所要時間: ${formatDuration(gpxSummary.durationHours)}`);
    if (gpxSummary?.avgSpeedKmh != null) gpxDetailParts.push(`平均時速: ${formatSpeed(gpxSummary.avgSpeedKmh)}`);
    gpxDetail = gpxDetailParts.length > 0 ? gpxDetailParts.join('、') : null;

    photoSummaries = photos.slice(0, 30).map((p, i) => {
      const parts = [];
      if (p.placeName) parts.push(p.placeName);
      if (p.landmarkNo || p.landmarkName) parts.push([p.landmarkNo, p.landmarkName].filter(Boolean).join(' '));
      if (p.description) parts.push(p.description);
      return parts.length ? parts.join(' — ') : `写真${i + 1}`;
    });

    stampStatus = getStampStatusForTrip(tripId);
    routePoints = getRoutePointsForMap();
    photosForHtml = null;
  }

  const btn = document.getElementById('tripMenuTravelogueBtn');
  if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
  setStatus('AI で旅行記を生成中…');

  if (!blogContent && tripUrl) {
    setStatus('旅行ブログを取得中…');
    blogContent = await fetchTravelBlogContent(tripUrl);
    setStatus('AI で旅行記を生成中…');
  }

  let travelogueText = '';
  try {
    travelogueText = await generateTravelogueWithAI(tripName, tripDesc, tripUrl, photoSummaries, gpxMeta, blogContent, stampStatus, gpxDetail, travelogueContent);
  } catch (err) {
    setStatus(err.message || 'AI 生成に失敗しました', true);
    if (btn) { btn.disabled = false; btn.textContent = '📝 旅行記生成'; }
    return;
  }

  setStatus('旅行記を生成中…');

  const parsed = parseTravelogueText(travelogueText);

  try {
    const htmlContent = await buildTravelogueHtml(tripName, tripDesc, tripUrl, parsed, routePoints, stampStatus, photosForHtml);
    if (_lastTravelogueHtmlUrl) URL.revokeObjectURL(_lastTravelogueHtmlUrl);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const htmlUrl = URL.createObjectURL(blob);
    _lastTravelogueHtmlUrl = htmlUrl;
    _lastTravelogueHtmlContent = htmlContent;
    _lastTravelogueTripId = tripId;
    openUrlInPopupOrModal(htmlUrl, '旅行記');

    const d = new Date();
    const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (tripId) setTravelogueInfo(tripId, { dateStr });
    if (tripId) saveTravelogueHtmlToDB(tripId, htmlContent, tripName).catch(() => {});
    const infoEl = document.getElementById('tripMenuTravelogueInfo');
    if (infoEl) {
      infoEl.innerHTML = `<button type="button" class="trip-menu-travelogue-link trip-menu-travelogue-link-btn trip-menu-travelogue-summary-btn">旅行記</button>`;
      const btn = infoEl.querySelector('button.trip-menu-travelogue-link-btn');
      if (btn) btn.onclick = () => {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        openUrlInPopupOrModal(URL.createObjectURL(blob), '旅行記');
      };
    }
    setStatus('旅行記 Web ページを開きました（ページ内のボタンで PDF ダウンロード）');
    await renderPublicTripsPanel();
    await refreshHeaderTravelogueButton();
  } catch (err) {
    setStatus(err.message || 'PDF 生成に失敗しました', true);
  }
  if (btn) { btn.disabled = false; btn.textContent = '📝 旅行記生成'; }
}

async function handleFiles(files, appendMode = false) {
  if (!files?.length) return;
  if (!isEditor()) {
    setStatus('アップロードするにはログインしてください', true);
    return;
  }
  setStatus('写真を読み込み中…');

  const newPhotos = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const p = await loadPhotoWithExif(file);
    newPhotos.push(p);
  }

  if (appendMode && currentTripId) {
    photos.push(...newPhotos);
    // 既存トリップへの追加時は後ろにそのまま追加（GPX順ソートしない）
  } else {
    photos = newPhotos;
    sortPhotosByGpxOrder();
  }
  setStatus('地名を取得中…');
  await fetchPlaceNamesForPhotos();

  const withGps = photos.filter(p => p.lat != null && p.lng != null);

  document.getElementById('playBtn').disabled = withGps.length === 0;
  updateSaveButtonState();
  renderAllPhotosStrip();
  addPhotoMarkers();
  fitMapToFullExtent();
  document.getElementById('allPhotosThumbnails')?.classList.remove('visible');
  await renderPublicTripsPanel();

  if (withGps.length > 0) {
    const idx = photos.findIndex(p => p.lat != null);
    showPhotoWithPopup(idx);
    setStatus(appendMode ? `${newPhotos.length}件を追加しました。` : `${newPhotos.length}件の写真を読み込みました（${withGps.length}件にGPS・地名あり）。`);
  } else {
    setStatus(appendMode ? `${newPhotos.length}件を追加しました（GPSなしの写真は地図に表示されません）。` : '読み込んだ写真にGPS情報が含まれていません。スマートフォンで撮影した写真をご利用ください。', !appendMode);
  }
  if (appendMode && currentTripId) autoSaveTrip();
}

function parseGpx(file) {
  if (!isEditor()) {
    setStatus('GPXをアップロードするにはログインしてください', true);
    return Promise.reject(new Error('ログインが必要です'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const xml = reader.result;
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        const err = doc.querySelector('parsererror');
        if (err) throw new Error('GPXの解析に失敗しました');

        const route = [];
        doc.querySelectorAll('trkpt, rtept, wpt').forEach(pt => {
          const lat = parseFloat(pt.getAttribute('lat'));
          const lon = parseFloat(pt.getAttribute('lon'));
          if (!isNaN(lat) && !isNaN(lon)) route.push([lat, lon]);
        });

        gpxData = xml;
        gpxTrackPoints = parseGpxTrackPoints(xml);
        assignGpxDataToPhotos();

        const line = createStyledRouteLayer(route);
        if (gpxLayer) map.removeLayer(gpxLayer);
        gpxLayer = line;
        if (line && route.length >= 2) {
          line.addTo(map);
          map.fitBounds(L.latLngBounds(route), { padding: [20, 20] });
        }
        sortPhotosByGpxOrder();
        renderAllPhotosStrip();
        addPhotoMarkers();
        updateTripInfoDisplay();
        setStatus('GPXルートを地図に追加しました。写真をGPX順に並べ替えました。');
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsText(file);
  });
}

function applyGpxToMap(xml) {
  if (!xml || !map) return;
  try {
    gpxTrackPoints = parseGpxTrackPoints(xml);
    assignGpxDataToPhotos();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const route = [];
    doc.querySelectorAll('trkpt, rtept, wpt').forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lon)) route.push([lat, lon]);
    });
    if (route.length >= 2) {
      const color = _currentTripColor || ROUTE_STYLE.main.color;
      const line = createStyledRouteLayerWithColor(route, color);
      if (gpxLayer) map.removeLayer(gpxLayer);
      gpxLayer = line;
      if (line) {
        line.addTo(map);
        map.fitBounds(L.latLngBounds(route), { padding: [20, 20] });
      }
    }
  } catch (_) {}
}

let _autoSaveTimer = null;

/** 既存トリップの変更を自動保存（currentTripId がある時のみ） */
async function autoSaveTrip() {
  if (!isEditor() || !currentTripId) return;
  const name = document.getElementById('tripNameInput')?.value?.trim();
  if (!name || photos.length === 0) return;
  if (await isTripNameDuplicate(name, currentTripId)) return;

  const storedPhotos = (await Promise.all(photos.map(async (p) => {
    let data = null;
    let mime = 'image/jpeg';
    if (p.file) {
      const enc = await resizeImageToBase64(p.file, DB_PHOTO_MAX_DIM, DB_PHOTO_MAX_DIM, DB_PHOTO_QUALITY);
      if (enc) { data = enc.data; mime = enc.mime; }
    } else if (p.data) {
      try {
        const enc = await resizeBase64ToBase64(p.mime || 'image/jpeg', p.data, DB_PHOTO_MAX_DIM, DB_PHOTO_MAX_DIM, DB_PHOTO_QUALITY);
        if (enc) { data = enc.data; mime = enc.mime; }
        else { data = p.data; mime = p.mime || 'image/jpeg'; }
      } catch (_) {
        data = p.data;
        mime = p.mime || 'image/jpeg';
      }
    }
    if (data) {
      // photoUrl は外部リンクURL、p.url（blob:）はDBに保存しない
      return buildMinimalPhotoForDB({ ...p, data, mime, url: p.photoUrl });
    }
    if (p.lat != null && p.lng != null) {
      return buildMinimalPointForDB(p);
    }
    return null;
  }))).filter(Boolean);
  if (storedPhotos.length === 0) return;

  const existing = currentTripId ? await getTripById(currentTripId) : null;
  const tripColor = document.getElementById('tripColorInput')?.value || null;
  let tripDate = existing?.tripDate;
  if (!existing?.isParent) {
    const tripDateVal = document.getElementById('tripDateInput')?.value?.trim();
    if (tripDateVal) {
      const t = new Date(tripDateVal).getTime();
      if (!isNaN(t)) tripDate = t;
    }
  }
  const trip = {
    id: currentTripId,
    name,
    description: document.getElementById('tripDescInput')?.value?.trim() || null,
    url: document.getElementById('tripUrlInput')?.value?.trim() || null,
    videoUrl: document.getElementById('tripVideoUrlInput')?.value?.trim() || null,
    public: document.getElementById('tripPublicInput')?.checked ?? false,
    color: tripColor || undefined,
    isParent: existing?.isParent ?? false,
    parentTripId: existing?.parentTripId ?? null,
    tripDate: existing?.isParent ? undefined : (tripDate ?? undefined),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    photos: storedPhotos,
    gpxData: gpxData || existing?.gpxData || null,
    thumbnailSource: existing?.thumbnailSource ?? undefined,
  };
  try {
    await saveTripWithOfflineSupport(trip);
    photos.forEach((p, i) => { p._dbIndex = i; });
    setStatus('自動保存しました');
    setTimeout(() => setStatus(''), 1500);
    refreshTripList().then(() => Promise.all([renderPublicTripsPanel(), renderTripListPanel()]));
  } catch (_) {}
}

function scheduleAutoSave() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => autoSaveTrip(), 1500);
}

async function saveTrip(opts = {}) {
  if (!isEditor()) {
    setStatus('保存するにはログインしてください', true);
    return false;
  }
  let name = document.getElementById('tripNameInput').value.trim();
  if (!name) {
    name = 'トリップ';
    document.getElementById('tripNameInput').value = name;
  }
  if (await isTripNameDuplicate(name, currentTripId || undefined)) {
    setStatus(`「${escapeHtml(name)}」は既に使用されています。トリップ名を変更してください。`, true);
    return false;
  }
  const isParent = document.getElementById('tripParentInput')?.checked ?? false;
  const parentTripId = document.getElementById('tripParentSelect')?.value?.trim() || null;
  if (isParent && photos.length > 0 && !confirm('親トリップには写真を保存できません。写真は破棄されます。続行しますか？')) {
    return false;
  }
  if (!isParent && photos.length === 0) {
    setStatus('写真またはポイントを追加するか、「親トリップ」にチェックを入れてください', true);
    return false;
  }
  if (!currentTripId && !isNewTrip) {
    isNewTrip = true;
  }

  setStatus('保存中…');

  let storedPhotos = [];
  if (!isParent) {
  storedPhotos = await Promise.all(photos.map(async (p) => {
    let data = null;
    let mime = 'image/jpeg';
    if (p.file) {
      let enc = await resizeImageToBase64(p.file, DB_PHOTO_MAX_DIM, DB_PHOTO_MAX_DIM, DB_PHOTO_QUALITY);
      if (!enc) {
        const raw = await fileToBase64(p.file);
        if (raw) { enc = raw; }
      }
      if (enc) { data = enc.data; mime = enc.mime || 'image/jpeg'; }
    } else if (p.data) {
      try {
        const enc = await resizeBase64ToBase64(p.mime || 'image/jpeg', p.data, DB_PHOTO_MAX_DIM, DB_PHOTO_MAX_DIM, DB_PHOTO_QUALITY);
        if (enc) { data = enc.data; mime = enc.mime; }
        else { data = p.data; mime = p.mime || 'image/jpeg'; }
      } catch (_) {
        data = p.data;
        mime = p.mime || 'image/jpeg';
      }
    }
    if (data) {
      // photoUrl は外部リンクURL、p.url（blob:）はDBに保存しない
      return buildMinimalPhotoForDB({ ...p, data, mime, url: p.photoUrl });
    }
    if (p.lat != null && p.lng != null) {
      return buildMinimalPointForDB(p);
    }
    return null;
  })).then(arr => {
    const filtered = arr.filter(Boolean);
    if (filtered.length !== arr.length) {
      console.warn('保存: 処理できなかった写真をスキップしました', arr.length - filtered.length, '件');
    }
    return filtered;
  });
  }

  if (!isParent && storedPhotos.length === 0) {
    setStatus('写真またはポイントを追加してください。', true);
    return false;
  }

  const description = document.getElementById('tripDescInput').value.trim() || null;
  const tripUrl = document.getElementById('tripUrlInput').value.trim() || null;
  const tripVideoUrl = document.getElementById('tripVideoUrlInput')?.value?.trim() || null;
  const isPublic = document.getElementById('tripPublicInput').checked;
  const id = currentTripId || 'trip_' + Date.now();
  const existing = currentTripId ? await getTripById(id) : null;
  const tripColor = document.getElementById('tripColorInput')?.value || null;
  let tripDate = null;
  if (!isParent) {
    const tripDateVal = document.getElementById('tripDateInput')?.value?.trim();
    if (tripDateVal) {
      const t = new Date(tripDateVal).getTime();
      if (!isNaN(t)) tripDate = t;
    }
  }

  const trip = {
    id,
    name,
    description,
    url: tripUrl,
    videoUrl: tripVideoUrl,
    public: isPublic,
    color: tripColor || undefined,
    isParent: isParent || false,
    parentTripId: isParent ? null : (parentTripId || null),
    tripDate: isParent ? undefined : (tripDate ?? existing?.tripDate ?? undefined),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    photos: storedPhotos,
    gpxData: isParent ? null : (gpxData || existing?.gpxData || null),
    thumbnailSource: isParent ? (existing?.thumbnailSource ?? undefined) : undefined,
  };

  try {
    await saveTripWithOfflineSupport(trip);
  } catch (err) {
    // IndexedDB への保存エラー（深刻）
    console.error('保存エラー:', err);
    const errMsg = err.name === 'QuotaExceededError'
      ? 'ストレージ容量が不足しています。古いトリップを削除してください。'
      : (formatFirestoreError(err) || err.message || '保存に失敗しました');
    setStatus(errMsg, true);
    return false;
  }
  // 保存後、メモリ上の photos を保存結果で完全に同期（表示が正しくなるよう）
  photos.forEach((p) => {
    if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
  });
  photos = storedPhotos.map((s, i) => ({
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    placeName: s.placeName || null,
    landmarkNo: toLandmarkValue(s.landmarkNo),
    landmarkName: toLandmarkValue(s.landmarkName),
    description: s.description || null,
    photoUrl: s.url || null,
    url: s.data ? base64ToUrl(s.mime || 'image/jpeg', s.data) : null,
    data: s.data,
    mime: s.mime || 'image/jpeg',
    _dbIndex: i,
  }));
  if (currentIndex >= photos.length) currentIndex = Math.max(0, photos.length - 1);
  currentTripId = id;
  isNewTrip = false;
  removeFromDeletedTripIds(id);
  document.getElementById('tripNameInput').value = name;
  document.getElementById('tripUrlInput').value = tripUrl || '';
  const tripVideoUrlInput = document.getElementById('tripVideoUrlInput');
  if (tripVideoUrlInput) tripVideoUrlInput.value = tripVideoUrl || '';
  document.getElementById('tripPublicInput').checked = isPublic;
  const parentInput = document.getElementById('tripParentInput');
  const parentSelect = document.getElementById('tripParentSelect');
  const parentSelectWrap = document.getElementById('tripParentSelectWrap');
  if (parentInput) parentInput.checked = isParent;
  if (parentSelect) parentSelect.value = parentTripId || '';
  await refreshTripParentSelectOptions();
  if (parentSelectWrap) parentSelectWrap.style.display = isParent ? 'none' : '';
  const colorInput = document.getElementById('tripColorInput');
  if (colorInput) colorInput.value = tripColor || PUBLIC_TRIP_COLORS[0];
  await updateTripInfoDisplay(trip);
  addPhotoMarkers();
  renderAllPhotosStrip();
  if (photos.length > 0) showPhoto(currentIndex, { popupOnly: true });
  await refreshTripList();
  await renderPublicTripsPanel();
  await renderTripListPanel();
  setStatus(`「${name}」を保存しました`);
  if (isEditor() && !opts?.skipOpenTripList) openTripListPanel();
  return true;
}

async function loadTrip() {
  cancelAddPointMode();
  let id = document.getElementById('tripSelect').value;
  if (!id) {
    setStatus('トリップを選択してください', true);
    return;
  }
  if (id === '_other') {
    const allTrips = await getMergedTrips();
    const myTrips = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
    const parentIds = new Set(myTrips.map(t => t.id));
    const orphan = myTrips.find(t => t.parentTripId && !parentIds.has(t.parentTripId));
    if (orphan) id = orphan.id;
    else {
      setStatus('その他にトリップがありません', true);
      return;
    }
  }

  let trip = null;
  let isPublicTrip = false;
  let isFirestoreTrip = false;
  if (id.startsWith('public_')) {
    const origId = id.slice(7);
    trip = publicTrips.find(t => t.id === origId) || publicTrips.find(t => t.id === id);
    isPublicTrip = !!trip;
  }
  if (!trip) {
    trip = await getTripById(id);
    isFirestoreTrip = !!trip && trip._fromFirestore;
  }
  if (!trip) {
    setStatus('トリップが見つかりません', true);
    return;
  }
  if (!isPublicTrip && !trip.color) {
    trip.color = getTripColor(trip);
    saveTripToDB(trip).catch(() => {});
  }

  if (isPublicTrip) currentTripId = null;
  else currentTripId = id;
  isNewTrip = false;
  _showTripListInPanel = false;
  _currentViewingTripId = id;

  photos.forEach(p => {
    if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
  });

  document.getElementById('tripNameInput').value = trip.name;
  document.getElementById('tripDescInput').value = trip.description || '';
  document.getElementById('tripUrlInput').value = trip.url || '';
  const tripVideoUrlInput = document.getElementById('tripVideoUrlInput');
  if (tripVideoUrlInput) tripVideoUrlInput.value = trip.videoUrl || '';
  const publicInput = document.getElementById('tripPublicInput');
  if (publicInput) publicInput.checked = !!trip.public;
  const parentInput = document.getElementById('tripParentInput');
  const parentSelect = document.getElementById('tripParentSelect');
  const parentSelectWrap = document.getElementById('tripParentSelectWrap');
  const isParent = !!trip.isParent;
  if (parentInput) parentInput.checked = isParent;
  if (parentSelect) parentSelect.value = trip.parentTripId || '';
  refreshTripParentSelectOptions();
  if (parentSelectWrap) parentSelectWrap.style.display = isParent ? 'none' : '';
  const childrenWrap = document.getElementById('tripParentChildrenWrap');
  if (childrenWrap) childrenWrap.style.display = isParent && isEditor() ? '' : 'none';
  if (isParent && isEditor()) renderParentTripChildren(trip.id);
  const colorInput = document.getElementById('tripColorInput');
  if (colorInput) colorInput.value = trip.color || getTripColor(trip);
  _currentTripColor = trip.color || getTripColor(trip);

  photos = (trip.photos || []).map((p, i) => ({
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    placeName: p.placeName || null,
    landmarkNo: toLandmarkValue(p.landmarkNo),
    landmarkName: toLandmarkValue(p.landmarkName),
    description: p.description || null,
    photoUrl: p.url || null,
    url: p.data ? base64ToUrl(p.mime, p.data) : null,
    data: p.data,
    mime: p.mime,
    _dbIndex: i,
  }));

  gpxData = trip.gpxData || null;
  gpxTrackPoints = [];
  sortPhotosByGpxOrder();
  if (gpxLayer) {
    map.removeLayer(gpxLayer);
    gpxLayer = null;
  }
  if (gpxData) {
    applyGpxToMap(gpxData);
  } else {
    photos.forEach(p => { delete p.gpxData; });
  }

  const withGps = photos.filter(p => p.lat != null && p.lng != null);
  setPlayStopDisabled(withGps.length === 0);
  if (isPublicTrip) {
    document.getElementById('deleteTripBtn').disabled = true;
  } else {
    document.getElementById('deleteTripBtn').disabled = false;
    document.getElementById('appendHint').style.display = trip.isParent ? 'none' : 'block';
  }

  renderAllPhotosStrip();
  if (trip.isParent && photos.length === 0) {
    await addParentTripChildMarkers(trip.id);
  } else {
    addPhotoMarkers();
  }
  await renderPublicTripsPanel();

  if (map) setMapToOsm();

  fitMapToFullExtent();
  if (photos.length > 0) {
    showPhoto(0, { popupOnly: true, skipMapZoom: true });
  }
  document.getElementById('allPhotosThumbnails')?.classList.remove('visible');
  await updateTripInfoDisplay(trip);
  const needGeocode = photos.some(p => p.lat != null && !p.placeName);
  if (needGeocode) {
    setStatus('地名を取得中…');
    fetchPlaceNamesForPhotos().then(() => {
      if (_currentViewingTripId !== id) return;
      updateTripInfoDisplay(trip);
      if (photos[currentIndex]) showPhoto(currentIndex, { popupOnly: true, skipMapZoom: true });
      setStatus(`「${trip.name}」を読み込みました。${isPublicTrip ? '' : '写真・ポイントを追加できます。'}`);
    }).catch(() => {});
  }
  updateSaveButtonState();
  document.body.classList.toggle('parent-trip-view', !!(trip?.isParent && photos.length === 0));
  setStatus(`「${trip.name}」を読み込みました。${isPublicTrip ? '' : '写真・ポイントを追加できます。'}`);
}

async function loadTripAndShowPhoto(tripId, photoIndex) {
  cancelAddPointMode();
  if (tripId === '_other') {
    const allTrips = await getMergedTrips();
    const myTrips = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
    const parentIds = new Set(myTrips.map(t => t.id));
    const orphan = myTrips.find(t => t.parentTripId && !parentIds.has(t.parentTripId));
    if (orphan) tripId = orphan.id;
    else {
      setStatus('その他にトリップがありません', true);
      return;
    }
  }
  let trip = null;
  if (tripId.startsWith('public_')) {
    const origId = tripId.slice(7);
    trip = publicTrips.find(t => t.id === origId) || publicTrips.find(t => t.id === tripId);
    if (!trip) trip = await getTripById(origId);
  }
  if (!trip) trip = await getTripById(tripId);
  if (!trip) return;

  if (tripId.startsWith('public_')) currentTripId = null;
  else currentTripId = tripId;
  isNewTrip = false;
  _showTripListInPanel = false;
  // モバイルのセクション選択状態は保持（戻る時に元のトリップ一覧に戻るため）
  _currentViewingTripId = tripId;

  photos.forEach(p => {
    if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
  });

  document.getElementById('tripNameInput').value = trip.name;
    document.getElementById('tripDescInput').value = trip.description || '';
    document.getElementById('tripUrlInput').value = trip.url || '';
    const tripVideoUrlInput2 = document.getElementById('tripVideoUrlInput');
    if (tripVideoUrlInput2) tripVideoUrlInput2.value = trip.videoUrl || '';
    const publicInput2 = document.getElementById('tripPublicInput');
  if (publicInput2) publicInput2.checked = !!trip.public;
  const colorInput2 = document.getElementById('tripColorInput');
  if (colorInput2) colorInput2.value = trip.color || getTripColor(trip);
  _currentTripColor = trip.color || getTripColor(trip);

  photos = (trip.photos || []).map((p, i) => ({
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    placeName: p.placeName || null,
    landmarkNo: toLandmarkValue(p.landmarkNo),
    landmarkName: toLandmarkValue(p.landmarkName),
    description: p.description || null,
    photoUrl: p.url || null,
    url: p.data ? base64ToUrl(p.mime, p.data) : null,
    data: p.data,
    mime: p.mime,
    _dbIndex: i,
  }));

  gpxData = trip.gpxData || null;
  gpxTrackPoints = [];
  sortPhotosByGpxOrder();
  if (gpxLayer) {
    map.removeLayer(gpxLayer);
    gpxLayer = null;
  }
  if (gpxData) {
    applyGpxToMap(gpxData);
  } else {
    photos.forEach(p => { delete p.gpxData; });
  }

  const withGps = photos.filter(p => p.lat != null && p.lng != null);
  setPlayStopDisabled(withGps.length === 0);
  if (isEditor()) {
    const parentInput2 = document.getElementById('tripParentInput');
    const parentSelect2 = document.getElementById('tripParentSelect');
    const parentSelectWrap2 = document.getElementById('tripParentSelectWrap');
    const childrenWrap2 = document.getElementById('tripParentChildrenWrap');
    if (parentInput2) parentInput2.checked = !!trip.isParent;
    if (parentSelect2) parentSelect2.value = trip.parentTripId || '';
    if (parentSelectWrap2) parentSelectWrap2.style.display = trip.isParent ? 'none' : '';
    if (childrenWrap2) childrenWrap2.style.display = trip.isParent ? '' : 'none';
    if (trip.isParent) renderParentTripChildren(trip.id);
    document.getElementById('appendHint').style.display = trip.isParent ? 'none' : 'block';
    const tripDateField = document.getElementById('tripDateField');
    const tripDateInput = document.getElementById('tripDateInput');
    const tripDateHint = document.getElementById('tripDateHint');
    if (tripDateField && tripDateInput) {
      tripDateField.style.display = trip.isParent ? 'none' : '';
      if (!trip.isParent) {
        let val = '';
        if (trip.tripDate != null) {
          val = formatTimestampForDatetimeLocal(typeof trip.tripDate === 'number' ? trip.tripDate : new Date(trip.tripDate).getTime());
        } else {
          const gpsTs = getTripGpsOrPhotoDateTimestamp(trip);
          if (gpsTs !== Infinity) val = formatTimestampForDatetimeLocal(gpsTs);
        }
        tripDateInput.value = val;
        if (tripDateHint) tripDateHint.textContent = val ? '（GPS/写真から取得。編集可）' : 'GPS情報がない場合は入力してください';
      }
    }
  }
  if (tripId.startsWith('public_')) {
    document.getElementById('deleteTripBtn').disabled = true;
  } else if (isEditor()) {
    document.getElementById('deleteTripBtn').disabled = false;
  }
  refreshTripParentSelectOptions();
  updateSaveButtonState();

  renderAllPhotosStrip();
  if (trip.isParent && photos.length === 0) {
    const parentId = tripId.startsWith('public_') ? tripId.slice(7) : tripId;
    await addParentTripChildMarkers(parentId);
  } else {
    addPhotoMarkers();
  }
  _lastLoadedTripForMenu = trip;
  await renderPublicTripsPanel();

  if (map) setMapToOsm();

  const idx = Math.min(photoIndex, photos.length - 1);
  if (photos.length > 0) {
    fitMapToFullExtent();
    if (idx >= 0) showPhoto(idx, { popupOnly: true, skipMapZoom: true });
  }
  document.getElementById('allPhotosThumbnails')?.classList.remove('visible');
  await updateTripInfoDisplay(trip);
  const needGeocode = photos.some(p => p.lat != null && !p.placeName);
  if (needGeocode) {
    setStatus('地名を取得中…');
    fetchPlaceNamesForPhotos().then(() => {
      if (_currentViewingTripId !== tripId) return;
      updateTripInfoDisplay(trip);
      if (photos[currentIndex]) showPhoto(currentIndex, { popupOnly: true, skipMapZoom: true });
      setStatus(`「${trip.name}」を読み込みました。${tripId.startsWith('public_') ? '' : '写真・ポイントを追加できます。'}`);
    }).catch(() => {});
  }
  updateSaveButtonState();
  closeTripListPanel();
  document.getElementById('tripSelect').value = tripId;
  document.body.classList.toggle('parent-trip-view', !!(trip?.isParent && photos.length === 0));
  setStatus(`「${trip.name}」を読み込みました。${tripId.startsWith('public_') ? '' : '写真・ポイントを追加できます。'}`);
}

async function updateTripInfoDisplay(trip) {
  _lastTripForDisplay = trip;
  _lastTripChildrenCount = 0;
  const tripColor = trip ? (trip.color || getTripColor(trip)) : null;
  document.body.style.setProperty('--trip-accent', tripColor || '');

  const nameEl = document.getElementById('tripInfoName');
  const metaEl = document.getElementById('tripInfoMeta');
  const tripNameNav = document.getElementById('tripNameNav');
  const metaRow = document.getElementById('tripInfoMetaRow');
  const mapOverlay = document.getElementById('mapTripNameOverlay');
  const name = trip?.name ?? document.getElementById('tripNameInput')?.value?.trim();
  const hasPhotos = photos.length > 0;
  let childrenCount = 0;
  if (trip?.isParent) {
    const allTrips = await getMergedTrips();
    const myTrips = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
    childrenCount = myTrips.filter(t => t.parentTripId === trip.id).length;
    _lastTripChildrenCount = childrenCount;
  }
  const showNav = name || hasPhotos || (trip?.isParent && childrenCount > 0);
  document.body.classList.toggle('trip-selected', !!showNav);
  if (!showNav) {
    if (tripNameNav) {
      tripNameNav.style.display = 'none';
      tripNameNav.classList.remove('visible');
    }
    const tripNav = document.getElementById('headerTripNav');
    if (tripNav) tripNav.style.display = 'none';
    const sep = document.getElementById('headerControlsSep');
    if (sep) sep.style.display = 'none';
    if (metaRow) metaRow.style.display = 'none';
    if (nameEl) nameEl.textContent = '';
    if (metaEl) metaEl.innerHTML = '';
    if (mapOverlay) {
      mapOverlay.textContent = '';
      mapOverlay.classList.remove('visible');
    }
    updateHeaderTravelogueButton(null);
    updateHeaderAnimeButton(null);
    return;
  }
  if (tripNameNav) {
    tripNameNav.style.display = '';
    tripNameNav.classList.add('visible');
  }
  if (isMobileView()) updateHeaderTripNav(trip);
  const sep = document.getElementById('headerControlsSep');
  if (sep) sep.style.display = '';
  let countText;
  if (trip?.isParent && !hasPhotos) {
    countText = `子トリップ（${childrenCount}件）`;
    if (name && !isMobileView()) countText = `${name}（${childrenCount}件）`;
    else if (name && isMobileView()) countText = String(name).slice(0, 4) + (childrenCount > 0 ? `（${childrenCount}）` : '');
  } else {
    countText = isMobileView()
      ? (hasPhotos && name ? String(name).slice(0, 4) : hasPhotos ? `写真（${photos.length}枚）` : (name ? String(name).slice(0, 4) : 'トリップ'))
      : (hasPhotos ? `写真（${photos.length}枚）` : (name || 'トリップ'));
  }
  if (nameEl) nameEl.textContent = countText;
  if (tripNameNav) {
    tripNameNav.style.display = '';
    nameEl?.classList.toggle('trip-name-clickable', hasPhotos);
    if (nameEl) {
      nameEl.style.cursor = hasPhotos ? 'pointer' : '';
      nameEl.title = hasPhotos ? 'クリックでサムネイルの表示・非表示を切り替え' : '';
      nameEl.onclick = hasPhotos ? () => {
        fitMapToFullExtent();
        toggleAllPhotosThumbnails();
      } : null;
    }
  }
  const desc = trip?.description ?? document.getElementById('tripDescInput')?.value?.trim();
  const url = trip?.url ?? document.getElementById('tripUrlInput')?.value?.trim();
  const parts = [];
  if (name && (photos.length > 0 || (trip?.isParent && childrenCount > 0))) {
    const suffix = trip?.isParent && !hasPhotos ? `（子トリップ${childrenCount}件）` : '';
    parts.push(`<span class="trip-meta-name">${escapeHtml(name)}${suffix}</span>`);
  }
  if (desc || url) {
    let descPart = '';
    const descText = desc ? (desc.length > 40 ? desc.slice(0, 40) + '…' : desc) : '';
    if (descText) {
      descPart = `<span class="trip-meta-desc" title="${escapeHtml(desc)}">${escapeHtml(descText)}</span>`;
    }
    if (url) {
      const linkPart = `<a href="${escapeHtml(url)}" class="trip-meta-detail-link" target="_blank" rel="noopener noreferrer" title="リンクを開く">[旅ブログ]</a>`;
      descPart = descPart ? descPart + ' ' + linkPart : linkPart;
    }
    if (descPart) parts.push(descPart);
  }
  const gpxSummary = getGpxSummary();
  const distKm = gpxSummary?.distanceKm ?? getRouteDistanceKm();
  if (gpxSummary?.dateStr) {
    parts.push(`<span class="trip-meta-date">${escapeHtml(gpxSummary.dateStr)}</span>`);
  }
  if (distKm != null) {
    const distStr = distKm < 1 ? (distKm * 1000).toFixed(0) + ' m' : distKm.toFixed(1) + ' km';
    const speedStr = gpxSummary?.avgSpeedKmh != null ? `（${formatSpeed(gpxSummary.avgSpeedKmh)}）` : '';
    parts.push(`<span class="trip-meta-dist">${distStr}${speedStr}</span>`);
  }
  if (metaEl) metaEl.innerHTML = parts.join(' ');
  if (metaRow) metaRow.style.display = parts.length > 0 ? 'block' : 'none';

  if (mapOverlay && name) {
    mapOverlay.textContent = name;
    mapOverlay.classList.add('visible');
    mapOverlay.title = 'タップでトリップのスタート画面に戻る';
    mapOverlay.onclick = () => {
      if (isPlaying) {
        stopPlay();
        document.getElementById('playPhotoOverlay')?.classList.remove('visible');
      }
      if (map) map.closePopup();
      currentIndex = 0;
      showPhoto(0, { popupOnly: true, skipMapZoom: true });
      fitMapToFullExtent();
    };
  } else if (mapOverlay) {
    mapOverlay.textContent = '';
    mapOverlay.classList.remove('visible');
    mapOverlay.title = '';
    mapOverlay.onclick = null;
  }

  const gpxInfoEl = document.getElementById('tripGpxInfo');
  if (gpxInfoEl) {
    const gs = getGpxSummary();
    if (gs && (gs.dateStr || gs.durationHours != null || gs.distanceKm != null || gs.avgSpeedKmh != null)) {
      const p = [];
      if (gs.dateStr) p.push(escapeHtml(gs.dateStr));
      const durationStr = formatDuration(gs.durationHours);
      if (durationStr) p.push(`時間 ${durationStr}`);
      if (gs.distanceKm != null) {
        const distStr = gs.distanceKm < 1 ? (gs.distanceKm * 1000).toFixed(0) + ' m' : gs.distanceKm.toFixed(1) + ' km';
        p.push(`距離 ${distStr}`);
      }
      if (gs.avgSpeedKmh != null) p.push(`時速 ${formatSpeed(gs.avgSpeedKmh)}`);
      gpxInfoEl.textContent = p.join('  ·  ');
      gpxInfoEl.style.display = 'block';
    } else {
      gpxInfoEl.textContent = '';
      gpxInfoEl.style.display = 'none';
    }
  }
  updateHeaderTravelogueButton(trip);
  updateHeaderAnimeButton(trip);
}

/** 旅行記を開く（ヘッダー・メニューボタン用） */
async function openTravelogueForCurrentTrip() {
  const tripId = _currentViewingTripId || currentTripId;
  if (!tripId) return;
  const rawTripId = tripId.startsWith('public_') ? tripId.slice(7) : tripId;
  let trip = null;
  if (tripId.startsWith('public_')) {
    trip = publicTrips.find(t => t.id === rawTripId || t.id === tripId);
  } else {
    trip = await getTripById(rawTripId);
  }
  let htmlContent = trip?.travelogueHtml ||
    ((_lastTravelogueTripId === tripId || _lastTravelogueTripId === rawTripId) ? _lastTravelogueHtmlContent : null);
  if (!htmlContent) htmlContent = await loadTravelogueHtmlFromDB(rawTripId);
  if (htmlContent) {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    openUrlInPopupOrModal(blobUrl, '旅行記');
  } else {
    setStatus('旅行記を開けません。再度「旅行記生成」してください。', true);
  }
}

/** ヘッダー・メニューの旅行記ボタン表示制御（旅行記がある時のみ表示） */
function updateHeaderTravelogueButton(tripOrNull) {
  const headerBtn = document.getElementById('headerTravelogueBtn');
  const menuBtn = document.getElementById('menuTravelogueBtn');
  const tripId = _currentViewingTripId || currentTripId;
  const rawTripId = tripId?.startsWith('public_') ? tripId.slice(7) : tripId;
  const travelogueInfo = getTravelogueInfo(tripId) || getTravelogueInfo(rawTripId);
  const embeddedTravelogue = tripOrNull?.travelogueHtml;
  const hasLink = travelogueInfo || !!embeddedTravelogue || (_lastTravelogueTripId === tripId && _lastTravelogueHtmlContent) || (_lastTravelogueTripId === rawTripId && _lastTravelogueHtmlContent);
  if (!hasLink || !tripId) {
    if (headerBtn) { headerBtn.style.display = 'none'; headerBtn.onclick = null; }
    if (menuBtn) { menuBtn.style.display = 'none'; menuBtn.onclick = null; }
    return;
  }
  if (headerBtn) { headerBtn.style.display = ''; headerBtn.title = '旅行記を表示'; headerBtn.onclick = () => openTravelogueForCurrentTrip(); }
  if (menuBtn) { menuBtn.style.display = ''; menuBtn.title = '旅行記を表示'; menuBtn.onclick = () => openTravelogueForCurrentTrip(); }
}

/** 現在のトリップを取得してヘッダー旅行記ボタンを更新（旅行記生成後など） */
async function refreshHeaderTravelogueButton() {
  const tripId = _currentViewingTripId || currentTripId;
  if (!tripId) {
    updateHeaderTravelogueButton(null);
    return;
  }
  let trip = null;
  if (tripId.startsWith('public_')) {
    const origId = tripId.slice(7);
    trip = publicTrips.find(t => t.id === origId || t.id === tripId);
  } else {
    trip = await getTripById(tripId);
  }
  updateHeaderTravelogueButton(trip || null);
}

/** ヘッダーのアニメボタン表示制御（アニメがある時のみ表示） */
async function updateHeaderTripNav(trip) {
  const tripNav = document.getElementById('headerTripNav');
  const prevBtn = document.getElementById('tripPrevBtnHeader');
  const nextBtn = document.getElementById('tripNextBtnHeader');
  if (!tripNav || !prevBtn || !nextBtn || !isMobileView()) return;
  const tripId = currentTripId || trip?.id;
  if (!tripId) {
    tripNav.style.display = 'none';
    return;
  }
  try {
    const groups = await getHomeTripsGrouped();
    const flatTrips = groups.flatMap(g => [g.parent, ...g.children]);
    const normId = (t) => (t._fromServer || t._isPublic ? 'public_' + (t.id || '').replace(/^public_/, '') : (t.id || '').replace(/^public_/, ''));
    const idx = flatTrips.findIndex(t => normId(t) === tripId || t.id === tripId || (t.id || '').replace(/^public_/, '') === (tripId || '').replace(/^public_/, ''));
    if (idx < 0) {
      tripNav.style.display = 'none';
      return;
    }
    tripNav.style.display = '';
    const prevTrip = idx > 0 ? flatTrips[idx - 1] : null;
    const nextTrip = idx < flatTrips.length - 1 ? flatTrips[idx + 1] : null;
    prevBtn.disabled = !prevTrip;
    nextBtn.disabled = !nextTrip;
    prevBtn.onclick = prevTrip ? () => loadTripAndShowPhoto(normId(prevTrip), 0) : null;
    nextBtn.onclick = nextTrip ? () => loadTripAndShowPhoto(normId(nextTrip), 0) : null;
  } catch (_) {
    tripNav.style.display = 'none';
  }
}

async function updateHeaderAnimeButton(tripOrNull) {
  const headerBtn = document.getElementById('headerAnimeBtn');
  const menuBtn = document.getElementById('menuAnimeBtn');
  const tripId = _currentViewingTripId || currentTripId;
  const rawTripId = tripId?.startsWith('public_') ? tripId.slice(7) : tripId;
  const hide = () => {
    if (headerBtn) { headerBtn.style.display = 'none'; headerBtn.onclick = null; }
    if (menuBtn) { menuBtn.style.display = 'none'; menuBtn.onclick = null; }
    updateHeaderVideoButton(null);
  };
  if (!tripId || !tripOrNull) {
    hide();
    return;
  }
  try {
    const allItems = await getAnimeAllForTripDisplay(tripId, tripOrNull.animeList);
    if (allItems.length === 0) {
      if (headerBtn) { headerBtn.style.display = 'none'; headerBtn.onclick = null; }
      if (menuBtn) { menuBtn.style.display = 'none'; menuBtn.onclick = null; }
      updateHeaderVideoButton(tripOrNull);
      return;
    }
    const allIds = allItems.map(x => x.id);
    const embeddedAnime = tripOrNull.animeList;
    const onClick = () => openAnimeFromData(allItems[0].id, {
      animeIds: allIds,
      currentIndex: 0,
      animeList: embeddedAnime || allItems
    });
    if (headerBtn) { headerBtn.style.display = ''; headerBtn.title = 'アニメ画像を表示'; headerBtn.onclick = onClick; }
    if (menuBtn) { menuBtn.style.display = ''; menuBtn.title = 'アニメ画像を表示'; menuBtn.onclick = onClick; }
  } catch (_) {
    if (headerBtn) { headerBtn.style.display = 'none'; headerBtn.onclick = null; }
    if (menuBtn) { menuBtn.style.display = 'none'; menuBtn.onclick = null; }
  }
  updateHeaderVideoButton(tripOrNull);
}

/** 動画URLをYouTube/Vimeoのembed用に変換、または直接再生用のURLを返す */
function getVideoEmbedUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  const ytMatch = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;
  const vimeoMatch = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
  return null;
}

/** モバイル：地図エリアで動画を再生するオーバーレイを表示 */
function openMobileVideoOverlay(videoUrl) {
  if (!videoUrl || !isMobileView()) return;
  const overlay = document.getElementById('mobileVideoOverlay');
  const content = document.getElementById('mobileVideoContent');
  const backBtn = document.getElementById('mobileVideoBackBtn');
  if (!overlay || !content || !backBtn) return;
  content.innerHTML = '';
  const embedUrl = getVideoEmbedUrl(videoUrl);
  if (embedUrl) {
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    content.appendChild(iframe);
  } else {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    content.appendChild(video);
  }
  overlay.classList.add('visible');
  backBtn.onclick = closeMobileVideoOverlay;
}

/** モバイル：動画オーバーレイを閉じて地図に戻る */
function closeMobileVideoOverlay() {
  const overlay = document.getElementById('mobileVideoOverlay');
  const content = document.getElementById('mobileVideoContent');
  if (!overlay || !content) return;
  const video = content.querySelector('video');
  if (video) video.pause();
  content.innerHTML = '';
  overlay.classList.remove('visible');
}

/** 動画ボタンクリック時のハンドラ（モバイルは地図エリアで再生、デスクトップは新タブ） */
function openVideo(videoUrl) {
  if (!videoUrl) return;
  if (isMobileView()) {
    openMobileVideoOverlay(videoUrl);
  } else {
    window.open(videoUrl, '_blank', POPUP_FEATURES);
  }
}

/** ヘッダーの動画ボタン表示制御（動画URLがある時のみ表示、アニメボタンの右横） */
function updateHeaderVideoButton(tripOrNull) {
  const headerBtn = document.getElementById('headerVideoBtn');
  const menuBtn = document.getElementById('menuVideoBtn');
  const videoUrl = tripOrNull?.videoUrl?.trim();
  const hide = () => {
    if (headerBtn) { headerBtn.style.display = 'none'; headerBtn.onclick = null; }
    if (menuBtn) { menuBtn.style.display = 'none'; menuBtn.onclick = null; }
  };
  const show = (url) => {
    if (headerBtn) { headerBtn.style.display = ''; headerBtn.title = '動画を表示'; headerBtn.onclick = () => openVideo(url); }
    if (menuBtn) { menuBtn.style.display = ''; menuBtn.title = '動画を表示'; menuBtn.onclick = () => openVideo(url); }
  };
  if (!videoUrl) { hide(); return; }
  show(videoUrl);
}

/** 現在のトリップを取得してヘッダーアニメボタンを更新（アニメ生成後など） */
async function refreshHeaderAnimeButton() {
  const tripId = _currentViewingTripId || currentTripId;
  if (!tripId) {
    updateHeaderAnimeButton(null);
    return;
  }
  let trip = null;
  if (tripId.startsWith('public_')) {
    const origId = tripId.slice(7);
    trip = publicTrips.find(t => t.id === origId) || publicTrips.find(t => t.id === tripId);
  } else {
    trip = await getTripById(tripId);
  }
  updateHeaderAnimeButton(trip || null);
}

function clearCurrentTrip() {
  cancelAddPointMode();
  document.body.classList.remove('parent-trip-view');
  photos.forEach(p => {
    if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
  });
  currentTripId = null;
  isNewTrip = false;
  _currentTripColor = null;
  photos = [];
  _showTripListInPanel = false;
  gpxData = null;
  gpxTrackPoints = [];
  const nameInput = document.getElementById('tripNameInput');
  if (nameInput) {
    nameInput.value = '';
    nameInput.placeholder = 'トリップ名を入力';
  }
  document.getElementById('tripDescInput').value = '';
  document.getElementById('tripUrlInput').value = '';
  const tripVideoUrlInputClear = document.getElementById('tripVideoUrlInput');
  if (tripVideoUrlInputClear) tripVideoUrlInputClear.value = '';
  const publicInputClear = document.getElementById('tripPublicInput');
  if (publicInputClear) publicInputClear.checked = false;
  const parentInputClear = document.getElementById('tripParentInput');
  if (parentInputClear) parentInputClear.checked = false;
  const parentSelectClear = document.getElementById('tripParentSelect');
  if (parentSelectClear) parentSelectClear.value = '';
  const parentSelectWrapEl = document.getElementById('tripParentSelectWrap');
  if (parentSelectWrapEl) parentSelectWrapEl.style.display = ''; /* 親トリップ未選択時は親選択を表示 */
  document.getElementById('tripParentChildrenWrap')?.style.setProperty('display', 'none');
  const tripDateInputClear = document.getElementById('tripDateInput');
  if (tripDateInputClear) tripDateInputClear.value = '';
  document.getElementById('tripDateField')?.style.setProperty('display', 'none');
  const tripDateHintClear = document.getElementById('tripDateHint');
  if (tripDateHintClear) tripDateHintClear.textContent = '';
  refreshTripParentSelectOptions(); /* 親トリップ選択肢を更新 */
  const colorInputClear = document.getElementById('tripColorInput');
  if (colorInputClear) colorInputClear.value = PUBLIC_TRIP_COLORS[0];
  updateTripInfoDisplay(null);
  setPlayStopDisabled(true);
  document.getElementById('deleteTripBtn').disabled = true;
  document.getElementById('appendHint').style.display = 'none';
  if (gpxLayer) {
    map.removeLayer(gpxLayer);
    gpxLayer = null;
  }
  if (map) setMapToOsm();
  renderAllPhotosStrip();
  addPhotoMarkers();
  if (photoPopup && map) {
    map.removeLayer(photoPopup);
    photoPopup = null;
  }
  document.getElementById('playPhotoOverlay')?.classList.remove('visible');
  updatePhotoNav();
  updateSaveButtonState();
  renderPublicTripsPanel();
  setStatus('');
}

const PUBLIC_TRIPS_MAX_SIZE = 100 * 1024 * 1024; // 100MB 超はスキップ（メモリ不足を防ぐ）

/** 静的ファイルからパブリックトリップを読み込む（フォールバック） */
async function loadPublicTripsFromStaticFile() {
  const urls = [
    new URL('data/public-trips.json.gz', window.location.href).href,
    new URL('data/public-trips.json', window.location.href).href,
    new URL('public-trips.json.gz', window.location.href).href,
    new URL('public-trips.json', window.location.href).href,
  ];
  try {
    let res = null;
    for (const url of urls) {
      res = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json, application/gzip' } });
      if (res.ok) break;
    }
    if (!res || !res.ok) {
      console.warn('静的ファイルが見つかりません:', urls.slice(0, 2).join(', '));
      return [];
    }
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    const isGzip = res.url.endsWith('.gz');
    const effectiveSize = isGzip ? contentLength * 4 : contentLength;
    if (effectiveSize > PUBLIC_TRIPS_MAX_SIZE) {
      console.warn('public-trips.json が大きすぎます');
      return [];
    }
    let data;
    if (isGzip) {
      const ds = new DecompressionStream('gzip');
      const decompressed = res.body.pipeThrough(ds);
      const reader = decompressed.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const blob = new Blob(chunks);
      const text = await new Response(blob).text();
      data = JSON.parse(text);
    } else {
      data = await res.json();
    }
    return Array.isArray(data) ? data : (data?.trips || []);
  } catch (err) {
    console.warn('静的ファイルからの読み込みエラー:', err);
    return [];
  }
}

/** パブリックトリップを読み込む
 * デプロイ時: Firestore（クラウド）のみを使用。ローカルでは静的ファイル＋Firestoreを併用 */
async function loadPublicTripsFromServer() {
  try {
    let firestoreTrips = [];
    let staticTrips = [];

    if (window.firebaseDb) {
      try {
        firestoreTrips = await loadPublicTripsFromFirestore();
        console.log(`Firestore: ${firestoreTrips.length}件`);
      } catch (e) {
        console.warn('Firestore 読み込みエラー:', e);
      }
    }

    if (isWebDeployment()) {
      // デプロイ時: クラウド（Firestore）のみを使用。静的ファイルは使わない
      publicTrips = firestoreTrips;
      if (publicTrips.length > 0) {
        console.log(`Firestoreから ${publicTrips.length}件のパブリックトリップを読み込みました（クラウドのみ）`);
      } else {
        if (!isEditor()) setStatus('公開トリップがありません', true);
      }
    } else {
      // ローカル: 静的ファイル＋Firestoreを併用
      staticTrips = await loadPublicTripsFromStaticFile();
      console.log(`静的ファイル: ${staticTrips.length}件`);

      if (staticTrips.length >= firestoreTrips.length && staticTrips.length > 0) {
        publicTrips = staticTrips;
        console.log(`静的ファイルから ${staticTrips.length}件のパブリックトリップを読み込みました`);
      } else if (firestoreTrips.length > 0) {
        publicTrips = firestoreTrips;
        console.log(`Firestoreから ${firestoreTrips.length}件のパブリックトリップを読み込みました`);
      } else {
        publicTrips = staticTrips.length > 0 ? staticTrips : [];
        if (publicTrips.length > 0) {
          console.log(`静的ファイルから ${publicTrips.length}件を読み込みました`);
        } else {
          if (!isEditor()) setStatus('公開トリップがありません', true);
        }
      }
    }

    if (publicTrips.length > 0) {
      await processPublicTripsStamps(publicTrips);
    }
  } catch (err) {
    console.error('パブリックトリップ読み込みエラー:', err);
    publicTrips = [];
    if (!isEditor()) setStatus('公開トリップの読み込みに失敗しました', true);
  }
  await renderPublicTripsPanel();
  if (photos.length === 0) addPublicTripMarkers();
}

/** パブリックトリップのスタンプ写真を処理 */
async function processPublicTripsStamps(trips) {
  const allStamps = getStampPhotos();
  let stampsMerged = false;
  for (const trip of trips) {
    if (trip?.stampPhotos && typeof trip.stampPhotos === 'object' && trip.id) {
      const prefix = 'public_' + trip.id + '_';
      for (const [photoIndex, sp] of Object.entries(trip.stampPhotos)) {
        if (sp?.data) {
          allStamps[prefix + photoIndex] = { data: sp.data, mime: sp.mime || 'image/jpeg' };
          stampsMerged = true;
        }
      }
    }
  }
  if (stampsMerged) localStorage.setItem(STAMP_PHOTOS_KEY, JSON.stringify(allStamps));
}

function getPublicTripConfig() {
  try {
    const raw = localStorage.getItem(PUBLIC_TRIP_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function savePublicTripConfig(config) {
  localStorage.setItem(PUBLIC_TRIP_CONFIG_KEY, JSON.stringify(config));
}

function getMyTripListOrder() {
  try {
    const raw = localStorage.getItem(MY_TRIP_LIST_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_) {
    try { localStorage.removeItem(MY_TRIP_LIST_ORDER_KEY); } catch (_) {}
    return null;
  }
}

function saveMyTripListOrder(config) {
  localStorage.setItem(MY_TRIP_LIST_ORDER_KEY, JSON.stringify(config));
}

function getStampPhotos() {
  try {
    const raw = localStorage.getItem(STAMP_PHOTOS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}
function saveStampPhoto(tripId, photoIndex, { data, mime }) {
  const all = getStampPhotos();
  const key = `${tripId}_${photoIndex}`;
  all[key] = { data, mime };
  localStorage.setItem(STAMP_PHOTOS_KEY, JSON.stringify(all));
}

/** トリップのスタンプラリー状態を取得 [{ text, filled }, ...] */
function getStampStatusForTrip(tripId) {
  const stampPhotos = getStampPhotos();
  const seen = new Set();
  const status = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const no = toLandmarkValue(p.landmarkNo);
    const nm = toLandmarkValue(p.landmarkName);
    const text = [no, nm].filter(Boolean).join(' ');
    if (text && !seen.has(text)) {
      seen.add(text);
      const key = `${tripId}_${i}`;
      status.push({ text, filled: !!stampPhotos[key] });
      if (status.length >= 16) break;
    }
  }
  return status;
}

let _stampUploadTripId = null;
let _stampUploadPhotoIndex = null;

function openStampUploadModal(tripId, photoIndex, stampText) {
  _stampUploadTripId = tripId;
  _stampUploadPhotoIndex = photoIndex;
  const hint = document.getElementById('stampUploadHint');
  const preview = document.getElementById('stampUploadPreview');
  const input = document.getElementById('stampPhotoInput');
  if (hint) hint.textContent = `スタンプ「${stampText}」の写真を選んでください`;
  if (preview) preview.innerHTML = '';
  if (input) input.value = '';
  document.getElementById('stampUploadModal').classList.add('open');
}

function openStampsModal(landmarks, tripId) {
  const content = document.getElementById('stampsModalContent');
  const modal = document.getElementById('stampsModal');
  if (!content || !modal) return;
  content.innerHTML = '';
  content.className = 'stamps-modal-grid trip-menu-stamps-grid';
  const stampPhotos = getStampPhotos();
  landmarks.forEach(({ text, photoIndex }) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'trip-menu-stamp-card';
    const key = `${tripId}_${photoIndex}`;
    const stampPhoto = stampPhotos[key];
    if (stampPhoto) {
      card.classList.add('trip-menu-stamp-card-filled');
      const img = document.createElement('img');
      img.src = base64ToUrl(stampPhoto.mime, stampPhoto.data);
      img.alt = text;
      if (img.src.startsWith('blob:')) _tripMenuUrls.push(img.src);
      const nameOverlay = document.createElement('span');
      nameOverlay.className = 'trip-menu-stamp-name';
      nameOverlay.textContent = text;
      nameOverlay.title = 'クリックで写真を変更';
      const check = document.createElement('span');
      check.className = 'trip-menu-stamp-check';
      check.textContent = '✅';
      check.title = 'クリックで写真を変更';
      const openUpload = (e) => {
        e.stopPropagation();
        if (isEditor()) openStampUploadModal(tripId, photoIndex, text);
        else setStatus('スタンプの写真アップロードにはログインが必要です', true);
      };
      nameOverlay.onclick = openUpload;
      check.onclick = openUpload;
      card.appendChild(img);
      card.appendChild(nameOverlay);
      card.appendChild(check);
      card.title = '写真エリア: 拡大表示 / 名前・✓: 写真を変更';
    } else {
      card.textContent = text;
      card.title = 'クリックで写真をアップロード';
    }
    card.onclick = () => {
      if (stampPhoto) {
        modal.classList.remove('open');
        showPhotoWithPopup(photoIndex);
      } else if (isEditor()) {
        modal.classList.remove('open');
        openStampUploadModal(tripId, photoIndex, text);
      } else {
        setStatus('スタンプの写真アップロードにはログインが必要です', true);
      }
    };
    content.appendChild(card);
  });
  modal.classList.add('open');
}

async function handleStampPhotoUpload(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const enc = await resizeImageToBase64(file, 400, 400, 0.8);
  if (!enc || _stampUploadTripId == null || _stampUploadPhotoIndex == null) return;
  saveStampPhoto(_stampUploadTripId, _stampUploadPhotoIndex, enc);
  document.getElementById('stampUploadModal').classList.remove('open');
  await renderTripMenu();
  setStatus('スタンプに写真を登録しました');
}

let _characterUploadTripId = null;

/** 親トリップのサムネイル選択モーダルを開く（複数選択・並び替え・削除対応） */
async function openParentThumbnailModal(parentId, parentTrip, children) {
  const grid = document.getElementById('parentThumbnailGrid');
  const selectedEl = document.getElementById('parentThumbnailSelected');
  const modal = document.getElementById('parentThumbnailModal');
  if (!grid || !selectedEl || !modal) return;
  grid.innerHTML = '';
  selectedEl.innerHTML = '';

  const animeList = await getAnimeAllForTripDisplay(parentId, parentTrip?.animeList);
  const candidates = [];

  animeList.forEach((a, i) => {
    const thumb = a.thumbnail?.data ? { mime: a.thumbnail.mime || 'image/jpeg', data: a.thumbnail.data }
      : a.coverImage?.data ? { mime: 'image/jpeg', data: a.coverImage.data }
      : a.pageImages?.[0]?.data ? { mime: 'image/jpeg', data: a.pageImages[0].data } : null;
    if (thumb) {
      candidates.push({ type: 'anime', animeId: a.id, thumb, label: a._displayLabel || `アニメ${i + 1}` });
    }
  });

  for (const c of children) {
    const childAnimeList = await getAnimeAllForTripDisplay(c.id, c.animeList);
    childAnimeList.forEach((a, i) => {
      const thumb = a.thumbnail?.data ? { mime: a.thumbnail.mime || 'image/jpeg', data: a.thumbnail.data }
        : a.coverImage?.data ? { mime: 'image/jpeg', data: a.coverImage.data }
        : a.pageImages?.[0]?.data ? { mime: 'image/jpeg', data: a.pageImages[0].data } : null;
      if (thumb) {
        candidates.push({ type: 'anime', animeId: a.id, thumb, label: `${c.name} アニメ${i + 1}` });
      }
    });
  }

  children.forEach((c) => {
    (c.photos || []).slice(0, 5).forEach((p, i) => {
      if (p?.data) {
        candidates.push({
          type: 'photo',
          childId: c.id,
          photoIndex: i,
          thumb: { mime: p.mime || 'image/jpeg', data: p.data },
          label: i === 0 ? c.name : `${c.name} (${i + 1})`
        });
      }
    });
  });

  const srcRaw = parentTrip?.thumbnailSource;
  let selected = Array.isArray(srcRaw) ? [...srcRaw] : (srcRaw ? [srcRaw] : []);

  const toSource = (c) => c.type === 'anime' ? { type: 'anime', animeId: c.animeId } : { type: 'photo', childId: c.childId, photoIndex: c.photoIndex };
  const findCandidate = (src) => candidates.find(c =>
    (src.type === 'anime' && c.type === 'anime' && src.animeId === c.animeId) ||
    (src.type === 'photo' && c.type === 'photo' && src.childId === c.childId && src.photoIndex === c.photoIndex)
  );

  const saveAndRefresh = async () => {
    const trip = await getTripById(parentId);
    if (!trip) return;
    trip.thumbnailSource = selected.length === 0 ? undefined : selected.length === 1 ? selected[0] : selected;
    trip.updatedAt = Date.now();
    await saveTripWithOfflineSupport(trip);
    await renderTripMenu();
    await renderPublicTripsPanel();
    await renderTripListPanel();
  };

  const updateGridButtons = () => {
    candidates.forEach((c, i) => {
      const btn = grid.querySelector(`.parent-thumbnail-option[data-candidate-index="${i}"]`);
      if (!btn) return;
      const alreadyAdded = selected.some(s => findCandidate(s) === c);
      btn.disabled = alreadyAdded;
      btn.classList.toggle('disabled', alreadyAdded);
    });
  };

  const renderSelected = () => {
    selectedEl.innerHTML = '';
    if (selected.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'parent-thumbnail-selected-empty';
      empty.textContent = '選択中のサムネイルはありません。下から選んで追加してください。';
      selectedEl.appendChild(empty);
      return;
    }
    selected.forEach((src, idx) => {
      const c = findCandidate(src);
      if (!c) return;
      const item = document.createElement('div');
      item.className = 'parent-thumbnail-selected-item';
      const img = document.createElement('img');
      img.src = base64ToUrl(c.thumb.mime, c.thumb.data);
      img.alt = c.label;
      const label = document.createElement('span');
      label.className = 'parent-thumbnail-selected-label';
      label.textContent = c.label;
      const btns = document.createElement('div');
      btns.className = 'parent-thumbnail-selected-actions';
      const leftBtn = document.createElement('button');
      leftBtn.type = 'button';
      leftBtn.className = 'parent-thumbnail-order-btn';
      leftBtn.textContent = '←';
      leftBtn.title = '左に移動';
      leftBtn.disabled = idx === 0;
      leftBtn.onclick = () => {
        [selected[idx - 1], selected[idx]] = [selected[idx], selected[idx - 1]];
        renderSelected();
        saveAndRefresh();
      };
      const rightBtn = document.createElement('button');
      rightBtn.type = 'button';
      rightBtn.className = 'parent-thumbnail-order-btn';
      rightBtn.textContent = '→';
      rightBtn.title = '右に移動';
      rightBtn.disabled = idx === selected.length - 1;
      rightBtn.onclick = () => {
        [selected[idx], selected[idx + 1]] = [selected[idx + 1], selected[idx]];
        renderSelected();
        saveAndRefresh();
      };
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'parent-thumbnail-delete-btn';
      delBtn.textContent = '×';
      delBtn.title = '削除';
      delBtn.onclick = async () => {
        selected = selected.filter((_, i) => i !== idx);
        renderSelected();
        await saveAndRefresh();
      };
      btns.appendChild(leftBtn);
      btns.appendChild(rightBtn);
      btns.appendChild(delBtn);
      item.appendChild(img);
      item.appendChild(label);
      item.appendChild(btns);
      selectedEl.appendChild(item);
    });
    updateGridButtons();
    const clearBtn = grid.querySelector('.parent-thumbnail-option[data-default="1"]');
    if (clearBtn) clearBtn.classList.toggle('selected', selected.length === 0);
  };

  renderSelected();

  const addDefaultOption = () => {
    const btn = document.createElement('button');
    btn.dataset.default = '1';
    btn.type = 'button';
    btn.className = 'parent-thumbnail-option' + (selected.length === 0 ? ' selected' : '');
    btn.innerHTML = '<span class="parent-thumbnail-option-label">クリア</span><span class="parent-thumbnail-option-desc">（全て削除）</span>';
    btn.onclick = async () => {
      selected = [];
      renderSelected();
      const trip = await getTripById(parentId);
      if (!trip) return;
      trip.thumbnailSource = undefined;
      trip.updatedAt = Date.now();
      await saveTripWithOfflineSupport(trip);
      modal.classList.remove('open');
      await renderTripMenu();
      await renderPublicTripsPanel();
      await renderTripListPanel();
      setStatus('サムネイルをクリアしました');
    };
    grid.appendChild(btn);
  };

  addDefaultOption();

  candidates.forEach((c, i) => {
    const src = toSource(c);
    const alreadyAdded = selected.some(s => findCandidate(s) === c);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'parent-thumbnail-option' + (alreadyAdded ? ' disabled' : '');
    btn.disabled = alreadyAdded;
    const img = document.createElement('img');
    img.src = base64ToUrl(c.thumb.mime, c.thumb.data);
    img.alt = c.label;
    const label = document.createElement('span');
    label.className = 'parent-thumbnail-option-label';
    label.textContent = c.label;
    btn.appendChild(img);
    btn.appendChild(label);
    btn.onclick = async () => {
      if (alreadyAdded) return;
      selected.push(src);
      renderSelected();
      await saveAndRefresh();
      setStatus('サムネイルを追加しました');
    };
    btn.dataset.candidateIndex = String(i);
    grid.appendChild(btn);
  });

  if (candidates.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'parent-thumbnail-empty';
    empty.textContent = 'アニメや子トリップの写真がありません。アニメを生成するか、子トリップに写真を追加してください。';
    grid.appendChild(empty);
  }

  modal.classList.add('open');
}

function openCharacterUploadModal(tripId) {
  _characterUploadTripId = tripId;
  const preview = document.getElementById('characterUploadPreview');
  const input = document.getElementById('characterPhotoInput');
  if (input) input.value = '';
  const photos = getCharacterPhotos(tripId);
  if (preview) {
    preview.innerHTML = photos.length === 0 ? '' : photos.map((p, i) => {
      const src = p.data ? `data:${p.mime || 'image/jpeg'};base64,${p.data}` : '';
      return `<div class="character-preview-item"><img src="${src}" alt=""><button type="button" class="character-preview-remove" data-index="${i}">×</button></div>`;
    }).join('');
    preview.querySelectorAll('.character-preview-remove').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.index, 10);
        const next = photos.filter((_, i) => i !== idx);
        setCharacterPhotos(tripId, next);
        openCharacterUploadModal(tripId);
      };
    });
  }
  document.getElementById('characterUploadModal').classList.add('open');
}

async function handleCharacterPhotoUpload(files) {
  if (!files?.length || _characterUploadTripId == null) return;
  const tripId = _characterUploadTripId;
  const existing = getCharacterPhotos(tripId);
  const added = [];
  for (let i = 0; i < Math.min(files.length, 5 - existing.length); i++) {
    const f = files[i];
    if (!f?.type?.startsWith('image/')) continue;
    const enc = await resizeImageToBase64(f, 640, 640, 0.85);
    if (enc) added.push({ mime: enc.mime || 'image/jpeg', data: enc.data });
  }
  if (added.length > 0) {
    setCharacterPhotos(tripId, [...existing, ...added]);
    openCharacterUploadModal(tripId);
    setStatus(`メインキャラの写真を${added.length}枚追加しました`);
  }
}

let _publicTripConfigDraft = null;
let _publicTripConfigAllTrips = [];

async function openPublicTripConfigModal() {
  const config = getPublicTripConfig();
  _publicTripConfigDraft = { hiddenTripIds: config?.hiddenTripIds ? [...(config.hiddenTripIds)] : [] };
  _publicTripConfigAllTrips = await getDisplayablePublicTrips(true);
  await renderPublicTripConfigContent();
  document.getElementById('publicTripConfigModal').classList.add('open');
}

async function renderPublicTripConfigContent() {
  const visibilityList = document.getElementById('publicTripConfigVisibilityList');
  if (visibilityList) {
    const hidden = new Set(_publicTripConfigDraft?.hiddenTripIds || []);
    visibilityList.innerHTML = '';
    for (const trip of _publicTripConfigAllTrips || []) {
      const id = trip._fromServer ? 'public_' + trip.id : trip.id;
      const isVisible = !hidden.has(id);
      const label = document.createElement('label');
      label.className = 'public-trip-config-visibility-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isVisible;
      cb.dataset.tripId = id;
      cb.onchange = () => {
        const ids = _publicTripConfigDraft.hiddenTripIds || [];
        if (cb.checked) {
          _publicTripConfigDraft.hiddenTripIds = ids.filter(x => x !== id);
        } else {
          _publicTripConfigDraft.hiddenTripIds = [...ids, id];
        }
      };
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + (trip.name || '（無題）')));
      visibilityList.appendChild(label);
    }
  }

}

async function savePublicTripConfigFromModal() {
  const hiddenTripIds = Array.isArray(_publicTripConfigDraft?.hiddenTripIds) ? _publicTripConfigDraft.hiddenTripIds : [];
  const config = getPublicTripConfig() || {};
  const { sections, ...rest } = config;
  savePublicTripConfig({ ...rest, hiddenTripIds });
  document.getElementById('publicTripConfigModal').classList.remove('open');
  await renderPublicTripsPanel();
  setStatus('公開トリップの表示設定を保存しました');
}

/** サーバー公開 + IndexedDBの公開トリップを結合して返す（ウェブではサーバーのみ、ローカルではローカル保存を優先） */
async function getDisplayablePublicTrips(includeHidden = false) {
  const deletedIds = getDeletedTripIds();
  const serverTrips = publicTrips.filter(t => !deletedIds.has(t.id)).map(t => ({ ...t, _fromServer: true }));
  let dbTrips = [];
  if (!isWebDeployment()) {
    try {
      dbTrips = await loadTripsFromDB() || [];
    } catch (_) {}
  }
  const localPublic = dbTrips.filter(t => t.public && !deletedIds.has(t.id)).map(t => ({ ...t, _fromServer: false }));
  const localById = new Map(localPublic.map(t => [t.id, t]));
  const serverIds = new Set(serverTrips.map(t => t.id));
  const localOnly = localPublic.filter(t => !serverIds.has(t.id));
  const merged = serverTrips.map(t => localById.has(t.id) ? localById.get(t.id) : t);
  let result = [...merged, ...localOnly];

  const config = getPublicTripConfig();
  if (config?.tripOrder && Array.isArray(config.tripOrder)) {
    const orderMap = new Map(config.tripOrder.map((id, i) => [id.replace(/^public_/, ''), i]));
    result.sort((a, b) => {
      const ai = orderMap.get(a.id);
      const bi = orderMap.get(b.id);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  } else {
    result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  if (!includeHidden && config?.hiddenTripIds && Array.isArray(config.hiddenTripIds)) {
    const hidden = new Set(config.hiddenTripIds);
    config.hiddenTripIds.forEach(id => {
      if (typeof id === 'string' && id.startsWith('public_')) hidden.add(id.slice(7));
      else if (typeof id === 'string') hidden.add('public_' + id);
    });
    result = result.filter(t => !hidden.has(t.id) && !hidden.has(t._fromServer ? 'public_' + t.id : t.id));
  }
  return result;
}

/** GPX/写真のみから日付を取得（tripDateは含めない）。UIの初期表示用 */
function getTripGpsOrPhotoDateTimestamp(trip) {
  let ts = Infinity;
  if (trip?.gpxData) {
    try {
      const doc = new DOMParser().parseFromString(trip.gpxData, 'text/xml');
      const times = [];
      doc.querySelectorAll('trkpt, rtept, wpt').forEach(pt => {
        const timeEl = pt.querySelector('time');
        if (timeEl) {
          const t = new Date(timeEl.textContent.trim()).getTime();
          if (!isNaN(t)) times.push(t);
        }
      });
      if (times.length > 0) ts = Math.min(...times);
    } catch (_) {}
  }
  if (ts === Infinity && trip?.photos?.length) {
    for (const p of trip.photos) {
      const d = p?.date;
      if (!d) continue;
      const t = typeof d === 'number' ? d : (d instanceof Date ? d.getTime() : new Date(d).getTime());
      if (!isNaN(t)) ts = Math.min(ts, t);
    }
  }
  return ts;
}

/** タイムスタンプを datetime-local 入力用にフォーマット */
function formatTimestampForDatetimeLocal(ts) {
  if (ts == null || ts === Infinity || !isFinite(ts)) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

/** トリップのGPS日付（写真EXIFまたはGPX）からソート用タイムスタンプを取得。古い順に並べるため使用。tripDate（手動入力）を最優先 */
function getTripGpsDateTimestamp(trip) {
  let ts = Infinity;
  if (trip?.tripDate != null) {
    const t = typeof trip.tripDate === 'number' ? trip.tripDate : new Date(trip.tripDate).getTime();
    if (!isNaN(t)) return t;
  }
  if (trip?.gpxData) {
    try {
      const doc = new DOMParser().parseFromString(trip.gpxData, 'text/xml');
      const times = [];
      doc.querySelectorAll('trkpt, rtept, wpt').forEach(pt => {
        const timeEl = pt.querySelector('time');
        if (timeEl) {
          const t = new Date(timeEl.textContent.trim()).getTime();
          if (!isNaN(t)) times.push(t);
        }
      });
      if (times.length > 0) ts = Math.min(...times);
    } catch (_) {}
  }
  if (ts === Infinity && trip?.photos?.length) {
    for (const p of trip.photos) {
      const d = p?.date;
      if (!d) continue;
      const t = typeof d === 'number' ? d : (d instanceof Date ? d.getTime() : new Date(d).getTime());
      if (!isNaN(t)) ts = Math.min(ts, t);
    }
  }
  if (ts === Infinity && trip?.updatedAt) ts = trip.updatedAt;
  return ts;
}

/** ホーム画面用：全トリップをグループ化（エディター時はマイトリップ+公開、非エディター時は公開のみ） */
async function getHomeTripsGrouped() {
  if (!isEditor()) {
    return getDisplayablePublicTripsGrouped();
  }
  const merged = await getMergedTrips();
  const myTrips = merged.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
  const publicTrips = merged.filter(t => t.id?.startsWith('public_') || t._isPublic);
  const myIds = new Set(myTrips.map(t => t.id));
  const myRawIds = new Set(myTrips.map(t => t.id.replace(/^public_/, '')));
  const myGroups = organizeTripsByParent(myTrips).filter(g => g.parent.id !== '_other');
  const publicGroups = await getDisplayablePublicTripsGrouped();
  const excludeId = (t) => myIds.has(t.id) || myIds.has('public_' + t.id) || myRawIds.has(t.id) || myRawIds.has((t.id || '').replace(/^public_/, ''));
  const filteredPublicGroups = publicGroups
    .map(g => ({
      parent: g.parent,
      children: g.children.filter(c => !excludeId(c))
    }))
    .filter(g => !excludeId(g.parent));
  return [...myGroups, ...filteredPublicGroups];
}

/** 公開トリップを親→子のツリー構造で返す（右パネル描画用） */
async function getDisplayablePublicTripsGrouped() {
  const flat = await getDisplayablePublicTrips();
  const byId = new Map(flat.map(t => [t.id, { ...t }]));
  const parentIds = new Set(flat.map(t => t.id));
  const roots = flat.filter(t => !t.parentTripId || !parentIds.has(t.parentTripId));
  const childrenByParent = new Map();
  for (const t of flat) {
    if (t.parentTripId && parentIds.has(t.parentTripId)) {
      const arr = childrenByParent.get(t.parentTripId) || [];
      arr.push(byId.get(t.id) || t);
      childrenByParent.set(t.parentTripId, arr);
    }
  }
  const config = getPublicTripConfig();
  const orderMap = config?.tripOrder && Array.isArray(config.tripOrder)
    ? new Map(config.tripOrder.map((id, i) => [id.replace(/^public_/, ''), i]))
    : null;
  const newestFirst = isMobileView();
  const sortByOrder = (a, b) => {
    if (orderMap) {
      const ai = orderMap.get(a.id);
      const bi = orderMap.get(b.id);
      if (ai != null && bi != null) return ai - bi;
      if (ai != null) return -1;
      if (bi != null) return 1;
    }
    const diff = getTripGpsDateTimestamp(a) - getTripGpsDateTimestamp(b);
    return newestFirst ? -diff : diff;
  };
  roots.sort(sortByOrder);
  for (const arr of childrenByParent.values()) {
    arr.sort(sortByOrder);
  }
  return roots.map(p => ({
    parent: byId.get(p.id) || p,
    children: (childrenByParent.get(p.id) || []).sort(sortByOrder)
  }));
}

let _publicTripUrls = [];
let _tripMenuMap = null;
let _tripMenuUrls = [];
let _tripMenuMapRenderId = 0;
let _showTripListInPanel = false;
let _lastTripForDisplay = null;
let _lastTripChildrenCount = 0;
let _lastLoadedTripForMenu = null; /** 親トリップ詳細の即時表示用キャッシュ */
/** モバイル：子トリップ一覧表示中の場合、その親トリップID（normId形式）を保持 */
let _mobileChildrenViewParentId = null;

async function renderPublicTripsPanel() {
  const panel = document.getElementById('publicTripsPanel');
  const listEl = document.getElementById('publicTripsList');
  const tripListWrap = document.getElementById('tripPanelTripList');
  const tripMenuWrap = document.getElementById('tripPanelTripMenu');
  if (!panel || !listEl) return;

  if ((photos.length > 0 || _currentViewingTripId) && !_showTripListInPanel) {
    if (tripListWrap) tripListWrap.style.display = 'none';
    if (tripMenuWrap) tripMenuWrap.style.display = 'flex';
    if (panel) panel.classList.add('trip-menu-expanded');
    renderTripMenu(); /* awaitしない：パネルを即表示し、コンテンツは非同期で描画 */
    return;
  }

  if (panel) panel.classList.remove('trip-menu-expanded');
  if (_tripMenuMap) {
    _tripMenuMap.remove();
    _tripMenuMap = null;
  }
  _tripMenuUrls.forEach(u => { if (u?.startsWith?.('blob:')) URL.revokeObjectURL(u); });
  _tripMenuUrls = [];

  if (tripListWrap) tripListWrap.style.display = 'flex';
  if (tripMenuWrap) tripMenuWrap.style.display = 'none';

  panel.classList.remove('no-trips');
  listEl.innerHTML = '';
  _publicTripUrls.forEach(u => { if (u?.startsWith?.('blob:')) URL.revokeObjectURL(u); });
  _publicTripUrls = [];
  const isHomeMode = _showTripListInPanel && photos.length === 0 && !_currentViewingTripId;
  const groups = isHomeMode ? await getHomeTripsGrouped() : await getDisplayablePublicTripsGrouped();
  const displayTrips = groups.flatMap(g => [g.parent, ...g.children]);
  if (displayTrips.length === 0) {
    _mobileChildrenViewParentId = null;
    const empty = document.createElement('p');
    empty.className = 'public-trips-empty';
    empty.textContent = isHomeMode ? 'トリップがありません' : '公開トリップがありません';
    listEl.appendChild(empty);
    return;
  }
  const isMobile = isMobileView();
  if (!isMobile) _mobileChildrenViewParentId = null;
  const normId = (t) => (t._fromServer ? 'public_' + t.id : t.id);

  const renderTripCard = (trip, idx, opts = {}) => {
    const { isChild = false, childrenCount, parentThumb, hasChildren = false, isParentCard = false } = opts;
    const card = document.createElement('div');
    card.className = 'public-trip-card' + (isChild ? ' public-trip-child-card' : '');
    const tripColor = getTripColor(trip);
    card.style.setProperty('--trip-accent', tripColor);
    const photos = trip.photos || [];
    const firstPhoto = photos[0];
    let thumbSrc = '';
    if (trip.isParent && parentThumb) {
      thumbSrc = base64ToUrl(parentThumb.mime, parentThumb.data);
      _publicTripUrls.push(thumbSrc);
    } else if (firstPhoto?.data) {
      thumbSrc = base64ToUrl(firstPhoto.mime, firstPhoto.data);
      _publicTripUrls.push(thumbSrc);
    }
    const desc = (trip.description || '').trim();
    const gpxSummary = trip.gpxData ? getGpxSummary(trip.gpxData) : null;
    const gpxParts = [];
    if (gpxSummary?.dateStr) gpxParts.push(escapeHtml(gpxSummary.dateStr));
    if (gpxSummary?.distanceKm != null) {
      const distStr = gpxSummary.distanceKm < 1 ? (gpxSummary.distanceKm * 1000).toFixed(0) + ' m' : gpxSummary.distanceKm.toFixed(1) + ' km';
      const speedStr = gpxSummary.avgSpeedKmh != null ? `（${formatSpeed(gpxSummary.avgSpeedKmh)}）` : '';
      gpxParts.push(distStr + speedStr);
    }
    const gpxMeta = gpxParts.length > 0 ? gpxParts.join(' ') : '';
    const showOrderBtns = isEditor() && !isMobile && !isChild;
    const showDeleteBtn = isEditor() && !isMobile && !trip._isPublic && !trip.id?.startsWith('public_');
    const countSuffix = trip.isParent && childrenCount != null ? `（${childrenCount}件）` : `（${photos.length}枚）`;
    const nameText = isMobile ? escapeHtml(trip.name) : `${escapeHtml(trip.name)}${countSuffix}`;
    const expandIcon = hasChildren ? '<span class="public-trip-expand-icon" aria-hidden="true">▼</span>' : '';
    const orderIdx = opts.groupIndex !== undefined ? opts.groupIndex : idx;
    card.innerHTML = `
      <div class="public-trip-card-inner">
        <div class="public-trip-thumb"></div>
        <div class="public-trip-info">
          <h4 class="public-trip-name">${nameText}${expandIcon}</h4>
          ${desc ? `<p class="public-trip-desc">${escapeHtml(desc)}</p>` : ''}
          ${gpxMeta ? `<p class="public-trip-gpx-meta">${gpxMeta}</p>` : ''}
        </div>
        ${showOrderBtns ? `
        <div class="public-trip-order-btns">
          <button type="button" class="public-trip-order-btn" data-dir="up" data-group-index="${orderIdx}" aria-label="上へ">↑</button>
          <button type="button" class="public-trip-order-btn" data-dir="down" data-group-index="${orderIdx}" aria-label="下へ">↓</button>
        </div>
        ` : ''}
        ${showDeleteBtn ? '<button type="button" class="public-trip-delete-btn" title="トリップと写真を削除">削除</button>' : ''}
      </div>
    `;
    const thumbEl = card.querySelector('.public-trip-thumb');
    if (thumbSrc && thumbEl) {
      const img = document.createElement('img');
      img.src = thumbSrc;
      img.alt = '';
      thumbEl.appendChild(img);
    }
    const loadId = normId(trip);
    if (isParentCard && thumbEl) {
      thumbEl.style.cursor = 'pointer';
      thumbEl.onclick = (e) => {
        e.stopPropagation();
        loadTripAndShowPhoto(loadId, 0);
      };
    }
    const origTripId = (trip.id || '').replace(/^public_/, '');
    card.onclick = (e) => {
      if (e.target.closest('.public-trip-order-btns') || e.target.closest('.public-trip-delete-btn')) return;
      loadTripAndShowPhoto(loadId, 0);
    };
    if (showDeleteBtn) {
      const delBtn = card.querySelector('.public-trip-delete-btn');
      if (delBtn) {
        delBtn.onclick = async (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!confirm(`「${escapeHtml(trip.name)}」とその写真を削除しますか？`)) return;
          try {
            await deleteTripFromDB(origTripId);
            await deleteTripFromFirestore(origTripId);
            await cleanupTripRelatedData(origTripId);
            if (currentTripId === origTripId) clearCurrentTrip();
            await refreshTripList();
            await renderTripListPanel();
            await renderPublicTripsPanel();
            const groups = await getHomeTripsGrouped();
            await addHomeMarkers(groups.flatMap(g => [g.parent, ...g.children]));
            setStatus('トリップを削除しました');
          } catch (err) {
            console.error('deleteTripFromDB error:', err);
            setStatus(err.message || 'トリップの削除に失敗しました', true);
          }
        };
      }
    }
    if (showOrderBtns) {
      const isPublicTrip = (t) => t?.id?.startsWith('public_') || t?._isPublic;
      card.querySelectorAll('.public-trip-order-btn').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const dir = btn.dataset.dir;
          const groupIdx = parseInt(btn.dataset.groupIndex, 10);
          const swapIdx = dir === 'up' ? groupIdx - 1 : groupIdx + 1;
          if (swapIdx < 0 || swapIdx >= groups.length) return;
          const newGroups = [...groups];
          [newGroups[groupIdx], newGroups[swapIdx]] = [newGroups[swapIdx], newGroups[groupIdx]];
          const newTripOrder = newGroups
            .filter(g => isPublicTrip(g.parent))
            .flatMap(g => [normId(g.parent), ...(g.children || []).map(c => normId(c))]);
          const config = getPublicTripConfig() || {};
          savePublicTripConfig({ ...config, tripOrder: newTripOrder });
          await renderPublicTripsPanel();
        };
      });
    }
    return card;
  };

  /* モバイル：子トリップ一覧表示（親タップで遷移） */
  if (isMobile && _mobileChildrenViewParentId) {
    const group = groups.find(g => normId(g.parent) === _mobileChildrenViewParentId);
    if (group && (group.children || []).length > 0) {
      panel.classList.add('trip-panel-manually-expanded');
      listEl.classList.add('public-trips-list-children-view');
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'mobile-back-to-trip-list mobile-back-to-children-view';
      backBtn.innerHTML = '‹ 戻る';
      backBtn.onclick = () => {
        _mobileChildrenViewParentId = null;
        renderPublicTripsPanel();
      };
      listEl.appendChild(backBtn);
      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'public-trips-children-only';
      for (const child of group.children) {
        const idx = displayTrips.indexOf(child);
        childrenWrap.appendChild(renderTripCard(child, idx, { isChild: true }));
      }
      listEl.appendChild(childrenWrap);
      return;
    }
    _mobileChildrenViewParentId = null;
  }
  listEl.classList.remove('public-trips-list-children-view');

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    const groupWrap = document.createElement('div');
    groupWrap.className = 'public-trip-group';
    const parent = group.parent;
    const children = group.children || [];
    const parentIdx = displayTrips.indexOf(parent);
    let parentThumb = null;
    if (parent.isParent && !parent.photos?.length) {
      parentThumb = await getParentTripThumbnail(parent, children);
    }
    const parentCard = renderTripCard(parent, parentIdx, { childrenCount: parent.isParent ? children.length : undefined, parentThumb, hasChildren: children.length > 0, groupIndex, isParentCard: true });
    if (children.length > 0) {
      parentCard.classList.add('public-trip-parent-expandable');
      parentCard.onclick = (e) => {
        if (e.target.closest('.public-trip-order-btns') || e.target.closest('.public-trip-delete-btn')) return;
        if (isMobile) {
          _mobileChildrenViewParentId = normId(parent);
          document.getElementById('publicTripsPanel')?.classList.add('trip-panel-manually-expanded');
          renderPublicTripsPanel();
        } else {
          groupWrap.classList.toggle('expanded');
        }
      };
    }
    groupWrap.appendChild(parentCard);
    if (children.length > 0) {
      groupWrap.classList.add('expanded');
      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'public-trip-children';
      const childrenInner = document.createElement('div');
      childrenInner.className = 'public-trip-children-inner';
      for (const child of children) {
        const idx = displayTrips.indexOf(child);
        const childCard = renderTripCard(child, idx, { isChild: true });
        childCard.onclick = (e) => {
          e.stopPropagation();
          const loadId = (child._fromServer || child._isPublic ? 'public_' : '') + (child.id || '').replace(/^public_/, '');
          loadTripAndShowPhoto(loadId, 0);
        };
        childrenInner.appendChild(childCard);
      }
      childrenWrap.appendChild(childrenInner);
      groupWrap.appendChild(childrenWrap);
    }
    listEl.appendChild(groupWrap);
  }
}

async function renderTripMenu() {
  const content = document.getElementById('tripMenuContent');
  if (!content) return;

  const name = document.getElementById('tripNameInput')?.value?.trim() || 'トリップ';
  const desc = (document.getElementById('tripDescInput')?.value || '').trim();
  const url = (document.getElementById('tripUrlInput')?.value || '').trim();
  const gpxSummary = getGpxSummary();
  const distKm = gpxSummary?.distanceKm ?? getRouteDistanceKm();
  const dateStr = gpxSummary?.dateStr || '';
  const distStr = distKm != null ? (distKm < 1 ? (distKm * 1000).toFixed(0) + ' m' : distKm.toFixed(1) + ' km') : '';
  const speedStr = gpxSummary?.avgSpeedKmh != null ? formatSpeed(gpxSummary.avgSpeedKmh) : '';

  const landmarks = [];
  const seen = new Set();
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const no = toLandmarkValue(p.landmarkNo);
    const nm = toLandmarkValue(p.landmarkName);
    const text = [no, nm].filter(Boolean).join(' ');
    if (text && !seen.has(text)) {
      seen.add(text);
      landmarks.push({ text, photoIndex: i });
      if (landmarks.length >= 16) break;
    }
  }

  content.innerHTML = '<div class="trip-menu-loading">読み込み中…</div>';
  content.className = 'trip-menu-content';

  const tripId = _currentViewingTripId || currentTripId || '';
  let _tripMenuAccent = _currentTripColor;
  const rawTripId = (typeof tripId === 'string' && tripId.startsWith('public_')) ? tripId.slice(7) : tripId;
  const travelogueInfo = getTravelogueInfo(tripId) || getTravelogueInfo(rawTripId);

  let prevTrip = null;
  let nextTrip = null;
  let currentTrip = _lastLoadedTripForMenu && (_lastLoadedTripForMenu.id === rawTripId || _lastLoadedTripForMenu.id === tripId) ? _lastLoadedTripForMenu : null;
  const groups = await getHomeTripsGrouped();
  let flatTrips = groups.flatMap(g => [g.parent, ...g.children]);
  const normId = (t) => (t._fromServer || t._isPublic ? 'public_' + (t.id || '').replace(/^public_/, '') : (t.id || '').replace(/^public_/, ''));
  let idx = flatTrips.findIndex(t => normId(t) === tripId || t.id === tripId || t.id === rawTripId || (t.id || '').replace(/^public_/, '') === rawTripId);
  if (idx < 0 && tripId) {
    const merged = await getMergedTrips();
    const myTrips = merged.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
    const hierarchy = organizeTripsByParent(myTrips);
    const allDisplayTrips = hierarchy.flatMap(g => [g.parent, ...g.children]);
    let allIdx = allDisplayTrips.findIndex(t => t.id === tripId || t.id === rawTripId);
    if (allIdx >= 0) {
      currentTrip = allDisplayTrips[allIdx];
      flatTrips = allDisplayTrips;
      idx = allIdx;
      _tripMenuAccent = getTripColor(currentTrip);
      prevTrip = idx > 0 ? flatTrips[idx - 1] : null;
      nextTrip = idx < flatTrips.length - 1 ? flatTrips[idx + 1] : null;
    } else {
      let fetched = null;
      if (tripId.startsWith('public_')) {
        const origId = tripId.slice(7);
        fetched = publicTrips.find(t => t.id === origId || t.id === tripId);
      }
      if (!fetched) fetched = await getTripById(rawTripId);
      if (fetched) {
        currentTrip = fetched;
        _tripMenuAccent = getTripColor(currentTrip);
      }
    }
  }
  if (idx >= 0) {
    if (!currentTrip) currentTrip = flatTrips[idx];
    _tripMenuAccent = getTripColor(currentTrip);
    prevTrip = idx > 0 ? flatTrips[idx - 1] : null;
    nextTrip = idx < flatTrips.length - 1 ? flatTrips[idx + 1] : null;
  }
  content.innerHTML = '';
  content.style.setProperty('--trip-accent', _tripMenuAccent || PUBLIC_TRIP_COLORS[0]);
  const embeddedTravelogue = currentTrip?.travelogueHtml;
  let hasLink = travelogueInfo || !!embeddedTravelogue || (_lastTravelogueTripId === tripId && _lastTravelogueHtmlContent);

  let parentTripChildren = [];
  if (currentTrip?.isParent) {
    if (isEditor()) {
      const allTrips = await getMergedTrips();
      const myTrips = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
      parentTripChildren = myTrips.filter(t => t.parentTripId === rawTripId);
      parentTripChildren = [...parentTripChildren].sort((a, b) => {
        const ta = getTripGpsDateTimestamp(a);
        const tb = getTripGpsDateTimestamp(b);
        if (ta !== tb) return ta - tb;
        return (a.updatedAt || 0) - (b.updatedAt || 0);
      });
    } else {
      const group = groups.find(g => g.parent.id === rawTripId || g.parent.id === currentTrip?.id);
      parentTripChildren = group?.children || [];
    }
  }

  const headerSection = document.createElement('div');
  headerSection.className = 'trip-menu-header-section';

  const navRow = document.createElement('div');
  navRow.className = 'trip-menu-nav-row';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'trip-menu-nav-arrow';
  prevBtn.innerHTML = '<span class="trip-menu-nav-arrow-desktop">◀️</span><span class="trip-menu-nav-arrow-mobile">‹</span>';
  prevBtn.title = '前のトリップ';
  prevBtn.disabled = !prevTrip;
  prevBtn.onclick = () => { if (prevTrip) loadTripAndShowPhoto(normId(prevTrip), 0); };
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'trip-menu-nav-arrow';
  nextBtn.innerHTML = '<span class="trip-menu-nav-arrow-desktop">▶️</span><span class="trip-menu-nav-arrow-mobile">›</span>';
  nextBtn.title = '次のトリップ';
  nextBtn.disabled = !nextTrip;
  nextBtn.onclick = () => { if (nextTrip) loadTripAndShowPhoto(normId(nextTrip), 0); };
  const titleWrap = document.createElement('div');
  titleWrap.className = 'trip-menu-title-wrap';
  const titleEl = document.createElement('h2');
  titleEl.className = 'trip-menu-title';
  const mainTitleText = desc || name || 'トリップ';
  if (url) {
    titleEl.innerHTML = escapeHtml(mainTitleText) + ' <span class="trip-menu-blog-link" role="button" tabindex="0" title="ブログを開く">(ブログ)</span>';
    const blogLink = titleEl.querySelector('.trip-menu-blog-link');
    if (blogLink) blogLink.onclick = (e) => { e.preventDefault(); openUrlInPopupOrModal(url, 'ブログ'); };
  } else {
    titleEl.textContent = mainTitleText;
  }
  titleWrap.appendChild(titleEl);
  navRow.appendChild(prevBtn);
  navRow.appendChild(titleWrap);
  navRow.appendChild(nextBtn);
  headerSection.appendChild(navRow);

  const durationStr = formatDuration(gpxSummary?.durationHours) || '';
  const dateWithDuration = [dateStr, durationStr].filter(Boolean).join(' ');
  const metaParts = [dateWithDuration, distStr ? `${distStr}${speedStr ? `（${speedStr}）` : ''}` : ''].filter(Boolean);
  if (metaParts.length > 0) {
    const metaEl = document.createElement('p');
    metaEl.className = 'trip-menu-meta';
    metaEl.textContent = metaParts.join(' ');
    headerSection.appendChild(metaEl);
  }

  content.appendChild(headerSection);

  const summarySection = document.createElement('section');
  summarySection.className = 'trip-menu-summary-section';
  /* 1行目: 旅行記, アニメ, 動画 | 2行目: 写真, <, >, ▶︎再生（左寄せ） */
  const row1 = document.createElement('div');
  row1.className = 'trip-menu-controls-row trip-menu-controls-row1';
  if (hasLink) {
    const travelogueLinkEl = document.createElement('div');
    travelogueLinkEl.className = 'trip-menu-travelogue-summary';
    travelogueLinkEl.id = 'tripMenuTravelogueInfo';
    travelogueLinkEl.innerHTML = `<button type="button" class="trip-menu-travelogue-link trip-menu-travelogue-link-btn trip-menu-travelogue-summary-btn">旅行記</button>`;
    row1.appendChild(travelogueLinkEl);
  }
  const animeBtnSlot = document.createElement('span');
  animeBtnSlot.id = 'tripMenuAnimeBtnSlot';
  animeBtnSlot.className = 'trip-menu-anime-btn-slot';
  row1.appendChild(animeBtnSlot);
  const videoUrl = (currentTrip?.videoUrl || '').trim();
  if (videoUrl) {
    const videoBtn = document.createElement('button');
    videoBtn.type = 'button';
    videoBtn.className = 'trip-menu-travelogue-link trip-menu-travelogue-link-btn trip-menu-travelogue-summary-btn trip-menu-video-btn';
    videoBtn.textContent = '動画';
    videoBtn.title = '動画を表示';
    videoBtn.onclick = () => openVideo(videoUrl);
    row1.appendChild(videoBtn);
  }
  const row2 = document.createElement('div');
  row2.className = 'trip-menu-controls-row trip-menu-controls-row2 trip-menu-unified-controls';
  if (photos.length > 0) {
    const photoCount = document.createElement('span');
    photoCount.className = 'trip-menu-photo-count trip-menu-photo-count-clickable';
    photoCount.textContent = `写真（${photos.length}枚）`;
    photoCount.title = 'クリックでサムネイルの表示・非表示を切り替え';
    row2.appendChild(photoCount);
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'btn btn-secondary btn-sm photo-prev-btn';
    prevBtn.id = 'tripMenuPrevBtn';
    prevBtn.innerHTML = '<span class="trip-menu-btn-text-desktop">&lt; 前</span><span class="trip-menu-btn-text-mobile">前</span>';
    row2.appendChild(prevBtn);
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn-secondary btn-sm photo-next-btn';
    nextBtn.id = 'tripMenuNextBtn';
    nextBtn.innerHTML = '<span class="trip-menu-btn-text-desktop">次 &gt;</span><span class="trip-menu-btn-text-mobile">次</span>';
    row2.appendChild(nextBtn);
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'btn btn-primary btn-sm play-btn';
    playBtn.id = 'tripMenuPlayBtn';
    playBtn.disabled = photos.filter(p => p.lat != null && p.lng != null).length === 0;
    playBtn.innerHTML = '<span class="play-btn-label-play">▶︎ 再生</span><span class="play-btn-label-stop" style="display:none">■ 停止</span>';
    row2.appendChild(playBtn);
    const intervalSelect = document.createElement('select');
    intervalSelect.id = 'tripMenuIntervalSelect';
    intervalSelect.className = 'trip-menu-interval-select';
    intervalSelect.innerHTML = '<option value="1">1秒</option><option value="3" selected>3秒</option><option value="5">5秒</option>';
    row2.appendChild(intervalSelect);
  }
  const controlsWrap = document.createElement('div');
  controlsWrap.className = 'trip-menu-controls trip-menu-summary-controls';
  controlsWrap.appendChild(row1);
  controlsWrap.appendChild(row2);
  summarySection.appendChild(controlsWrap);

  if (isEditor()) {
    const editorRow = document.createElement('div');
    editorRow.className = 'trip-menu-controls-row trip-menu-editor-row';
    const showTravelogueBtn = true;
    editorRow.innerHTML = `
      ${showTravelogueBtn ? '<button type="button" class="btn btn-primary btn-sm" id="tripMenuTravelogueBtn">📝 旅行記生成</button>' : ''}
      ${hasLink ? `<div class="trip-menu-anime-gen-row">
        <button type="button" class="btn btn-secondary btn-sm" id="tripMenuAnimeCharBtn" title="メインキャラの人物写真を設定">キャラ</button>
        <button type="button" class="btn btn-secondary btn-sm" id="tripMenuAnimeBtn" title="旅行記から表紙・1/4〜4/4ページのアニメを生成">🎬 アニメ生成</button>
        <select id="tripMenuAnimeTypeSelect" title="生成する種類を選択">
          <option value="cover_aruku">歩き方風表紙</option>
          <option value="cover_jump">ジャンプ風表紙</option>
          <option value="cover_popeye">雑誌風表紙</option>
          <option value="cover_spotlight">注目スポット風表紙</option>
          <option value="q1">1/4ページ</option>
          <option value="q2">2/4ページ</option>
          <option value="q3">3/4ページ</option>
          <option value="q4">4/4ページ</option>
        </select>
      </div>` : ''}
    `;
    summarySection.appendChild(editorRow);
  }

  const summaryRow = document.createElement('div');
  summaryRow.className = 'trip-menu-summary-row';
  const animeAllWrap = document.createElement('div');
  animeAllWrap.className = 'trip-menu-anime-all-wrap';
  animeAllWrap.id = 'tripMenuAnimeAll';
  summaryRow.appendChild(animeAllWrap);
  if (isEditor()) {
    const animeUploadRow = document.createElement('div');
    animeUploadRow.className = 'trip-menu-anime-upload-row';
    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'btn btn-secondary btn-sm';
    uploadBtn.textContent = '📷 画像をアップロード';
    uploadBtn.title = 'アニメ・画像をアップロードして表示';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      fileInput.value = '';
      if (files.length === 0) return;
      const tripName = document.getElementById('tripNameInput')?.value?.trim() || 'トリップ';
      setStatus('画像をアップロード中…');
      let existingCount = (await listAnimeFromDB()).filter(a => a.tripId === rawTripId).length;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f.type.startsWith('image/')) continue;
        try {
          const result = await fileToBase64(f);
          if (!result?.data) continue;
          const thumbnail = { mime: result.mime || 'image/jpeg', data: result.data };
          await saveAnimeToDB(rawTripId, tripName, [], thumbnail, [], null, { animeType: 'upload', order: existingCount + i });
        } catch (err) {
          console.error('画像アップロードエラー:', err);
        }
      }
      await renderTripMenu();
      await renderPublicTripsPanel();
      setStatus(`${files.length}件の画像を追加しました`);
    };
    animeUploadRow.appendChild(uploadBtn);
    animeUploadRow.appendChild(fileInput);
    summaryRow.appendChild(animeUploadRow);
  }
  summarySection.appendChild(summaryRow);

  content.appendChild(summarySection);

  // イベント設定
  const travelogueLinkBtn = content.querySelector('#tripMenuTravelogueInfo button.trip-menu-travelogue-link-btn');
  if (travelogueLinkBtn) {
    travelogueLinkBtn.onclick = async (e) => {
      e.preventDefault();
      let htmlContent = embeddedTravelogue ||
        ((_lastTravelogueTripId === tripId || _lastTravelogueTripId === rawTripId) ? _lastTravelogueHtmlContent : null);
      if (!htmlContent) htmlContent = await loadTravelogueHtmlFromDB(rawTripId);
      if (htmlContent) {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        openUrlInPopupOrModal(blobUrl, '旅行記');
      } else {
        setStatus('旅行記を開けません。再度「旅行記生成」してください。', true);
      }
      return false;
    };
  }
  const travelogueBtn = document.getElementById('tripMenuTravelogueBtn');
  if (travelogueBtn) travelogueBtn.onclick = () => generateTraveloguePdf();
  const animeCharBtn = document.getElementById('tripMenuAnimeCharBtn');
  if (animeCharBtn && hasLink) {
    animeCharBtn.onclick = () => openCharacterUploadModal(rawTripId);
    const charPhotos = getCharacterPhotos(rawTripId).filter(p => p.data);
    if (charPhotos.length > 0) {
      const first = charPhotos[0];
      const src = `data:${first.mime || 'image/jpeg'};base64,${first.data}`;
      animeCharBtn.classList.add('trip-menu-char-btn-with-photo');
      animeCharBtn.textContent = '';
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'キャラ';
      img.className = 'trip-menu-char-btn-img';
      animeCharBtn.appendChild(img);
      animeCharBtn.title = 'メインキャラの写真を追加・変更';
    } else {
      animeCharBtn.classList.remove('trip-menu-char-btn-with-photo');
      animeCharBtn.textContent = 'キャラ';
      animeCharBtn.title = 'メインキャラの人物写真を設定';
    }
  }
  const animeBtn = document.getElementById('tripMenuAnimeBtn');
  const animeTypeSelect = document.getElementById('tripMenuAnimeTypeSelect');
  if (animeBtn && hasLink && animeTypeSelect) {
    animeBtn.onclick = () => {
      const type = animeTypeSelect.value;
      if (type.startsWith('cover_')) {
        const coverStyle = type.replace('cover_', '');
        generateTravelAnime(tripId, coverStyle);
      } else {
        generateTravelAnimePage(tripId, type);
      }
    };
  }
  getAnimeAllForTripDisplay(rawTripId, currentTrip?.animeList).then(async (allItems) => {
    const wrap = document.getElementById('tripMenuAnimeAll');
    const animeBtnSlot = document.getElementById('tripMenuAnimeBtnSlot');
    if (allItems.length > 0 && animeBtnSlot) {
      const existingAnimeBtn = animeBtnSlot.querySelector('.trip-menu-anime-summary-btn');
      if (!existingAnimeBtn) {
        const animeSummaryBtn = document.createElement('button');
        animeSummaryBtn.type = 'button';
        animeSummaryBtn.className = 'trip-menu-travelogue-link trip-menu-travelogue-link-btn trip-menu-travelogue-summary-btn trip-menu-anime-summary-btn';
        animeSummaryBtn.textContent = 'アニメ';
        animeSummaryBtn.title = 'アニメ画像を表示';
        const allIds = allItems.map(x => x.id);
        const embeddedAnime = currentTrip?.animeList;
        animeSummaryBtn.onclick = () => openAnimeFromData(allItems[0].id, {
          animeIds: allIds,
          currentIndex: 0,
          animeList: embeddedAnime || undefined
        });
        animeBtnSlot.appendChild(animeSummaryBtn);
      }
    }
    // モバイルではアニメ一覧を表示しない
    if (!wrap || allItems.length === 0 || isMobileView()) return;
    wrap.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'trip-menu-anime-all-list';
    list.setAttribute('data-trip-id', tripId);
    for (let i = 0; i < allItems.length; i++) {
      const a = allItems[i];
      const thumbSrc = a.thumbnail?.data ? `data:${a.thumbnail.mime || 'image/jpeg'};base64,${a.thumbnail.data}` : a.coverImage?.data ? `data:image/jpeg;base64,${a.coverImage.data}` : a.pageImages?.[0]?.data ? `data:image/jpeg;base64,${a.pageImages[0].data}` : null;
      if (!thumbSrc) continue;
      const item = document.createElement('div');
      item.className = 'trip-menu-anime-all-item';
      item.draggable = isEditor();
      item.dataset.animeId = String(a.id);
      item.dataset.index = String(i);
      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'trip-menu-anime-all-thumb';
      thumb.title = 'クリックで表示';
      const img = document.createElement('img');
      img.src = thumbSrc;
      img.alt = a.tripName || a._displayLabel || '';
      thumb.appendChild(img);
      const allIds = allItems.map(x => x.id);
      const embeddedAnime = currentTrip?.animeList;
      thumb.onclick = () => openAnimeFromData(a.id, {
        animeIds: allIds,
        currentIndex: i,
        animeList: embeddedAnime || undefined
      });
      const overlay = document.createElement('div');
      overlay.className = 'trip-menu-anime-all-overlay';
      const orderSpan = document.createElement('span');
      orderSpan.className = 'trip-menu-anime-all-order';
      orderSpan.textContent = `${i + 1}`;
      overlay.appendChild(orderSpan);
      if (isEditor()) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'trip-menu-anime-all-del';
        delBtn.textContent = '削除';
        delBtn.title = '削除';
        delBtn.onclick = async (e) => {
          e.stopPropagation();
          if (!confirm('この画像を削除しますか？')) return;
          await deleteAnimeFromDB(a.id);
          await renderTripMenu();
          await renderPublicTripsPanel();
        };
        overlay.appendChild(delBtn);
      }
      item.appendChild(thumb);
      item.appendChild(overlay);
      list.appendChild(item);
    }
    wrap.appendChild(list);
    if (isEditor() && allItems.length > 1) {
      let dragged = null;
      list.querySelectorAll('.trip-menu-anime-all-item').forEach((el) => {
        el.ondragstart = (e) => { dragged = el; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.dataset.animeId); };
        el.ondragover = (e) => { e.preventDefault(); if (dragged && dragged !== el) el.classList.add('drag-over'); };
        el.ondragleave = () => el.classList.remove('drag-over');
        el.ondrop = async (e) => {
          e.preventDefault();
          el.classList.remove('drag-over');
          if (!dragged || dragged === el) return;
          const items = [...list.querySelectorAll('.trip-menu-anime-all-item')];
          const fromIdx = items.indexOf(dragged);
          const toIdx = items.indexOf(el);
          if (fromIdx < 0 || toIdx < 0) return;
          const reordered = [...items];
          reordered.splice(fromIdx, 1);
          reordered.splice(toIdx, 0, dragged);
          for (let i = 0; i < reordered.length; i++) {
            await updateAnimeOrderInDB(parseInt(reordered[i].dataset.animeId, 10), i);
          }
          await renderTripMenu();
        };
        el.ondragend = () => list.querySelectorAll('.trip-menu-anime-all-item').forEach(x => x.classList.remove('drag-over'));
      });
    }
  }).catch(() => {});

  const photoCountEl = content.querySelector('.trip-menu-photo-count');
  if (photoCountEl) {
    photoCountEl.classList.add('trip-menu-photo-count-clickable');
    photoCountEl.title = 'クリックでサムネイルの表示・非表示を切り替え';
    photoCountEl.onclick = () => {
      fitMapToFullExtent();
      toggleAllPhotosThumbnails();
    };
  }
  const tripMenuPrevBtn = document.getElementById('tripMenuPrevBtn');
  const tripMenuNextBtn = document.getElementById('tripMenuNextBtn');
  const playBtn = document.getElementById('tripMenuPlayBtn');
  const intervalSelect = document.getElementById('tripMenuIntervalSelect');
  const mainIntervalSelect = document.getElementById('intervalSelect');
  if (tripMenuPrevBtn) tripMenuPrevBtn.onclick = () => { if (currentIndex > 0) showPhotoWithPopup(currentIndex - 1); };
  if (tripMenuNextBtn) tripMenuNextBtn.onclick = () => { if (currentIndex < photos.length - 1) showPhotoWithPopup(currentIndex + 1); };
  const togglePlayStop = () => { if (isPlaying) stopPlay(); else startPlay(); };
  if (playBtn) playBtn.onclick = togglePlayStop;
  if (intervalSelect && mainIntervalSelect) {
    intervalSelect.value = mainIntervalSelect.value;
    intervalSelect.onchange = () => { mainIntervalSelect.value = intervalSelect.value; };
  }
  if (photos.length > 0) setPlayStopDisabled(photos.filter(p => p.lat != null && p.lng != null).length === 0);

  if (currentTrip?.isParent) {
    const childrenSection = document.createElement('section');
    childrenSection.className = 'trip-menu-children-section';
    childrenSection.innerHTML = '<div class="trip-menu-children-list" id="tripMenuChildrenList"></div>' + (isEditor() ? '<div class="trip-menu-children-actions"><button type="button" class="btn btn-secondary btn-sm menu-full" id="tripMenuAddChildBtn">＋ 子トリップを追加</button></div>' : '');
    content.appendChild(childrenSection);
    const listEl = document.getElementById('tripMenuChildrenList');
    const addBtn = document.getElementById('tripMenuAddChildBtn');
    const children = parentTripChildren;
    const childrenTitle = document.createElement('h3');
    childrenTitle.className = 'trip-menu-section-title';
    childrenTitle.textContent = `子トリップ${children.length}件`;
    childrenSection.insertBefore(childrenTitle, listEl);
    if (listEl) {
      listEl.innerHTML = '';
      const loadIdForChild = (t) => (t._fromServer ? 'public_' + t.id : t.id);
      children.forEach((c) => {
        const card = document.createElement('div');
        card.className = 'public-trip-card public-trip-child-card trip-menu-child-card';
        const tripColor = getTripColor(c);
        card.style.setProperty('--trip-accent', tripColor);
        const cPhotos = c.photos || [];
        const firstPhoto = cPhotos[0];
        let thumbSrc = '';
        if (firstPhoto?.data) {
          thumbSrc = base64ToUrl(firstPhoto.mime || 'image/jpeg', firstPhoto.data);
          _tripMenuUrls.push(thumbSrc);
        }
        const cDesc = (c.description || '').trim();
        const cGpxSummary = c.gpxData ? getGpxSummary(c.gpxData) : null;
        const gpxParts = [];
        if (cGpxSummary?.dateStr) gpxParts.push(escapeHtml(cGpxSummary.dateStr));
        if (cGpxSummary?.distanceKm != null) {
          const distStr = cGpxSummary.distanceKm < 1 ? (cGpxSummary.distanceKm * 1000).toFixed(0) + ' m' : cGpxSummary.distanceKm.toFixed(1) + ' km';
          const speedStr = cGpxSummary.avgSpeedKmh != null ? `（${formatSpeed(cGpxSummary.avgSpeedKmh)}）` : '';
          gpxParts.push(distStr + speedStr);
        }
        const gpxMeta = gpxParts.length > 0 ? gpxParts.join(' ') : '';
        card.innerHTML = `
          <div class="public-trip-card-inner">
            <div class="public-trip-thumb"></div>
            <div class="public-trip-info">
              <h4 class="public-trip-name">${escapeHtml(c.name)}（${cPhotos.length}枚）</h4>
              ${cDesc ? `<p class="public-trip-desc">${escapeHtml(cDesc)}</p>` : ''}
              ${gpxMeta ? `<p class="public-trip-gpx-meta">${gpxMeta}</p>` : ''}
            </div>
          </div>
        `;
        const thumbEl = card.querySelector('.public-trip-thumb');
        if (thumbSrc && thumbEl) {
          const img = document.createElement('img');
          img.src = thumbSrc;
          img.alt = '';
          thumbEl.appendChild(img);
        }
        const loadId = loadIdForChild(c);
        card.onclick = () => loadTripAndShowPhoto(loadId, 0);
        listEl.appendChild(card);
      });
      if (addBtn) addBtn.onclick = () => addChildTripUnder(rawTripId, name);
    }
  }

  if (photos.length > 0) {
    const mapSection = document.createElement('section');
    mapSection.className = 'trip-menu-map-section';
    const mapContainer = document.createElement('div');
    mapContainer.className = 'trip-menu-map-wrap';
    mapContainer.innerHTML = '<div id="tripMenuMap" class="trip-menu-map"></div><div class="trip-menu-thumbnails" id="tripMenuThumbnails"></div>';
    mapSection.appendChild(mapContainer);
    content.appendChild(mapSection);
  }

  const thumbsDiv = document.getElementById('tripMenuThumbnails');
  if (thumbsDiv && photos.length > 0) {
    photos.slice(0, 20).forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'trip-menu-thumb';
      div.title = p.name;
      if (p.url) {
        const img = document.createElement('img');
        img.src = p.url;
        if (p.url.startsWith('blob:')) _tripMenuUrls.push(p.url);
        img.alt = '';
        img.onclick = () => showPhotoWithPopup(i);
        div.appendChild(img);
      }
      thumbsDiv.appendChild(div);
    });
  }

  if (landmarks.length > 0 && !isWebDeployment()) {
    const stampsEl = document.createElement('section');
    stampsEl.className = 'trip-menu-stamps';
    const stampBtn = document.createElement('button');
    stampBtn.type = 'button';
    stampBtn.className = 'btn btn-secondary btn-sm trip-menu-stamp-btn';
    stampBtn.textContent = 'スタンプ';
    stampBtn.title = 'Trip Stamps を表示';
    stampBtn.onclick = () => openStampsModal(landmarks, tripId);
    stampsEl.appendChild(stampBtn);
    content.appendChild(stampsEl);
  }

  const navRowBottom = document.createElement('div');
  navRowBottom.className = 'trip-menu-nav-row trip-menu-nav-row-bottom';
  const prevBtnBottom = document.createElement('button');
  prevBtnBottom.type = 'button';
  prevBtnBottom.className = 'trip-menu-nav-arrow';
  prevBtnBottom.innerHTML = '<span class="trip-menu-nav-arrow-desktop">◀️</span><span class="trip-menu-nav-arrow-mobile">‹</span>';
  prevBtnBottom.title = prevTrip ? `前のトリップ: ${escapeHtml(prevTrip.name || '')}` : '前のトリップ';
  prevBtnBottom.disabled = !prevTrip;
  prevBtnBottom.onclick = () => { if (prevTrip) loadTripAndShowPhoto(normId(prevTrip), 0); };
  const titleWrapBottom = document.createElement('div');
  titleWrapBottom.className = 'trip-menu-title-wrap';
  const titleElBottom = document.createElement('div');
  titleElBottom.className = 'trip-menu-nav-label';
  titleElBottom.textContent = desc || name || 'トリップ';
  titleWrapBottom.appendChild(titleElBottom);
  const nextBtnBottom = document.createElement('button');
  nextBtnBottom.type = 'button';
  nextBtnBottom.className = 'trip-menu-nav-arrow';
  nextBtnBottom.innerHTML = '<span class="trip-menu-nav-arrow-desktop">▶️</span><span class="trip-menu-nav-arrow-mobile">›</span>';
  nextBtnBottom.title = nextTrip ? `次のトリップ: ${escapeHtml(nextTrip.name || '')}` : '次のトリップ';
  nextBtnBottom.disabled = !nextTrip;
  nextBtnBottom.onclick = () => { if (nextTrip) loadTripAndShowPhoto(normId(nextTrip), 0); };
  navRowBottom.appendChild(prevBtnBottom);
  navRowBottom.appendChild(titleWrapBottom);
  navRowBottom.appendChild(nextBtnBottom);
  content.appendChild(navRowBottom);

  // 一番下の戻るボタン（子トリップの場合は「親に戻る」＋「トリップ一覧に戻る」）
  const parentTrip = currentTrip?.parentTripId ? flatTrips.find(t => t.id === currentTrip.parentTripId || (t.id || '').replace(/^public_/, '') === (currentTrip.parentTripId || '').replace(/^public_/, '')) : null;
  const parentName = parentTrip?.name || '親トリップ';

  const backBtnsWrap = document.createElement('div');
  backBtnsWrap.className = 'trip-menu-back-btns-wrap';
  if (parentTrip) {
    const backToParentBtn = document.createElement('button');
    backToParentBtn.type = 'button';
    backToParentBtn.className = isMobileView() ? 'mobile-back-to-trip-list' : 'desktop-back-to-trip-list';
    if (isMobileView()) {
      backToParentBtn.innerHTML = `<span class="back-arrow">‹</span>${escapeHtml(parentName)}`;
    } else {
      backToParentBtn.textContent = `${parentName}に戻る`;
    }
    backToParentBtn.title = `${parentName}に戻る`;
    backToParentBtn.onclick = () => loadTripAndShowPhoto(normId(parentTrip), 0);
    backBtnsWrap.appendChild(backToParentBtn);
  }

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = isMobileView() ? 'mobile-back-to-trip-list' : 'desktop-back-to-trip-list';
  if (isMobileView()) {
    backBtn.innerHTML = '<span class="back-arrow">‹</span>トリップ一覧';
  } else {
    backBtn.textContent = 'トリップ一覧に戻る';
  }
  backBtn.title = 'トリップ一覧';
  backBtn.onclick = () => {
    _showTripListInPanel = true;
    _mobileChildrenViewParentId = null;
    renderPublicTripsPanel();
  };
  backBtnsWrap.appendChild(backBtn);
  content.appendChild(backBtnsWrap);

  if (_tripMenuMap) {
    _tripMenuMap.remove();
    _tripMenuMap = null;
  }
  const mapEl = document.getElementById('tripMenuMap');
  if (mapEl && typeof L !== 'undefined') {
    const routePoints = getGpxRoutePoints();
    const withGps = photos.filter(p => p.lat != null && p.lng != null);
    let bounds = null;
    if (withGps.length > 0) bounds = L.latLngBounds(withGps.map(p => [p.lat, p.lng]));
    if (routePoints.length >= 2) {
      const routeBounds = L.latLngBounds(routePoints);
      bounds = bounds ? bounds.extend(routeBounds) : routeBounds;
    }
    const thisRenderId = ++_tripMenuMapRenderId;
    const initMap = () => {
      if (thisRenderId !== _tripMenuMapRenderId || !document.getElementById('tripMenuMap')) return;
      _tripMenuMap = L.map('tripMenuMap', { zoomControl: false }).setView(DEFAULT_CENTER, 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(_tripMenuMap);
      if (routePoints.length >= 2) {
        const line = createStyledRouteLayer(routePoints);
        if (line) line.addTo(_tripMenuMap);
      }
      withGps.forEach((p) => {
        const idx = photos.indexOf(p);
        const icon = L.divIcon({ className: 'trip-menu-marker', html: '<span></span>', iconSize: [8, 8], iconAnchor: [4, 4] });
        L.marker([p.lat, p.lng], { icon }).addTo(_tripMenuMap).on('click', () => showPhotoWithPopup(idx));
      });
      if (bounds) {
        _tripMenuMap.fitBounds(bounds, { padding: [10, 10], maxZoom: 14 });
      }
      const refreshMap = () => {
        if (_tripMenuMap) {
          _tripMenuMap.invalidateSize();
          if (bounds) _tripMenuMap.fitBounds(bounds, { padding: [10, 10], maxZoom: 14 });
        }
      };
      refreshMap();
      requestAnimationFrame(refreshMap);
      setTimeout(refreshMap, 100);
      setTimeout(refreshMap, 400);
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting && _tripMenuMap) {
            _tripMenuMap.invalidateSize();
            if (bounds) _tripMenuMap.fitBounds(bounds, { padding: [10, 10], maxZoom: 14 });
          }
        }
      }, { root: mapEl.closest('.trip-menu-content'), threshold: 0.1 });
      io.observe(mapEl);
    };
    requestAnimationFrame(() => requestAnimationFrame(initMap));
  }
}

/** エクスポート用に写真・アニメ画像を圧縮し、目標サイズ以下にする */
const EXPORT_PHOTO_MAX_DIM = 1200;
const EXPORT_ANIME_MAX_DIM = 800;
const EXPORT_ANIME_THUMB_MAX = 360;

/** 写真から base64 データを取得（data / data URL / blob URL に対応） */
async function getPhotoDataForExport(p) {
  if (p?.data) return { data: p.data, mime: p.mime || 'image/jpeg' };
  const url = p?.url || p?.photoUrl;
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;]+);base64,(.+)$/);
    if (m) return { data: m[2], mime: m[1] };
  }
  if (url.startsWith('blob:')) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const mime = blob.type || 'image/jpeg';
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const m = String(r.result).match(/^data:[^;]+;base64,(.+)$/);
          resolve(m ? m[1] : null);
        };
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
      return data ? { data, mime } : null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

async function compressImageForExport(mime, data, maxDim, quality) {
  if (!data) return null;
  try {
    return await resizeBase64ToBase64(mime, data, maxDim, maxDim, quality);
  } catch (_) {
    return { mime: mime || 'image/jpeg', data };
  }
}

async function compressAnimeForExport(animeList, maxDim, thumbMax, quality) {
  if (!animeList?.length) return animeList;
  const out = [];
  for (const a of animeList) {
    const item = { ...a };
    if (a.coverImage?.data) {
      const enc = await compressImageForExport(a.coverImage.mime, a.coverImage.data, maxDim, quality);
      if (enc) item.coverImage = { mime: enc.mime, data: enc.data };
    }
    if (a.thumbnail?.data) {
      const enc = await compressImageForExport(a.thumbnail.mime, a.thumbnail.data, thumbMax, quality);
      if (enc) item.thumbnail = { mime: enc.mime, data: enc.data };
    }
    if (a.pageImages?.length) {
      item.pageImages = [];
      for (const img of a.pageImages) {
        if (img?.data) {
          const enc = await compressImageForExport(img.mime, img.data, maxDim, quality);
          if (enc) item.pageImages.push({ mime: enc.mime, data: enc.data });
        }
      }
    }
    if (a.panels?.length) {
      item.panels = [];
      for (const p of a.panels) {
        if (p?.data) {
          const enc = await compressImageForExport(p.mime, p.data, maxDim, quality);
          if (enc) item.panels.push({ ...p, mime: enc.mime, data: enc.data });
        } else {
          item.panels.push(p);
        }
      }
    }
    out.push(item);
  }
  return out;
}

/** トリップのスタンプ写真を trip.stampPhotos に集約（key: photoIndex） */
function collectStampPhotosForTrip(tripId) {
  const all = getStampPhotos();
  const out = {};
  const prefixes = [tripId + '_', 'public_' + tripId + '_'];
  for (const prefix of prefixes) {
    for (const key of Object.keys(all)) {
      if (key.startsWith(prefix)) {
        const photoIndex = key.slice(prefix.length);
        if (/^\d+$/.test(photoIndex)) out[photoIndex] = all[key];
      }
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function compressTripsForExport(trips, targetBytes) {
  if (!trips?.length) return trips;

  let quality = 0.5;
  let maxDim = EXPORT_PHOTO_MAX_DIM;
  for (let attempt = 0; attempt < 10; attempt++) {
    const stampMaxDim = Math.min(480, Math.round(maxDim * 0.5));
    const result = [];
    for (const trip of trips) {
      const t = { ...trip };
      if (trip.photos?.length) {
        const photos = [];
        for (const p of trip.photos) {
          const src = await getPhotoDataForExport(p);
          if (src?.data) {
            const enc = await compressImageForExport(src.mime, src.data, maxDim, quality);
            photos.push({ ...p, data: enc?.data ?? src.data, mime: enc?.mime ?? src.mime ?? 'image/jpeg' });
          } else if (p.lat != null && p.lng != null) {
            photos.push({ ...p, data: undefined, mime: undefined });
          }
        }
        t.photos = photos;
      }
      if (trip.animeList?.length) {
        const thumbMax = Math.min(EXPORT_ANIME_THUMB_MAX, Math.round(maxDim * 0.45));
        t.animeList = await compressAnimeForExport(trip.animeList, Math.min(maxDim, EXPORT_ANIME_MAX_DIM), thumbMax, quality);
      }
      if (trip.stampPhotos && Object.keys(trip.stampPhotos).length > 0) {
        const compressed = {};
        for (const [idx, sp] of Object.entries(trip.stampPhotos)) {
          if (sp?.data) {
            const enc = await compressImageForExport(sp.mime || 'image/jpeg', sp.data, stampMaxDim, quality);
            if (enc) compressed[idx] = { mime: enc.mime, data: enc.data };
          }
        }
        t.stampPhotos = Object.keys(compressed).length > 0 ? compressed : undefined;
      }
      result.push(t);
    }
    const testJson = JSON.stringify(result);
    if (testJson.length <= targetBytes) return result;
    quality = Math.max(0.2, quality - 0.06);
    if (attempt >= 4) maxDim = Math.max(480, maxDim - 160);
  }
  return result;
}

async function openDataFolderModal() {
  const modal = document.getElementById('dataFolderModal');
  const traveloguesEl = document.getElementById('dataFolderTraveloguesList');
  const animeEl = document.getElementById('dataFolderAnimeList');
  if (!modal || !traveloguesEl || !animeEl) return;
  traveloguesEl.innerHTML = '<p class="data-folder-loading">読み込み中…</p>';
  animeEl.innerHTML = '<p class="data-folder-loading">読み込み中…</p>';
  modal.classList.add('open');
  try {
    const travelogues = await listTraveloguesFromDB();
    traveloguesEl.innerHTML = '';
    if (travelogues.length === 0) {
      traveloguesEl.innerHTML = '<p class="data-folder-empty">旅行記がありません。旅行記生成してください。</p>';
    } else {
      travelogues.forEach((t) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'data-folder-item';
        const name = (t.tripName || t.tripId || '旅行記').slice(0, 30);
        const date = t.updatedAt ? new Date(t.updatedAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : '';
        btn.innerHTML = `<span class="data-folder-item-name">${escapeHtml(name)}</span><span class="data-folder-item-date">${escapeHtml(date)}</span>`;
        btn.onclick = async () => {
          const html = t.html || await loadTravelogueHtmlFromDB(t.tripId);
          if (html) {
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
          }
        };
        traveloguesEl.appendChild(btn);
      });
    }
    const animeList = await listAnimeFromDB();
    const hiddenIds = getHiddenAnimeIds();
    const visibleAnime = animeList.filter(a => !hiddenIds.has(a.id));
    const hiddenAnime = animeList.filter(a => hiddenIds.has(a.id));
    animeEl.innerHTML = '';
    if (visibleAnime.length === 0) {
      animeEl.innerHTML = '<p class="data-folder-empty">旅行アニメがありません。旅行アニメを生成してください。</p>';
    } else {
      const sortByOrder = (x, y) => (x.order ?? x.createdAt ?? 0) - (y.order ?? y.createdAt ?? 0);
      visibleAnime.forEach((a) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'data-folder-anime-card';
        const name = (a.tripName || a.tripId || '旅行アニメ').slice(0, 20);
        const date = a.createdAt ? new Date(a.createdAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : '';
        const thumbSrc = a.thumbnail?.data ? `data:${a.thumbnail.mime || 'image/png'};base64,${a.thumbnail.data}` : '';
        card.innerHTML = thumbSrc
          ? `<img src="${thumbSrc}" alt="" class="data-folder-anime-thumb"><span class="data-folder-anime-name">${escapeHtml(name)}</span><span class="data-folder-anime-date">${escapeHtml(date)}</span>`
          : `<span class="data-folder-anime-name">${escapeHtml(name)}</span><span class="data-folder-anime-date">${escapeHtml(date)}</span>`;
        card.onclick = () => {
          const forTrip = visibleAnime.filter(x => x.tripId === a.tripId).sort(sortByOrder);
          const ids = forTrip.map(x => x.id);
          const idx = ids.indexOf(a.id);
          openAnimeFromData(a.id, { animeIds: ids, currentIndex: idx >= 0 ? idx : 0 });
        };
        animeEl.appendChild(card);
      });
    }
    const hiddenSection = document.getElementById('dataFolderHiddenAnimeSection');
    const hiddenListEl = document.getElementById('dataFolderHiddenAnimeList');
    if (hiddenSection && hiddenListEl && isEditor() && hiddenAnime.length > 0) {
      hiddenSection.style.display = '';
      hiddenListEl.innerHTML = '';
      const sortByOrder = (x, y) => (x.order ?? x.createdAt ?? 0) - (y.order ?? y.createdAt ?? 0);
      hiddenAnime.forEach((a) => {
        const wrap = document.createElement('div');
        wrap.className = 'data-folder-anime-card-wrap';
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'data-folder-anime-card';
        const name = (a.tripName || a.tripId || '旅行アニメ').slice(0, 20);
        const date = a.createdAt ? new Date(a.createdAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : '';
        const thumbSrc = a.thumbnail?.data ? `data:${a.thumbnail.mime || 'image/png'};base64,${a.thumbnail.data}` : '';
        card.innerHTML = thumbSrc
          ? `<img src="${thumbSrc}" alt="" class="data-folder-anime-thumb"><span class="data-folder-anime-name">${escapeHtml(name)}</span><span class="data-folder-anime-date">${escapeHtml(date)}</span>`
          : `<span class="data-folder-anime-name">${escapeHtml(name)}</span><span class="data-folder-anime-date">${escapeHtml(date)}</span>`;
        card.onclick = () => {
          const forTrip = hiddenAnime.filter(x => x.tripId === a.tripId).sort(sortByOrder);
          const ids = forTrip.map(x => x.id);
          const idx = ids.indexOf(a.id);
          openAnimeFromData(a.id, { animeIds: ids, currentIndex: idx >= 0 ? idx : 0 });
        };
        const unhideBtn = document.createElement('button');
        unhideBtn.type = 'button';
        unhideBtn.className = 'data-folder-anime-unhide-btn';
        unhideBtn.textContent = '表示に戻す';
        unhideBtn.onclick = (e) => {
          e.stopPropagation();
          setAnimeHidden(a.id, false);
          openDataFolderModal();
        };
        wrap.appendChild(card);
        wrap.appendChild(unhideBtn);
        hiddenListEl.appendChild(wrap);
      });
    } else if (hiddenSection) {
      hiddenSection.style.display = 'none';
    }
  } catch (err) {
    traveloguesEl.innerHTML = `<p class="data-folder-error">${escapeHtml(err.message || '読み込みに失敗しました')}</p>`;
    animeEl.innerHTML = '';
  }
}

async function openAnimeFromData(id, opts = {}) {
  let { animeIds = [], currentIndex = 0, animeList = null } = opts;
  let anime = animeList?.find(a => a.id === id) ?? animeList?.[currentIndex] ?? null;
  if (!anime) anime = await loadAnimeFromDB(id);
  if (!anime) return;
  if (animeIds.length === 0 && animeList?.length) {
    animeIds = animeList.map(a => a.id);
    const idx = animeIds.indexOf(id);
    currentIndex = idx >= 0 ? idx : 0;
  } else if (animeIds.length === 0 && anime.tripId) {
    const items = await getAnimeAllForTripDisplay(anime.tripId);
    animeIds = items.map(a => a.id);
    const idx = animeIds.indexOf(id);
    currentIndex = idx >= 0 ? idx : 0;
  }
  const contentEl = document.getElementById('animeModalContent');
  const modal = document.getElementById('animeModal');
  const navEl = document.getElementById('animeModalNav');
  const prevBtn = document.getElementById('animeModalPrev');
  const nextBtn = document.getElementById('animeModalNext');
  if (!contentEl || !modal) return;
  contentEl.innerHTML = '';
  const coverImage = anime.coverImage;
  if (coverImage?.data) {
    const wrap = document.createElement('div');
    wrap.className = 'anime-cover-wrap';
    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'anime-cover-thumb';
    const thumbSrc = anime.thumbnail?.data
      ? `data:${anime.thumbnail.mime || 'image/jpeg'};base64,${anime.thumbnail.data}`
      : `data:image/jpeg;base64,${coverImage.data}`;
    const thumbImg = document.createElement('img');
    thumbImg.src = thumbSrc;
    thumbImg.alt = anime.tripName || '旅行アニメ';
    thumb.appendChild(thumbImg);
    thumb.onclick = () => {
      const blob = new Blob([Uint8Array.from(atob(coverImage.data), c => c.charCodeAt(0))], { type: 'image/jpeg' });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
    };
    wrap.appendChild(thumb);
    contentEl.appendChild(wrap);
  } else {
    const pageImages = anime.pageImages || [];
    if (pageImages.length > 0) {
      const container = document.createElement('div');
      container.className = 'anime-comic-pages';
      pageImages.forEach((page) => {
        const wrap = document.createElement('div');
        wrap.className = 'anime-comic-page';
        const img = document.createElement('img');
        img.src = `data:${page.mime || 'image/jpeg'};base64,${page.data}`;
        img.alt = '';
        wrap.appendChild(img);
        container.appendChild(wrap);
      });
      contentEl.appendChild(container);
    } else {
      const grid = document.createElement('div');
      grid.className = 'anime-comic-grid';
      (anime.panels || []).forEach((item) => {
        const panel = document.createElement('div');
        panel.className = 'anime-comic-panel';
        if (item.data) {
          const img = document.createElement('img');
          img.src = `data:${item.mime || 'image/png'};base64,${item.data}`;
          img.alt = '';
          panel.appendChild(img);
        }
        if (item.dialogue) {
          const speech = document.createElement('div');
          speech.className = 'anime-comic-speech';
          speech.textContent = item.dialogue;
          panel.appendChild(speech);
        }
        grid.appendChild(panel);
      });
      contentEl.appendChild(grid);
    }
  }
  if (navEl && prevBtn && nextBtn) {
    if (animeIds.length > 1) {
      navEl.style.display = 'flex';
      prevBtn.disabled = currentIndex <= 0;
      nextBtn.disabled = currentIndex >= animeIds.length - 1;
      prevBtn.onclick = () => {
        if (currentIndex > 0) openAnimeFromData(animeIds[currentIndex - 1], { animeIds, currentIndex: currentIndex - 1 });
      };
      nextBtn.onclick = () => {
        if (currentIndex < animeIds.length - 1) openAnimeFromData(animeIds[currentIndex + 1], { animeIds, currentIndex: currentIndex + 1 });
      };
    } else {
      navEl.style.display = 'none';
    }
  }
  modal.classList.add('open');
}

/**
 * 公開トリップをエクスポート（統合）
 * - ログイン時: ローカルの公開トリップを圧縮して保存。なければサーバーから取得。
 * - 非ログイン時: サーバーの公開トリップをダウンロード。
 */
async function exportPublicTrips() {
  if (!isEditor()) {
    downloadPublicTripsFromServer();
    return;
  }
  const displayTrips = await getDisplayablePublicTrips(true);
  if (displayTrips.length === 0) {
    setStatus('公開トリップがありません。「公開する」にチェックを入れて保存するか、public-trips.json を配置してください。', true);
    return;
  }
  setStatus(`エクスポート準備中（写真・旅行記・アニメ・スタンプを${EXPORT_TARGET_SIZE_MB}MB以下に圧縮）…`);
  const targetBytes = EXPORT_TARGET_SIZE_MB * 1024 * 1024;
  const withExtras = [];
  for (const t of displayTrips) {
    let trip = { ...t };
    delete trip._fromServer;
    try {
      if (!trip.travelogueHtml) {
        const html = await loadTravelogueHtmlFromDB(t.id);
        if (html) trip.travelogueHtml = html;
      }
    } catch (_) {}
    try {
      if (!trip.animeList || trip.animeList.length === 0) {
        const animeList = await getAnimeAllForTripDisplay(t.id, t.animeList);
        if (animeList.length > 0) trip.animeList = animeList;
      }
    } catch (_) {}
    const stampPhotos = collectStampPhotosForTrip(t.id);
    if (stampPhotos) trip.stampPhotos = stampPhotos;
    withExtras.push(trip);
  }
  let compressed = await compressTripsForExport(withExtras, targetBytes);
  const json = JSON.stringify(compressed);
  if (!json || json.length < 2) {
    setStatus('エクスポートデータが空です。トリップに写真・アニメ・旅行記・スタンプのいずれかが含まれているか確認してください。', true);
    return;
  }
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  if (blob.size === 0) {
    setStatus('エクスポートデータの作成に失敗しました。', true);
    return;
  }
  const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
  setStatus(`公開トリップ ${displayTrips.length}件を圧縮しました（${sizeMB}MB）`);

  _pendingExportBlob = blob;
  _pendingExportCount = displayTrips.length;
  _pendingExportFilename = 'public-trips.json.gz';
  applyExportDownloadLink();
  const msgEl = document.getElementById('exportReadyMessage');
  if (msgEl) msgEl.textContent = `公開トリップ ${displayTrips.length}件（${sizeMB}MB）の準備が完了しました。「ダウンロード」で gzip 圧縮して保存します。`;
  document.getElementById('exportReadyModal')?.classList.add('open');
}

function applyExportDownloadLink() {
  const btn = document.getElementById('exportReadyDownloadBtn');
  if (btn) btn.style.display = _pendingExportBlob ? '' : 'none';
}

function closeExportReadyModal() {
  document.getElementById('exportReadyModal')?.classList.remove('open');
  _pendingExportBlob = null;
  _pendingExportCount = 0;
  _pendingExportFilename = 'public-trips.json.gz';
}

async function triggerExportDownload() {
  if (!_pendingExportBlob) return;
  const blob = _pendingExportBlob;
  const count = _pendingExportCount;
  const filename = _pendingExportFilename || 'airgo_export.json.gz';
  closeExportReadyModal();
  if (blob.size === 0) {
    setStatus('エクスポートデータが空です。トリップに写真・アニメ・旅行記・スタンプのいずれかが含まれているか確認してください。', true);
    return;
  }
  const runDownload = async () => {
    const ok = () => setStatus(`${count}件をダウンロードしました。`);
    try {
      const compressedStream = blob.stream().pipeThrough(new CompressionStream('gzip'));
      const compressedBlob = await new Response(compressedStream).blob();
      if (navigator.msSaveBlob) {
        navigator.msSaveBlob(compressedBlob, filename);
        ok();
        return;
      }
      if (typeof window.showSaveFilePicker === 'function') {
        const h = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            { accept: { 'application/gzip': ['.gz'] }, description: 'Gzip' },
            { accept: { 'application/json': ['.json'] }, description: 'JSON' },
          ],
        });
        const w = await h.createWritable();
        await w.write(compressedBlob);
        await w.close();
        ok();
        return;
      }
      const url = URL.createObjectURL(compressedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 10000);
      ok();
    } catch (err) {
      if (err.name === 'AbortError') return;
      setStatus(err.message || '保存に失敗しました', true);
    }
  };
  setTimeout(() => runDownload().catch(e => setStatus(e.message || '保存に失敗しました', true)), 0);
}

function fallbackDownloadPublicTrips(blob, count) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'public-trips.json';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`公開トリップ ${count}件をダウンロードしました。data フォルダに data/public-trips.json として保存してください。`);
}

/** 公開トリップ（サーバー由来）をJSONでダウンロード（gzip圧縮） */
async function downloadPublicTripsFromServer() {
  if (!publicTrips || publicTrips.length === 0) {
    setStatus('公開トリップがありません。読み込み中の場合はしばらく待ってから再度お試しください。', true);
    return;
  }
  try {
    const json = JSON.stringify(publicTrips);
    const blob = new Blob([json], { type: 'application/json' });
    const compressedStream = blob.stream().pipeThrough(new CompressionStream('gzip'));
    const compressedBlob = await new Response(compressedStream).blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(compressedBlob);
    a.download = 'public-trips.json.gz';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(`公開トリップ ${publicTrips.length}件をダウンロードしました（gzip圧縮）。data に配置する際は gunzip で解凍してください`);
  } catch (err) {
    setStatus(err.message || 'ダウンロードに失敗しました', true);
  }
}

const FIRESTORE_LAST_SYNC_KEY = 'airgo_firestore_lastSync';

/** 最終同期時刻を取得（ユーザーごと） */
function getLastSyncAt(uid) {
  try {
    const raw = localStorage.getItem(`${FIRESTORE_LAST_SYNC_KEY}_${uid}`);
    return raw ? parseInt(raw, 10) : null;
  } catch (_) { return null; }
}

/** 最終同期時刻を保存 */
function setLastSyncAt(uid, ts) {
  try {
    localStorage.setItem(`${FIRESTORE_LAST_SYNC_KEY}_${uid}`, String(ts));
  } catch (_) {}
}

/** 最終同期時刻をクリア（強制フル同期用） */
function clearLastSyncAt(uid) {
  try {
    localStorage.removeItem(`${FIRESTORE_LAST_SYNC_KEY}_${uid}`);
  } catch (_) {}
}

/** トリップに付随データ（旅行記・アニメ・スタンプ）を付与 */
async function enrichTripForFirestore(trip) {
  const withExtras = { ...trip };
  try {
    const html = await loadTravelogueHtmlFromDB(trip.id);
    if (html) withExtras.travelogueHtml = html;
  } catch (_) {}
  try {
    const animeList = await getAnimeAllForTripDisplay(trip.id, trip.animeList);
    if (animeList.length > 0) withExtras.animeList = animeList;
  } catch (_) {}
  const stampPhotos = collectStampPhotosForTrip(trip.id);
  if (stampPhotos) withExtras.stampPhotos = stampPhotos;
  return withExtras;
}

/** 差分のみ送信（常に差分モード。初回は削除同期のみでアップロードはスキップ） */
async function uploadDiffOnlyToFirestore() {
  return uploadIndexedDBToFirestore(false, true);
}

/** 表示中の公開トリップ（public-trips.json 由来）を Firestore にアップロード */
async function uploadPublicTripsToFirestore() {
  if (!window.firebaseDb || !window.firebaseAuth?.currentUser) {
    setStatus('Google でログインしてください', true);
    return;
  }
  if (!publicTrips || publicTrips.length === 0) {
    setStatus('アップロードする公開トリップがありません。public-trips.json を配置してから再度お試しください。', true);
    return;
  }
  try {
    setStatus(`公開トリップ ${publicTrips.length}件を Firestore にアップロード中…`);
    let ok = 0;
    let failed = 0;
    for (const trip of publicTrips) {
      try {
        const data = sanitizeForFirestore({ ...trip, userId: window.firebaseAuth.currentUser.uid, public: true });
        if (!data || typeof data !== 'object') {
          failed++;
          continue;
        }
        const dataSize = estimateDataSize(data);
        if (dataSize > 1000000) {
          console.warn(`スキップ（1MB超過）: ${trip.name || trip.id}`);
          failed++;
          continue;
        }
        await window.firebaseDb.collection('trips').doc(trip.id).set(data, { merge: true });
        ok++;
      } catch (e) {
        console.error(`アップロード失敗: ${trip.name || trip.id}`, e);
        failed++;
      }
    }
    await loadPublicTripsFromServer();
    setStatus(`Firestore 完了: ${ok}件アップロード${failed > 0 ? `、${failed}件スキップ` : ''}`);
    setTimeout(() => setStatus(''), 3000);
  } catch (err) {
    console.error('公開トリップ Firestore アップロードエラー:', err);
    setStatus(formatFirestoreError(err), true);
  }
}

/** IndexedDB → Firestore データ移行（初回は全件、以降は差分のみ）
 * @param {boolean} forceFull - true で強制フル同期（全件再送信）
 * @param {boolean} diffOnly - true で常に差分モード（初回でも全件アップロードしない） */
async function uploadIndexedDBToFirestore(forceFull = false, diffOnly = false) {
  if (!window.firebaseDb || !window.firebaseAuth?.currentUser) {
    setStatus('Google でログインしてください', true);
    return;
  }
  const uid = window.firebaseAuth.currentUser.uid;
  try {
    const dbTrips = await loadTripsFromDB();
    if (dbTrips.length === 0) {
      setStatus('IndexedDB にトリップがありません', true);
      return;
    }
    const lastSyncAt = forceFull ? null : getLastSyncAt(uid);
    const isFullMigration = !diffOnly && lastSyncAt == null;

    const toUpload = (diffOnly && lastSyncAt == null)
      ? []
      : (isFullMigration ? dbTrips : dbTrips.filter(t => (t.updatedAt ?? t.createdAt ?? 0) > (lastSyncAt || 0)));

    if (toUpload.length === 0) {
      const fsTrips = await loadTripsFromFirestore();
      const dbIds = new Set(dbTrips.map(t => t.id));
      const toDelete = fsTrips.filter(t => !dbIds.has(t.id));
      if (toDelete.length > 0) {
        setStatus(`削除同期を実行中（${toDelete.length}件）…`);
        for (const t of toDelete) {
          await deleteTripFromFirestore(t.id);
        }
        await refreshTripList();
        setLastSyncAt(uid, Date.now());
        setStatus(`削除同期完了: Firestore から ${toDelete.length}件を削除`);
      } else {
        if (!(diffOnly && lastSyncAt == null)) setLastSyncAt(uid, Date.now());
        setStatus(diffOnly && lastSyncAt == null
          ? '初回同期は「IndexedDB → Firestore に同期」または「全件再送信」を実行してください'
          : '差分なし。Firestore は最新です。');
      }
      setTimeout(() => setStatus(''), 2000);
      return;
    }

    const modeLabel = isFullMigration ? '全件' : '差分';
    setStatus(`${modeLabel}同期: ${toUpload.length}件を Firestore にアップロード中…`);
    let ok = 0;
    for (const trip of toUpload) {
      const withExtras = await enrichTripForFirestore(trip);
      try {
        await saveTripToFirestore(withExtras);
        ok++;
      } catch (e) {
        console.error(`Firestore アップロード失敗: ${trip.name || trip.id}`, e);
        throw new Error(`「${trip.name || trip.id}」のアップロードに失敗: ${e.message}`);
      }
    }

    const fsTrips = await loadTripsFromFirestore();
    const dbIds = new Set(dbTrips.map(t => t.id));
    const toDelete = fsTrips.filter(t => !dbIds.has(t.id));
    for (const t of toDelete) {
      await deleteTripFromFirestore(t.id);
    }

    setLastSyncAt(uid, Date.now());
    await refreshTripList();
    const delMsg = toDelete.length > 0 ? `、削除${toDelete.length}件` : '';
    setStatus(`${modeLabel}同期完了: アップロード${ok}件${delMsg}`);
    setTimeout(() => setStatus(''), 3000);
  } catch (err) {
    console.error('Firestore アップロードエラー:', err);
    setStatus(formatFirestoreError(err), true);
  }
}

async function importTripsFromFile() {
  if (!isEditor()) return;
  const input = document.getElementById('tripImportInput');
  if (!input) return;
  input.value = '';
  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const trips = Array.isArray(data) ? data : (data.trips || []);
      if (trips.length === 0) {
        setStatus('有効なトリップデータが含まれていません', true);
        return;
      }
      setStatus(`トリップ ${trips.length}件をインポート中…`);
      for (const trip of trips) {
        if (!trip.id || !trip.photos || !Array.isArray(trip.photos)) continue;
        const storedPhotos = [];
        for (const p of trip.photos) {
          if (p?.data) {
            try {
              const enc = await resizeBase64ToBase64(p.mime || 'image/jpeg', p.data, DB_PHOTO_MAX_DIM, DB_PHOTO_MAX_DIM, DB_PHOTO_QUALITY);
              const data = enc?.data || p.data;
              const mime = enc?.mime || p.mime || 'image/jpeg';
              storedPhotos.push(buildMinimalPhotoForDB({ ...p, data, mime, url: p.url || p.photoUrl }));
            } catch (_) {
              storedPhotos.push(buildMinimalPhotoForDB({ ...p, url: p.url || p.photoUrl }));
            }
          } else if (p?.lat != null && p?.lng != null) {
            storedPhotos.push(buildMinimalPointForDB(p));
          }
        }
        if (storedPhotos.length === 0) continue;
        let importName = (trip.name || '無題').trim() || '無題';
        while (await isTripNameDuplicate(importName, null)) {
          const m = importName.match(/^(.+?)\s*\((\d+)\)\s*$/);
          const base = m ? m[1] : importName;
          const num = m ? parseInt(m[2], 10) + 1 : 2;
          importName = `${base} (${num})`;
        }
        const toSave = {
          id: trip.id,
          name: importName,
          description: trip.description || null,
          url: trip.url || null,
          videoUrl: trip.videoUrl || null,
          public: !!trip.public,
          color: trip.color || undefined,
          photos: storedPhotos,
          gpxData: trip.gpxData || null,
          createdAt: trip.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        await saveTripWithOfflineSupport(toSave);
        removeFromDeletedTripIds(trip.id);
      }
      await refreshTripList();
      setStatus(`トリップ ${trips.length}件を復元しました`);
    } catch (err) {
      setStatus(formatFirestoreError(err) || err.message || 'インポートに失敗しました', true);
    }
    input.onchange = null;
  };
  input.click();
}

/** トリップ名が他と重複しているか（excludeTripId を除く） */
async function isTripNameDuplicate(name, excludeTripId = null) {
  const normalized = (name || '').trim();
  if (!normalized) return false;
  const allTrips = await getMergedTripsRaw();
  const myTrips = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
  return myTrips.some(t => t.id !== excludeTripId && (t.name || '').trim() === normalized);
}

/** マージ済みトリップ取得（名前重複排除前の内部用） */
async function getMergedTripsRaw() {
  let dbTrips = [];
  if (!isWebDeployment()) {
    try {
      dbTrips = await loadTripsFromDB() || [];
    } catch (err) {
      console.error('トリップ読み込みエラー:', err);
    }
  }
  const byId = new Map();
  dbTrips.forEach(t => { byId.set(t.id, { ...t, _source: 'indexeddb' }); });
  if (window.firebaseDb && window.firebaseAuth?.currentUser) {
    firestoreTrips = await loadTripsFromFirestore();
    firestoreTrips.forEach(t => {
      const existing = byId.get(t.id);
      const fsUpdated = t.updatedAt || 0;
      const existingUpdated = existing?.updatedAt || 0;
      if (!existing || (useFirestoreAsPrimary() && fsUpdated >= existingUpdated)) {
        byId.set(t.id, { ...t, _source: 'firestore' });
      }
    });
  } else {
    firestoreTrips = [];
  }
  const deletedIds = getDeletedTripIds();
  publicTrips.forEach(t => {
    if (byId.has(t.id) || deletedIds.has(t.id)) return;
    const id = 'public_' + t.id;
    if (!byId.has(id)) byId.set(id, { ...t, id, _isPublic: true, _source: 'public' });
  });
  let allTrips = [...byId.values()];
  allTrips = allTrips.filter(t => {
    const rawId = t.id?.replace(/^public_/, '') || t.id;
    return !deletedIds.has(rawId);
  });
  if (!isEditor()) {
    allTrips = allTrips.filter(t => t.id?.startsWith('public_') || t._isPublic);
  }
  return allTrips.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** getMergedTrips の短時間キャッシュ（トリップ表示時の重複呼び出し削減） */
let _mergedTripsCache = null;
let _mergedTripsCacheTime = 0;
const _mergedTripsCacheTtl = 400;

function invalidateMergedTripsCache() {
  _mergedTripsCache = null;
}

/** IndexedDB + Firestore + 公開トリップをマージ。トリップ名が重複する場合は最新の1件のみ表示 */
async function getMergedTrips() {
  const now = Date.now();
  if (_mergedTripsCache && (now - _mergedTripsCacheTime) < _mergedTripsCacheTtl) {
    return _mergedTripsCache;
  }
  let allTrips = await getMergedTripsRaw();
  const byName = new Map();
  for (const t of allTrips) {
    const n = (t.name || '').trim() || '(無題)';
    const existing = byName.get(n);
    if (!existing || (t.updatedAt || 0) > (existing.updatedAt || 0)) {
      byName.set(n, t);
    }
  }
  const deduped = allTrips.filter(t => {
    const n = (t.name || '').trim() || '(無題)';
    return byName.get(n)?.id === t.id;
  });
  const result = deduped.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  _mergedTripsCache = result;
  _mergedTripsCacheTime = Date.now();
  return result;
}

/** 親トリップの子トリップ一覧を表示・更新 */
async function renderParentTripChildren(parentId) {
  const listEl = document.getElementById('tripParentChildrenList');
  const addBtn = document.getElementById('addChildTripBtn');
  if (!listEl || !addBtn) return;
  const allTrips = await getMergedTrips();
  const myTrips = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
  const children = myTrips.filter(t => t.parentTripId === parentId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  listEl.innerHTML = '';
  children.forEach(c => {
    const row = document.createElement('div');
    row.className = 'trip-parent-child-row';
    const photoCount = (c.photos || []).length;
    row.innerHTML = `
      <span class="trip-parent-child-name">${escapeHtml(c.name)}</span>
      <span class="trip-parent-child-count">${photoCount}枚</span>
      <button type="button" class="trip-parent-child-load btn btn-secondary btn-sm" data-id="${escapeHtml(c.id)}">読み込み</button>
    `;
    row.querySelector('.trip-parent-child-load').onclick = () => loadTripAndShowPhoto(c.id, 0);
    listEl.appendChild(row);
  });
  addBtn.onclick = () => addChildTripUnder(parentId);
}

/** 親トリップの下に子トリップを追加（新規作成・親を事前設定） */
async function addChildTripUnder(parentId, parentName = null) {
  if (!parentId) return;
  const nameBeforeClear = parentName ?? (document.getElementById('tripNameInput')?.value?.trim() || parentId);
  clearCurrentTrip();
  isNewTrip = true;
  document.getElementById('tripNameInput').value = '';
  document.getElementById('tripNameInput').placeholder = '子トリップ名を入力';
  document.getElementById('tripParentInput').checked = false;
  document.getElementById('tripParentSelectWrap').style.display = '';
  document.getElementById('tripParentChildrenWrap').style.display = 'none';
  await refreshTripParentSelectOptions();
  const parentSelect = document.getElementById('tripParentSelect');
  if (parentSelect) {
    if (!parentSelect.querySelector(`option[value="${parentId}"]`)) {
      const opt = document.createElement('option');
      opt.value = parentId;
      opt.textContent = nameBeforeClear;
      parentSelect.appendChild(opt);
    }
    parentSelect.value = parentId;
  }
  updateTripDateFieldVisibility();
  updateSaveButtonState();
  document.getElementById('tripSelect').value = '';
  setStatus('子トリップを追加します。名前を入力して写真をアップロードしてください。');
}

/** 子トリップの日付入力欄の表示/非表示を更新 */
function updateTripDateFieldVisibility() {
  const tripDateField = document.getElementById('tripDateField');
  const tripDateHint = document.getElementById('tripDateHint');
  if (!tripDateField) return;
  const isParent = document.getElementById('tripParentInput')?.checked ?? false;
  const parentId = document.getElementById('tripParentSelect')?.value?.trim() || null;
  const isChild = !isParent && !!parentId;
  tripDateField.style.display = isChild ? '' : 'none';
  if (tripDateHint && isChild) {
    const tripDateInput = document.getElementById('tripDateInput');
    tripDateHint.textContent = tripDateInput?.value ? '（編集可）' : 'GPS情報がない場合は入力してください';
  }
}

/** 親トリップ選択肢を更新（親トリップのみ、現在編集中のトリップとその子孫は除外） */
async function refreshTripParentSelectOptions() {
  const select = document.getElementById('tripParentSelect');
  if (!select) return;
  const prevVal = select.value;
  const prevOpt = prevVal ? select.querySelector(`option[value="${prevVal}"]`) : null;
  const prevText = prevOpt?.textContent || '';
  const allTrips = await getMergedTrips();
  const myTrips = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
  const parentTrips = myTrips.filter(t => !!t.isParent);
  const excludeIds = new Set();
  if (currentTripId) {
    excludeIds.add(currentTripId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of myTrips) {
        if (t.parentTripId && excludeIds.has(t.parentTripId) && !excludeIds.has(t.id)) {
          excludeIds.add(t.id);
          changed = true;
        }
      }
    }
  }
  const options = parentTrips.filter(t => !excludeIds.has(t.id));
  select.innerHTML = '<option value="">— なし —</option>';
  options.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  });
  if (prevVal && !options.some(t => t.id === prevVal) && prevText) {
    const opt = document.createElement('option');
    opt.value = prevVal;
    opt.textContent = prevText;
    select.appendChild(opt);
  }
  if (prevVal && (options.some(t => t.id === prevVal) || prevText)) select.value = prevVal;
}

/** トリップを親→子の階層に整理。親のない子トリップは「その他」の下にまとめる。表示順は getMyTripListOrder で取得 */
function organizeTripsByParent(trips) {
  if (!trips || !Array.isArray(trips)) return [];
  try {
    const byId = new Map(trips.map(t => [t.id, { ...t }]));
    const parentIds = new Set(trips.map(t => t.id));
    const tripIds = new Set(trips.map(t => t.id));
    let orderConfig = null;
    try {
      orderConfig = getMyTripListOrder();
    } catch (_) { /* 不正な保存データを無視 */ }
    const rootOrderRaw = orderConfig && Array.isArray(orderConfig.rootOrder) ? orderConfig.rootOrder : [];
    const rootOrder = rootOrderRaw.filter(id => tripIds.has(id));
    const childrenOrderRaw = orderConfig?.childrenOrder && typeof orderConfig.childrenOrder === 'object' ? orderConfig.childrenOrder : {};
    const childrenOrder = {};
    for (const [parentId, order] of Object.entries(childrenOrderRaw)) {
      const filtered = order.filter(id => tripIds.has(id));
      if (filtered.length > 0) childrenOrder[parentId] = filtered;
    }

    const sortByOrder = (arr, orderIds) => {
      if (!Array.isArray(orderIds) || orderIds.length === 0) return arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      try {
        const orderMap = new Map(orderIds.map((id, i) => [String(id), i]));
        return arr.sort((a, b) => {
          const ai = orderMap.get(String(a.id));
          const bi = orderMap.get(String(b.id));
          if (ai != null && bi != null) return ai - bi;
          if (ai != null) return -1;
          if (bi != null) return 1;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
      } catch (_) {
        return arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      }
    };

    const roots = trips.filter(t => !t.parentTripId);
    sortByOrder(roots, rootOrder);

    const childrenByParent = new Map();
    for (const t of trips) {
      if (t.parentTripId) {
        const arr = childrenByParent.get(t.parentTripId) || [];
        arr.push(byId.get(t.id) || t);
        childrenByParent.set(t.parentTripId, arr);
      }
    }
    for (const [parentId, arr] of childrenByParent) {
      sortByOrder(arr, childrenOrder[parentId]);
    }

    const result = roots.map(p => ({
      parent: byId.get(p.id) || p,
      children: childrenByParent.get(p.id) || []
    }));
    const orphanChildren = trips.filter(t => t.parentTripId && !parentIds.has(t.parentTripId));
    if (orphanChildren.length > 0) {
      sortByOrder(orphanChildren, childrenOrder['_other']);
      const otherParent = { id: '_other', name: 'その他', isParent: true, _virtual: true };
      result.push({ parent: otherParent, children: orphanChildren });
    }
    return result;
  } catch (err) {
    console.error('organizeTripsByParent error:', err);
    try { localStorage.removeItem(MY_TRIP_LIST_ORDER_KEY); } catch (_) {}
    return _organizeTripsByParentFallback(trips);
  }
}

function _organizeTripsByParentFallback(trips) {
  if (!trips || !Array.isArray(trips)) return [];
  const byId = new Map(trips.map(t => [t.id, { ...t }]));
  const parentIds = new Set(trips.map(t => t.id));
  const roots = trips.filter(t => !t.parentTripId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const childrenByParent = new Map();
  for (const t of trips) {
    if (t.parentTripId) {
      const arr = childrenByParent.get(t.parentTripId) || [];
      arr.push(byId.get(t.id) || t);
      childrenByParent.set(t.parentTripId, arr);
    }
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  const result = roots.map(p => ({
    parent: byId.get(p.id) || p,
    children: (childrenByParent.get(p.id) || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }));
  const orphanChildren = trips.filter(t => t.parentTripId && !parentIds.has(t.parentTripId));
  if (orphanChildren.length > 0) {
    orphanChildren.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    result.push({ parent: { id: '_other', name: 'その他', isParent: true, _virtual: true }, children: orphanChildren });
  }
  return result;
}

async function refreshTripList() {
  let allTrips;
  try {
    allTrips = await getMergedTrips();
  } catch (err) {
    setStatus('トリップの読み込みに失敗しました。インポートで復元できます。', true);
    return;
  }
  updateDbIndicator();
  const select = document.getElementById('tripSelect');
  const prevVal = select.value;
  select.innerHTML = '<option value="">— 読み込む —</option>';
  const myTripsRaw = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
  const myTripsById = new Map(myTripsRaw.map(t => [t.id, t]));
  const myTrips = [...myTripsById.values()];
  const hierarchy = organizeTripsByParent(myTrips).filter(g => g.parent.id !== '_other');
  hierarchy.forEach(({ parent, children }) => {
    const opt = document.createElement('option');
    opt.value = parent.id;
    const label = (parent.id.startsWith('public_') || parent.public) ? ' [公開]' : '';
    const photoCount = (parent.photos || []).length;
    opt.textContent = parent.isParent ? `📁 ${parent.name}（${children.length}件）${label}` : `${parent.name} (${photoCount}枚)${label}`;
    select.appendChild(opt);
    children.forEach(c => {
      const cOpt = document.createElement('option');
      cOpt.value = c.id;
      const cLabel = (c.id.startsWith('public_') || c.public) ? ' [公開]' : '';
      cOpt.textContent = `　└ ${c.name} (${(c.photos || []).length}枚)${cLabel}`;
      select.appendChild(cOpt);
    });
  });
  const publicTripsForSelect = allTrips.filter(t => t.id?.startsWith('public_') || t._isPublic);
  const publicById = new Map(publicTripsForSelect.map(t => [t.id, t]));
  [...publicById.values()].forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name} (${(t.photos || []).length}枚) [公開]`;
    select.appendChild(opt);
  });
  select.value = prevVal && allTrips.some(t => t.id === prevVal) ? prevVal : '';
}

async function deleteTrip() {
  if (!isEditor()) return;
  let id = document.getElementById('tripSelect').value;
  if (!id) return;
  if (id.startsWith('public_')) {
    setStatus('公開トリップは削除できません（public-trips.json 由来）', true);
    return;
  }
  if (!confirm('このトリップを削除しますか？')) return;

  try {
    await deleteTripWithOfflineSupport(id);
    await cleanupTripRelatedData(id);
    if (currentTripId === id) clearCurrentTrip();
    document.getElementById('tripSelect').value = '';
    await refreshTripList();
    await renderTripListPanel();
    await renderPublicTripsPanel();
    document.getElementById('deleteTripBtn').disabled = true;
    setStatus('トリップを削除しました');
  } catch (err) {
    console.error('deleteTrip error:', err);
    setStatus(err.message || 'トリップの削除に失敗しました', true);
  }
}

/* --- トリップ一覧パネル --- */
let _tripListUrls = [];

async function renderTripListPanel() {
  const allTrips = await getMergedTrips();
  const body = document.getElementById('tripListBody');
  if (!body) return;
  body.innerHTML = '';

  _tripListUrls.forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
  _tripListUrls = [];

  allTrips.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const myTripsRaw = allTrips.filter(t => !t.id?.startsWith('public_') && !t._isPublic);
  const myTripsById = new Map(myTripsRaw.map(t => [t.id, t]));
  const myTrips = [...myTripsById.values()];
  const hierarchy = organizeTripsByParent(myTrips).filter(g => g.parent.id !== '_other');

  const isMobile = isMobileView();
  const rootCount = hierarchy.length;
  for (let groupIndex = 0; groupIndex < hierarchy.length; groupIndex++) {
    const { parent, children } = hierarchy[groupIndex];
    let parentThumb = null;
    if (parent.isParent && !parent.photos?.length) {
      parentThumb = await getParentTripThumbnail(parent, children);
    }
    const renderTripItem = (trip, isChild = false, childIndex = -1, groupIdx = -1, thumbForParent = null) => {
      const item = document.createElement('div');
      const parentClass = !isChild && trip.isParent ? ' trip-list-item-parent' : '';
      item.className = 'trip-list-item' + (isChild ? ' trip-list-item-child' : parentClass);
      const tripColor = getTripColor(trip);
      item.style.setProperty('--trip-accent', tripColor);
      const photos = trip.photos || [];
      const showDelete = isEditor() && !isMobile && !trip._isPublic && !trip._virtual;
      const showChildOrderBtns = isEditor() && !trip._isPublic && !trip._virtual && isChild && children.length > 1;
      const showRootOrderBtns = isEditor() && !trip._isPublic && !trip._virtual && !isChild && rootCount > 1 && !trip._virtual;
      const showOrderBtns = showChildOrderBtns || showRootOrderBtns;
      const countText = trip.isParent ? `（${children.length}件）` : `${photos.length}枚`;
      item.innerHTML = `
      <div class="trip-list-item-header">
        <span class="trip-list-item-info">
          <span class="trip-list-item-name">${isChild ? '└ ' : ''}${trip.isParent ? '📁 ' : ''}${escapeHtml(trip.name)}</span>
          <span class="trip-list-item-count">${countText}</span>
        </span>
        ${showOrderBtns ? `
        <div class="trip-list-order-btns">
          <button type="button" class="trip-list-order-btn" data-dir="up" data-parent-id="${escapeHtml(parent.id)}" data-child-index="${childIndex}" data-group-index="${groupIdx}" data-is-root="${!isChild}" aria-label="上へ">↑</button>
          <button type="button" class="trip-list-order-btn" data-dir="down" data-parent-id="${escapeHtml(parent.id)}" data-child-index="${childIndex}" data-group-index="${groupIdx}" data-is-root="${!isChild}" aria-label="下へ">↓</button>
        </div>
        ` : ''}
        ${showDelete ? '<button type="button" class="trip-list-delete-btn" title="トリップと写真を削除">削除</button>' : ''}
      </div>
      <div class="trip-list-photos"></div>
    `;
    const header = item.querySelector('.trip-list-item-header');
    const photosDiv = item.querySelector('.trip-list-photos');
    const deleteBtn = item.querySelector('.trip-list-delete-btn');

    const tripId = trip._isPublic ? trip.id : trip.id;
    const origTripId = trip._isPublic ? trip.id.slice(7) : trip.id;
    if (showOrderBtns) {
      item.querySelectorAll('.trip-list-order-btn').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          e.preventDefault();
          const dir = btn.dataset.dir;
          const isRoot = btn.dataset.isRoot === 'true';
          const config = getMyTripListOrder() || {};
          if (isRoot) {
            const groupIdx = parseInt(btn.dataset.groupIndex, 10);
            if (groupIdx < 0 || groupIdx >= hierarchy.length) return;
            const swapIdx = dir === 'up' ? groupIdx - 1 : groupIdx + 1;
            if (swapIdx < 0 || swapIdx >= hierarchy.length) return;
            const rootOrder = [...(config.rootOrder || hierarchy.map(g => g.parent.id))];
            const id1 = hierarchy[groupIdx].parent.id;
            const id2 = hierarchy[swapIdx].parent.id;
            const idx1 = rootOrder.indexOf(id1);
            const idx2 = rootOrder.indexOf(id2);
            if (idx1 < 0 || idx2 < 0) return;
            [rootOrder[idx1], rootOrder[idx2]] = [rootOrder[idx2], rootOrder[idx1]];
            saveMyTripListOrder({ ...config, rootOrder });
          } else {
            const parentId = btn.dataset.parentId;
            const idx = parseInt(btn.dataset.childIndex, 10);
            if (idx < 0 || idx >= children.length) return;
            const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
            if (swapIdx < 0 || swapIdx >= children.length) return;
            const childrenOrder = config.childrenOrder || {};
            let order = childrenOrder[parentId] || children.map(c => c.id);
            [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
            saveMyTripListOrder({ ...config, childrenOrder: { ...childrenOrder, [parentId]: order } });
          }
          await refreshTripList();
          await renderTripListPanel();
          setStatus('順番を変更しました');
        };
      });
    }
    if (deleteBtn) {
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!confirm(`「${escapeHtml(trip.name)}」とその写真を削除しますか？`)) return;
        try {
          await deleteTripFromDB(origTripId);
          await deleteTripFromFirestore(origTripId);
          await cleanupTripRelatedData(origTripId);
          if (currentTripId === origTripId) clearCurrentTrip();
          await refreshTripList();
          await renderTripListPanel();
          await renderPublicTripsPanel();
          setStatus('トリップを削除しました');
        } catch (err) {
          console.error('deleteTripFromDB error:', err);
          setStatus(err.message || 'トリップの削除に失敗しました', true);
        }
      };
    }
    header.onclick = () => {
      if (item.classList.contains('expanded')) {
        if (isEditor() && !trip._isPublic) {
          item.classList.remove('expanded');
        } else {
          loadTripAndShowPhoto(tripId, 0);
        }
      } else {
        item.classList.add('expanded');
      }
    };
    if (trip._isPublic) header.title = 'クリックで読み込み';

    if (trip.isParent && thumbForParent && photos.length === 0) {
      const div = document.createElement('div');
      div.className = 'trip-list-photo trip-list-photo-thumb';
      div.title = 'サムネイル';
      const img = document.createElement('img');
      img.src = base64ToUrl(thumbForParent.mime, thumbForParent.data);
      _tripListUrls.push(img.src);
      img.alt = '';
      div.appendChild(img);
      div.onclick = (e) => {
        e.stopPropagation();
        loadTripAndShowPhoto(tripId, 0);
      };
      photosDiv.appendChild(div);
    }
    photos.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'trip-list-photo';
      div.title = p.name;
      if (p.data && p.mime) {
        const img = document.createElement('img');
        img.src = base64ToUrl(p.mime, p.data);
        _tripListUrls.push(img.src);
        img.alt = p.name;
        div.appendChild(img);
      }
      div.onclick = (e) => {
        e.stopPropagation();
        if (isEditor() && !trip._isPublic) {
          openPhotoEditModalFromTrip(origTripId, i);
        } else {
          loadTripAndShowPhoto(tripId, i);
        }
      };
      photosDiv.appendChild(div);
    });
    return item;
    };

    const group = document.createElement('div');
    group.className = 'trip-list-group';
    const hasChildren = children.length > 0;
    const parentItem = renderTripItem(parent, false, -1, groupIndex, parentThumb);

    if (hasChildren) {
      const expandIcon = document.createElement('span');
      expandIcon.className = 'trip-list-expand-icon';
      expandIcon.textContent = '▶';
      expandIcon.setAttribute('aria-hidden', 'true');
      parentItem.querySelector('.trip-list-item-info').insertBefore(expandIcon, parentItem.querySelector('.trip-list-item-info').firstChild);
      parentItem.querySelector('.trip-list-item-header').onclick = () => {
        const groupEl = parentItem.closest('.trip-list-group');
        const childrenEl = groupEl?.querySelector('.trip-list-children');
        if (childrenEl) {
          const isExpanded = groupEl.classList.contains('expanded');
          groupEl.classList.toggle('expanded');
          expandIcon.textContent = isExpanded ? '▶' : '▼';
        }
      };
    } else {
      parentItem.querySelector('.trip-list-item-header').onclick = () => {
        const tripId = parent._isPublic ? parent.id : parent.id;
        if (parentItem.classList.contains('expanded')) {
          if (isEditor() && !parent._isPublic) {
            parentItem.classList.remove('expanded');
          } else {
            loadTripAndShowPhoto(tripId, 0);
          }
        } else {
          parentItem.classList.add('expanded');
        }
      };
    }

    group.appendChild(parentItem);
    if (hasChildren) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'trip-list-children';
      children.forEach((c, i) => {
        const childItem = renderTripItem(c, true, i, groupIndex, null);
        childItem.querySelector('.trip-list-item-header').onclick = () => {
          if (childItem.classList.contains('expanded')) {
            if (isEditor() && !c._isPublic) {
              childItem.classList.remove('expanded');
            } else {
              loadTripAndShowPhoto(c._isPublic ? c.id : c.id, 0);
            }
          } else {
            childItem.classList.add('expanded');
          }
        };
        childrenContainer.appendChild(childItem);
      });
      group.appendChild(childrenContainer);
    }
    body.appendChild(group);
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

/** ランドマーク番号・名を保存用に正規化（"0" や空白を正しく扱う） */
function toLandmarkValue(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

async function goToHome() {
  if (isPlaying) stopPlay();
  clearCurrentTrip();
  _currentViewingTripId = null;
  _mobileChildrenViewParentId = null;
  _showTripListInPanel = true;
  document.getElementById('tripSelect').value = '';
  closeMenu();
  document.getElementById('allPhotosThumbnails').classList.remove('visible');
  await updateTripInfoDisplay(null);
  setStatus('');
  const groups = await getHomeTripsGrouped();
  const displayTrips = groups.flatMap(g => [g.parent, ...g.children]);
  await renderPublicTripsPanel();
  await addHomeMarkers(displayTrips);
  if (map) setMapToOsm();
}

async function renderMenuMobileTripList() {
  const container = document.getElementById('menuMobileTripList');
  if (!container || !isMobileView()) return;
  const prevUrls = container._urlsToRevoke;
  if (prevUrls) {
    prevUrls.forEach(u => { if (u?.startsWith?.('blob:')) URL.revokeObjectURL(u); });
  }
  container.innerHTML = '';
  const groups = await getDisplayablePublicTripsGrouped();
  if (groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'menu-mobile-trip-empty';
    empty.textContent = '公開トリップがありません';
    container.appendChild(empty);
    return;
  }
  const urlsToRevoke = [];
  for (const group of groups) {
    const trip = group.parent;
    const children = group.children || [];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'menu-mobile-trip-card';
    const tripColor = getTripColor(trip);
    card.style.setProperty('--trip-accent', tripColor);
    let thumbSrc = '';
    if (trip.isParent && !trip.photos?.length) {
      const parentThumb = await getParentTripThumbnail(trip, children);
      if (parentThumb) {
        thumbSrc = base64ToUrl(parentThumb.mime, parentThumb.data);
        urlsToRevoke.push(thumbSrc);
      }
    } else {
      const photos = trip.photos || [];
      const firstPhoto = photos[0];
      if (firstPhoto?.data) {
        thumbSrc = base64ToUrl(firstPhoto.mime, firstPhoto.data);
        urlsToRevoke.push(thumbSrc);
      }
    }
    const name = (trip.name || 'トリップ').slice(0, 20);
    card.innerHTML = thumbSrc
      ? `<img src="${thumbSrc}" alt="" class="menu-mobile-trip-thumb"><span class="menu-mobile-trip-name">${escapeHtml(name)}</span>`
      : `<span class="menu-mobile-trip-name">${escapeHtml(name)}</span>`;
    const loadId = trip._fromServer ? 'public_' + trip.id : trip.id;
    card.onclick = () => {
      loadTripAndShowPhoto(loadId, 0);
      closeMenu();
    };
    container.appendChild(card);
    for (const child of children) {
      const cCard = document.createElement('button');
      cCard.type = 'button';
      cCard.className = 'menu-mobile-trip-card menu-mobile-trip-child';
      cCard.style.setProperty('--trip-accent', getTripColor(child));
      const cPhotos = child.photos || [];
      const cFirst = cPhotos[0];
      let cThumb = '';
      if (cFirst?.data) {
        cThumb = base64ToUrl(cFirst.mime, cFirst.data);
        urlsToRevoke.push(cThumb);
      }
      const cName = (child.name || 'トリップ').slice(0, 20);
      cCard.innerHTML = cThumb
        ? `<img src="${cThumb}" alt="" class="menu-mobile-trip-thumb"><span class="menu-mobile-trip-name">└ ${escapeHtml(cName)}</span>`
        : `<span class="menu-mobile-trip-name">└ ${escapeHtml(cName)}</span>`;
      const cLoadId = child._fromServer ? 'public_' + child.id : child.id;
      cCard.onclick = () => {
        loadTripAndShowPhoto(cLoadId, 0);
        closeMenu();
      };
      container.appendChild(cCard);
    }
  }
  container._urlsToRevoke = urlsToRevoke;
}

function openMenu() {
  if (isEditor()) updateAiSettingsUI();
  document.getElementById('menuOverlay').classList.add('visible');
  document.getElementById('menuPanelsWrapper').classList.add('open');
  document.getElementById('settingsPanel').classList.remove('open');
  if (isMobileView()) renderMenuMobileTripList();
}

function closeMenu() {
  document.getElementById('menuOverlay').classList.remove('visible');
  document.getElementById('menuPanelsWrapper').classList.remove('open');
  document.getElementById('settingsPanel').classList.remove('open');
}

function openSettings() {
  if (isEditor()) updateAiSettingsUI();
  document.getElementById('settingsPanel').classList.add('open');
}

function closeSettings() {
  document.getElementById('settingsPanel').classList.remove('open');
}

function openTripListPanel() {
  if (!isEditor()) return;
  const overlay = document.getElementById('tripListOverlay');
  const panel = document.getElementById('tripListPanel');
  if (overlay) overlay.classList.add('visible');
  if (panel) panel.classList.add('open');
  renderTripListPanel();
}

function closeTripListPanel() {
  const overlay = document.getElementById('tripListOverlay');
  const panel = document.getElementById('tripListPanel');
  if (overlay) overlay.classList.remove('visible');
  if (panel) panel.classList.remove('open');
}

/* --- 写真編集モーダル --- */
let _photoEditTripId = null;
let _photoEditIndex = null;
let _photoEditIsPoint = false;
let _photoEditPreviewUrl = null;

function openPhotoEditModal(photoIndex) {
  if (!isEditor() || photos.length === 0) return;
  if (_photoEditPreviewUrl) {
    URL.revokeObjectURL(_photoEditPreviewUrl);
    _photoEditPreviewUrl = null;
  }
  // 新規トリップの場合は特別なIDを設定
  _photoEditTripId = currentTripId || (isNewTrip ? '__new_trip__' : null);
  _photoEditIndex = photoIndex;
  const photo = photos[photoIndex];
  if (!photo) return;

  _photoEditIsPoint = !hasPhotoData(photo);
  const updateField = document.getElementById('photoEditPhotoUpdateField');
  const updateLabel = document.getElementById('photoEditPhotoUpdateLabel');
  const addPhotoInput = document.getElementById('photoEditAddPhotoInput');
  if (updateField) updateField.style.display = '';
  if (updateLabel) updateLabel.textContent = _photoEditIsPoint ? '写真を追加:' : '写真を更新:';
  if (addPhotoInput) addPhotoInput.value = '';

  if (_photoEditIsPoint) {
    document.getElementById('photoEditPreview').innerHTML = '<div class="photo-edit-point-preview"><span class="photo-edit-point-icon">📍</span><span>' + escapeHtml(photo.placeName || photo.landmarkName || photo.name || 'ポイント') + '</span></div>';
  } else {
    document.getElementById('photoEditPreview').innerHTML = `<img src="${photo.url}" alt="${escapeHtml(photo.name)}" loading="lazy">`;
  }
  document.getElementById('photoEditLandmarkNo').value = photo.landmarkNo ?? '';
  document.getElementById('photoEditLandmarkName').value = photo.landmarkName ?? '';
  document.getElementById('photoEditDesc').value = photo.description || photo.name || photo.placeName || photo.landmarkName || '';
  document.getElementById('photoEditUrl').value = photo.photoUrl || '';
  document.getElementById('photoEditModal').classList.add('open');
}

async function openPhotoEditModalFromTrip(tripId, photoIndex) {
  if (!isEditor()) return;
  const trip = await getTripById(tripId);
  if (!trip || !trip.photos || !trip.photos[photoIndex]) return;
  const p = trip.photos[photoIndex];
  _photoEditTripId = tripId;
  _photoEditIndex = photoIndex;
  _photoEditIsPoint = !hasPhotoData(p);

  if (_photoEditPreviewUrl) {
    URL.revokeObjectURL(_photoEditPreviewUrl);
    _photoEditPreviewUrl = null;
  }
  const updateField = document.getElementById('photoEditPhotoUpdateField');
  const updateLabel = document.getElementById('photoEditPhotoUpdateLabel');
  if (updateField) updateField.style.display = '';
  if (updateLabel) updateLabel.textContent = _photoEditIsPoint ? '写真を追加:' : '写真を更新:';
  if (_photoEditIsPoint) {
    document.getElementById('photoEditPreview').innerHTML = '<div class="photo-edit-point-preview"><span class="photo-edit-point-icon">📍</span><span>' + escapeHtml(p.placeName || p.landmarkName || p.name || 'ポイント') + '</span></div>';
  } else {
    _photoEditPreviewUrl = base64ToUrl(p.mime, p.data);
    document.getElementById('photoEditPreview').innerHTML = `<img src="${_photoEditPreviewUrl}" alt="${escapeHtml(p.name)}" loading="lazy">`;
  }
  document.getElementById('photoEditLandmarkNo').value = p.landmarkNo ?? '';
  document.getElementById('photoEditLandmarkName').value = p.landmarkName ?? '';
  document.getElementById('photoEditDesc').value = p.description || p.name || p.placeName || p.landmarkName || '';
  document.getElementById('photoEditUrl').value = p.url || '';
  document.getElementById('photoEditModal').classList.add('open');
}

function closePhotoEditModal() {
  document.getElementById('photoEditModal').classList.remove('open');
  if (_photoEditPreviewUrl) {
    URL.revokeObjectURL(_photoEditPreviewUrl);
    _photoEditPreviewUrl = null;
  }
  _photoEditTripId = null;
  _photoEditIndex = null;
  _photoEditIsPoint = false;
}

function showUrlPopup(url) {
  const input = document.getElementById('urlPopupInput');
  const modal = document.getElementById('urlPopupModal');
  if (input && modal) {
    input.value = url || '';
    modal.classList.add('open');
  }
}

function openUrlInPopup(url) {
  if (!url) return;
  const w = Math.min(900, screen.width - 40);
  const h = Math.min(700, screen.height - 80);
  const left = Math.round((screen.width - w) / 2);
  const top = Math.round((screen.height - h) / 2);
  window.open(url, '_blank', `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`);
}

async function savePhotoEdit() {
  const landmarkNo = toLandmarkValue(document.getElementById('photoEditLandmarkNo').value);
  const landmarkName = toLandmarkValue(document.getElementById('photoEditLandmarkName').value);
  const desc = document.getElementById('photoEditDesc').value.trim() || null;
  const url = document.getElementById('photoEditUrl').value.trim() || null;

  // 新規トリップまたは既存トリップが必要
  const isNewTripEdit = _photoEditTripId === '__new_trip__';
  if (!_photoEditTripId && !isNewTrip) {
    closePhotoEditModal();
    setStatus('保存できません（トリップが読み込まれていません。メニューからトリップを選択して「読み込み」してください）', true);
    return;
  }

  // 公開トリップは保存不可
  if (_photoEditTripId?.startsWith('public_')) {
    closePhotoEditModal();
    setStatus('公開トリップは編集・保存できません', true);
    return;
  }

  // ポイントの状態を再確認（写真が追加されている可能性があるため）
  const p = photos[_photoEditIndex];
  if (p) {
    _photoEditIsPoint = !hasPhotoData(p);
  }

  // メモリ上の photos を更新（表示中のトリップの場合）
  if ((currentTripId === _photoEditTripId || isNewTripEdit) && photos[_photoEditIndex]) {
    const photo = photos[_photoEditIndex];
    photo.landmarkNo = landmarkNo;
    photo.landmarkName = landmarkName;
    photo.description = desc;
    photo.photoUrl = url;
    if (_photoEditIsPoint && desc) photo.name = photo.placeName = desc;
  }

  const metadata = { landmarkNo, landmarkName, description: desc, url };
  if (_photoEditIsPoint && desc) {
    metadata.name = desc;
    metadata.placeName = desc;
  }
  let saved = false;
  const hasNewPhoto = p && (p.file || p.data);
  try {
    // 新規トリップ、またはポイントに写真を追加した場合は、トリップ全体を保存
    if (isNewTripEdit || (currentTripId === _photoEditTripId && hasNewPhoto)) {
      console.log('トリップ全体を保存します (新規トリップ or ポイントに写真追加)');
      saved = await saveTrip({ skipOpenTripList: true });
    } else {
      // メタデータのみの更新
      const dbIndex = (p?._dbIndex != null) ? p._dbIndex : _photoEditIndex;
      saved = await savePhotoMetadataToDB(_photoEditTripId, dbIndex, metadata);
    }
  } catch (err) {
    console.error('savePhotoEdit error:', err);
    setStatus(err.message || '保存中にエラーが発生しました', true);
  }

  closePhotoEditModal();

  if (saved) {
    closeTripListPanel();
    // 新規トリップまたは表示中のトリップの場合、表示を更新
    if ((isNewTripEdit || currentTripId === _photoEditTripId) && photos[_photoEditIndex]) {
      addPhotoMarkers();
      const strip = document.getElementById('allPhotosStrip');
      if (strip?.parentElement?.classList.contains('visible')) renderAllPhotosStrip();
      document.getElementById('playPhotoOverlay')?.classList.remove('visible');
      showPhoto(_photoEditIndex, { popupOnly: true });
    }
    setStatus('詳細設定を保存しました');
    setTimeout(() => setStatus(''), 2000);
    Promise.all([refreshTripList(), renderPublicTripsPanel(), renderTripListPanel()]).catch(() => {});
  } else {
    setStatus('保存に失敗しました。トリップ名を入力してから再度お試しください。', true);
  }
}

async function downloadVideo() {
  const indices = photos.map((p, i) => i).filter(i => photos[i].lat != null && photos[i].lng != null);
  if (indices.length === 0) {
    setStatus('GPS付きの写真がありません', true);
    return;
  }
  const interval = parseInt(document.getElementById('intervalSelect').value, 10) * 1000;
  const fps = 30;
  const width = 1280;
  const height = 720;

  setStatus('動画を作成中…');
  const btn = document.getElementById('downloadVideoBtn');
  if (btn) btn.disabled = true;

  const loadImage = (src) => new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  const imgs = [];
  for (const i of indices) {
    const img = await loadImage(photos[i].url);
    imgs.push(img);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const stream = canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9' : 'video/webm';
  const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
  const chunks = [];
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `airgo-${currentTripId || 'trip'}-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('動画をダウンロードしました');
    if (btn) btn.disabled = false;
  };

  mediaRecorder.start(1000);

  const drawPhoto = (img) => {
    if (!img) {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, width, height);
      return;
    }
    const scale = Math.max(width / img.width, height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  };

  for (let i = 0; i < imgs.length; i++) {
    drawPhoto(imgs[i]);
    const frames = Math.ceil((interval / 1000) * fps);
    for (let f = 0; f < frames; f++) {
      await new Promise(r => requestAnimationFrame(r));
    }
  }

  mediaRecorder.stop();
}

async function downloadVideoWithErrorHandling() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    setStatus('お使いのブラウザでは動画のダウンロードに対応していません', true);
    return;
  }
  try {
    await downloadVideo();
  } catch (err) {
    setStatus(err.message || '動画の作成に失敗しました', true);
  }
}

async function setup() {
  initMap();
  initMapSearch();
  await loadPublicTripsFromServer();
  await updateTripInfoDisplay(null);
  deleteOrphanTrips().then(n => { if (n > 0) console.log('孤立トリップ削除:', n, '件'); }).catch(err => console.warn('孤立トリップ削除:', err));
  cleanupOrphanedStorage().catch(err => console.warn('ストレージ最適化:', err));
  updateEditorUI();

  document.getElementById('authBtn').onclick = async () => {
    if (isEditor()) {
      if (window.firebaseAuth) await window.firebaseAuth.signOut().catch(() => {});
      updateEditorUI();
      await refreshTripList();
      setStatus('ログアウトしました');
    } else {
      if (window.firebaseAuth && typeof firebase !== 'undefined') {
        closeMenu();
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
          if (isMobileView()) {
            setStatus('Googleでログイン中…');
            await window.firebaseAuth.signInWithRedirect(provider);
          } else {
            await window.firebaseAuth.signInWithPopup(provider);
            updateEditorUI();
            await refreshTripList();
            setStatus('Googleでログインしました');
          }
        } catch (err) {
          console.error('Google ログインエラー:', err);
          if (!isMobileView() && err?.code === 'auth/popup-blocked') {
            setStatus('ポップアップがブロックされました。リダイレクトでログインします…', true);
            try {
              await window.firebaseAuth.signInWithRedirect(provider);
            } catch (e) {
              setStatus('ブラウザのポップアップブロックを解除するか、別のブラウザでお試しください', true);
            }
          } else {
            setStatus(err.message || 'Googleでログインに失敗しました', true);
          }
        }
      } else {
        const isProd = /airgo\.ktrips\.net|air\.ktrips\.net/.test(location.hostname);
        const loadFailed = !!window.FIREBASE_CONFIG_LOAD_FAILED;
        let msg;
        if (loadFailed) {
          msg = isProd
            ? 'firebase-config.js が読み込めません。GitHub Secrets の FIREBASE_CONFIG_JS を設定し、再デプロイしてください。'
            : 'firebase-config.js が読み込めません。ローカルサーバー（python3 -m http.server 8080）で起動していますか？';
        } else {
          msg = isProd
            ? 'Firebase の設定が必要です。GitHub Secrets に FIREBASE_CONFIG_JS を登録し、main に push して再デプロイしてください。'
            : 'Firebase の設定が必要です。firebase-config.js の内容を確認し、ブラウザの Console（F12）でエラーを確認してください。';
        }
        setStatus(msg, true);
      }
    }
  };

  // Firebase リダイレクトログインの結果を処理（signInWithRedirect 後の戻り時に必要）
  if (window.firebaseAuth) {
    window.firebaseAuth.getRedirectResult().then(result => {
      if (result?.user) {
        updateEditorUI();
        refreshTripList();
        setStatus('Googleでログインしました');
      }
    }).catch(err => console.warn('getRedirectResult:', err));
  }

  // Firebase 認証状態の監視（ページ読み込み時に既にログイン済みの場合）
  if (window.firebaseAuth) {
    window.firebaseAuth.onAuthStateChanged(async user => {
      if (user) {
        console.log('Firebase 認証: ログイン検知', user.uid);
        updateEditorUI();

        // Firestore からローカルに初期同期
        await syncFirestoreToLocalAll();

        // オフラインキューを処理
        await processOfflineQueue();

        // リアルタイム同期を開始
        subscribeToFirestoreTrips();

        await refreshTripList();
      } else {
        console.log('Firebase 認証: ログアウト検知');

        // リアルタイム同期を停止
        unsubscribeFromFirestore();

        updateDbIndicator();
      }
    });
  }

  // オンライン/オフライン時に DB インジケーターを更新し、オンライン復帰時は Firestore から再取得
  window.addEventListener('online', async () => {
    console.log('オンライン復帰');
    updateDbIndicator();

    // オフラインキューを処理
    await processOfflineQueue();

    // リアルタイム同期を再開
    if (window.firebaseAuth?.currentUser) {
      subscribeToFirestoreTrips();
    }

    if (useFirestoreAsPrimary()) await refreshTripList();
  });
  window.addEventListener('offline', () => {
    console.log('オフライン');
    updateDbIndicator();

    // リアルタイム同期を停止
    unsubscribeFromFirestore();
  });

  document.getElementById('helpBtn').onclick = () => {
    document.getElementById('helpModal').classList.add('open');
  };
  document.getElementById('helpModalClose').onclick = () => {
    document.getElementById('helpModal').classList.remove('open');
  };
  document.getElementById('helpModal').onclick = e => {
    if (e.target.id === 'helpModal') document.getElementById('helpModal').classList.remove('open');
  };

  document.getElementById('openDataFolderBtn').onclick = () => openDataFolderModal();
  document.getElementById('dataFolderModalClose').onclick = () => document.getElementById('dataFolderModal').classList.remove('open');
  document.getElementById('dataFolderModal').onclick = (e) => {
    if (e.target.id === 'dataFolderModal') document.getElementById('dataFolderModal').classList.remove('open');
  };
  document.getElementById('publicTripConfigClose').onclick = () => {
    document.getElementById('publicTripConfigModal').classList.remove('open');
  };
  document.getElementById('animeModalClose').onclick = () => {
    document.getElementById('animeModal').classList.remove('open');
  };
  document.getElementById('animeModal').onclick = (e) => {
    if (e.target.id === 'animeModal') document.getElementById('animeModal').classList.remove('open');
  };
  document.getElementById('stampsModalClose').onclick = () => {
    document.getElementById('stampsModal').classList.remove('open');
  };
  document.getElementById('stampsModal').onclick = (e) => {
    if (e.target.id === 'stampsModal') document.getElementById('stampsModal').classList.remove('open');
  };
  document.getElementById('exportReadyModalClose').onclick = () => {
    closeExportReadyModal();
  };
  document.getElementById('exportReadyModal').onclick = (e) => {
    if (e.target.id === 'exportReadyModal') closeExportReadyModal();
  };
  document.getElementById('exportReadyDownloadBtn').onclick = () => triggerExportDownload();
  document.getElementById('publicTripConfigModal').onclick = e => {
    if (e.target.id === 'publicTripConfigModal') document.getElementById('publicTripConfigModal').classList.remove('open');
  };
  document.getElementById('publicTripConfigSave').onclick = savePublicTripConfigFromModal;

  const uploadZone = document.getElementById('uploadZone');
  const photoInput = document.getElementById('photoInput');
  const gpxZone = document.getElementById('gpxZone');
  const gpxInput = document.getElementById('gpxInput');

  uploadZone.onclick = () => photoInput.click();
  uploadZone.ondragover = e => { e.preventDefault(); uploadZone.classList.add('dragover'); };
  uploadZone.ondragleave = () => uploadZone.classList.remove('dragover');
  uploadZone.ondrop = e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files, !!currentTripId);
  };
  photoInput.onchange = e => handleFiles(e.target.files, !!currentTripId);

  gpxZone.onclick = () => gpxInput.click();
  gpxInput.onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await parseGpx(file);
      await updateTripInfoDisplay(currentTripId ? await getTripById(currentTripId) : null);
      if (currentTripId) autoSaveTrip();
    } catch (err) {
      setStatus(err.message || 'GPXの読み込みに失敗しました', true);
    }
    gpxInput.value = '';
  };

  const addPointBtn = document.getElementById('addPointBtn');
  if (addPointBtn) {
    addPointBtn.onclick = () => {
      closeMenu();
      startAddPointMode();
    };
  };

  const togglePlayStop = () => { if (isPlaying) stopPlay(); else startPlay(); };
  document.getElementById('playBtn').onclick = togglePlayStop;
  const menuPlayBtn = document.getElementById('menuPlayBtn');
  if (menuPlayBtn) menuPlayBtn.onclick = togglePlayStop;
  document.getElementById('saveTripBtn').onclick = saveTrip;
  document.getElementById('tripNameInput').addEventListener('input', () => { updateSaveButtonState(); scheduleAutoSave(); });
  document.getElementById('tripDescInput').addEventListener('input', () => { updateSaveButtonState(); scheduleAutoSave(); });
  document.getElementById('tripUrlInput').addEventListener('input', () => { updateSaveButtonState(); scheduleAutoSave(); });
  document.getElementById('tripVideoUrlInput')?.addEventListener('input', () => { updateSaveButtonState(); scheduleAutoSave(); });
  document.getElementById('tripDateInput')?.addEventListener('change', () => { updateSaveButtonState(); scheduleAutoSave(); updateTripDateFieldVisibility(); });
  document.getElementById('tripPublicInput')?.addEventListener('change', scheduleAutoSave);
  const tripParentInput = document.getElementById('tripParentInput');
  const tripParentSelectWrap = document.getElementById('tripParentSelectWrap');
  if (tripParentInput) {
    tripParentInput.addEventListener('change', () => {
      updateSaveButtonState();
      scheduleAutoSave();
      if (tripParentSelectWrap) tripParentSelectWrap.style.display = tripParentInput.checked ? 'none' : '';
      if (tripParentInput.checked) {
        const tripParentSelect = document.getElementById('tripParentSelect');
        if (tripParentSelect) tripParentSelect.value = '';
      }
      refreshTripParentSelectOptions();
      updateTripDateFieldVisibility();
    });
  }
  document.getElementById('tripParentSelect')?.addEventListener('change', () => {
    updateSaveButtonState();
    scheduleAutoSave();
    updateTripDateFieldVisibility();
  });
  const tripColorInput = document.getElementById('tripColorInput');
  if (tripColorInput) {
    const onColorChange = () => {
      updateSaveButtonState();
      scheduleAutoSave();
      if (currentTripId) setTimeout(() => autoSaveTrip(), 300);
    };
    tripColorInput.addEventListener('input', onColorChange);
    tripColorInput.addEventListener('change', onColorChange);
    const swatches = document.getElementById('tripColorSwatches');
    if (swatches) {
      PUBLIC_TRIP_COLORS.forEach(c => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'trip-color-swatch';
        btn.style.backgroundColor = c;
        btn.title = c;
        btn.onclick = () => {
          tripColorInput.value = c;
          onColorChange();
        };
        swatches.appendChild(btn);
      });
    }
  }
  document.getElementById('loadTripBtn').onclick = loadTrip;
  document.getElementById('newTripBtn').onclick = () => {
    if (!isEditor()) return;
    clearCurrentTrip();
    isNewTrip = true;
    document.getElementById('tripSelect').value = '';
    document.getElementById('allPhotosThumbnails')?.classList.remove('visible');
    setStatus('新規トリップを開始しました。写真をアップロードするか、「写真」をクリックして📍ボタンでポイントを追加してください。');
  };
  document.getElementById('deleteTripBtn').onclick = deleteTrip;

  document.getElementById('headerTitle').onclick = goToHome;
  document.getElementById('hamburgerBtn').onclick = openMenu;
  const panelHeaderTitle = document.getElementById('panelHeaderTitle');
  const panelHamburgerBtn = document.getElementById('panelHamburgerBtn');
  if (panelHeaderTitle) panelHeaderTitle.onclick = goToHome;
  if (panelHamburgerBtn) panelHamburgerBtn.onclick = openMenu;
  document.getElementById('menuClose').onclick = closeMenu;
  document.getElementById('menuOverlay').onclick = closeMenu;
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  if (openSettingsBtn) openSettingsBtn.onclick = openSettings;
  const settingsBack = document.getElementById('settingsBack');
  if (settingsBack) settingsBack.onclick = closeSettings;

  const prevHandler = () => { if (currentIndex > 0) showPhotoWithPopup(currentIndex - 1); };
  const nextHandler = () => { if (currentIndex < photos.length - 1) showPhotoWithPopup(currentIndex + 1); };
  document.getElementById('photoPrevBtnHeader').onclick = prevHandler;
  document.getElementById('photoNextBtnHeader').onclick = nextHandler;
  const menuPrevBtn = document.getElementById('menuPrevBtn');
  const menuNextBtn = document.getElementById('menuNextBtn');
  if (menuPrevBtn) menuPrevBtn.onclick = prevHandler;
  if (menuNextBtn) menuNextBtn.onclick = nextHandler;

  const photoAllPhotosBtn = document.getElementById('photoAllPhotosBtn');
  if (photoAllPhotosBtn) photoAllPhotosBtn.onclick = toggleAllPhotosThumbnails;
  const menuAllPhotosBtn = document.getElementById('menuAllPhotosBtn');
  if (menuAllPhotosBtn) menuAllPhotosBtn.onclick = toggleAllPhotosThumbnails;
  document.getElementById('allPhotosClose').onclick = () => {
    document.getElementById('allPhotosThumbnails').classList.remove('visible');
  };
  const allPhotosStripEl = document.getElementById('allPhotosStrip');
  if (allPhotosStripEl) {
    allPhotosStripEl.addEventListener('click', (e) => {
      if (e.target.closest('.all-photo-add-point')) {
        e.preventDefault();
        e.stopPropagation();
        startAddPointMode();
      }
    });
  }

  document.getElementById('exportPublicBtn').onclick = exportPublicTrips;
  const uploadPublicToFirestoreBtn = document.getElementById('uploadPublicToFirestoreBtn');
  if (uploadPublicToFirestoreBtn) uploadPublicToFirestoreBtn.onclick = uploadPublicTripsToFirestore;
  document.getElementById('tripImportBtn').onclick = importTripsFromFile;
  const cleanupStorageBtn = document.getElementById('cleanupStorageBtn');
  if (cleanupStorageBtn) {
    cleanupStorageBtn.onclick = async () => {
      if (!isEditor()) return;
      setStatus('ストレージを最適化中…');
      try {
        const orphanCount = await deleteOrphanTrips();
        const removed = await cleanupOrphanedStorage();
        await refreshTripList();
        await renderTripListPanel();
        await renderPublicTripsPanel();
        if (typeof renderMenuMobileTripList === 'function') renderMenuMobileTripList();
        const total = orphanCount + removed;
        setStatus(total > 0 ? `${orphanCount > 0 ? `孤立トリップ${orphanCount}件、` : ''}${removed}件の不要データを削除しました` : '不要なデータはありませんでした');
        setTimeout(() => setStatus(''), 2000);
      } catch (err) {
        console.error('cleanupOrphanedStorage:', err);
        setStatus('ストレージの最適化に失敗しました', true);
      }
    };
  }

  const aiProviderSelect = document.getElementById('aiProviderSelect');
  const aiModelSelect = document.getElementById('aiModelSelect');
  const aiApiKeyInput = document.getElementById('aiApiKeyInput');
  const aiApiKeySaveBtn = document.getElementById('aiApiKeySaveBtn');
  if (aiProviderSelect) {
    aiProviderSelect.addEventListener('change', () => {
      const p = aiProviderSelect.value;
      setAiApiProvider(p);
      const models = AI_MODELS[p] || AI_MODELS.gemini;
      if (aiModelSelect) {
        aiModelSelect.innerHTML = models.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
        aiModelSelect.value = models[0]?.id || '';
        setAiApiModel(aiModelSelect.value);
      }
      const placeholders = { gemini: 'API Key を入力', openai: 'sk-... を入力', claude: 'sk-ant-... を入力' };
      if (aiApiKeyInput) aiApiKeyInput.placeholder = placeholders[p] || 'API Key を入力';
    });
  }
  if (aiModelSelect) {
    aiModelSelect.addEventListener('change', () => setAiApiModel(aiModelSelect.value));
  }
  if (aiApiKeySaveBtn && aiApiKeyInput) {
    aiApiKeySaveBtn.addEventListener('click', () => {
      const key = (aiApiKeyInput.value || '').trim();
      setAiApiKey(key);
      if (key) {
        setAiApiProvider(aiProviderSelect?.value || 'gemini');
        setAiApiModel(aiModelSelect?.value || '');
      }
      setStatus(key ? 'API Key とデフォルトモデルを保存しました' : 'API Key を削除しました');
    });
  }

  document.getElementById('photoEditClose').onclick = closePhotoEditModal;
  // イベント委譲: オーバーレイでクリックを一元処理（ボタン単体のonclickが発火しない環境対策）
  document.getElementById('photoEditModal').addEventListener('click', async (e) => {
    if (e.target.closest('#photoEditSave')) {
      e.preventDefault();
      e.stopPropagation();
      await savePhotoEdit();
      return;
    }
    if (e.target.id === 'photoEditModal') closePhotoEditModal();
  });
  const photoEditAddPhotoInput = document.getElementById('photoEditAddPhotoInput');
  if (photoEditAddPhotoInput) {
    photoEditAddPhotoInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file || _photoEditIndex == null) return;
      const isCurrentTrip = (currentTripId === _photoEditTripId) || (_photoEditTripId === '__new_trip__' && isNewTrip);
      const existing = isCurrentTrip ? photos[_photoEditIndex] : null;
      if (!existing) {
        setStatus('写真の更新には、該当トリップを読み込んでから行ってください', true);
        e.target.value = '';
        return;
      }
      try {
        const loaded = await loadPhotoWithExif(file);
        const hadPhoto = hasPhotoData(existing);
        // ポイント/写真のプロパティを保持しつつ、画像データを追加または更新
        photos[_photoEditIndex] = {
          ...existing,
          file: loaded.file,
          url: loaded.url,
          data: null,
          mime: null,
          name: hadPhoto ? (existing.name || loaded.name) : (existing.name || loaded.name),
          lat: existing.lat ?? loaded.lat,
          lng: existing.lng ?? loaded.lng,
          placeName: existing.placeName || loaded.placeName,
          _dbIndex: existing._dbIndex,
        };
        addPhotoMarkers();
        renderAllPhotosStrip();
        document.getElementById('photoEditPreview').innerHTML = `<img src="${loaded.url}" alt="${escapeHtml(photos[_photoEditIndex].name)}" loading="lazy">`;
        const updateLabel = document.getElementById('photoEditPhotoUpdateLabel');
        if (updateLabel) updateLabel.textContent = '写真を更新:';
        _photoEditIsPoint = false;
        setStatus(hadPhoto ? '写真を更新しました。保存中…' : '写真を追加しました。保存中…');
        await savePhotoEdit();
      } catch (err) {
        setStatus(err.message || '写真の読み込みに失敗しました', true);
      }
      e.target.value = '';
    };
  }

  document.getElementById('webviewModalClose').onclick = closeWebviewModal;
  document.getElementById('webviewModal').onclick = e => {
    if (e.target.id === 'webviewModal') closeWebviewModal();
  };

  document.getElementById('parentThumbnailModalClose').onclick = () => document.getElementById('parentThumbnailModal').classList.remove('open');
  document.getElementById('parentThumbnailModal').onclick = e => {
    if (e.target.id === 'parentThumbnailModal') document.getElementById('parentThumbnailModal').classList.remove('open');
  };

  document.getElementById('stampUploadClose').onclick = () => document.getElementById('stampUploadModal').classList.remove('open');
  document.getElementById('stampUploadModal').onclick = e => {
    if (e.target.id === 'stampUploadModal') document.getElementById('stampUploadModal').classList.remove('open');
  };
  const stampUploadZone = document.getElementById('stampUploadZone');
  const stampPhotoInput = document.getElementById('stampPhotoInput');
  if (stampUploadZone && stampPhotoInput) {
    stampUploadZone.onclick = () => stampPhotoInput.click();
    stampUploadZone.ondragover = e => { e.preventDefault(); stampUploadZone.classList.add('dragover'); };
    stampUploadZone.ondragleave = () => stampUploadZone.classList.remove('dragover');
    stampUploadZone.ondrop = e => {
      e.preventDefault();
      stampUploadZone.classList.remove('dragover');
      const f = e.dataTransfer?.files?.[0];
      if (f?.type?.startsWith('image/')) handleStampPhotoUpload(f);
    };
    stampPhotoInput.onchange = e => {
      const f = e.target.files?.[0];
      if (f) handleStampPhotoUpload(f);
    };
  }
  const closeCharacterModal = () => {
    document.getElementById('characterUploadModal').classList.remove('open');
    const rawTripId = _characterUploadTripId;
    if (rawTripId) {
      const btn = document.getElementById('tripMenuAnimeCharBtn');
      if (btn && !btn.disabled) {
        const charPhotos = getCharacterPhotos(rawTripId).filter(p => p.data);
        if (charPhotos.length > 0) {
          const first = charPhotos[0];
          const src = `data:${first.mime || 'image/jpeg'};base64,${first.data}`;
          btn.classList.add('trip-menu-char-btn-with-photo');
          btn.textContent = '';
          const img = document.createElement('img');
          img.src = src;
          img.alt = 'キャラ';
          img.className = 'trip-menu-char-btn-img';
          btn.appendChild(img);
          btn.title = 'メインキャラの写真を追加・変更';
        } else {
          btn.classList.remove('trip-menu-char-btn-with-photo');
          btn.textContent = 'キャラ';
          btn.title = 'メインキャラの人物写真を設定';
        }
      }
    }
  };
  document.getElementById('characterUploadClose').onclick = closeCharacterModal;
  document.getElementById('characterUploadModal').onclick = e => {
    if (e.target.id === 'characterUploadModal') closeCharacterModal();
  };
  const characterUploadZone = document.getElementById('characterUploadZone');
  const characterPhotoInput = document.getElementById('characterPhotoInput');
  if (characterUploadZone && characterPhotoInput) {
    characterUploadZone.onclick = () => characterPhotoInput.click();
    characterUploadZone.ondragover = e => { e.preventDefault(); characterUploadZone.classList.add('dragover'); };
    characterUploadZone.ondragleave = () => characterUploadZone.classList.remove('dragover');
    characterUploadZone.ondrop = e => {
      e.preventDefault();
      characterUploadZone.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files?.length) handleCharacterPhotoUpload([...files]);
    };
    characterPhotoInput.onchange = e => {
      const files = e.target.files;
      if (files?.length) handleCharacterPhotoUpload([...files]);
    };
  }

  document.getElementById('playOverlayClose').onclick = () => {
    if (!isPlaying) {
      document.getElementById('playPhotoOverlay').classList.remove('visible', 'play-mode');
    }
  };

  document.getElementById('fullPhotoClose').onclick = closeFullSizePhoto;
  document.getElementById('fullPhotoOverlay').onclick = e => {
    if (e.target.id === 'fullPhotoOverlay') closeFullSizePhoto();
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('fullPhotoOverlay')?.classList.contains('visible')) {
      closeFullSizePhoto();
    }
  });
  document.getElementById('playOverlayStopBtn').onclick = () => {
    if (isPlaying) stopPlay();
  };
  document.getElementById('playModeStopBtn').onclick = () => {
    if (isPlaying) stopPlay();
  };
  document.getElementById('playOverlayEdit').onclick = (e) => {
    e.stopPropagation();
    if (isEditor() && photos.length > 0 && currentIndex >= 0) {
      openPhotoEditModal(currentIndex);
    }
  };
  document.getElementById('playPhotoOverlay')?.addEventListener('click', e => {
    const photoArea = e.target.closest('.play-overlay-photo');
    if (photoArea && !e.target.closest('.play-overlay-buttons')) {
      if (photos.length > 0 && currentIndex >= 0) showFullSizePhoto(currentIndex);
    }
  });

  const goToTripList = (e) => {
    e.preventDefault();
    _showTripListInPanel = true;
    renderPublicTripsPanel();
    if (isMobileView()) {
      document.getElementById('publicTripsPanel')?.classList.add('trip-panel-manually-expanded');
    }
  };
  const panelHeaderTripList = document.getElementById('panelHeaderTripList');
  if (panelHeaderTripList) panelHeaderTripList.onclick = goToTripList;

  const openTripListPanelBtn = document.getElementById('openTripListPanelBtn');
  if (openTripListPanelBtn) openTripListPanelBtn.onclick = () => { closeMenu(); openTripListPanel(); };
  document.getElementById('tripListClose').onclick = closeTripListPanel;
  document.getElementById('tripListOverlay').onclick = closeTripListPanel;

  const tripPanelDragHandle = document.getElementById('tripPanelDragHandle');
  const publicTripsPanel = document.getElementById('publicTripsPanel');
  if (tripPanelDragHandle && publicTripsPanel) {
    tripPanelDragHandle.onclick = () => {
      publicTripsPanel.classList.toggle('trip-panel-manually-expanded');
    };
    let pinchStartDist = 0;
    const handlePinch = (e) => {
      if (e.touches.length !== 2) return;
      const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
      if (pinchStartDist === 0) pinchStartDist = dist;
      else if (dist - pinchStartDist > 50) {
        publicTripsPanel.classList.add('trip-panel-manually-expanded');
        pinchStartDist = -1;
      }
    };
    const resetPinch = () => { pinchStartDist = 0; };
    document.addEventListener('touchstart', e => { if (e.touches.length === 2) pinchStartDist = 0; }, { passive: true });
    document.addEventListener('touchmove', handlePinch, { passive: true });
    document.addEventListener('touchend', resetPinch, { passive: true });
    document.addEventListener('touchcancel', resetPinch, { passive: true });
  }

  document.addEventListener('click', e => {
    const link = e.target.closest('.trip-desc-link, .trip-meta-detail-link');
    if (link && link.href && !link.href.startsWith('#')) {
      e.preventDefault();
      openUrlInPopup(link.href);
    }
    const urlBtn = e.target.closest('.popup-url-btn');
    if (urlBtn && urlBtn.dataset.url) {
      e.preventDefault();
      e.stopPropagation();
      showUrlPopup(urlBtn.dataset.url);
    }
    const editBtn = e.target.closest('.popup-photo-edit');
    if (editBtn && isEditor()) {
      const idx = parseInt(editBtn.dataset.photoIndex, 10);
      if (!isNaN(idx) && photos[idx]) {
        e.preventDefault();
        e.stopPropagation();
        openPhotoEditModal(idx);
      }
    }
    const addPhotoBtn = e.target.closest('.popup-photo-add-photo-btn');
    if (addPhotoBtn && isEditor()) {
      const idx = parseInt(addPhotoBtn.dataset.photoIndex, 10);
      if (!isNaN(idx) && photos[idx]) {
        e.preventDefault();
        e.stopPropagation();
        if (map) map.closePopup();
        openPhotoEditModal(idx);
      }
    }
    const photoWrap = e.target.closest('.popup-photo-clickable');
    if (photoWrap) {
      const idx = parseInt(photoWrap.dataset.photoIndex, 10);
      if (!isNaN(idx) && photos[idx]) {
        e.preventDefault();
        if (map) map.closePopup();
        showFullSizePhoto(idx);
      }
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const photoWrap = e.target.closest('.popup-photo-clickable');
    if (photoWrap) {
      const idx = parseInt(photoWrap.dataset.photoIndex, 10);
      if (!isNaN(idx) && photos[idx]) {
        e.preventDefault();
        if (map) map.closePopup();
        showFullSizePhoto(idx);
      }
    }
  });

  document.getElementById('urlPopupClose').onclick = () => document.getElementById('urlPopupModal').classList.remove('open');
  document.getElementById('urlPopupModal').onclick = e => {
    if (e.target.id === 'urlPopupModal') document.getElementById('urlPopupModal').classList.remove('open');
  };
  document.getElementById('urlPopupOpen').onclick = () => {
    const url = document.getElementById('urlPopupInput').value;
    openUrlInPopup(url);
  };
  document.getElementById('urlPopupCopy').onclick = async () => {
    const input = document.getElementById('urlPopupInput');
    await navigator.clipboard.writeText(input.value || '');
    setStatus('URLをコピーしました');
    setTimeout(() => setStatus(''), 1500);
  };

  await refreshTripList();
  updatePhotoNav();

  if (isMobileView() && !currentTripId) {
    const groups = await getHomeTripsGrouped();
    const displayTrips = groups.flatMap(g => [g.parent, ...g.children]);
    if (displayTrips.length > 0) {
      const first = displayTrips[0];
      const loadId = first._fromServer || first._isPublic ? 'public_' + first.id : first.id;
      await loadTripAndShowPhoto(loadId, 0);
    }
  }

  // Firebase初期化完了後にパブリックトリップを再読み込み
  window.addEventListener('firebase-ready', async () => {
    console.log('Firebase初期化完了、パブリックトリップを再読み込みします');
    await loadPublicTripsFromServer();
  });
}

setup();
