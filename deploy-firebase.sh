#!/bin/bash
# Airgo を Firebase Hosting にデプロイするスクリプト
# デプロイ先: https://airgo.ktrips.net（カスタムドメイン設定後）
#
# 事前準備:
#   1. firebase login
#   2. firebase-config.js を配置（firebase-config.example.js をコピーして編集）
#   3. airgo.ktrips.net を Firebase Console の Hosting > カスタムドメイン に追加
#
# 使用方法:
#   ./deploy-firebase.sh

set -e

echo "Firebase Hosting へデプロイします..."
echo ""

# 公開トリップの確認
if [ -f "data/public-trips.json" ]; then
  TRIP_FILE="data/public-trips.json"
elif [ -f "public-trips.json" ]; then
  TRIP_FILE="public-trips.json"
else
  echo "注意: data/public-trips.json がありません。"
  echo "  空のファイルを作成します: mkdir -p data && echo '[]' > data/public-trips.json"
  mkdir -p data
  echo '[]' > data/public-trips.json
fi
TRIP_SIZE=$(wc -c < "$TRIP_FILE")
echo "public-trips.json: $TRIP_SIZE bytes"
if [ "$(cat "$TRIP_FILE" | tr -d ' \n')" = "[]" ]; then
  echo "注意: public-trips.json が空です。公開トリップをエクスポートして配置してください。"
fi
echo ""

# firebase-config.js の確認
if [ ! -f "firebase-config.js" ]; then
  echo "警告: firebase-config.js がありません。"
  echo "  cp firebase-config.example.js firebase-config.js で作成し、Firebase Console の値を入力してください。"
  echo "  続行しますか？ (y/N)"
  read -r ans
  if [ "$ans" != "y" ] && [ "$ans" != "Y" ]; then
    exit 1
  fi
fi

# Hosting と Firestore ルールをデプロイ
echo "firebase deploy を実行..."
firebase deploy --only hosting,firestore:rules

echo ""
echo "デプロイ完了！"
echo "  Hosting URL: https://airgo-trip.web.app"
echo "  カスタムドメイン: https://airgo.ktrips.net （Firebase Console で設定済みの場合）"
echo ""
echo "カスタムドメインの設定:"
echo "Firebase Console > Hosting > カスタムドメイン で airgo.ktrips.net を追加してください。"
echo "DNS に CNAME レコードを追加: airgo.ktrips.net -> airgo-trip.web.app"
