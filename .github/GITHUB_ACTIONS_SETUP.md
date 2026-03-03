# GitHub Actions セットアップ手順

main ブランチへの push で自動的に GCP Cloud Run にデプロイされ、https://airgo.ktrips.net で公開されます。

## 前提条件

- GCP プロジェクトが作成済み
- ktrips.net ドメインの管理権限（airgo.ktrips.net の DNS 設定用）

---

## 1. GCP の準備

### 1.1 必要な API の有効化

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iam.googleapis.com
```

### 1.2 認証方法の選択

**方法A: サービスアカウントキー（簡単・推奨で開始）**

```bash
# サービスアカウント作成
gcloud iam service-accounts create github-actions-airgo \
  --display-name="GitHub Actions Airgo Deploy"

# 必要な権限を付与
PROJECT_ID=$(gcloud config get-value project)
SA_EMAIL="github-actions-airgo@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudbuild.builds.builder"

# キーを生成（JSON をダウンロード）
gcloud iam service-accounts keys create ~/github-actions-key.json \
  --iam-account=$SA_EMAIL
```

**方法B: Workload Identity Federation（セキュア・キー不要）**

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
POOL_NAME="github-pool"
PROVIDER_NAME="github-provider"

# プールとプロバイダー作成
gcloud iam workload-identity-pools create $POOL_NAME \
  --location="global" \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc $PROVIDER_NAME \
  --location="global" \
  --workload-identity-pool=$POOL_NAME \
  --display-name="GitHub" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# サービスアカウント作成と権限付与
gcloud iam service-accounts create github-actions-airgo \
  --display-name="GitHub Actions Airgo Deploy"

SA_EMAIL="github-actions-airgo@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudbuild.builds.builder"

# GitHub リポジトリをサービスアカウントにバインド
gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/ktrips/airgo"
```

---

## 2. GitHub Secrets の設定

リポジトリの **Settings → Secrets and variables → Actions** で以下を追加：

| Secret 名 | 説明 | 必須 |
|-----------|------|------|
| `GCP_PROJECT_ID` | GCP プロジェクト ID | ✅ 常に |
| `GCP_SA_KEY` | サービスアカウントキー JSON（方法A の場合） | 方法A で必須 |
| `WIF_PROVIDER` | Workload Identity プロバイダー（方法B の場合） | 方法B で必須 |
| `WIF_SERVICE_ACCOUNT` | サービスアカウントメール（方法B の場合） | 方法B で必須 |

### WIF_PROVIDER の値

```
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
```

`PROJECT_NUMBER` は `gcloud projects describe PROJECT_ID --format='value(projectNumber)'` で確認。

### GCP_SA_KEY の値

方法A で生成した JSON ファイルの内容を **1行に圧縮**して貼り付け（改行を削除）。

---

## 3. カスタムドメイン airgo.ktrips.net の設定

### 3.1 初回デプロイ後

1. GitHub Actions でデプロイが成功したら、GCP Console の **Cloud Run → ドメインマッピング** を確認
2. `airgo.ktrips.net` がマッピングされていれば、DNS の指示が表示される

### 3.2 DNS 設定

ktrips.net の DNS 管理画面で、Cloud Run が表示する CNAME レコードを追加：

| タイプ | 名前 | 値 |
|--------|------|-----|
| CNAME | airgo | （Cloud Run のドメインマッピング画面に表示される値） |

※ GCP Console → Cloud Run → ドメインマッピング で `airgo.ktrips.net` を追加すると、追加すべき DNS レコードの **正確な値** が表示されます。

### 3.3 ドメイン検証

- ktrips.net がすでに Google Search Console などで検証済みの場合は、自動で認識される場合があります
- 未検証の場合は、GCP Console の **ドメイン検証** で手順に従って検証

---

## 4. 動作確認

1. `main` ブランチに push
2. GitHub の **Actions** タブでワークフローが実行されることを確認
3. 成功後、https://airgo.ktrips.net にアクセス（DNS 反映まで数分〜最大48時間かかる場合あり）

---

## トラブルシューティング

### デプロイが失敗する

- **権限エラー**: サービスアカウントに `roles/run.admin`, `roles/artifactregistry.admin`, `roles/cloudbuild.builds.builder` が付与されているか確認
- **Cloud Build 権限エラー**: [DEPLOY.md](../DEPLOY.md) の「デプロイ失敗時の権限設定」を参照し、Compute Engine デフォルトサービスアカウントに権限を付与
- **public-trips.json がない**: リポジトリに `public-trips.json` が含まれているか確認（空の `[]` でも可）

### カスタムドメインが表示されない

- DNS の設定が正しいか確認（CNAME の向き先）
- ドメイン検証が完了しているか確認
- 反映には最大48時間かかることがあります
