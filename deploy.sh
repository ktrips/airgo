#!/bin/bash
# Airgo を Google Cloud Run にデプロイするスクリプト
# 事前に gcloud auth login と gcloud config set project PROJECT_ID を実行してください

set -e

PROJECT_ID=${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}
REGION=${GCP_REGION:-asia-northeast1}
SERVICE_NAME=${SERVICE_NAME:-airgo}

if [ -z "$PROJECT_ID" ]; then
  echo "Error: GCP_PROJECT_ID を設定するか、gcloud config set project PROJECT_ID を実行してください"
  exit 1
fi

echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# 公開トリップの確認（data/public-trips.json または public-trips.json）
if [ -f "data/public-trips.json" ]; then
  TRIP_FILE="data/public-trips.json"
elif [ -f "public-trips.json" ]; then
  TRIP_FILE="public-trips.json"
else
  echo "エラー: public-trips.json がありません。"
  echo "  data/public-trips.json または public-trips.json を配置してください。"
  echo "  空のファイル: mkdir -p data && echo '[]' > data/public-trips.json"
  exit 1
fi
TRIP_SIZE=$(wc -c < "$TRIP_FILE")
echo "public-trips.json: $TRIP_SIZE bytes"
if [ "$(cat "$TRIP_FILE" | tr -d ' \n')" = "[]" ]; then
  echo "注意: public-trips.json が空です。公開トリップをエクスポートして配置してください。"
fi
if [ "$TRIP_SIZE" -gt 52428800 ]; then
  echo "注意: public-trips.json が 50MB を超えています。デプロイに時間がかかる場合があります。"
fi
if [ "$TRIP_SIZE" -gt 104857600 ]; then
  echo "警告: public-trips.json が 100MB を超えています。ブラウザで読み込めない可能性があります。"
  echo "  公開トリップの数を減らすか、写真を圧縮してください。"
fi
echo ""

# gcloud run deploy --source でビルド＆デプロイ（Dockerfile を使用、cloud-run-source-deploy リポジトリを自動作成）
echo "ビルド・デプロイを開始..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --quiet

echo ""
echo "デプロイ完了！"
echo "サービスURL: $(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')"
