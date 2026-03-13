#!/usr/bin/env node
/**
 * public-trips.json を個別ファイルに分割するスクリプト
 *
 * 使い方:
 *   node scripts/split-trips.js
 *
 * 処理内容:
 *   1. data/public-trips.json (58MB) を読み込み
 *   2. 各トリップを個別ファイル data/trips/trip-{id}.json に保存
 *   3. メタデータのみの index.json を生成（軽量・高速読み込み用）
 */

const fs = require('fs');
const path = require('path');

// 設定
const INPUT_FILE = path.join(__dirname, '../data/public-trips.json');
const OUTPUT_DIR = path.join(__dirname, '../data/trips');
const INDEX_FILE = path.join(OUTPUT_DIR, 'index.json');

// メインファイルのバックアップ
const BACKUP_FILE = path.join(__dirname, '../data/public-trips.json.backup');

/**
 * トリップから軽量なメタデータのみ抽出
 */
function extractMetadata(trip) {
  const photoCount = (trip.photos || []).length;
  const firstPhoto = trip.photos?.[0];
  const lastPhoto = trip.photos?.[photoCount - 1];

  return {
    id: trip.id,
    name: trip.name || '無題',
    description: trip.description || '',
    url: trip.url || '',
    public: trip.public,
    photoCount,
    updatedAt: trip.updatedAt || Date.now(),

    // サムネイル（最初の写真）
    thumbnail: firstPhoto?.url ? {
      url: firstPhoto.url,
      lat: firstPhoto.lat,
      lng: firstPhoto.lng,
      placeName: firstPhoto.placeName
    } : null,

    // ルート情報
    hasGpx: !!trip.gpxData,
    color: trip.color || '#e1306c',

    // 統計情報
    stats: {
      distance: 0, // 後で計算
      duration: 0,
      dateRange: null
    }
  };
}

/**
 * 写真データを最適化（Base64を除去してURLのみ）
 */
function optimizePhotos(photos) {
  if (!Array.isArray(photos)) return [];

  return photos.map(photo => {
    const optimized = { ...photo };

    // Base64データは除去（大容量の原因）
    if (optimized.data && optimized.data.startsWith('data:')) {
      delete optimized.data;
    }

    // 必要な情報のみ残す
    return {
      url: optimized.url,
      lat: optimized.lat,
      lng: optimized.lng,
      name: optimized.name,
      placeName: optimized.placeName,
      date: optimized.date,
      description: optimized.description,
      landmarkNo: optimized.landmarkNo,
      landmarkName: optimized.landmarkName,
      gpxData: optimized.gpxData
    };
  });
}

/**
 * メイン処理
 */
async function main() {
  console.log('🚀 AirGo Trip Splitter');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. 入力ファイルの確認
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ エラー: ${INPUT_FILE} が見つかりません`);
    process.exit(1);
  }

  const inputStats = fs.statSync(INPUT_FILE);
  console.log(`📂 入力ファイル: ${INPUT_FILE}`);
  console.log(`📊 ファイルサイズ: ${(inputStats.size / 1024 / 1024).toFixed(2)} MB`);

  // 2. 出力ディレクトリの作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 出力ディレクトリを作成: ${OUTPUT_DIR}`);
  }

  // 3. バックアップ作成
  if (!fs.existsSync(BACKUP_FILE)) {
    console.log('💾 バックアップを作成中...');
    fs.copyFileSync(INPUT_FILE, BACKUP_FILE);
    console.log(`✅ バックアップ完了: ${BACKUP_FILE}`);
  }

  // 4. データ読み込み
  console.log('📖 データを読み込み中...');
  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));

  if (!Array.isArray(data)) {
    console.error('❌ エラー: データが配列ではありません');
    process.exit(1);
  }

  console.log(`✅ ${data.length}件のトリップを読み込みました`);

  // 5. 各トリップを個別ファイルに保存
  console.log('\n📝 トリップを分割中...');
  const metadata = [];
  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;

  for (const trip of data) {
    if (!trip.id) {
      console.warn('⚠️  IDがないトリップをスキップ:', trip.name);
      continue;
    }

    // 写真データを最適化
    const optimizedTrip = {
      ...trip,
      photos: optimizePhotos(trip.photos)
    };

    // 個別ファイルに保存
    const tripFile = path.join(OUTPUT_DIR, `trip-${trip.id}.json`);
    const tripJson = JSON.stringify(optimizedTrip, null, 2);
    fs.writeFileSync(tripFile, tripJson, 'utf-8');

    const originalSize = JSON.stringify(trip).length;
    const optimizedSize = tripJson.length;
    totalOriginalSize += originalSize;
    totalOptimizedSize += optimizedSize;

    // メタデータ抽出
    metadata.push(extractMetadata(trip));

    const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
    console.log(`  ✓ ${trip.name || trip.id} - ${(optimizedSize / 1024).toFixed(0)}KB (${reduction}% 削減)`);
  }

  // 6. index.json を生成
  console.log('\n📋 index.json を生成中...');
  const indexData = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalTrips: metadata.length,
    trips: metadata.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  };

  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2), 'utf-8');
  const indexSize = fs.statSync(INDEX_FILE).size;

  // 7. 結果表示
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ 完了!');
  console.log(`📂 出力ディレクトリ: ${OUTPUT_DIR}`);
  console.log(`📊 トリップ数: ${metadata.length}件`);
  console.log(`📄 index.json: ${(indexSize / 1024).toFixed(1)}KB`);
  console.log(`📉 データ削減: ${(totalOriginalSize / 1024 / 1024).toFixed(2)}MB → ${(totalOptimizedSize / 1024 / 1024).toFixed(2)}MB`);
  console.log(`💾 削減率: ${((1 - totalOptimizedSize / totalOriginalSize) * 100).toFixed(1)}%`);
  console.log('\n📌 次のステップ:');
  console.log('  1. index.html の読み込みコードを更新');
  console.log('  2. 初回は data/trips/index.json のみ読み込み');
  console.log('  3. トリップ選択時に data/trips/trip-{id}.json を遅延読み込み');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// 実行
main().catch(err => {
  console.error('❌ エラー:', err);
  process.exit(1);
});
