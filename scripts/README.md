# IndexedDB → Firestore データ移行（CLI）

2 段階のスクリプトで移行できます。

1. **export-from-indexeddb.js** … ローカル IndexedDB から JSON を gzip 圧縮してダウンロード
2. **migrate-to-firestore.js** … ダウンロードした JSON（.json または .json.gz）を Firestore にアップロード

## エラー5が出る場合

1. **診断**: http://localhost:8080/scripts/firestore-check.html を開いて接続を確認
2. **データベース作成**: [Firebase Console](https://console.firebase.google.com/project/airgo-trip/firestore) → 「データベースを作成」→ **ネイティブモード**・asia-northeast1
3. **ルールデプロイ**: `firebase deploy --only firestore:rules`

### 「Missing or insufficient permissions」が出る場合

1. **ルールをデプロイ**: `firebase deploy --only firestore:rules`
2. **ログイン**: アプリで「Google でログイン」してから同期を実行

## 手順

### 1. IndexedDB から JSON をダウンロード

**前提**: Airgo アプリを起動し、ブラウザで使用して IndexedDB にデータがあること

```bash
# ターミナル1: アプリを起動
python3 -m http.server 8080

# ターミナル2: エクスポート実行（ブラウザが開くので「エクスポート」をクリック）
node scripts/export-from-indexeddb.js
```

`--app-url` と `--output` で指定可能:

```bash
node scripts/export-from-indexeddb.js --app-url http://localhost:8080 --output my_export.json.gz
```

### 2. Firebase UID の取得

- アプリで Google ログイン後、ブラウザの開発者ツール（F12）→ Console で実行:
  ```javascript
  firebase.auth().currentUser.uid
  ```
- 表示された UID をコピー

### 3. サービスアカウントの準備

Firebase Console → プロジェクト設定 → サービスアカウント → 「新しい秘密鍵の生成」で JSON をダウンロード

### 4. Firestore にアップロード

```bash
npm install   # 初回のみ（firebase-admin）

GOOGLE_APPLICATION_CREDENTIALS=./path/to/serviceAccount.json \
  node scripts/migrate-to-firestore.js airgo_export_for_migrate.json.gz --uid YOUR_FIREBASE_UID
```

または `--credentials` で指定:

```bash
node scripts/migrate-to-firestore.js airgo_export_for_migrate.json.gz \
  --uid YOUR_FIREBASE_UID \
  --credentials ./path/to/serviceAccount.json
```

### 5. ドライラン（実際には書き込まない）

```bash
node scripts/migrate-to-firestore.js airgo_export_for_migrate.json.gz --uid YOUR_UID --dry-run
```

## 別の方法: Firestore からエクスポート

すでに Firestore に同期済みの場合は、ブラウザ不要で CLI のみでエクスポートできます（gzip 圧縮）:

```bash
node scripts/export-from-firestore.js --uid YOUR_FIREBASE_UID --output airgo_export_for_migrate.json.gz
```

## 含まれるデータ

- トリップ基本情報（写真・GPS・説明など）
- 旅行記（travelogueHtml）
- 旅行アニメ（animeList）
- スタンプ写真（stampPhotos）
