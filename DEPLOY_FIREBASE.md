# Airgo を Firebase Hosting にデプロイ

## 概要

Airgo を Firebase Hosting にデプロイし、https://airgo.ktrips.net で公開します。

## 前提条件

- [Firebase CLI](https://firebase.google.com/docs/cli) のインストール
- Firebase プロジェクト: `airgo-trip`

## デプロイ手順

### 1. 初回セットアップ

```bash
# Firebase にログイン
firebase login

# プロジェクトを確認（.firebaserc で airgo-trip が設定済み）
firebase use
```

### 2. firebase-config.js の準備

```bash
cp firebase-config.example.js firebase-config.js
# firebase-config.js を編集し、Firebase Console の値を入力
```

### 3. デプロイ実行

```bash
./deploy-firebase.sh
```

または直接:

```bash
firebase deploy --only hosting,firestore:rules
```

### 4. カスタムドメイン（airgo.ktrips.net）の設定

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクト `airgo-trip` を開く
2. **Hosting** → **カスタムドメインを追加**
3. `airgo.ktrips.net` を入力
4. 表示される DNS の指示に従って、ドメインの DNS 設定を追加:
   - **A レコード**: Firebase が指定する IP アドレス
   - または **CNAME レコード**: `airgo.ktrips.net` → `airgo-trip.web.app`
5. 証明書のプロビジョニング完了（数分〜数時間）を待つ

## デプロイされるファイル

- `index.html`, `app.js`, `style.css`
- `firebase-config.js`, `firebase-init.js`
- `firestore.rules`
- `data/public-trips.json`
- その他の静的アセット

## 注意事項

- `firebase-config.js` は `.gitignore` に含まれているため、GitHub にコミットされません。ローカルでデプロイする場合は、デプロイ前に必ず配置してください。
- CI/CD でデプロイする場合は、GitHub Secrets で `firebase-config.js` の内容を管理し、デプロイ時に生成する必要があります。
