# Airgo - Google Cloud Run デプロイ手順

## 公開トリップを airgo.ktrips.net にデプロイし、表示するための準備と方法

### 全体の流れ

| 段階 | 内容 |
|------|------|
| **準備** | アプリでトリップを作成・公開設定し、エクスポート |
| **デプロイ** | `public-trips.json` を airgo フォルダに置き、Cloud Run にデプロイ |
| **表示** | https://airgo.ktrips.net で誰でもログインなしで閲覧 |

### 準備（トリップの作成とエクスポート）

1. **Airgo アプリでトリップを作成**
   - 写真をアップロード（GPS 付き推奨）
   - 必要に応じて GPX を読み込み
   - トリップ名・説明を入力

2. **公開設定**
   - トリップ保存時に「公開する（ログインなしで閲覧可能）」にチェック
   - ログインした状態で操作

3. **エクスポート**
   - メニュー（≡）→「📤 公開トリップをエクスポート」をクリック
   - `public-trips.json` がダウンロードされる（GPS・写真データを含む）

### デプロイ方法

1. **ファイル配置**
   - ダウンロードした `public-trips.json` を `airgo` フォルダに配置
   - 既存の `[]` を上書き

2. **デプロイ実行**
   ```bash
   cd airgo
   export GCP_PROJECT_ID=your-project-id  # 初回のみ
   ./deploy.sh
   ```

3. **カスタムドメイン**
   - Cloud Run の URL を `airgo.ktrips.net` にマッピング（Cloud Run のドメインマッピングで設定）

### 表示方法（閲覧者向け）

1. https://airgo.ktrips.net にアクセス
2. 右側の「公開トリップ」パネルからトリップを選択
3. 地図・サムネイル・再生・前へ/次へで閲覧（ログイン不要）

---

## 前提条件

- Google Cloud アカウント
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) のインストール

## 必要な API の有効化

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

## デプロイ失敗時の権限設定

デプロイに失敗する場合、Compute Engine デフォルトサービスアカウントに Cloud Run Builder ロールを付与してください：

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Cloud Run ビルド・デプロイ用の権限（Google 推奨）
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

権限の反映には数分かかることがあります。

## デプロイ方法

### 方法 1: deploy.sh を使用（推奨）

```bash
cd airgo

# プロジェクトを設定
export GCP_PROJECT_ID=your-project-id

# デプロイ実行
chmod +x deploy.sh
./deploy.sh
```

### 方法 2: gcloud で直接デプロイ

```bash
cd airgo

gcloud run deploy airgo \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated
```

### 方法 3: ローカルでビルドしてデプロイ

```bash
cd airgo

# イメージをビルド
docker build -t asia-northeast1-docker.pkg.dev/PROJECT_ID/cloud-run-source-deploy/airgo:latest .

# Artifact Registry に認証
gcloud auth configure-docker asia-northeast1-docker.pkg.dev

# イメージをプッシュ
docker push asia-northeast1-docker.pkg.dev/PROJECT_ID/cloud-run-source-deploy/airgo:latest

# Cloud Run にデプロイ
gcloud run deploy airgo \
  --image asia-northeast1-docker.pkg.dev/PROJECT_ID/cloud-run-source-deploy/airgo:latest \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated
```

## 認証設定

デプロイ時に `--allow-unauthenticated` と `allUsers` への Invoker ロール付与が自動で行われます。誰でも airgo.ktrips.net にアクセスできます。

## 環境変数

| 変数 | 説明 | デフォルト |
|------|------|------------|
| GCP_PROJECT_ID | GCP プロジェクト ID | gcloud の現在のプロジェクト |
| GCP_REGION | デプロイ先リージョン | asia-northeast1 |
| SERVICE_NAME | Cloud Run サービス名 | airgo |
| REPOSITORY | （--source 使用時は cloud-run-source-deploy が自動作成） | - |

## 公開トリップのデプロイ（詳細）

上記「準備と方法」の詳細版。GPS・写真を含む公開トリップをウェブでログインなし表示する手順：

1. **アプリでトリップを公開設定** → 保存時に「公開する」にチェック
2. **エクスポート** → メニュー「📤 公開トリップをエクスポート」で `public-trips.json` をダウンロード
3. **配置** → `public-trips.json` を `airgo` フォルダに置く
4. **デプロイ** → `./deploy.sh` を実行

## 閲覧方法（詳細）

https://airgo.ktrips.net にアクセス後：

- **トリップ選択** — 右側「公開トリップ」パネルからカードをクリック
- **地図** — トリップ全体の範囲で表示
- **サムネイル** — 下部に全写真を表示。クリックで拡大・地図マーカー表示
- **操作** — 「全ての写真」「▶ 再生」「前へ」「次へ」で閲覧
- **ログイン不要** — 誰でも閲覧可能

## 公開トリップが表示されない場合の確認

1. **public-trips.json の配置**
   - `airgo` フォルダ直下に `public-trips.json` があるか確認
   - デプロイ実行時に `public-trips.json: XXX bytes` と表示される

2. **ファイル形式**
   - 配列 `[{...}, {...}]` または `{"trips": [...]}` 形式であること
   - 各トリップに `id`, `name`, `photos` が含まれること

3. **デプロイ後の確認**
   - ブラウザで https://airgo.ktrips.net/public-trips.json に直接アクセス
   - JSON が表示されればデプロイは成功。表示されない場合は再デプロイ

4. **キャッシュ**
   - ブラウザのキャッシュをクリアするか、シークレットモードで試す

## GitHub Actions でのデプロイ

main ブランチに push すると、GitHub Actions で自動的に airgo.ktrips.net にデプロイされます。Yonda のデプロイ構成を参考にしています。

- **ワークフロー**: `.github/workflows/deploy.yml`
- **セットアップ**: [.github/GITHUB_ACTIONS_SETUP.md](.github/GITHUB_ACTIONS_SETUP.md) を参照
- **必要な Secrets**: `GCP_PROJECT_ID`, `GCP_SA_KEY`

## ファイル構成

- `Dockerfile` - nginx で静的ファイルを配信
- `public-trips.json` - 公開トリップのデータ（エクスポートで生成）
- `nginx.conf.template` - nginx 設定テンプレート（PORT 環境変数対応）
- `docker-entrypoint.sh` - 起動時に PORT を設定
- `cloudbuild.yaml` - Cloud Build のビルド設定（手動デプロイ用）
- `deploy.sh` - ローカルからのデプロイ用シェルスクリプト
- `.github/workflows/deploy.yml` - GitHub Actions デプロイワークフロー
- `.dockerignore` - Docker ビルド時の除外ファイル
