# AirGo 包括的仕様書

**バージョン**: 1.0  
**最終更新**: 2025年3月

---

## 1. 概要

### 1.1 製品概要

**AirGo** は、GPS付き写真をアップロードすると撮影場所を地図上に表示し、自動で地図を動かしながら写真をスライドショーするWebアプリケーションである。「地図と写真でエア旅行した気分になる」をコンセプトに、旅行記・サイクリング記録・フォトアルバムの作成・閲覧・共有を支援する。

### 1.2 主な特徴

| 特徴 | 説明 |
|------|------|
| **写真×地図** | EXIF GPSから座標を取得し、地図上にマーカー表示 |
| **スライドショー** | 1/3/5秒間隔で写真を自動切り替え、地図を追従 |
| **GPX連携** | ルートファイルを重ね表示、ルート順に写真をソート |
| **トリップ管理** | 複数トリップを保存・編集・公開 |
| **オフライン対応** | IndexedDBを主ストレージとし、オフラインでも閲覧・編集可能 |
| **Firebase連携** | オプションでGoogleログイン・Firestore同期 |

### 1.3 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フロントエンド | HTML5, CSS3, JavaScript（ビルド不要） |
| 地図 | Leaflet 1.9.4 |
| EXIF/GPS | exifr |
| ストレージ | IndexedDB, localStorage |
| 認証・DB | Firebase Auth, Firestore（オプション） |
| PDF生成 | jsPDF |
| フォント | Inter（Google Fonts） |

---

## 2. システム構成

### 2.1 アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                        ブラウザ                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  index.html │  │   app.js    │  │     style.css        │ │
│  │  (UI構造)   │  │ (ロジック)   │  │   (スタイル)          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│         │                  │                                │
│         └──────────────────┼────────────────────────────────│
│                            │                                 │
│  ┌─────────────────────────┴─────────────────────────────┐  │
│  │  IndexedDB (airgo)  │  localStorage  │  Firebase SDK   │  │
│  └─────────────────────────┬─────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │  Firestore (trips)          │
              │  Firebase Auth (Google)      │
              │  Nominatim (逆ジオコーディング) │
              └─────────────────────────────┘
```

### 2.2 ファイル構成

```
airgo/
├── index.html          # メインHTML（UI構造）
├── app.js              # アプリケーションロジック（約9,000行）
├── style.css           # スタイル（約4,300行）
├── firebase-init.js    # Firebase初期化
├── firebase-config.js  # Firebase設定（gitignore、要手動作成）
├── firebase-config.example.js
├── firebase.json       # Firebase Hosting/ Firestore設定
├── firestore.rules     # Firestoreセキュリティルール
├── firestore.indexes.json
├── package.json        # firebase, firebase-admin
├── data/
│   ├── public-trips.json   # 公開トリップ（デプロイ用）
│   └── trips/              # 分割トリップ（index.json + trip-{id}.json）
├── scripts/            # ユーティリティスクリプト
└── .github/workflows/  # CI/CD
```

---

## 3. データモデル

### 3.1 Trip（トリップ）

| フィールド | 型 | 説明 |
|------------|-----|------|
| `id` | string | 一意識別子（例: `trip_1700000000000`） |
| `name` | string | トリップ名 |
| `description` | string \| null | 説明文 |
| `url` | string \| null | ブログURL |
| `videoUrl` | string \| null | 動画URL |
| `public` | boolean | 公開フラグ（ログインなし閲覧可） |
| `color` | string | ルート・マーカー色（例: `#e1306c`） |
| `createdAt` | number | 作成日時（Unix ms） |
| `updatedAt` | number | 更新日時（Unix ms） |
| `parentId` | string \| null | 親トリップID（子トリップの場合） |
| `date` | string \| null | datetime-local値（GPSなし時の並び順） |
| `photos` | Photo[] | 写真配列 |
| `gpxData` | string \| null | GPX XML文字列 |
| `travelogueHtml` | string \| null | 旅行記HTML |
| `animeList` | Array \| null | 旅行アニメデータ |
| `stampPhotos` | Object \| null | スタンプ写真 |
| `thumbnail` | Object \| null | サムネイル |
| `userId` | string | Firestore用（所有者UID） |

### 3.2 Photo（写真）

| フィールド | 型 | 説明 |
|------------|-----|------|
| `url` | string | 表示用URL（blob: または data:） |
| `data` | string | base64（エクスポート・保存用） |
| `mime` | string | MIMEタイプ（例: image/jpeg） |
| `lat` | number \| null | 緯度 |
| `lng` | number \| null | 経度 |
| `name` | string | ファイル名・表示名 |
| `placeName` | string | 逆ジオコーディング地名 |
| `description` | string | 説明文 |
| `landmarkNo` | string | ランドマーク番号（地図表示用） |
| `landmarkName` | string | ランドマーク名 |
| `url` | string | 写真リンクURL（ブログ等） |
| `date` | Date | 撮影日時 |
| `gpxData` | Object | GPX連携データ（speed, temp, ele, hr） |

### 3.3 ストレージスキーマ

#### IndexedDB（`airgo`, DB_VERSION=5）

| ストア | keyPath | 用途 |
|--------|---------|------|
| `trips` | `id` | トリップ本体 |
| `travelogueHtml` | `tripId` | 旅行記HTML |
| `dataAnime` | `id` (autoIncrement) | 旅行アニメ |

#### Firestore

- **コレクション**: `trips`
- **インデックス**: `public` ASC, `updatedAt` DESC
- **フィールド**: Trip + `userId`

#### localStorage

| キー | 用途 |
|------|------|
| `airgo_ai_provider` | AI APIプロバイダー（gemini/openai/claude） |
| `airgo_ai_model` | AIモデル名 |
| `airgo_ai_api_key` | API Key（暗号化なし、注意） |
| `airgo_public_trip_config` | 公開トリップ表示設定 |
| `airgo_my_trip_list_order` | トリップ一覧の並び順 |
| `airgo_deleted_trip_ids` | 削除済みトリップID |
| `airgo_stamp_photos` | スタンプ写真 |
| `airgo_travelogue_info` | 旅行記メタ |
| `airgo_hidden_anime_ids` | 非表示アニメID |
| `airgo_anime_character_photos` | アニメキャラ写真 |

---

## 4. 機能仕様

### 4.1 写真・地図

#### 4.1.1 写真アップロード

- **方式**: ドラッグ＆ドロップ、またはファイル選択
- **対応形式**: JPG/JPEG/PNG等（`image/*`）
- **処理フロー**: `handleFiles()` → `loadPhotoWithExif()` → EXIF解析 → 逆ジオコーディング
- **EXIF取得**: exifr で `latitude`, `longitude`, `DateTimeOriginal` を取得、DMS→十進度変換

#### 4.1.2 逆ジオコーディング

- **サービス**: OpenStreetMap Nominatim
- **エンドポイント**: `https://nominatim.openstreetmap.org/reverse`
- **レート制限**: 1秒1リクエスト、キャッシュあり
- **用途**: GPS座標から地名（`placeName`）を自動取得

#### 4.1.3 地図表示

- **ライブラリ**: Leaflet 1.9.4
- **レイヤー**:
  - OpenStreetMap（標準）
  - Esri 航空写真
  - ハイブリッド（ラベル）
- **マーカー**: 写真位置、ランドマーク番号表示、トリップ色で区別
- **デフォルト**: 中心（日本）、ズームレベル適宜

#### 4.1.4 地名検索

- **入力**: `mapSearchInput`
- **API**: Nominatim search
- **動作**: 検索結果クリックで地図を該当座標に移動

### 4.2 GPX

#### 4.2.1 ルート表示

- **形式**: GPX 1.0/1.1
- **要素**: `trkpt`, `rtept`, `wpt` から `[lat, lon]` を抽出
- **表示**: Leaflet Polyline で地図に重ね描画

#### 4.2.2 GPX順ソート

- **関数**: `sortPhotosByGpxOrder()`
- **ロジック**: 各写真の座標をGPXルート上の最近傍点にマッピングし、ルート順に並べ替え

#### 4.2.3 拡張データ

- **対応**: `extensions` 内の `speed`, `temp`, `ele`, `hr` 等
- **表示**: 再生オーバーレイに速度・標高・気温・心拍数を表示

### 4.3 トリップ管理

#### 4.3.1 親子トリップ

- **親トリップ**: 写真・GPS不要のフォルダ。子トリップをまとめる
- **子トリップ**: `parentId` で親を指定
- **一覧**: 親のみデフォルト表示、クリックで子を展開

#### 4.3.2 トリップカラー

- **12色**: ピンク〜濃い紫のレインボー順
- **用途**: 地図マーカー・ルート線の色分け

#### 4.3.3 保存・読み込み

- **保存**: IndexedDB に常に保存、Firestore はログイン時のみ同期
- **読み込み**: `getMergedTrips()` で IndexedDB + Firestore をマージ
- **キャッシュ**: `_mergedTripsCache` で無駄な再取得を防止

### 4.4 再生（スライドショー）

- **間隔**: 1秒 / 3秒 / 5秒（`intervalSelect`）
- **流れ**: `startPlay()` → `playTimer` で `showPhotoWithPopup()` を繰り返し
- **オーバーレイ**: 写真、GPXデータ、説明、URL、地名を表示
- **地図**: 写真の座標に地図を自動移動

### 4.5 公開・共有

- **公開フラグ**: `tripPublicInput` で「公開する」にチェック
- **閲覧**: ログイン不要で誰でも閲覧可能
- **エクスポート**: `public-trips.json` または `public-trips.json.gz` をダウンロード
- **デプロイ**: `data/public-trips.json` を配置して Cloud Run / Firebase Hosting にデプロイ

### 4.6 動画出力

- **形式**: WebM
- **対応**: 対応ブラウザのみ（MediaRecorder API）
- **内容**: スライドショーをそのまま録画

---

## 5. AI機能

### 5.1 対応プロバイダー・モデル

| プロバイダー | モデル例 |
|-------------|----------|
| Google Gemini | gemini-2.0-flash, gemini-2.5-flash, gemini-2.5-pro |
| OpenAI | gpt-4o-mini, gpt-4o, gpt-4-turbo |
| Claude | claude-3-5-haiku, claude-3-5-sonnet, claude-3-opus |

### 5.2 旅行記生成

- **関数**: `generateTravelogueWithAI()`
- **入力**: トリップ名・説明・URL、写真サマリー、GPXメタ、ブログ内容、スタンプ状態
- **出力**: 日本語の旅行記テキスト
- **利用**: `generateTraveloguePdf()` で PDF 用 HTML 生成

### 5.3 旅行アニメ生成

- **前提**: Gemini API（画像生成対応モデル）
- **スタイル**: 地球の歩き方、週刊少年ジャンプ、POPEYE 風
- **用途**: 表紙・各ページのアニメ風画像

### 5.4 API Key管理

- **保存先**: localStorage
- **保存時**: 選択中のモデルをデフォルトとして記憶

---

## 6. Firebase連携

### 6.1 認証

- **プロバイダー**: Google のみ
- **方式**: ポップアップ（デスクトップ）、リダイレクト（モバイル）
- **カスタムドメイン**: `airgo.ktrips.net` のとき `authDomain` を同一ホストに設定（iOS Safari 対策）

### 6.2 Firestore

- **コレクション**: `trips`
- **クエリ**:
  - 自分のトリップ: `userId == uid`
  - 公開トリップ: `public == true`
- **ルール**: 作成・更新・削除は `resource.userId == auth.uid` を要する

### 6.3 同期

- **保存時**: IndexedDB → Firestore に自動同期
- **読み込み時**: Firestore から取得して IndexedDB とマージ
- **オフライン**: オフラインキューで遅延同期

### 6.4 設定

- **ファイル**: `firebase-config.js`（`firebase-config.example.js` をコピーして編集）
- **必須項目**: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`

---

## 7. UI仕様

### 7.1 レイアウト

| 領域 | 説明 |
|------|------|
| **ヘッダー** | モバイル時のみ。タイトル、再生・前後・旅行記・アニメ・動画ボタン、間隔選択 |
| **メニュー** | 右スライド。ログイン、設定、トリップ管理、写真・GPXアップロード |
| **設定パネル** | メニュー内。AI設定、エクスポート、インポート、同期、ストレージ最適化 |
| **メイン** | 地図コンテナ、検索ボックス、再生オーバーレイ |
| **公開トリップパネル** | 右側。トリップ一覧、トリップメニュー |
| **全写真サムネイル** | 下部。サムネイルストリップ |
| **トリップ一覧パネル** | ログイン時。保存トリップ一覧（右からスライド） |

### 7.2 モーダル

| ID | 用途 |
|----|------|
| `exportReadyModal` | エクスポート準備完了 |
| `helpModal` | ヘルプ（使い方・設定） |
| `photoEditModal` | 写真詳細（ランドマーク・説明・URL） |
| `publicTripConfigModal` | 公開トリップ表示設定 |
| `stampUploadModal` | スタンプ写真アップロード |
| `characterUploadModal` | アニメキャラ写真アップロード |
| `parentThumbnailModal` | 親トリップサムネイル選択 |
| `urlPopupModal` | URL表示（デスクトップ） |
| `webviewModal` | URL表示（モバイル iframe） |
| `dataFolderModal` | data フォルダ一覧 |
| `stampsModal` | Trip Stamps |
| `animeModal` | 旅行アニメ |

### 7.3 レスポンシブ

- **ブレークポイント**: 768px（`isMobileView()`）
- **モバイル**: ヘッダー表示、コンパクトナビ、ピンチでパネル展開、URLはモーダル内 iframe
- **デスクトップ**: ヘッダー非表示、URLはポップアップ

---

## 8. ユーザーフロー

### 8.1 閲覧（ログイン不要）

1. アプリ起動
2. 公開トリップパネルからトリップを選択
3. 写真サムネイルクリックで拡大、地図マーカー表示
4. 「▶ 再生」「前へ」「次へ」でスライドショー

### 8.2 編集（ログイン必要）

1. メニュー → 「ログイン」で Google 認証
2. 写真アップロード（ドラッグ＆ドロップ or ファイル選択）
3. （任意）GPX アップロード
4. トリップ名・説明・URL 入力、「保存」
5. 「公開する」にチェックで公開トリップに

### 8.3 公開トリップのデプロイ

1. トリップを「公開する」で保存
2. 「📤 公開トリップをエクスポート」で `public-trips.json` 取得
3. `data/public-trips.json` に配置
4. main に push で GitHub Actions が自動デプロイ

---

## 9. デプロイ・運用

### 9.1 デプロイ先

- **Cloud Run**: https://airgo.ktrips.net
- **Firebase Hosting**: プロジェクト airgo-trip

### 9.2 必要な GitHub Secrets

| Secret | 用途 |
|--------|------|
| `GCP_PROJECT_ID` | Cloud Run デプロイ |
| `GCP_SA_KEY` | Cloud Run デプロイ |
| `FIREBASE_CONFIG_JS` | 本番用 firebase-config.js |
| `FIREBASE_SERVICE_ACCOUNT_AIRGO_TRIP` | Firebase Hosting デプロイ |

### 9.3 起動方法

```bash
# ローカル開発
python3 -m http.server 8080
# ブラウザで http://localhost:8080
```

---

## 10. 制限・注意事項

- **GPS情報**: スマートフォンで「位置情報をオン」にして撮影した写真を推奨
- **ファイル読み込み**: 一部ブラウザで `index.html` 直接開きに制限がある場合はローカルサーバーを推奨
- **API Key**: localStorage に平文保存。共有環境では使用しないこと
- **Firestore**: ネイティブモード・asia-northeast1 で作成すること

---

## 付録 A: 主要関数一覧

| 関数 | 用途 |
|------|------|
| `openDB()` | IndexedDB 接続 |
| `saveTripToDB(trip)` | トリップを IndexedDB に保存 |
| `loadTripsFromDB()` | IndexedDB から全トリップ取得 |
| `saveTripToFirestore(trip)` | Firestore に保存 |
| `loadTripsFromFirestore()` | Firestore から取得 |
| `getMergedTrips()` | IndexedDB + Firestore をマージ |
| `initMap()` | Leaflet 地図初期化 |
| `initMapSearch()` | 地名検索初期化 |
| `handleFiles(files)` | 写真アップロード処理 |
| `parseGpx(xml)` | GPX パース |
| `saveTrip(opts)` | トリップ保存（UI連携） |
| `loadTrip()` | トリップ読み込み |
| `loadTripAndShowPhoto(tripId, photoIndex)` | トリップ読み込み＋写真表示 |
| `exportPublicTrips()` | 公開トリップエクスポート |
| `generateTravelogueWithAI()` | AI 旅行記生成 |
| `renderTripListPanel()` | トリップ一覧パネル描画 |

---

## 付録 B: 用語集

| 用語 | 説明 |
|------|------|
| **トリップ** | 写真・GPX・メタデータのまとまり。1つの旅行・ルートに対応 |
| **公開トリップ** | ログインなしで閲覧可能なトリップ |
| **親トリップ** | 子トリップをまとめるフォルダ。写真・GPS不要 |
| **子トリップ** | 親に紐づくトリップ |
| **スタンプ** | 写真に付与するラベル（例: スタート、ゴール） |
| **旅行記** | AI または手動で生成するテキスト。PDF 出力可能 |
| **旅行アニメ** | 写真をアニメ風に変換した画像 |
