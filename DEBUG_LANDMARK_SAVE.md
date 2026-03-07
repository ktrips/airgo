# ランドマーク保存の調査レポート

## 保存フロー概要

```
[ユーザー操作] 写真サムネイルの✎クリック → openPhotoEditModal(i)
                    ↓
[モーダル表示] _photoEditTripId = currentTripId, _photoEditIndex = i
                    ↓
[ユーザー入力] ランドマーク番号・名を入力 → 保存ボタンクリック
                    ↓
[savePhotoEdit] 1. 入力値を取得 (toLandmarkValue)
                2. photos[i] を更新（表示中トリップの場合）
                3. currentTripId === _photoEditTripId → saveTrip()
                4. 失敗時 → savePhotoMetadataToDB()
```

## 想定される問題点

### 1. currentTripId が null の場合
- **公開トリップ**を表示中: `loadTripAndShowPhoto` で `currentTripId = null` に設定
- この状態で編集すると `_photoEditTripId = null` → 保存不可
- **新規トリップ**（未保存）: `currentTripId` が未設定

### 2. saveTrip() の早期 return
- トリップ名が空 → `return false`
- photos が空 → `return false`
- `!currentTripId && !isNewTrip` → `return false`

### 3. storedPhotos の構築失敗
- 各 photo に `p.data` または `p.file` が必要
- DB から読み込んだ写真は `p.data` を持つ
- 新規アップロードは `p.file` を持つ（resize で data に変換）

### 4. IndexedDB の構造
- 保存形式: `{ name, lat, lng, placeName, landmarkNo, landmarkName, description, url, data, mime }`
- メモリ形式: `photoUrl` (DB の `url` に相当)

### 5. トリップ一覧からの編集
- `openPhotoEditModalFromTrip(tripId, photoIndex)` 使用
- `currentTripId !== _photoEditTripId` のため saveTrip はスキップ
- `savePhotoMetadataToDB` が呼ばれる
- `loadTripFromDB(tripId)` でトリップ取得が必要

## デバッグ方法

1. ブラウザの開発者ツール (F12) → Console タブを開く
2. 写真詳細でランドマークを入力し、保存を試す
3. `[Landmark Save]` で始まるログを確認:
   - `savePhotoEdit start` - 保存開始時の状態
   - `trying saveTrip()` - saveTrip を試行
   - `saveTrip result: true/false` - saveTrip の結果
   - `trying savePhotoMetadataToDB()` - フォールバック試行
   - `OK: savePhotoMetadataToDB completed` - 直接保存成功
   - `FAIL:` - 失敗原因
   - `保存確認:` - 保存後の検証結果

## よくある失敗原因

| 原因 | 対処 |
|------|------|
| トリップが読み込まれていない | メニューからトリップを選択し「読み込み」をクリック |
| トリップ名が空 | メニューのトリップ名を入力 |
| 公開トリップを編集 | 公開トリップは保存不可。ローカルトリップを編集 |
| 新規トリップ（未保存） | 先に「保存」でトリップを保存してから編集 |
