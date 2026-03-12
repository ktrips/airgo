# Airgo - デプロイ手順

## 概要

main ブランチへの push で **GitHub Actions** が自動的にデプロイします。

- **Cloud Run**: https://airgo.ktrips.net
- **Firebase Hosting**: プロジェクト airgo-trip

詳細なセットアップは [.github/GITHUB_ACTIONS_SETUP.md](.github/GITHUB_ACTIONS_SETUP.md) を参照してください。

---

## 公開トリップのデプロイ

### 1. 準備

1. アプリでトリップを作成し、「公開する」にチェックして保存
2. メニュー「📤 公開トリップをエクスポート」で `public-trips.json` を取得
3. `data/public-trips.json` に配置（空の場合は `[]` が自動作成されます）

### 2. デプロイ

`data/public-trips.json` をコミットして main に push すると自動デプロイされます。

### 3. 閲覧

https://airgo.ktrips.net で誰でもログインなしで閲覧できます。

---

## 必要な GitHub Secrets

| Secret | 用途 |
|--------|------|
| `GCP_PROJECT_ID` | Cloud Run デプロイ |
| `GCP_SA_KEY` | Cloud Run デプロイ |
| `FIREBASE_CONFIG_JS` | Google ログイン（本番用） |
| `FIREBASE_SERVICE_ACCOUNT_AIRGO_TRIP` | Firebase Hosting デプロイ |

---

## ファイル構成

- `Dockerfile` - nginx で静的ファイルを配信
- `data/public-trips.json` - 公開トリップのデータ
- `nginx.conf.template` - nginx 設定
- `docker-entrypoint.sh` - 起動スクリプト
- `.github/workflows/deploy.yml` - Cloud Run デプロイ
- `.github/workflows/firebase-hosting-merge.yml` - Firebase Hosting デプロイ
