/**
 * AirGo - モジュール化版エントリーポイント
 *
 * 改善ポイント:
 * - コードを機能ごとにモジュール分割
 * - 写真サムネイル自動生成
 * - トリップデータの遅延読み込み
 * - パフォーマンス最適化
 */

// ユーティリティ
import { escapeHtml, formatSpeed, formatDuration, haversineKm } from './utils/helpers.js';
import { createThumbnail, createMediumImage } from './utils/image.js';

// コア機能
import { loadPhotoWithExif, loadPhotosWithExif, reverseGeocode, fetchPlaceNamesForPhotos } from './core/photos.js';
import {
  getGpxRoutePoints,
  parseGpxTrackPoints,
  assignGpxDataToPhotos,
  getRouteDistanceKm,
  sortPhotosByGpxRoute,
  getGpxStats
} from './core/gpx.js';

// ストレージ
import { loadTripIndex, loadTrip, loadTrips, clearTripCache } from './storage/trip-loader.js';

// グローバル状態（将来的にはStateManagementモジュールへ移行）
window.AirGo = {
  // データ
  photos: [],
  currentIndex: 0,
  currentTripId: null,
  gpxData: null,
  gpxTrackPoints: [],

  // UI状態
  isPlaying: false,
  playTimer: null,

  // 地図
  map: null,
  markers: [],

  // キャッシュ
  tripCache: new Map(),

  // 設定
  config: {
    thumbnailMaxWidth: 360,
    thumbnailMaxHeight: 640,
    thumbnailQuality: 0.7,
    autoGenerateThumbnails: true
  }
};

/**
 * 写真アップロード処理（サムネイル自動生成付き）
 */
async function handlePhotoUpload(files) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = `写真を処理中... (0/${files.length})`;

  const photos = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      // 1. EXIF GPS 読み取り
      const photoData = await loadPhotoWithExif(file);

      // 2. サムネイル生成
      if (window.AirGo.config.autoGenerateThumbnails) {
        try {
          const thumbnail = await createThumbnail(file, {
            maxWidth: window.AirGo.config.thumbnailMaxWidth,
            maxHeight: window.AirGo.config.thumbnailMaxHeight,
            quality: window.AirGo.config.thumbnailQuality
          });

          photoData.thumbnail = thumbnail.dataUrl;
          photoData.thumbnailSize = thumbnail.size;

          console.log(`📸 ${file.name}: サムネイル ${(thumbnail.size / 1024).toFixed(0)}KB (元: ${(file.size / 1024).toFixed(0)}KB)`);
        } catch (err) {
          console.warn('サムネイル生成エラー:', file.name, err);
        }
      }

      photos.push(photoData);
    } catch (err) {
      console.error('写真処理エラー:', file.name, err);
    }

    // 進捗更新
    statusEl.textContent = `写真を処理中... (${i + 1}/${files.length})`;
  }

  // 3. 地名取得
  statusEl.textContent = '地名を取得中...';
  await fetchPlaceNamesForPhotos(photos, (progress, current, total) => {
    statusEl.textContent = `地名を取得中... (${current}/${total})`;
  });

  window.AirGo.photos = photos;
  statusEl.textContent = `${photos.length}枚の写真を読み込みました`;

  // UI更新
  renderPhotos();
}

/**
 * トリップ一覧を表示
 */
async function loadAndDisplayTrips() {
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'トリップ一覧を読み込み中...';

  try {
    // index.json のみ読み込み（軽量・高速）
    const trips = await loadTripIndex();

    console.log(`✅ ${trips.length}件のトリップを読み込みました`);

    // UI に表示
    renderTripList(trips);

    statusEl.textContent = `${trips.length}件のトリップ`;
  } catch (err) {
    console.error('トリップ一覧読み込みエラー:', err);
    statusEl.textContent = 'トリップ一覧の読み込みに失敗しました';
  }
}

/**
 * トリップを選択して表示（遅延読み込み）
 */
async function selectTrip(tripId) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'トリップを読み込み中...';

  try {
    // 個別トリップを遅延読み込み
    const trip = await loadTrip(tripId);

    if (!trip) {
      throw new Error('トリップが見つかりません');
    }

    // データを反映
    window.AirGo.currentTripId = tripId;
    window.AirGo.photos = trip.photos || [];
    window.AirGo.gpxData = trip.gpxData || null;

    if (window.AirGo.gpxData) {
      window.AirGo.gpxTrackPoints = parseGpxTrackPoints(window.AirGo.gpxData);
      assignGpxDataToPhotos(window.AirGo.photos, window.AirGo.gpxTrackPoints);
    }

    console.log(`✅ トリップ読み込み: ${trip.name} (${window.AirGo.photos.length}枚)`);

    // UI更新
    renderTrip(trip);

    statusEl.textContent = `${trip.name} - ${window.AirGo.photos.length}枚`;
  } catch (err) {
    console.error('トリップ読み込みエラー:', err);
    statusEl.textContent = 'トリップの読み込みに失敗しました';
  }
}

/**
 * UI描画関数（プレースホルダー - 既存コードから移行）
 */
function renderPhotos() {
  // TODO: 既存の写真表示ロジックを移行
  console.log('renderPhotos:', window.AirGo.photos.length);
}

function renderTripList(trips) {
  // TODO: 既存のトリップ一覧表示ロジックを移行
  console.log('renderTripList:', trips.length);
}

function renderTrip(trip) {
  // TODO: 既存のトリップ表示ロジックを移行
  console.log('renderTrip:', trip.name);
}

/**
 * 初期化
 */
async function init() {
  console.log('🚀 AirGo 起動中...');
  console.log('📦 モジュール化版: v2.0.0');

  // トリップ一覧を読み込み
  await loadAndDisplayTrips();

  console.log('✅ AirGo 準備完了');
}

// DOMContentLoaded で初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// グローバルに公開（デバッグ用）
window.AirGo.handlePhotoUpload = handlePhotoUpload;
window.AirGo.selectTrip = selectTrip;
window.AirGo.loadTripIndex = loadTripIndex;
window.AirGo.clearCache = clearTripCache;
