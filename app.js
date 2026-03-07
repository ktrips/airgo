/* === Airgo — 写真と地図の旅 === */

const DB_NAME = 'airgo';
const DB_VERSION = 3;
const AUTH_STORAGE_KEY = 'airgo_editor';
const AUTH_USER_DEFAULT = 'usr2';
const AUTH_PASS_DEFAULT = 'pswd';
const AI_PROVIDER_STORAGE_KEY = 'airgo_ai_provider';
const AI_API_KEY_STORAGE_KEY = 'airgo_ai_api_key';
const PUBLIC_TRIP_CONFIG_KEY = 'airgo_public_trip_config';
const STAMP_PHOTOS_KEY = 'airgo_stamp_photos';

function isEditor() {
  return sessionStorage.getItem(AUTH_STORAGE_KEY) === '1';
}

function setEditor(ok) {
  if (ok) sessionStorage.setItem(AUTH_STORAGE_KEY, '1');
  else sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

function checkAuth(user, pass) {
  return (user || '').trim() === AUTH_USER_DEFAULT && (pass || '') === AUTH_PASS_DEFAULT;
}

function getAiApiProvider() {
  return localStorage.getItem(AI_PROVIDER_STORAGE_KEY) || 'openai';
}

function setAiApiProvider(v) {
  localStorage.setItem(AI_PROVIDER_STORAGE_KEY, v || 'openai');
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
  const apiKeyInput = document.getElementById('aiApiKeyInput');
  if (!providerSelect || !apiKeyInput) return;
  providerSelect.value = getAiApiProvider();
  apiKeyInput.value = getAiApiKey();
  apiKeyInput.placeholder = providerSelect.value === 'gemini' ? 'API Key を入力' : 'sk-... を入力';
}

function updateEditorUI() {
  const isEd = isEditor();
  const authBtn = document.getElementById('authBtn');
  const hint = document.getElementById('editorOnlyHint');

  if (authBtn) authBtn.textContent = isEd ? `ログアウト (${AUTH_USER_DEFAULT})` : 'ログイン';
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
}

const STORE_NAME = 'trips';

let map = null;
let markers = [];
let photoPopup = null; // 地図上の写真ポップアップ（GPSなし用）
let gpxLayer = null;
let routeLayer = null;
let osmLayer = null;
let aerialLayer = null;
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
let _currentViewingTripId = null; // スタンプ保存用（loadTrip/loadTripAndShowPhotoで設定）

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
    };
  });
}

async function saveTripToDB(trip) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(trip);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
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

/** 写真のメタデータ（ランドマーク・説明・URL）をDBに直接保存。既存トリップの写真データを保持したまま更新 */
async function savePhotoMetadataToDB(tripId, photoIndex, metadata) {
  const trip = await loadTripFromDB(tripId);
  if (!trip) return false;
  if (!trip.photos || !trip.photos[photoIndex]) return false;
  const p = trip.photos[photoIndex];
  p.landmarkNo = metadata.landmarkNo;
  p.landmarkName = metadata.landmarkName;
  p.description = metadata.description;
  p.url = metadata.url;
  trip.updatedAt = Date.now();
  await saveTripToDB(trip);
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
  osmLayer.addTo(map);
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
  for (const p of withGps) {
    p.placeName = await reverseGeocode(p.lat, p.lng);
  }
}

/* --- GPX順で写真をソート --- */
function getGpxRoutePoints() {
  if (!gpxData) return [];
  try {
    const doc = new DOMParser().parseFromString(gpxData, 'text/xml');
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

function assignGpxDataToPhotos() {
  if (gpxTrackPoints.length === 0) return;
  photos.forEach(p => {
    if (p.lat == null || p.lng == null) return;
    let best = null;
    let bestDist = Infinity;
    for (const pt of gpxTrackPoints) {
      const d = distSq([p.lat, p.lng], [pt.lat, pt.lon]);
      if (d < bestDist) {
        bestDist = d;
        best = pt;
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
    if (withTime.length >= 2 && distanceKm != null && distanceKm > 0) {
      const firstTime = Math.min(...withTime.map(p => p.time));
      const lastTime = Math.max(...withTime.map(p => p.time));
      const hours = (lastTime - firstTime) / 3600000;
      if (hours > 0) avgSpeedKmh = distanceKm / hours;
    }
    return { dateStr, avgSpeedKmh, distanceKm };
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
  const place = photo.placeName ? `📍 ${photo.placeName}` : '';
  const hasLandmark = toLandmarkValue(photo.landmarkNo) != null || toLandmarkValue(photo.landmarkName) != null;
  const landmarkText = hasLandmark ? [photo.landmarkNo, photo.landmarkName].filter(Boolean).join(' ') : '';
  const landmarkHtml = hasLandmark
    ? `<div class="popup-photo-landmark-watermark">${escapeHtml(landmarkText)}</div>`
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
    ? `<div class="popup-photo-img-wrap">${landmarkHtml}<img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name)}" class="popup-photo-img"></div>`
    : '';
  const nameHtml = showName
    ? `<span class="popup-photo-name">${escapeHtml(photo.name)}</span>`
    : '';
  const editBtnHtml = isEditor()
    ? `<button type="button" class="popup-photo-edit" data-photo-index="${index}" title="詳細設定（ランドマーク・説明・URL）" aria-label="編集">✎</button>`
    : '';
  return `
    <div class="popup-photo-content">
      ${editBtnHtml}
      ${imgHtml}
      <div class="popup-photo-info">
        ${nameHtml}
        ${place ? `<span class="popup-photo-place">${escapeHtml(place)}</span>` : ''}
      </div>
      ${descHtml}
      ${urlHtml}
    </div>
  `;
}

function addPhotoMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const withGps = photos.filter(p => p.lat != null && p.lng != null);
  const routePoints = getGpxRoutePoints();

  let bounds = null;
  if (withGps.length > 0) {
    bounds = L.latLngBounds(withGps.map(p => [p.lat, p.lng]));
  }
  if (routePoints.length >= 2) {
    const routeBounds = L.latLngBounds(routePoints);
    bounds = bounds ? bounds.extend(routeBounds) : routeBounds;
  }
  if (bounds) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  }

  if (withGps.length === 0) return;

  withGps.forEach((photo) => {
    const photoIndex = photos.indexOf(photo);
    const hasLandmarkNo = toLandmarkValue(photo.landmarkNo) != null;
    const displayText = hasLandmarkNo ? escapeHtml(String(photo.landmarkNo).trim()) : '';
    const icon = L.divIcon({
      className: 'photo-marker photo-marker-' + (hasLandmarkNo ? 'landmark' : 'plain'),
      html: hasLandmarkNo
        ? `<span class="landmark-marker-num">${displayText}</span>`
        : `<span class="landmark-marker-plain"></span>`,
      iconSize: hasLandmarkNo ? [40, 40] : [24, 24],
      iconAnchor: hasLandmarkNo ? [20, 20] : [12, 12],
    });
    const marker = L.marker([photo.lat, photo.lng], { icon })
      .addTo(map)
      .bindPopup(buildPhotoPopupHtml(photo, photoIndex), {
        maxWidth: 280,
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
  } else if (popupOnly && map && photo.url) {
    if (photoPopup) map.removeLayer(photoPopup);
    const center = map.getCenter();
    photoPopup = L.popup({ maxWidth: 280, className: 'photo-popup' })
      .setLatLng(center)
      .setContent(buildPhotoPopupHtml(photo, index))
      .openOn(map);
  }

  const strip = document.getElementById('allPhotosStrip');
  if (strip) strip.querySelectorAll('.all-photo-thumb').forEach((t, i) => t.classList.toggle('active', i === index));

  updatePhotoNav();
}

function setPlayStopDisabled(playDisabled, stopDisabled) {
  document.querySelectorAll('.play-btn').forEach(el => { el.disabled = playDisabled; });
  document.querySelectorAll('.stop-btn').forEach(el => { el.disabled = stopDisabled; });
}

function setSaveTripBtnDisabled(disabled) {
  const btn = document.getElementById('saveTripBtn');
  if (btn) btn.disabled = disabled;
}

function updateSaveButtonState() {
  if (!isEditor()) return;
  const name = document.getElementById('tripNameInput')?.value?.trim();
  const canSave = photos.length > 0 && !!name;
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
    if (mc) mc.style.display = 'none';
    updateTripInfoDisplay(null);
    return;
  }
  const prevDisabled = currentIndex <= 0;
  const nextDisabled = currentIndex >= photos.length - 1;
  if (prevBtn) prevBtn.disabled = prevDisabled;
  if (nextBtn) nextBtn.disabled = nextDisabled;
  if (menuPrevBtn) menuPrevBtn.disabled = prevDisabled;
  if (menuNextBtn) menuNextBtn.disabled = nextDisabled;
  if (menuAllPhotosBtn) menuAllPhotosBtn.textContent = photos.length > 0 ? `写真（${photos.length}枚）` : '写真（0枚）';
  if (mc) mc.style.display = '';
  updateTripInfoDisplay(null);
}

function fitMapToFullExtent() {
  if (!map) return;
  const withGps = photos.filter(p => p.lat != null && p.lng != null);
  if (withGps.length === 0) return;
  const bounds = L.latLngBounds(withGps.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
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
  setPlayStopDisabled(true, false);
  setStatus('自動再生中（3D表示）…');

  if (map) {
    map.removeLayer(osmLayer);
    aerialLayer.addTo(map);
  }

  if (routeLayer) map.removeLayer(routeLayer);
  if (gpxLayer) {
    map.removeLayer(gpxLayer);
    gpxLayer = null;
  }
  routeLayer = createStyledRouteLayer(routePoints);
  if (routeLayer) routeLayer.addTo(map);

  const bounds = L.latLngBounds(routePoints);
  map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });

  document.getElementById('mainArea').classList.add('play-mode');
  document.getElementById('playPhotoOverlay').classList.add('play-mode');
  document.getElementById('allPhotosThumbnails')?.classList.remove('visible');

  let idx = 1;
  function tick() {
    if (!isPlaying) return;
    const photoIdx = indices[idx % indices.length];
    const photo = photos[photoIdx];
    showPhotoWith3D(photoIdx);
    if (photo && photo.lat != null && photo.lng != null) {
      map.flyTo([photo.lat, photo.lng], 18, { duration: 1.2, easeLinearity: 0.15 });
    }
    idx = (idx + 1) % indices.length;
    playTimer = setTimeout(tick, interval);
  }
  showPhotoWith3D(indices[0]);
  if (photos[indices[0]]?.lat != null) {
    map.flyTo([photos[indices[0]].lat, photos[indices[0]].lng], 18, { duration: 1, easeLinearity: 0.15 });
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
  photos.forEach((photo, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'all-photo-thumb-wrap';
    const div = document.createElement('div');
    div.className = 'all-photo-thumb' + (i === currentIndex ? ' active' : '');
    div.title = photo.name;
    const img = document.createElement('img');
    img.src = photo.url || '';
    img.alt = photo.name;
    div.appendChild(img);
    div.onclick = (e) => {
      if (!e.target.closest('.all-photo-thumb-actions')) {
        showPhotoWithPopup(i);
        strip.querySelectorAll('.all-photo-thumb').forEach((t, j) => t.classList.toggle('active', j === i));
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
    strip.appendChild(wrap);
  });
}

function isMobileView() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
}

function openAllPhotosThumbnails() {
  if (isMobileView()) return;
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
  clearTimeout(playTimer);
  playTimer = null;
  if (playAnimationFrame) {
    cancelAnimationFrame(playAnimationFrame);
    playAnimationFrame = null;
  }
  isPlaying = false;
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  if (gpxData && map) {
    applyGpxToMap(gpxData);
  }
  setPlayStopDisabled(false, true);
  setStatus('');

  // 通常地図に戻す
  if (map) {
    map.removeLayer(aerialLayer);
    osmLayer.addTo(map);
  }
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }

  document.getElementById('mainArea').classList.remove('play-mode');
  document.getElementById('playPhotoOverlay').classList.remove('visible', 'play-mode');
}

const PHOTO_MAX_DIMENSION = 1920;
const PHOTO_JPEG_QUALITY = 0.85;
const EXPORT_TARGET_SIZE_MB = 100;

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
      const line = createStyledRouteLayer(route);
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

  const storedPhotos = [];
  for (const p of photos) {
    let data = null;
    let mime = 'image/jpeg';
    if (p.file) {
      const enc = await resizeImageToBase64(p.file);
      if (enc) { data = enc.data; mime = enc.mime; }
    } else if (p.data) {
      data = p.data;
      mime = p.mime || 'image/jpeg';
    }
    if (data) {
      storedPhotos.push({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        placeName: p.placeName || null,
        landmarkNo: toLandmarkValue(p.landmarkNo),
        landmarkName: toLandmarkValue(p.landmarkName),
        description: p.description || null,
        url: p.photoUrl || null,
        data,
        mime,
      });
    }
  }
  if (storedPhotos.length === 0) return;

  const existing = await loadTripFromDB(currentTripId);
  const trip = {
    id: currentTripId,
    name,
    description: document.getElementById('tripDescInput')?.value?.trim() || null,
    url: document.getElementById('tripUrlInput')?.value?.trim() || null,
    public: document.getElementById('tripPublicInput')?.checked ?? false,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    photos: storedPhotos,
    gpxData: gpxData || existing?.gpxData || null,
  };
  try {
    await saveTripToDB(trip);
    photos.forEach((p, i) => { p._dbIndex = i; });
    await refreshTripList();
    await renderPublicTripsPanel();
    await renderTripListPanel();
    setStatus('自動保存しました');
    setTimeout(() => setStatus(''), 1500);
  } catch (_) {}
}

function scheduleAutoSave() {
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => autoSaveTrip(), 600);
}

async function saveTrip() {
  if (!isEditor()) {
    setStatus('保存するにはログインしてください', true);
    return false;
  }
  const name = document.getElementById('tripNameInput').value.trim();
  if (!name) {
    setStatus('トリップ名を入力してください', true);
    return false;
  }
  if (photos.length === 0) {
    setStatus('写真がありません', true);
    return false;
  }
  if (!currentTripId && !isNewTrip) {
    setStatus('既存トリップの変更は読み込み後に保存できます。新規トリップは「新規」をクリックしてから作成してください。', true);
    return false;
  }

  setStatus('保存中…');

  const storedPhotos = [];
  for (const p of photos) {
    let data = null;
    let mime = 'image/jpeg';
    if (p.file) {
      const enc = await resizeImageToBase64(p.file);
      if (enc) {
        data = enc.data;
        mime = enc.mime;
      }
    } else if (p.data) {
      data = p.data;
      mime = p.mime || 'image/jpeg';
    }
    if (data) {
      storedPhotos.push({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        placeName: p.placeName || null,
        landmarkNo: toLandmarkValue(p.landmarkNo),
        landmarkName: toLandmarkValue(p.landmarkName),
        description: p.description || null,
        url: p.photoUrl || null,
        data,
        mime,
      });
    }
  }

  if (storedPhotos.length === 0) {
    setStatus('写真のデータを読み込めませんでした。再度アップロードしてください。', true);
    return false;
  }

  const description = document.getElementById('tripDescInput').value.trim() || null;
  const tripUrl = document.getElementById('tripUrlInput').value.trim() || null;
  const isPublic = document.getElementById('tripPublicInput').checked;
  const id = currentTripId || 'trip_' + Date.now();
  const trip = {
    id,
    name,
    description,
    url: tripUrl,
    public: isPublic,
    createdAt: currentTripId ? (await loadTripFromDB(id))?.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now(),
    photos: storedPhotos,
    gpxData: gpxData || (currentTripId ? (await loadTripFromDB(id))?.gpxData : null),
  };

  try {
    await saveTripToDB(trip);
  } catch (err) {
    setStatus(err.message || '保存に失敗しました', true);
    return false;
  }
  photos.forEach((p, i) => { p._dbIndex = i; });
  currentTripId = id;
  isNewTrip = false;
  document.getElementById('tripNameInput').value = name;
  document.getElementById('tripUrlInput').value = tripUrl || '';
  document.getElementById('tripPublicInput').checked = isPublic;
  updateTripInfoDisplay(trip);
  await refreshTripList();
  await renderPublicTripsPanel();
  await renderTripListPanel();
  setStatus(`「${name}」を保存しました`);
  return true;
}

async function loadTrip() {
  const id = document.getElementById('tripSelect').value;
  if (!id) {
    setStatus('トリップを選択してください', true);
    return;
  }

  let trip = null;
  let isPublicTrip = false;
  if (id.startsWith('public_')) {
    const origId = id.slice(7);
    trip = publicTrips.find(t => t.id === origId) || publicTrips.find(t => t.id === id);
    isPublicTrip = !!trip;
  }
  if (!trip) {
    trip = await loadTripFromDB(id);
  }
  if (!trip) {
    setStatus('トリップが見つかりません', true);
    return;
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
  const publicInput = document.getElementById('tripPublicInput');
  if (publicInput) publicInput.checked = !!trip.public;

  photos = (trip.photos || []).map((p, i) => ({
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    placeName: p.placeName || null,
    landmarkNo: toLandmarkValue(p.landmarkNo),
    landmarkName: toLandmarkValue(p.landmarkName),
    description: p.description || null,
    photoUrl: p.url || null,
    url: base64ToUrl(p.mime, p.data),
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
  setPlayStopDisabled(withGps.length === 0, true);
  if (isPublicTrip) {
    document.getElementById('deleteTripBtn').disabled = true;
  } else {
    document.getElementById('deleteTripBtn').disabled = false;
    document.getElementById('appendHint').style.display = 'block';
  }

  renderAllPhotosStrip();
  addPhotoMarkers();
  await renderPublicTripsPanel();

  if (map) {
    map.removeLayer(osmLayer);
    aerialLayer.addTo(map);
  }

  fitMapToFullExtent();
  if (photos.length > 0) {
    document.getElementById('allPhotosThumbnails')?.classList.remove('visible');
    showPhoto(0, { popupOnly: true, skipMapZoom: true });
  }
  const needGeocode = photos.some(p => p.lat != null && !p.placeName);
  if (needGeocode) {
    setStatus('地名を取得中…');
    await fetchPlaceNamesForPhotos();
    if (photos[currentIndex]) showPhoto(currentIndex, { popupOnly: true, skipMapZoom: true });
  }
  updateTripInfoDisplay(trip);
  updateSaveButtonState();
  setStatus(`「${trip.name}」を読み込みました。${isPublicTrip ? '' : '写真を追加できます。'}`);
}

async function loadTripAndShowPhoto(tripId, photoIndex) {
  let trip = null;
  if (tripId.startsWith('public_')) {
    const origId = tripId.slice(7);
    trip = publicTrips.find(t => t.id === origId) || publicTrips.find(t => t.id === tripId);
  }
  if (!trip) trip = await loadTripFromDB(tripId);
  if (!trip) return;

  if (tripId.startsWith('public_')) currentTripId = null;
  else currentTripId = tripId;
  isNewTrip = false;
  _showTripListInPanel = false;
  _currentViewingTripId = tripId;

  photos.forEach(p => {
    if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
  });

  document.getElementById('tripNameInput').value = trip.name;
  document.getElementById('tripDescInput').value = trip.description || '';
  document.getElementById('tripUrlInput').value = trip.url || '';
  const publicInput2 = document.getElementById('tripPublicInput');
  if (publicInput2) publicInput2.checked = !!trip.public;

  photos = (trip.photos || []).map((p, i) => ({
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    placeName: p.placeName || null,
    landmarkNo: toLandmarkValue(p.landmarkNo),
    landmarkName: toLandmarkValue(p.landmarkName),
    description: p.description || null,
    photoUrl: p.url || null,
    url: base64ToUrl(p.mime, p.data),
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
  setPlayStopDisabled(withGps.length === 0, true);
  if (isEditor() && !tripId.startsWith('public_')) {
    document.getElementById('deleteTripBtn').disabled = false;
    document.getElementById('appendHint').style.display = 'block';
  } else if (tripId.startsWith('public_')) {
    document.getElementById('deleteTripBtn').disabled = true;
  }
  updateSaveButtonState();

  renderAllPhotosStrip();
  addPhotoMarkers();
  await renderPublicTripsPanel();

  if (map) {
    map.removeLayer(osmLayer);
    aerialLayer.addTo(map);
  }

  const idx = Math.min(photoIndex, photos.length - 1);
  if (photos.length > 0) {
    fitMapToFullExtent();
    document.getElementById('allPhotosThumbnails')?.classList.remove('visible');
    if (idx >= 0) showPhoto(idx, { popupOnly: true, skipMapZoom: idx === 0 });
  }
  const needGeocode = photos.some(p => p.lat != null && !p.placeName);
  if (needGeocode) {
    setStatus('地名を取得中…');
    await fetchPlaceNamesForPhotos();
    if (photos[currentIndex]) showPhoto(currentIndex, { popupOnly: true, skipMapZoom: photoIndex === 0 });
  }
  updateTripInfoDisplay(trip);
  updateSaveButtonState();
  closeTripListPanel();
  document.getElementById('tripSelect').value = tripId;
  setStatus(`「${trip.name}」を読み込みました`);
}

function updateTripInfoDisplay(trip) {
  const nameEl = document.getElementById('tripInfoName');
  const metaEl = document.getElementById('tripInfoMeta');
  const tripNameNav = document.getElementById('tripNameNav');
  const metaRow = document.getElementById('tripInfoMetaRow');
  const name = trip?.name ?? document.getElementById('tripNameInput')?.value?.trim();
  const hasPhotos = photos.length > 0;
  const showNav = name || hasPhotos;
  if (!showNav) {
    if (tripNameNav) {
      tripNameNav.style.display = 'none';
      tripNameNav.classList.remove('visible');
    }
    const sep = document.getElementById('headerControlsSep');
    if (sep) sep.style.display = 'none';
    if (metaRow) metaRow.style.display = 'none';
    if (nameEl) nameEl.textContent = '';
    if (metaEl) metaEl.innerHTML = '';
    return;
  }
  if (tripNameNav) {
    tripNameNav.style.display = '';
    tripNameNav.classList.add('visible');
  }
  const sep = document.getElementById('headerControlsSep');
  if (sep) sep.style.display = '';
  const displayName = name || 'トリップ';
  const countText = hasPhotos ? `${displayName}（${photos.length}枚）` : displayName;
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
  if (name && photos.length > 0) {
    parts.push(`<span class="trip-meta-name">${escapeHtml(name)}</span>`);
  }
  if (desc || url) {
    let descPart = '';
    const descText = desc ? (desc.length > 40 ? desc.slice(0, 40) + '…' : desc) : '';
    if (descText) {
      descPart = `<span class="trip-meta-desc" title="${escapeHtml(desc)}">${escapeHtml(descText)}</span>`;
    }
    if (url) {
      const linkPart = `<a href="${escapeHtml(url)}" class="trip-meta-detail-link" target="_blank" rel="noopener noreferrer" title="リンクを開く">[詳細リンク]</a>`;
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

  const gpxInfoEl = document.getElementById('tripGpxInfo');
  if (gpxInfoEl) {
    const gs = getGpxSummary();
    if (gs && (gs.dateStr || gs.avgSpeedKmh != null || gs.distanceKm != null)) {
      const p = [];
      if (gs.dateStr) p.push(escapeHtml(gs.dateStr));
      if (gs.distanceKm != null) {
        const distStr = gs.distanceKm < 1 ? (gs.distanceKm * 1000).toFixed(0) + ' m' : gs.distanceKm.toFixed(1) + ' km';
        const speedStr = gs.avgSpeedKmh != null ? `（${formatSpeed(gs.avgSpeedKmh)}）` : '';
        p.push(distStr + speedStr);
      }
      gpxInfoEl.textContent = p.join(' ');
      gpxInfoEl.style.display = 'block';
    } else {
      gpxInfoEl.textContent = '';
      gpxInfoEl.style.display = 'none';
    }
  }
}

function clearCurrentTrip() {
  photos.forEach(p => {
    if (p.url && p.url.startsWith('blob:')) URL.revokeObjectURL(p.url);
  });
  currentTripId = null;
  isNewTrip = false;
  photos = [];
  _showTripListInPanel = false;
  gpxData = null;
  gpxTrackPoints = [];
  document.getElementById('tripNameInput').value = '';
  document.getElementById('tripDescInput').value = '';
  document.getElementById('tripUrlInput').value = '';
  const publicInputClear = document.getElementById('tripPublicInput');
  if (publicInputClear) publicInputClear.checked = false;
  updateTripInfoDisplay(null);
  setPlayStopDisabled(true, true);
  document.getElementById('deleteTripBtn').disabled = true;
  document.getElementById('appendHint').style.display = 'none';
  if (gpxLayer) {
    map.removeLayer(gpxLayer);
    gpxLayer = null;
  }
  if (map) {
    map.removeLayer(aerialLayer);
    osmLayer.addTo(map);
  }
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

async function loadPublicTripsFromServer() {
  try {
    const url = new URL('public-trips.json', window.location.href).href;
    const res = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      publicTrips = [];
      if (!isEditor()) setStatus('公開トリップの読み込みに失敗しました', true);
      await renderPublicTripsPanel();
      return;
    }
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > PUBLIC_TRIPS_MAX_SIZE) {
      publicTrips = [];
      if (!isEditor()) setStatus('public-trips.json が大きすぎます（100MB以下にしてください）', true);
      await renderPublicTripsPanel();
      return;
    }
    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      publicTrips = [];
      if (!isEditor()) setStatus('公開トリップの読み込みに失敗しました（ファイルが大きすぎる可能性があります）', true);
      await renderPublicTripsPanel();
      return;
    }
    publicTrips = Array.isArray(data) ? data : (data?.trips || []);
  } catch (err) {
    publicTrips = [];
    if (!isEditor()) setStatus('公開トリップの読み込みに失敗しました', true);
  }
  await renderPublicTripsPanel();
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

async function handleStampPhotoUpload(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const enc = await resizeImageToBase64(file, 400, 400, 0.8);
  if (!enc || _stampUploadTripId == null || _stampUploadPhotoIndex == null) return;
  saveStampPhoto(_stampUploadTripId, _stampUploadPhotoIndex, enc);
  document.getElementById('stampUploadModal').classList.remove('open');
  await renderTripMenu();
  setStatus('スタンプに写真を登録しました');
}

let _publicTripConfigDraft = null;
let _publicTripConfigAllTrips = [];

async function openPublicTripConfigModal() {
  const config = getPublicTripConfig();
  _publicTripConfigDraft = config?.sections?.length
    ? JSON.parse(JSON.stringify(config.sections))
    : [];
  _publicTripConfigDraft.hiddenTripIds = config?.hiddenTripIds ? [...(config.hiddenTripIds)] : [];
  _publicTripConfigAllTrips = await getDisplayablePublicTrips(true);
  await renderPublicTripConfigContent();
  document.getElementById('publicTripConfigModal').classList.add('open');
}

function getAssignedTripIds() {
  const ids = new Set();
  (_publicTripConfigDraft || []).forEach(s => (s.tripIds || []).forEach(id => ids.add(id)));
  return ids;
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

  const container = document.getElementById('publicTripConfigSections');
  if (!container) return;
  container.innerHTML = '';
  const sections = (_publicTripConfigDraft || []).filter(s => s && typeof s === 'object' && 'tripIds' in s);
  const assigned = getAssignedTripIds();

  for (let idx = 0; idx < sections.length; idx++) {
    const sec = sections[idx];
    const tripIds = sec.tripIds || [];
    const unassignedTrips = _publicTripConfigAllTrips.filter(t => {
      const id = t._fromServer ? 'public_' + t.id : t.id;
      return !assigned.has(id);
    });

    const block = document.createElement('div');
    block.className = 'public-trip-config-section';
    const tripChips = tripIds.map(tid => {
      const t = _publicTripConfigAllTrips.find(tr => (tr._fromServer ? 'public_' + tr.id : tr.id) === tid);
      return t ? { id: tid, name: t.name } : null;
    }).filter(Boolean);

    block.innerHTML = `
      <div class="public-trip-config-section-header">
        <span class="public-trip-config-section-title">セクション ${idx + 1}</span>
        <div class="public-trip-config-section-actions">
          <button type="button" class="public-trip-config-order-btn" data-dir="up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''} aria-label="上へ">↑</button>
          <button type="button" class="public-trip-config-order-btn" data-dir="down" data-idx="${idx}" ${idx === sections.length - 1 ? 'disabled' : ''} aria-label="下へ">↓</button>
          <button type="button" class="public-trip-config-remove-btn" data-idx="${idx}" aria-label="削除">×</button>
        </div>
      </div>
      <div class="public-trip-config-section-fields">
        <div class="modal-field">
          <label>セクション名</label>
          <input type="text" class="modal-input public-trip-config-name" data-idx="${idx}" placeholder="例: Day1" value="${escapeHtml(sec.name || '')}">
        </div>
        <div class="modal-field">
          <label>URL（任意）</label>
          <input type="url" class="modal-input public-trip-config-url" data-idx="${idx}" placeholder="https://..." value="${escapeHtml(sec.url || '')}">
        </div>
        <div class="modal-field">
          <label>トリップ</label>
          <div class="public-trip-config-trip-chips" data-idx="${idx}">
            ${tripChips.map(tc => `<span class="public-trip-config-chip"><span>${escapeHtml(tc.name)}</span><button type="button" class="public-trip-config-chip-remove" data-idx="${idx}" data-tid="${escapeHtml(tc.id)}" aria-label="削除">×</button></span>`).join('')}
          </div>
          <select class="modal-input public-trip-config-add-select" data-idx="${idx}">
            <option value="">— トリップを追加 —</option>
            ${unassignedTrips.map(t => {
              const id = t._fromServer ? 'public_' + t.id : t.id;
              return `<option value="${escapeHtml(id)}">${escapeHtml(t.name)}</option>`;
            }).join('')}
          </select>
        </div>
      </div>
    `;

    block.querySelector('.public-trip-config-order-btn[data-dir="up"]').onclick = () => movePublicTripConfigSection(idx, -1);
    block.querySelector('.public-trip-config-order-btn[data-dir="down"]').onclick = () => movePublicTripConfigSection(idx, 1);
    block.querySelector('.public-trip-config-remove-btn').onclick = () => removePublicTripConfigSection(idx);
    block.querySelector('.public-trip-config-name').oninput = e => { _publicTripConfigDraft[idx].name = e.target.value; };
    block.querySelector('.public-trip-config-url').oninput = e => { _publicTripConfigDraft[idx].url = e.target.value; };
    block.querySelector('.public-trip-config-add-select').onchange = async e => {
      const id = e.target.value;
      if (!id) return;
      _publicTripConfigDraft[idx].tripIds = _publicTripConfigDraft[idx].tripIds || [];
      _publicTripConfigDraft[idx].tripIds.push(id);
      e.target.value = '';
      await renderPublicTripConfigContent();
    };
    block.querySelectorAll('.public-trip-config-chip-remove').forEach(btn => {
      btn.onclick = async () => {
        const tid = btn.dataset.tid;
        _publicTripConfigDraft[idx].tripIds = (_publicTripConfigDraft[idx].tripIds || []).filter(x => x !== tid);
        await renderPublicTripConfigContent();
      };
    });
    container.appendChild(block);
  }
}

function addPublicTripConfigSection() {
  _publicTripConfigDraft = _publicTripConfigDraft || [];
  _publicTripConfigDraft.push({ id: 'sec_' + Date.now(), name: '', url: '', tripIds: [] });
  renderPublicTripConfigContent();
}

function movePublicTripConfigSection(idx, delta) {
  const next = idx + delta;
  if (next < 0 || next >= _publicTripConfigDraft.length) return;
  [_publicTripConfigDraft[idx], _publicTripConfigDraft[next]] = [_publicTripConfigDraft[next], _publicTripConfigDraft[idx]];
  renderPublicTripConfigContent();
}

function removePublicTripConfigSection(idx) {
  _publicTripConfigDraft.splice(idx, 1);
  renderPublicTripConfigContent();
}

async function savePublicTripConfigFromModal() {
  const sections = (_publicTripConfigDraft || []).map(s => ({
    id: s.id || 'sec_' + Date.now(),
    name: (s.name || '').trim(),
    url: (s.url || '').trim(),
    tripIds: s.tripIds || []
  }));
  const hiddenTripIds = Array.isArray(_publicTripConfigDraft?.hiddenTripIds) ? _publicTripConfigDraft.hiddenTripIds : [];
  const config = getPublicTripConfig() || {};
  savePublicTripConfig({ ...config, sections, hiddenTripIds });
  document.getElementById('publicTripConfigModal').classList.remove('open');
  await renderPublicTripsPanel();
  setStatus('公開トリップの表示設定を保存しました');
}

/** サーバー公開 + IndexedDBの公開トリップを結合して返す（ローカル保存を優先＝変更が即反映） */
async function getDisplayablePublicTrips(includeHidden = false) {
  const serverTrips = publicTrips.map(t => ({ ...t, _fromServer: true }));
  let dbTrips = [];
  try {
    dbTrips = await loadTripsFromDB() || [];
  } catch (_) {}
  const localPublic = dbTrips.filter(t => t.public).map(t => ({ ...t, _fromServer: false }));
  const localById = new Map(localPublic.map(t => [t.id, t]));
  const serverIds = new Set(serverTrips.map(t => t.id));
  const localOnly = localPublic.filter(t => !serverIds.has(t.id));
  const merged = serverTrips.map(t => localById.has(t.id) ? localById.get(t.id) : t);
  let result = [...merged, ...localOnly];

  const config = getPublicTripConfig();
  if (config?.sections && Array.isArray(config.sections) && config.sections.length > 0) {
    const ordered = [];
    const usedIds = new Set();
    for (const sec of config.sections) {
      const tripIds = sec.tripIds || [];
      for (const id of tripIds) {
        const t = result.find(r => r.id === id || ('public_' + r.id) === id);
        if (t && !usedIds.has(t.id)) {
          ordered.push(t);
          usedIds.add(t.id);
        }
      }
    }
    const rest = result.filter(t => !usedIds.has(t.id));
    result = [...ordered, ...rest];
  } else if (config?.tripOrder && Array.isArray(config.tripOrder)) {
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

/** セクション情報付きで公開トリップを返す（右パネル描画用） */
async function getDisplayablePublicTripsGrouped() {
  const flat = await getDisplayablePublicTrips();
  const config = getPublicTripConfig();
  if (!config?.sections?.length) {
    return [{ sectionName: null, sectionUrl: null, trips: flat }];
  }
  const idToTrip = new Map();
  for (const t of flat) {
    const key = t._fromServer ? 'public_' + t.id : t.id;
    idToTrip.set(key, t);
    if (t._fromServer) idToTrip.set(t.id, t);
  }
  const usedIds = new Set();
  const groups = [];
  for (const sec of config.sections) {
    const trips = (sec.tripIds || []).map(id => idToTrip.get(id) || idToTrip.get('public_' + id) || idToTrip.get(id.replace(/^public_/, ''))).filter(Boolean);
    trips.forEach(t => usedIds.add(t._fromServer ? 'public_' + t.id : t.id));
    if (trips.length > 0) groups.push({ sectionName: sec.name || null, sectionUrl: sec.url || null, trips });
  }
  const rest = flat.filter(t => !usedIds.has(t._fromServer ? 'public_' + t.id : t.id));
  if (rest.length) groups.push({ sectionName: 'その他', sectionUrl: null, trips: rest });
  return groups;
}

let _publicTripUrls = [];
let _tripMenuMap = null;
let _tripMenuUrls = [];
let _showTripListInPanel = false;

async function renderPublicTripsPanel() {
  const panel = document.getElementById('publicTripsPanel');
  const listEl = document.getElementById('publicTripsList');
  const tripListWrap = document.getElementById('tripPanelTripList');
  const tripMenuWrap = document.getElementById('tripPanelTripMenu');
  if (!panel || !listEl) return;

  if (photos.length > 0 && !_showTripListInPanel) {
    if (tripListWrap) tripListWrap.style.display = 'none';
    if (tripMenuWrap) tripMenuWrap.style.display = 'flex';
    if (panel) panel.classList.add('trip-menu-expanded');
    await renderTripMenu();
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
  const groups = await getDisplayablePublicTripsGrouped();
  const displayTrips = groups.flatMap(g => g.trips);
  if (displayTrips.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'public-trips-empty';
    empty.textContent = '公開トリップがありません';
    listEl.appendChild(empty);
    return;
  }
  let globalIdx = 0;
  const isMobile = isMobileView();
  for (const group of groups) {
    if (!isMobile && group.sectionName && group.trips.length > 0) {
      const header = document.createElement('div');
      header.className = 'public-trips-section-header';
      let headerHtml = escapeHtml(group.sectionName);
      if (group.sectionUrl) {
        headerHtml = `<a href="${escapeHtml(group.sectionUrl)}" target="_blank" rel="noopener noreferrer" class="public-trips-section-link">${headerHtml}</a>`;
      }
      header.innerHTML = `<h4 class="public-trips-section-title">${headerHtml}</h4>`;
      listEl.appendChild(header);
    }
    for (const trip of group.trips) {
      const idx = globalIdx++;
    const card = document.createElement('div');
    card.className = 'public-trip-card';
    const photos = trip.photos || [];
    const firstPhoto = photos[0];
    let thumbSrc = '';
    if (firstPhoto?.data) {
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
    const showOrderBtns = isEditor();
    const nameText = isMobile ? escapeHtml(trip.name) : `${escapeHtml(trip.name)}（${photos.length}枚）`;
    card.innerHTML = `
      <div class="public-trip-card-inner">
        <div class="public-trip-thumb"></div>
        <div class="public-trip-info">
          <h4 class="public-trip-name">${nameText}</h4>
          ${desc ? `<p class="public-trip-desc">${escapeHtml(desc)}</p>` : ''}
          ${gpxMeta ? `<p class="public-trip-gpx-meta">${gpxMeta}</p>` : ''}
        </div>
        ${showOrderBtns ? `
        <div class="public-trip-order-btns">
          <button type="button" class="public-trip-order-btn" data-dir="up" data-index="${idx}" aria-label="上へ">↑</button>
          <button type="button" class="public-trip-order-btn" data-dir="down" data-index="${idx}" aria-label="下へ">↓</button>
        </div>
        ` : ''}
      </div>
    `;
    const thumbEl = card.querySelector('.public-trip-thumb');
    if (thumbSrc && thumbEl) {
      const img = document.createElement('img');
      img.src = thumbSrc;
      img.alt = '';
      thumbEl.appendChild(img);
    }
    const loadId = trip._fromServer ? 'public_' + trip.id : trip.id;
    card.onclick = (e) => {
      if (e.target.closest('.public-trip-order-btns')) return;
      loadTripAndShowPhoto(loadId, 0);
    };
    if (showOrderBtns) {
      card.querySelectorAll('.public-trip-order-btn').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const dir = btn.dataset.dir;
          const i = parseInt(btn.dataset.index, 10);
          const swapIdx = dir === 'up' ? i - 1 : i + 1;
          if (swapIdx < 0 || swapIdx >= displayTrips.length) return;
          const ids = displayTrips.map(t => t._fromServer ? 'public_' + t.id : t.id);
          [ids[i], ids[swapIdx]] = [ids[swapIdx], ids[i]];
          const config = getPublicTripConfig() || {};
          if (config?.sections?.length) {
            const idToSec = new Map();
            config.sections.forEach(s => (s.tripIds || []).forEach(tid => idToSec.set(tid, s.id)));
            const newSections = config.sections.map(s => ({ ...s, tripIds: [] }));
            const otherIds = [];
            const secById = new Map(newSections.map(s => [s.id, s]));
            ids.forEach(tid => {
              const secId = idToSec.get(tid);
              const sec = secId ? secById.get(secId) : null;
              if (sec) sec.tripIds.push(tid);
              else otherIds.push(tid);
            });
            const final = otherIds.length ? [...newSections, { id: '_other', name: 'その他', url: '', tripIds: otherIds }] : newSections;
            savePublicTripConfig({ ...config, sections: final });
          } else {
            savePublicTripConfig({ ...config, tripOrder: ids });
          }
          await renderPublicTripsPanel();
        };
      });
    }
    listEl.appendChild(card);
    }
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
      if (landmarks.length >= 9) break;
    }
  }

  const titleEl = document.getElementById('tripMenuTitle');
  if (titleEl) titleEl.textContent = name;

  content.innerHTML = '';
  content.className = 'trip-menu-content';

  if (desc || url) {
    const descEl = document.createElement('div');
    descEl.className = 'trip-menu-section-body';
    if (desc) {
      descEl.appendChild(document.createTextNode(desc));
    }
    if (url) {
      if (desc) descEl.appendChild(document.createTextNode(' '));
      const link = document.createElement('a');
      link.href = url;
      link.className = 'trip-menu-detail-link';
      link.textContent = '[詳細リンク]';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      descEl.appendChild(link);
    }
    content.appendChild(descEl);
  }

  const metaParts = [dateStr, distStr ? `${distStr}${speedStr ? `（${speedStr}）` : ''}` : ''].filter(Boolean);
  if (metaParts.length > 0) {
    const metaEl = document.createElement('div');
    metaEl.className = 'trip-menu-section-body trip-menu-meta';
    metaEl.textContent = metaParts.join(' ');
    content.appendChild(metaEl);
  }

  if (photos.length > 0 && !isMobileView()) {
    const controlsEl = document.createElement('div');
    controlsEl.className = 'trip-menu-controls';
    controlsEl.innerHTML = `
      <div class="trip-menu-controls-row">
        <span class="trip-menu-photo-count">写真（${photos.length}枚）</span>
        <button type="button" class="btn btn-secondary btn-sm photo-prev-btn" id="tripMenuPrevBtn">前へ</button>
        <button type="button" class="btn btn-secondary btn-sm photo-next-btn" id="tripMenuNextBtn">次へ</button>
      </div>
      <div class="trip-menu-controls-row">
        <button type="button" class="btn btn-primary btn-sm play-btn" id="tripMenuPlayBtn" disabled>▶ 再生</button>
        <button type="button" class="btn btn-secondary btn-sm stop-btn" id="tripMenuStopBtn" disabled>停止</button>
        <select id="tripMenuIntervalSelect">
          <option value="1">1秒</option>
          <option value="3" selected>3秒</option>
          <option value="5">5秒</option>
        </select>
      </div>
    `;
    content.appendChild(controlsEl);
    const photoCountEl = content.querySelector('.trip-menu-photo-count');
    if (photoCountEl) {
      photoCountEl.classList.add('trip-menu-photo-count-clickable');
      photoCountEl.title = 'クリックでサムネイルの表示・非表示を切り替え';
      photoCountEl.onclick = () => {
        fitMapToFullExtent();
        toggleAllPhotosThumbnails();
      };
    }
    const prevBtn = document.getElementById('tripMenuPrevBtn');
    const nextBtn = document.getElementById('tripMenuNextBtn');
    const playBtn = document.getElementById('tripMenuPlayBtn');
    const stopBtn = document.getElementById('tripMenuStopBtn');
    const intervalSelect = document.getElementById('tripMenuIntervalSelect');
    const mainIntervalSelect = document.getElementById('intervalSelect');
    if (prevBtn) prevBtn.onclick = () => { if (currentIndex > 0) showPhotoWithPopup(currentIndex - 1); };
    if (nextBtn) nextBtn.onclick = () => { if (currentIndex < photos.length - 1) showPhotoWithPopup(currentIndex + 1); };
    if (playBtn) playBtn.onclick = startPlay;
    if (stopBtn) stopBtn.onclick = stopPlay;
    if (intervalSelect && mainIntervalSelect) {
      intervalSelect.value = mainIntervalSelect.value;
      intervalSelect.onchange = () => { mainIntervalSelect.value = intervalSelect.value; };
    }
    setPlayStopDisabled(photos.filter(p => p.lat != null && p.lng != null).length === 0, true);
  }

  const mapContainer = document.createElement('div');
  mapContainer.className = 'trip-menu-map-wrap';
  mapContainer.innerHTML = '<div id="tripMenuMap" class="trip-menu-map"></div><div class="trip-menu-thumbnails" id="tripMenuThumbnails"></div>';
  content.appendChild(mapContainer);

  const thumbsDiv = document.getElementById('tripMenuThumbnails');
  if (thumbsDiv) {
    photos.slice(0, 20).forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'trip-menu-thumb';
      div.title = p.name;
      if (p.url) {
        const img = document.createElement('img');
        img.src = p.url;
        if (p.url.startsWith('blob:')) _tripMenuUrls.push(p.url);
        img.alt = '';
        img.onclick = () => showPhoto(i);
        div.appendChild(img);
      }
      thumbsDiv.appendChild(div);
    });
  }

  if (landmarks.length > 0) {
    const stampsEl = document.createElement('div');
    stampsEl.className = 'trip-menu-stamps';
    stampsEl.innerHTML = '<h4 class="trip-menu-stamps-title">スタンプラリー</h4><div class="trip-menu-stamps-grid"></div>';
    const grid = stampsEl.querySelector('.trip-menu-stamps-grid');
    const tripId = _currentViewingTripId || currentTripId || '';
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
        const check = document.createElement('span');
        check.className = 'trip-menu-stamp-check';
        check.textContent = '✓';
        card.appendChild(img);
        card.appendChild(check);
        card.title = 'クリックで写真を変更';
      } else {
        card.textContent = text;
        card.title = 'クリックで写真をアップロード';
      }
      card.onclick = () => openStampUploadModal(tripId, photoIndex, text);
      grid.appendChild(card);
    });
    content.appendChild(stampsEl);
  }

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
    _tripMenuMap = L.map('tripMenuMap', { zoomControl: false }).setView(DEFAULT_CENTER, 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(_tripMenuMap);
    if (routePoints.length >= 2) {
      const line = createStyledRouteLayer(routePoints);
      if (line) line.addTo(_tripMenuMap);
    }
    withGps.forEach((p) => {
      const idx = photos.indexOf(p);
      const icon = L.divIcon({ className: 'trip-menu-marker', html: '<span></span>', iconSize: [8, 8], iconAnchor: [4, 4] });
      L.marker([p.lat, p.lng], { icon }).addTo(_tripMenuMap).on('click', () => showPhoto(idx));
    });
    if (bounds) {
      _tripMenuMap.fitBounds(bounds, { padding: [10, 10], maxZoom: 14 });
    }
    setTimeout(() => _tripMenuMap?.invalidateSize(), 100);
  }
}

/** エクスポート用に写真を圧縮し、目標サイズ（100MB）以下にする */
async function compressTripsForExport(trips, targetBytes) {
  const totalPhotos = trips.reduce((s, t) => s + (t.photos?.length || 0), 0);
  if (totalPhotos === 0) return trips;

  let quality = 0.65;
  let maxDim = 1600;
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = [];
    for (const trip of trips) {
      const photos = [];
      for (const p of trip.photos || []) {
        if (!p.data) continue;
        let enc;
        try {
          enc = await resizeBase64ToBase64(p.mime, p.data, maxDim, maxDim, quality);
        } catch (_) {
          enc = { mime: p.mime, data: p.data };
        }
        if (enc) photos.push({ ...p, data: enc.data, mime: enc.mime || 'image/jpeg' });
      }
      result.push({ ...trip, photos });
    }
    const testJson = JSON.stringify(result);
    if (testJson.length <= targetBytes) return result;
    quality = Math.max(0.2, quality - 0.08);
    if (attempt >= 3) maxDim = Math.max(480, maxDim - 240);
  }
  return trips;
}

async function exportPublicTrips() {
  if (!isEditor()) return;
  const trips = await loadTripsFromDB();
  const publicOnly = trips.filter(t => t.public);
  if (publicOnly.length === 0) {
    setStatus('公開に設定されたトリップがありません。「公開する」にチェックを入れて保存してください。', true);
    return;
  }
  setStatus('エクスポート準備中（100MBに圧縮）…');
  const targetBytes = EXPORT_TARGET_SIZE_MB * 1024 * 1024;
  const compressed = await compressTripsForExport(publicOnly, targetBytes);
  const json = JSON.stringify(compressed, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
  setStatus(`公開トリップ ${publicOnly.length}件を圧縮しました（${sizeMB}MB）`);

  if ('showDirectoryPicker' in window) {
    try {
      setStatus('AirGo フォルダを選択してください…');
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'desktop',
      });
      const fileHandle = await dirHandle.getFileHandle('public-trips.json', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      setStatus(`公開トリップ ${publicOnly.length}件を public-trips.json に保存しました（AirGo フォルダ、上書き済み）。`);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setStatus(err.message || '保存に失敗しました', true);
      fallbackDownloadPublicTrips(blob, publicOnly.length);
    }
  } else if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'public-trips.json',
        types: [{ accept: { 'application/json': ['.json'] }, description: 'JSON' }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      setStatus(`公開トリップ ${publicOnly.length}件を public-trips.json に保存しました。`);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setStatus(err.message || '保存に失敗しました', true);
      fallbackDownloadPublicTrips(blob, publicOnly.length);
    }
  } else {
    fallbackDownloadPublicTrips(blob, publicOnly.length);
  }
}

function fallbackDownloadPublicTrips(blob, count) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'public-trips.json';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`公開トリップ ${count}件をダウンロードしました。AirGo フォルダに public-trips.json として保存（上書き可）してください。`);
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
        const toSave = {
          id: trip.id,
          name: trip.name || '無題',
          description: trip.description || null,
          url: trip.url || null,
          public: !!trip.public,
          photos: trip.photos,
          gpxData: trip.gpxData || null,
          createdAt: trip.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        await saveTripToDB(toSave);
      }
      await refreshTripList();
      setStatus(`トリップ ${trips.length}件を復元しました`);
    } catch (err) {
      setStatus(err.message || 'インポートに失敗しました', true);
    }
    input.onchange = null;
  };
  input.click();
}

async function refreshTripList() {
  let dbTrips = [];
  try {
    dbTrips = await loadTripsFromDB() || [];
  } catch (err) {
    console.error('トリップ読み込みエラー:', err);
    setStatus('トリップの読み込みに失敗しました。インポートで復元できます。', true);
  }
  const allTrips = [...dbTrips];
  publicTrips.forEach(t => {
    if (!allTrips.some(x => x.id === t.id)) {
      allTrips.push({ ...t, id: 'public_' + t.id });
    }
  });
  const select = document.getElementById('tripSelect');
  const prevVal = select.value;
  select.innerHTML = '<option value="">— 読み込む —</option>';
  allTrips.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  allTrips.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    const label = t.id.startsWith('public_') ? ' [公開]' : '';
    opt.textContent = `${t.name} (${(t.photos || []).length}枚)${label}`;
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
    await deleteTripFromDB(id);
    if (currentTripId === id) clearCurrentTrip();
    document.getElementById('tripSelect').value = '';
    await refreshTripList();
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
  const dbTrips = await loadTripsFromDB();
  let allTrips = [...dbTrips];
  publicTrips.forEach(t => {
    if (!allTrips.some(x => x.id === t.id)) {
      allTrips.push({ ...t, id: 'public_' + t.id, _isPublic: true });
    }
  });
  if (!isEditor()) allTrips = allTrips.filter(t => t._isPublic);
  const body = document.getElementById('tripListBody');
  if (!body) return;
  body.innerHTML = '';

  _tripListUrls.forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
  _tripListUrls = [];

  allTrips.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  allTrips.forEach(trip => {
    const item = document.createElement('div');
    item.className = 'trip-list-item';
    const photos = trip.photos || [];
    const showDelete = isEditor() && !trip._isPublic;
    item.innerHTML = `
      <div class="trip-list-item-header">
        <span class="trip-list-item-info">
          <span class="trip-list-item-name">${escapeHtml(trip.name)}</span>
          <span class="trip-list-item-count">${photos.length}枚</span>
        </span>
        ${showDelete ? '<button type="button" class="trip-list-delete-btn" title="トリップと写真を削除">削除</button>' : ''}
      </div>
      <div class="trip-list-photos"></div>
    `;
    const header = item.querySelector('.trip-list-item-header');
    const photosDiv = item.querySelector('.trip-list-photos');
    const deleteBtn = item.querySelector('.trip-list-delete-btn');

    const tripId = trip._isPublic ? trip.id : trip.id;
    const origTripId = trip._isPublic ? trip.id.slice(7) : trip.id;
    if (deleteBtn) {
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!confirm(`「${escapeHtml(trip.name)}」とその写真を削除しますか？`)) return;
        try {
          await deleteTripFromDB(origTripId);
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

    body.appendChild(item);
  });
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

function goToHome() {
  if (isPlaying) stopPlay();
  clearCurrentTrip();
  document.getElementById('tripSelect').value = '';
  closeMenu();
  document.getElementById('allPhotosThumbnails').classList.remove('visible');
  if (map) map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  setStatus('');
}

function openMenu() {
  if (isEditor()) updateAiSettingsUI();
  document.getElementById('menuOverlay').classList.add('visible');
  document.getElementById('menuPanel').classList.add('open');
}

function closeMenu() {
  document.getElementById('menuOverlay').classList.remove('visible');
  document.getElementById('menuPanel').classList.remove('open');
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

function openPhotoEditModal(photoIndex) {
  if (!isEditor() || photos.length === 0) return;
  _photoEditTripId = currentTripId;
  _photoEditIndex = photoIndex;
  const photo = photos[photoIndex];
  if (!photo) return;

  document.getElementById('photoEditPreview').innerHTML = `<img src="${photo.url}" alt="${escapeHtml(photo.name)}">`;
  document.getElementById('photoEditLandmarkNo').value = photo.landmarkNo ?? '';
  document.getElementById('photoEditLandmarkName').value = photo.landmarkName ?? '';
  document.getElementById('photoEditDesc').value = photo.description || '';
  document.getElementById('photoEditUrl').value = photo.photoUrl || '';
  document.getElementById('photoEditModal').classList.add('open');
}

async function openPhotoEditModalFromTrip(tripId, photoIndex) {
  if (!isEditor()) return;
  const trip = await loadTripFromDB(tripId);
  if (!trip || !trip.photos || !trip.photos[photoIndex]) return;
  const p = trip.photos[photoIndex];
  _photoEditTripId = tripId;
  _photoEditIndex = photoIndex;

  const imgUrl = base64ToUrl(p.mime, p.data);
  document.getElementById('photoEditPreview').innerHTML = `<img src="${imgUrl}" alt="${escapeHtml(p.name)}">`;
  document.getElementById('photoEditLandmarkNo').value = p.landmarkNo ?? '';
  document.getElementById('photoEditLandmarkName').value = p.landmarkName ?? '';
  document.getElementById('photoEditDesc').value = p.description || '';
  document.getElementById('photoEditUrl').value = p.url || '';
  document.getElementById('photoEditModal').classList.add('open');
  URL.revokeObjectURL(imgUrl);
}

function closePhotoEditModal() {
  document.getElementById('photoEditModal').classList.remove('open');
  _photoEditTripId = null;
  _photoEditIndex = null;
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
  const metadata = { landmarkNo, landmarkName, description: desc, url };

  if (!_photoEditTripId) {
    closePhotoEditModal();
    setStatus('保存できません（トリップが読み込まれていません。メニューからトリップを選択して「読み込み」してください）', true);
    return;
  }

  // 公開トリップは保存不可
  if (_photoEditTripId.startsWith('public_')) {
    closePhotoEditModal();
    setStatus('公開トリップは編集・保存できません', true);
    return;
  }

  // メモリ上の photos を更新（表示中のトリップの場合）
  if (currentTripId === _photoEditTripId && photos[_photoEditIndex]) {
    photos[_photoEditIndex].landmarkNo = landmarkNo;
    photos[_photoEditIndex].landmarkName = landmarkName;
    photos[_photoEditIndex].description = desc;
    photos[_photoEditIndex].photoUrl = url;
  }

  let saved = false;
  try {
    if (currentTripId === _photoEditTripId) {
      // 表示中のトリップ: メモリ状態をそのまま saveTrip で保存（最も確実）
      saved = await saveTrip();
    } else {
      // トリップ一覧から編集: DB に直接保存
      const dbIndex = (photos[_photoEditIndex]?._dbIndex != null) ? photos[_photoEditIndex]._dbIndex : _photoEditIndex;
      saved = await savePhotoMetadataToDB(_photoEditTripId, dbIndex, metadata);
    }
  } catch (err) {
    console.error('savePhotoEdit error:', err);
  }

  if (saved) {
    addPhotoMarkers();
    renderAllPhotosStrip();
    if (currentTripId === _photoEditTripId && photos[_photoEditIndex]) {
      showPhoto(_photoEditIndex);
    }
    await refreshTripList();
    await renderPublicTripsPanel();
    await renderTripListPanel();
    setStatus('詳細設定を保存しました');
    setTimeout(() => setStatus(''), 2000);
  } else {
    setStatus('保存に失敗しました。トリップを再度読み込んでお試しください。', true);
  }

  closePhotoEditModal();
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
  await loadPublicTripsFromServer();
  updateEditorUI();

  document.getElementById('authBtn').onclick = () => {
    if (isEditor()) {
      setEditor(false);
      updateEditorUI();
      setStatus('ログアウトしました');
    } else {
      document.getElementById('authModal').classList.add('open');
    }
  };

  document.getElementById('authModalClose').onclick = () => {
    document.getElementById('authModal').classList.remove('open');
  };

  document.getElementById('authLoginBtn').onclick = () => {
    const user = document.getElementById('authUser').value;
    const pass = document.getElementById('authPass').value;
    if (checkAuth(user, pass)) {
      setEditor(true);
      updateEditorUI();
      document.getElementById('authModal').classList.remove('open');
      document.getElementById('authUser').value = '';
      document.getElementById('authPass').value = '';
      setStatus('ログインしました');
    } else {
      setStatus('ユーザー名またはパスワードが正しくありません', true);
    }
  };

  document.getElementById('authModal').onclick = e => {
    if (e.target.id === 'authModal') document.getElementById('authModal').classList.remove('open');
  };

  document.getElementById('helpBtn').onclick = () => {
    document.getElementById('helpModal').classList.add('open');
  };
  document.getElementById('helpModalClose').onclick = () => {
    document.getElementById('helpModal').classList.remove('open');
  };
  document.getElementById('helpModal').onclick = e => {
    if (e.target.id === 'helpModal') document.getElementById('helpModal').classList.remove('open');
  };

  document.getElementById('openPublicTripConfigBtn').onclick = () => {
    closeMenu();
    openPublicTripConfigModal();
  };
  document.getElementById('publicTripConfigClose').onclick = () => {
    document.getElementById('publicTripConfigModal').classList.remove('open');
  };
  document.getElementById('publicTripConfigModal').onclick = e => {
    if (e.target.id === 'publicTripConfigModal') document.getElementById('publicTripConfigModal').classList.remove('open');
  };
  document.getElementById('publicTripConfigAddSection').onclick = addPublicTripConfigSection;
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
      updateTripInfoDisplay(currentTripId ? await loadTripFromDB(currentTripId) : null);
      if (currentTripId) autoSaveTrip();
    } catch (err) {
      setStatus(err.message || 'GPXの読み込みに失敗しました', true);
    }
    gpxInput.value = '';
  };

  document.getElementById('playBtn').onclick = startPlay;
  document.getElementById('stopBtn').onclick = stopPlay;
  const menuPlayBtn = document.getElementById('menuPlayBtn');
  const menuStopBtn = document.getElementById('menuStopBtn');
  if (menuPlayBtn) menuPlayBtn.onclick = startPlay;
  if (menuStopBtn) menuStopBtn.onclick = stopPlay;
  document.getElementById('saveTripBtn').onclick = saveTrip;
  document.getElementById('tripNameInput').addEventListener('input', () => { updateSaveButtonState(); scheduleAutoSave(); });
  document.getElementById('tripDescInput').addEventListener('input', () => { updateSaveButtonState(); scheduleAutoSave(); });
  document.getElementById('tripUrlInput').addEventListener('input', () => { updateSaveButtonState(); scheduleAutoSave(); });
  document.getElementById('tripPublicInput')?.addEventListener('change', scheduleAutoSave);
  document.getElementById('loadTripBtn').onclick = loadTrip;
  document.getElementById('newTripBtn').onclick = () => {
    if (!isEditor()) return;
    clearCurrentTrip();
    isNewTrip = true;
    document.getElementById('tripSelect').value = '';
    setStatus('新規トリップを開始しました。写真をアップロードしてください。');
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

  document.getElementById('exportPublicBtn').onclick = exportPublicTrips;
  document.getElementById('tripImportBtn').onclick = importTripsFromFile;

  const aiProviderSelect = document.getElementById('aiProviderSelect');
  const aiApiKeyInput = document.getElementById('aiApiKeyInput');
  const aiApiKeySaveBtn = document.getElementById('aiApiKeySaveBtn');
  if (aiProviderSelect) {
    aiProviderSelect.addEventListener('change', () => {
      setAiApiProvider(aiProviderSelect.value);
      if (aiApiKeyInput) aiApiKeyInput.placeholder = aiProviderSelect.value === 'gemini' ? 'API Key を入力' : 'sk-... を入力';
    });
  }
  if (aiApiKeySaveBtn && aiApiKeyInput) {
    aiApiKeySaveBtn.addEventListener('click', () => {
      const key = (aiApiKeyInput.value || '').trim();
      setAiApiKey(key);
      setStatus(key ? 'API Key を保存しました' : 'API Key を削除しました');
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

  document.getElementById('playOverlayClose').onclick = () => {
    if (!isPlaying) {
      document.getElementById('playPhotoOverlay').classList.remove('visible', 'play-mode');
    }
  };
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

  document.getElementById('tripMenuBack').onclick = (e) => {
    e.preventDefault();
    _showTripListInPanel = true;
    renderPublicTripsPanel();
  };

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
    const link = e.target.closest('.trip-desc-link, .trip-meta-detail-link, .public-trips-section-link');
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
}

setup();
