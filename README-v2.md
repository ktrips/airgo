# Airgo v2.0 — 写真と地図の旅

GPS付き写真をアップロードすると、撮影場所を地図上に表示し、自動で地図を動かしながら写真をスライドショーするアプリです。

## 🚀 v2.0 の改善点

### パフォーマンス劇的向上
- **初回読み込み: 13.5MB → 4.5KB (99.97% 削減)**
- **表示速度: 15-30秒 → 0.5秒 (30-60倍高速化)**
- **モバイル対応: 実用レベルに到達**

### 主要な改善
1. **コードのモジュール化** - 7,325行の巨大ファイルを機能別に分割
2. **写真サムネイル自動生成** - 5MB/枚 → 50KB/枚 (99% 削減)
3. **トリップデータの分割** - 必要な時だけ読み込む遅延ローディング
4. **キャッシュ機構** - 一度読み込んだデータを高速表示

詳細は [IMPROVEMENTS.md](IMPROVEMENTS.md) を参照。

---

## 機能

### 写真・地図

- **写真アップロード**: ドラッグ＆ドロップまたはファイル選択（JPG/JPEG/PNG等）
- **EXIF GPS読み取り**: JPG画像のEXIFから緯度・経度を自動取得（スマートフォン・カメラ撮影）
- **逆ジオコーディング**: GPS座標から地名を自動取得（OpenStreetMap Nominatim）
- **地図表示**: OpenStreetMap / 航空写真（Esri）を切り替え可能
- **自動再生**: 1/3/5秒間隔で写真を切り替え、地図を自動で移動
- **全写真サムネイル**: 下部に全写真を一覧表示、クリックで拡大・地図マーカー表示

### GPX

- **ルート表示**: GPXファイルをアップロードで地図にルートを重ね表示
- **GPX順ソート**: ルートに沿った順序で写真を並べ替え
- **詳細データ**: 速度・標高・気温・心拍数など extensions のデータを再生時に表示

### トリップ管理

- **保存・読み込み**: 複数トリップを IndexedDB に保存（Firebase 利用時は Firestore にも同期）
- **トリップ名・説明・URL**: 各トリップにメタデータを付与可能
- **写真の説明・URL**: 写真ごとに説明文とリンクURLを編集可能
- **インポート・エクスポート**: JSON でトリップをバックアップ・復元

### 公開・共有

- **公開トリップ**: 「公開する」にチェックでログインなし閲覧可能に
- **エクスポート**: `public-trips.json` をダウンロードしてデプロイ
- **動画ダウンロード**: スライドショーを WebM 動画として出力（対応ブラウザのみ）

### Firebase（オプション）

- **Google ログイン**: Firebase 設定時は「Googleでログイン」で編集モードを有効化
- **Firestore 同期**: トリップの保存・削除・インポート時に Firestore に自動同期
- **パブリックトリップの高速読み込み**: ログインの有無に関わらず、Firestoreから最新のパブリックトリップを直接読み込み
- **設定**: `firebase-config.example.js` を `firebase-config.js` にコピーし、Firebase Console の値を入力
- **デプロイ**: 以下のコマンドでFirestoreのルールとインデックスをデプロイ
  ```bash
  firebase deploy --only firestore:rules
  firebase deploy --only firestore:indexes
  ```

---

## 使い方

### 1. トリップデータの準備（初回のみ）

```bash
# public-trips.json を個別ファイルに分割
node scripts/split-trips.js
```

### 2. 起動

```bash
cd airgo
python3 -m http.server 8080
# ブラウザで http://localhost:8080 を開く
```

### 3. 閲覧（ログイン不要）

- **公開トリップ**: 右側パネルからトリップを選択して閲覧
- **写真**: サムネイルクリックで拡大、地図マーカー表示
- **操作**: 「▶ 再生」「前へ」「次へ」でスライドショー

### 4. 編集（ログイン必要）

- **ログイン**: メニュー（≡）→「ログイン」で編集モードを有効化
- **写真アップロード**: メニュー内のアップロードゾーンにドラッグ＆ドロップ
- **GPX読み込み**: ルートファイルをアップロードで地図に重ね表示
- **トリップ保存**: トリップ名・説明を入力し「保存」
- **公開設定**: 「公開する」にチェックでログインなし閲覧可能に

---

## 開発者向け

### モジュール構造

```
src/
├── app-new.js          - エントリーポイント
├── core/
│   ├── photos.js       - 写真管理・EXIF
│   └── gpx.js          - GPX処理
├── storage/
│   └── trip-loader.js  - 遅延読み込み
└── utils/
    ├── helpers.js      - ユーティリティ
    └── image.js        - 画像処理
```

### APIの使用例

```javascript
import { loadTripIndex, loadTrip } from './src/storage/trip-loader.js';
import { createThumbnail } from './src/utils/image.js';

// トリップ一覧を取得（軽量・高速）
const trips = await loadTripIndex();

// 個別トリップを遅延読み込み
const trip = await loadTrip('trip-001');

// 写真のサムネイル生成
const thumbnail = await createThumbnail(file, {
  maxWidth: 360,
  maxHeight: 640,
  quality: 0.7
});
```

---

## 技術

- Leaflet（地図）
- exifr（EXIF/GPS読み取り）
- IndexedDB（トリップ保存）
- Firebase（Auth / Firestore、オプション）
- ES Modules（モジュールシステム）
- Canvas API（画像処理）
