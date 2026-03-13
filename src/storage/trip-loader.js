/**
 * トリップデータの遅延読み込み（Progressive Loading）
 */

// キャッシュ
const _tripCache = new Map();
const _indexCache = { data: null, loadedAt: 0 };

const CACHE_DURATION = 5 * 60 * 1000; // 5分

/**
 * トリップインデックスを読み込み（軽量・高速）
 * @returns {Promise<Array>} トリップメタデータの配列
 */
export async function loadTripIndex() {
  // キャッシュチェック
  if (_indexCache.data && Date.now() - _indexCache.loadedAt < CACHE_DURATION) {
    return _indexCache.data.trips;
  }

  try {
    // 新しい分割形式を優先
    const response = await fetch('data/trips/index.json');
    if (response.ok) {
      const data = await response.json();
      _indexCache.data = data;
      _indexCache.loadedAt = Date.now();
      console.log(`📋 トリップインデックス読み込み: ${data.totalTrips}件 (${(response.headers.get('content-length') / 1024).toFixed(1)}KB)`);
      return data.trips;
    }
  } catch (err) {
    console.warn('新形式のindex.json読み込み失敗、フォールバック:', err);
  }

  // フォールバック: 旧形式のpublic-trips.json
  try {
    const response = await fetch('data/public-trips.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const trips = await response.json();
    console.log(`📋 旧形式のpublic-trips.json読み込み: ${trips.length}件`);

    // キャッシュに保存
    _indexCache.data = { trips, totalTrips: trips.length };
    _indexCache.loadedAt = Date.now();

    return trips;
  } catch (err) {
    console.error('トリップインデックス読み込みエラー:', err);
    return [];
  }
}

/**
 * 個別のトリップを遅延読み込み
 * @param {string} tripId - トリップID
 * @returns {Promise<Object|null>} トリップデータ
 */
export async function loadTrip(tripId) {
  if (!tripId) return null;

  // キャッシュチェック
  if (_tripCache.has(tripId)) {
    return _tripCache.get(tripId);
  }

  try {
    // 新形式: 個別ファイル
    const response = await fetch(`data/trips/trip-${tripId}.json`);
    if (response.ok) {
      const trip = await response.json();
      _tripCache.set(tripId, trip);
      console.log(`✓ トリップ読み込み: ${trip.name} (${(response.headers.get('content-length') / 1024).toFixed(0)}KB)`);
      return trip;
    }
  } catch (err) {
    console.warn(`個別ファイル読み込み失敗 (${tripId}):`, err);
  }

  // フォールバック: 旧形式から検索
  try {
    const response = await fetch('data/public-trips.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const trips = await response.json();
    const trip = trips.find(t => t.id === tripId);

    if (trip) {
      _tripCache.set(tripId, trip);
      return trip;
    }
  } catch (err) {
    console.error('フォールバック読み込みエラー:', err);
  }

  return null;
}

/**
 * 複数のトリップを並列で読み込み
 */
export async function loadTrips(tripIds, onProgress = null) {
  const results = [];
  const total = tripIds.length;

  for (let i = 0; i < tripIds.length; i++) {
    const trip = await loadTrip(tripIds[i]);
    results.push(trip);

    if (onProgress) {
      onProgress((i + 1) / total, i + 1, total);
    }
  }

  return results.filter(t => t != null);
}

/**
 * キャッシュをクリア
 */
export function clearTripCache() {
  _tripCache.clear();
  _indexCache.data = null;
  console.log('🗑️ トリップキャッシュをクリアしました');
}

/**
 * プリフェッチ（バックグラウンドで先読み）
 */
export async function prefetchTrips(tripIds) {
  console.log(`🔄 ${tripIds.length}件のトリップをプリフェッチ中...`);

  // バックグラウンドで非同期に読み込み（エラーは無視）
  Promise.all(tripIds.map(id => loadTrip(id).catch(() => null)));
}

/**
 * ストレージ使用状況を取得
 */
export function getCacheStats() {
  return {
    cachedTrips: _tripCache.size,
    hasIndex: _indexCache.data != null,
    cacheAge: Date.now() - _indexCache.loadedAt
  };
}
