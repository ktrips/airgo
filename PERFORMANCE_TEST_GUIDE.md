# AirGo パフォーマンステストガイド

## テスト環境の起動

```bash
cd /Users/kenichi.yoshida/Git/airgo
python3 -m http.server 8080
```

ブラウザで http://localhost:8080 を開く

---

## Chrome DevTools でのパフォーマンス測定

### 1. コンソールでの自動測定

アプリには自動的にパフォーマンス測定が組み込まれています。
Chrome DevTools の Console タブを開くと、以下のような測定結果が表示されます：

```
⏱️ loadTripAndShowPhoto: 245.30ms
⏱️ renderAllPhotosStrip: 18.50ms
⏱️ addPhotoMarkers: 32.10ms
⏱️ renderPublicTripsPanel: 156.20ms
```

### 2. 手動測定（DevTools Console で実行）

```javascript
// 関数の実行時間を測定
perfStart('myTest');
// ... 何か処理 ...
perfEnd('myTest');

// 例：トリップ一覧の再レンダリング時間を測定
perfStart('renderTest');
renderPublicTripsPanel();
perfEnd('renderTest');
```

### 3. Performance タブでの詳細分析

1. **Performance タブを開く**
2. **⚫ 録画ボタンをクリック**
3. **トリップを選択して表示**（100枚以上の写真があるトリップで測定）
4. **⏹ 停止ボタンをクリック**

#### 確認する指標

| 指標 | 説明 | 目標値 |
|------|------|--------|
| **FCP** (First Contentful Paint) | 最初のコンテンツ表示 | < 1秒 |
| **LCP** (Largest Contentful Paint) | 最大コンテンツ表示 | < 2秒 |
| **TBT** (Total Blocking Time) | メインスレッドブロック時間 | < 300ms |
| **CLS** (Cumulative Layout Shift) | レイアウトシフト | < 0.1 |

### 4. Memory タブでメモリ使用量の確認

1. **Memory タブを開く**
2. **Heap snapshot を選択**
3. **Take snapshot をクリック**

#### 確認項目

- **Shallow Size**: オブジェクトの直接的なサイズ
- **Retained Size**: オブジェクトと参照先の合計サイズ
- **Blob URLの数**: `_blobUrlCache` のサイズ（150個以下に制限）

### 5. Network タブで画像読み込みの確認

1. **Network タブを開く**
2. **Img フィルターを選択**
3. **トリップを読み込む**

#### 確認項目

- 最初の20枚の画像がすぐに読み込まれるか
- それ以降の画像は遅延読み込みされているか（スクロール時に読み込み）

---

## ベンチマークテスト

### テストケース1: 小規模トリップ（10-20枚）

```javascript
// 期待される結果
⏱️ loadTripAndShowPhoto: < 200ms
⏱️ renderAllPhotosStrip: < 20ms
⏱️ addPhotoMarkers: < 30ms
```

### テストケース2: 中規模トリップ（50-100枚）

```javascript
// 期待される結果
⏱️ loadTripAndShowPhoto: < 400ms
⏱️ renderAllPhotosStrip: < 50ms
⏱️ addPhotoMarkers: < 80ms
```

### テストケース3: 大規模トリップ（200枚以上）

```javascript
// 期待される結果（遅延読み込みの効果が大きい）
⏱️ loadTripAndShowPhoto: < 800ms
⏱️ renderAllPhotosStrip: < 100ms（初回20枚のみ）
⏱️ addPhotoMarkers: < 150ms
```

---

## 改善前後の比較

### 測定手順

1. **改善前のコミットに戻す**
   ```bash
   git stash
   git checkout HEAD~1
   ```

2. **Performance タブで録画**
   - トリップを選択して表示
   - 結果をスクリーンショット

3. **改善後のコミットに戻す**
   ```bash
   git checkout -
   git stash pop
   ```

4. **同じトリップで再度測定**

5. **結果を比較**

### 比較項目

| 項目 | 改善前 | 改善後 | 削減率 |
|------|--------|--------|--------|
| 初回表示時間 | ___ms | ___ms | __% |
| サムネイル生成 | ___ms | ___ms | __% |
| マーカー追加 | ___ms | ___ms | __% |
| メモリ使用量 | ___MB | ___MB | __% |

---

## トラブルシューティング

### パフォーマンスが改善されない場合

1. **キャッシュをクリア**
   ```
   Chrome DevTools > Application > Clear storage
   ```

2. **ハードリロード**
   ```
   Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)
   ```

3. **コンソールでキャッシュ状態を確認**
   ```javascript
   console.log('Blob URL cache size:', _blobUrlCache.size);
   console.log('Merged trips cache:', _mergedTripsCache ? 'active' : 'empty');
   ```

### メモリリークの確認

1. **Memory タブ > Allocation timeline**
2. **トリップを何度も切り替える**
3. **メモリが増え続けないか確認**

期待される動作：
- Blob URLは最大150個に制限される
- 古いトリップの画像は自動的に解放される

---

## 最適化のヒント

### さらに高速化したい場合

1. **サムネイル専用画像の実装**
   - 定数は既に定義済み: `THUMB_MAX_DIMENSION = 400`
   - 写真アップロード時にサムネイルを生成
   - 予想される改善: 70-90%のストレージ削減

2. **仮想スクロールの実装**
   - 100枚以上の写真で大きな効果
   - 表示範囲内のDOMのみレンダリング

3. **Web Worker での画像処理**
   - リサイズ・圧縮をバックグラウンドで実行
   - UIのブロッキングを完全に回避

---

## テスト結果の記録

### 日付: ____年__月__日

#### テスト環境
- ブラウザ: Chrome __.__.__
- OS: macOS / Windows
- マシン: __________

#### 測定結果

**小規模トリップ（10枚）:**
- loadTripAndShowPhoto: ___ms
- renderAllPhotosStrip: ___ms
- addPhotoMarkers: ___ms

**中規模トリップ（50枚）:**
- loadTripAndShowPhoto: ___ms
- renderAllPhotosStrip: ___ms
- addPhotoMarkers: ___ms

**大規模トリップ（200枚）:**
- loadTripAndShowPhoto: ___ms
- renderAllPhotosStrip: ___ms
- addPhotoMarkers: ___ms

#### 総評
- [ ] 目標値を達成
- [ ] さらなる改善が必要
- [ ] 問題なし

#### コメント
_____________________________________
_____________________________________
