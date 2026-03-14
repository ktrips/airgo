# AirGo パフォーマンス改善実装案

## 分析結果

### 主なボトルネック

1. **画像処理**
   - Base64からBlob URLへの変換が大量に発生
   - サムネイル画像のサイズが大きい
   - `renderAllPhotosStrip`で全写真のDOMを生成

2. **地図マーカー**
   - `addPhotoMarkers`が一つずつマーカーを追加
   - マーカーの削除・追加を毎回実行

3. **レンダリング**
   - `renderPublicTripsPanel`が同期的にDOMを生成
   - 重複したHTML生成処理

4. **データ取得**
   - `getMergedTrips`は既にキャッシュ実装済み（400ms TTL）
   - `fetchPlaceNamesForPhotos`は既に非同期化済み

## 改善案

### 1. 画像サムネイルの最適化

**問題**: IndexedDBに保存される画像がフルサイズのまま

**解決策**:
```javascript
// サムネイル専用の小さいサイズを保存
const THUMB_MAX_WIDTH = 300;
const THUMB_MAX_HEIGHT = 300;
const THUMB_QUALITY = 0.7;

async function createThumbnail(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > THUMB_MAX_WIDTH || height > THUMB_MAX_HEIGHT) {
        const ratio = Math.min(THUMB_MAX_WIDTH / width, THUMB_MAX_HEIGHT / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // JPEG圧縮でファイルサイズを削減
      resolve(canvas.toDataURL('image/jpeg', THUMB_QUALITY));
    };
    img.src = imageUrl;
  });
}
```

**効果**: ストレージサイズ削減、読み込み速度向上（70-90%削減予想）

---

### 2. 仮想スクロール（Virtual Scrolling）

**問題**: `renderAllPhotosStrip`が全写真のDOMを生成（100枚で重い）

**解決策**:
```javascript
// 表示領域に入っている写真のみレンダリング
const VISIBLE_PHOTOS_BUFFER = 10; // 前後に追加でレンダリングする枚数

function renderAllPhotosStripVirtual() {
  const strip = document.getElementById('allPhotosStrip');
  const container = strip.parentElement;
  const scrollLeft = container.scrollLeft;
  const containerWidth = container.offsetWidth;
  const thumbWidth = 120; // サムネイル幅（CSS値と同期）

  const startIndex = Math.max(0, Math.floor(scrollLeft / thumbWidth) - VISIBLE_PHOTOS_BUFFER);
  const endIndex = Math.min(photos.length, Math.ceil((scrollLeft + containerWidth) / thumbWidth) + VISIBLE_PHOTOS_BUFFER);

  // 既存のDOMを再利用し、表示範囲外は削除
  const existingThumbs = strip.querySelectorAll('.all-photo-thumb-wrap');
  const toRemove = Array.from(existingThumbs).filter(el => {
    const idx = parseInt(el.dataset.photoIndex);
    return idx < startIndex || idx >= endIndex;
  });
  toRemove.forEach(el => el.remove());

  // 表示範囲のみレンダリング
  for (let i = startIndex; i < endIndex; i++) {
    if (!strip.querySelector(`[data-photo-index="${i}"]`)) {
      // 新規作成
      renderPhotoThumb(i, strip);
    }
  }
}

// スクロールイベントにdebounce適用
let scrollTimeout;
container.addEventListener('scroll', () => {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(renderAllPhotosStripVirtual, 50);
});
```

**効果**: 初期レンダリング時間削減（100枚→20枚程度に削減）

---

### 3. 地図マーカーのバッチ処理

**問題**: `addPhotoMarkers`がループ内でマーカーを一つずつ追加

**解決策**:
```javascript
function addPhotoMarkersBatch() {
  // 既存マーカーを一括削除
  if (markers.length > 0) {
    const markerGroup = L.layerGroup(markers);
    markerGroup.clearLayers();
    markers = [];
  }

  const withGps = photos.filter(p => p.lat != null && p.lng != null);
  if (withGps.length === 0) return;

  // マーカーを一括作成
  const newMarkers = withGps.map((photo, idx) => {
    const photoIndex = photos.indexOf(photo);
    const icon = createPhotoIcon(photo);
    const marker = L.marker([photo.lat, photo.lng], { icon })
      .bindPopup(buildPhotoPopupHtml(photo, photoIndex), {
        maxWidth: 488,
        className: 'photo-popup',
      })
      .on('click', () => showPhotoWithPopup(photoIndex));
    marker.photoIndex = photoIndex;
    return marker;
  });

  // LayerGroupで一括追加
  const markerGroup = L.layerGroup(newMarkers).addTo(map);
  markers = newMarkers;

  // 地図範囲の調整
  const bounds = L.latLngBounds(withGps.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [150, 150], maxZoom: 16 });
}
```

**効果**: マーカー追加速度向上（特に100個以上のマーカーで効果大）

---

### 4. レンダリングの最適化（RequestAnimationFrame）

**問題**: DOM操作が同期的で、複数の更新が重なるとブロッキング

**解決策**:
```javascript
// レンダリングをフレーム単位で最適化
let pendingRender = false;

function scheduleRender(renderFn) {
  if (pendingRender) return;
  pendingRender = true;

  requestAnimationFrame(() => {
    renderFn();
    pendingRender = false;
  });
}

// 使用例
function updateTripInfoDisplay(trip) {
  scheduleRender(() => {
    // DOM更新処理
    const nameEl = document.getElementById('tripInfoName');
    if (nameEl) nameEl.textContent = trip.name;
    // ...
  });
}
```

**効果**: スムーズなアニメーション、UI応答性向上

---

### 5. Base64→Blob URL変換のキャッシュ

**問題**: 同じ画像に対して何度もBlob URLを生成している

**解決策**:
```javascript
const _blobUrlCache = new Map(); // key: base64 hash, value: blob URL

function base64ToUrlCached(mime, data) {
  const key = data.substring(0, 100); // 先頭100文字をキーにする

  if (_blobUrlCache.has(key)) {
    return _blobUrlCache.get(key);
  }

  const url = base64ToUrl(mime, data);
  _blobUrlCache.set(key, url);

  // 100個を超えたら古いものを削除
  if (_blobUrlCache.size > 100) {
    const firstKey = _blobUrlCache.keys().next().value;
    const oldUrl = _blobUrlCache.get(firstKey);
    URL.revokeObjectURL(oldUrl);
    _blobUrlCache.delete(firstKey);
  }

  return url;
}
```

**効果**: 重複変換の削減、メモリ使用量の最適化

---

### 6. Intersection Observer による遅延読み込み

**問題**: 全ての画像を一度に読み込もうとする

**解決策**:
```javascript
const imageObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      if (img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
        imageObserver.unobserve(img);
      }
    }
  });
}, {
  rootMargin: '50px' // 50px手前から読み込み開始
});

// 画像要素作成時
function createLazyImage(src, alt) {
  const img = document.createElement('img');
  img.dataset.src = src; // 実際のsrcではなくdata-srcに設定
  img.alt = alt;
  imageObserver.observe(img);
  return img;
}
```

**効果**: 初期表示速度の向上、ネットワーク負荷の削減

---

### 7. デバウンス・スロットリングの適用

**問題**: イベントハンドラが頻繁に実行される

**解決策**:
```javascript
// デバウンス（最後の呼び出しのみ実行）
function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// スロットリング（一定間隔で実行）
function throttle(fn, interval) {
  let lastTime = 0;
  return function(...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn.apply(this, args);
    }
  };
}

// 使用例
window.addEventListener('resize', debounce(() => {
  renderAllPhotosStrip();
}, 200));

window.addEventListener('scroll', throttle(() => {
  updateVisibleElements();
}, 100));
```

**効果**: 不要な処理の削減、CPU使用率の低下

---

## 実装優先順位

### 高優先度（即効性あり）
1. ✅ 画像サムネイルの最適化（ストレージ・転送量削減）
2. ✅ Base64→Blob URL変換のキャッシュ
3. ✅ デバウンス・スロットリングの適用

### 中優先度（大量データで効果大）
4. 仮想スクロール（100枚以上の写真で効果大）
5. 地図マーカーのバッチ処理
6. Intersection Observerによる遅延読み込み

### 低優先度（細かい最適化）
7. RequestAnimationFrameの適用

---

## 測定指標

改善前後で以下を測定：

- **初回表示時間**: トリップ選択から写真表示まで
- **メモリ使用量**: IndexedDB、Blob URL
- **レンダリング時間**: `renderAllPhotosStrip`、`addPhotoMarkers`
- **ネットワーク転送量**: Firestore読み込みサイズ

---

## 既に実装済みの最適化

✅ `getMergedTrips`のキャッシュ（400ms TTL）
✅ `fetchPlaceNamesForPhotos`の非同期化
✅ `aggregateParentTripDataForAnime`のバックグラウンド実行

---

## 次のステップ

1. 高優先度の改善を実装
2. Chrome DevToolsで計測
3. 効果を確認してから中優先度に進む
