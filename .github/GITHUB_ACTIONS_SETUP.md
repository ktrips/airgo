# GitHub Actions セットアップ手順（Airgo）

main ブランチへの push で自動的に GCP Cloud Run にデプロイされ、https://airgo.ktrips.net で公開されます。

Yonda のデプロイ構成を参考にしています。

## 前提条件

- GCP プロジェクトが作成済み
- ktrips.net ドメインの管理権限（airgo.ktrips.net の DNS 設定用）

---

## 1. GCP サービスアカウントの作成

```bash
export PROJECT_ID="your-gcp-project-id"
gcloud config set project $PROJECT_ID

# サービスアカウント作成
gcloud iam service-accounts create github-actions-airgo \
  --display-name="GitHub Actions for Airgo"

# 必要な権限を付与
for role in "roles/run.admin" "roles/artifactregistry.admin" "roles/cloudbuild.builds.builder" \
  "roles/iam.serviceAccountUser" "roles/serviceusage.serviceUsageAdmin"; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:github-actions-airgo@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$role" --quiet
done
```

## 2. サービスアカウントキーのダウンロード

```bash
gcloud iam service-accounts keys create ~/sa-key-airgo.json \
  --iam-account=github-actions-airgo@${PROJECT_ID}.iam.gserviceaccount.com
```

`~/sa-key-airgo.json` にキーファイルが作成されます。`cat ~/sa-key-airgo.json` で表示された JSON の全文（`{` から `}` まで）をコピーしてください。登録後はローカルのキーファイルを削除して構いません。

## 3. GitHub Secrets の登録

GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret 名 | 値 | 必須 |
|-----------|-----|------|
| `GCP_PROJECT_ID` | GCP プロジェクト ID（例: `my-project-123`） | ✅ |
| `GCP_SA_KEY` | Step 2 で作成した JSON ファイルの**全文**をコピー&ペースト | ✅ |
| `FIREBASE_CONFIG_JS` | `firebase-config.js` の**全文**（Google ログイン用） | 推奨 |

## 4. 初回実行

1. **方法A**: `main` ブランチに push する（自動でデプロイが開始）
2. **方法B**: **Actions** タブ → **Deploy Airgo to Cloud Run** → **Run workflow** で手動実行

## 5. public-trips.json について

- リポジトリに `data/public-trips.json` が含まれている場合、その内容がデプロイされます
- 含まれていない場合、空の `[]` が自動作成されます（公開トリップなしの状態）
- 公開トリップを表示するには、アプリでエクスポートした `public-trips.json` を `data/public-trips.json` に配置してコミットしてください

## 6. カスタムドメイン airgo.ktrips.net の設定

### 初回デプロイ後

1. GitHub Actions でデプロイが成功したら、GCP Console の **Cloud Run → ドメインマッピング** を確認
2. `airgo.ktrips.net` がマッピングされていれば、DNS の指示が表示される

### DNS 設定

ktrips.net の DNS 管理画面で、Cloud Run が表示する CNAME レコードを追加：

```bash
# マッピング情報を確認
gcloud run domain-mappings describe \
  --domain=airgo.ktrips.net \
  --region=asia-northeast1
```

SSL 証明書は Google が自動でプロビジョニングします（DNS 設定後、最大15分程度）。

---

## セットアップチェックリスト

- [ ] ワークフローが `.github/workflows/deploy.yml` に配置されている
- [ ] `GCP_PROJECT_ID` を GitHub Secrets に登録
- [ ] `GCP_SA_KEY` を GitHub Secrets に登録
- [ ] サービスアカウントに必要なロールを付与

## よくあるエラーと対処

| エラー | 原因 | 対処 |
|--------|------|------|
| ワークフローが実行されない | ワークフローがサブディレクトリにある | リポジトリルートの `.github/workflows/` に配置 |
| `Permission denied` / `403` | サービスアカウントの権限不足 | Step 1 の権限付与を再確認 |
| `GCP_SA_KEY` invalid | JSON の形式が不正 | キー全体をコピー（`{` から `}` まで） |
| Cloud Build 失敗 | Dockerfile のビルドエラー | ローカルで `docker build .` を試して動作確認 |
| イメージが push できない | Artifact Registry の権限 | `roles/artifactregistry.admin` が必要 |

## トリガー

- **push**: `main` ブランチに変更があるとデプロイ
- **workflow_dispatch**: 手動実行

---

## Firebase Hosting デプロイ（firebase-hosting-merge.yml）

`main` ブランチへの push で Firebase Hosting（プロジェクト: airgo-trip）にも自動デプロイされます。

### 必要な Secret

| Secret 名 | 値 |
|-----------|-----|
| `FIREBASE_SERVICE_ACCOUNT_AIRGO_TRIP` | Firebase プロジェクトのサービスアカウント JSON の全文 |

### サービスアカウントの取得

1. [Firebase Console](https://console.firebase.google.com/) → プロジェクト **airgo-trip** を選択
2. **プロジェクトの設定**（歯車アイコン）→ **サービス アカウント**
3. **新しい秘密鍵の生成** をクリックして JSON をダウンロード
4. ダウンロードした JSON の全文を `FIREBASE_SERVICE_ACCOUNT_AIRGO_TRIP` として GitHub Secrets に登録

---

## Google ログインが開かない場合の対処

ウェブ（airgo.ktrips.net や air.ktrips.net）で「Googleでログイン」を押してもポップアップが開かない、またはすぐ閉じる場合は以下を確認してください。

### 1. FIREBASE_CONFIG_JS の登録

GitHub Secrets に `FIREBASE_CONFIG_JS` を登録し、ローカルの `firebase-config.js` の**全文**をそのままコピー&ペーストしてください。

### 2. Firebase の認証許可ドメイン

[Firebase Console](https://console.firebase.google.com/) → プロジェクト **airgo-trip** → **Authentication** → **Settings** → **Authorized domains**

以下を追加します（未登録の場合）:

- `airgo.ktrips.net`
- `air.ktrips.net`
- `localhost`（ローカル開発用）

### 3. Google Cloud OAuth 2.0 の設定

[Google Cloud Console](https://console.cloud.google.com/) → **API とサービス** → **認証情報** → OAuth 2.0 クライアント ID（Web アプリケーション）を編集

**承認済みの JavaScript 生成元** に以下を追加:

- `https://airgo.ktrips.net`
- `https://air.ktrips.net`

---

## Firestore アップロードでエラー(5)が出る場合

「IndexedDB → Firestore にアップロード」でエラーコード 5 が出る場合、Firestore データベースが未作成または設定が誤っている可能性があります。

### 対処手順

1. [Firebase Console](https://console.firebase.google.com/) → プロジェクト **airgo-trip** → **Firestore Database**
2. **「データベースを作成」** をクリック
3. **重要**: **Cloud Firestore（ネイティブモード）** を選択（Datastore モードではない）
4. ロケーション: **asia-northeast1 (Tokyo)** を選択
5. セキュリティルール: 本番モードで開始
6. 作成後、`firebase deploy --only firestore:rules` でルールをデプロイ

---

## 「Missing or insufficient permissions」が出る場合

Firestore のセキュリティルールがデプロイされていないか、ログインしていない可能性があります。

### 対処手順

1. **ルールをデプロイ**（必須）:
   ```bash
   firebase deploy --only firestore:rules
   ```
   プロジェクトルートで実行し、`firestore.rules` の内容が Firebase に反映されます。

2. **ログイン確認**: アプリで「Google でログイン」してから「IndexedDB → Firestore に同期」を実行してください。

3. **ルールの確認**: [Firebase Console](https://console.firebase.google.com/project/airgo-trip/firestore/rules) → Firestore → ルール で、`trips` コレクションに `request.auth != null` のルールが反映されているか確認
