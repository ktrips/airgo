#!/usr/bin/env node
/**
 * Firestore からトリップデータをエクスポートする CLI スクリプト
 *
 * 使い方:
 *   node scripts/export-from-firestore.js --uid YOUR_FIREBASE_UID [--output airgo_export.json]
 *
 * 必要な環境変数:
 *   GOOGLE_APPLICATION_CREDENTIALS - サービスアカウント JSON のパス
 *   または --credentials で指定
 *
 * 出力形式は export-for-migrate.html と同じ（migrate-to-firestore.js で使用可能）
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { uid: null, credentials: null, output: 'airgo_export_for_migrate.json.gz' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--uid' && args[i + 1]) {
      result.uid = args[++i];
    } else if (args[i] === '--credentials' && args[i + 1]) {
      result.credentials = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      result.output = args[++i];
    }
  }
  return result;
}

/** Firestore 用にサニタイズ（Timestamp 等を JSON 化可能に） */
function sanitizeForExport(obj, seen = new WeakSet()) {
  if (obj == null || typeof obj === 'number' || typeof obj === 'boolean' || typeof obj === 'string') return obj;
  if (Number.isNaN(obj) || obj === Infinity || obj === -Infinity) return null;
  if (typeof obj === 'function') return undefined;
  if (Array.isArray(obj)) return obj.map(v => sanitizeForExport(v, seen)).filter(v => v !== undefined);
  if (typeof obj === 'object') {
    if (obj.constructor?.name === 'Timestamp') {
      return obj.toMillis ? obj.toMillis() : obj.toDate?.()?.getTime() ?? null;
    }
    if (obj.constructor?.name === 'GeoPoint') {
      return { _type: 'GeoPoint', latitude: obj.latitude, longitude: obj.longitude };
    }
    if (seen.has(obj)) return undefined;
    seen.add(obj);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('_')) continue;
      const s = sanitizeForExport(v, seen);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }
  return obj;
}

async function main() {
  const { uid, credentials, output } = parseArgs();

  if (!uid) {
    console.error('Usage: node export-from-firestore.js --uid FIREBASE_UID [--output path/to/export.json] [--credentials path/to/sa.json]');
    console.error('');
    console.error('  Firestore に同期済みのトリップデータを JSON ファイルにエクスポートします。');
    console.error('  UID はアプリで Google ログイン後、ブラウザ Console で firebase.auth().currentUser.uid を実行して取得。');
    process.exit(1);
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch (e) {
    console.error('Error: firebase-admin が必要です。npm install firebase-admin を実行してください。');
    process.exit(1);
  }

  if (!admin.apps.length) {
    const opts = { projectId: 'airgo-trip' };
    if (credentials) {
      const credPath = path.resolve(credentials);
      opts.credential = admin.credential.cert(JSON.parse(fs.readFileSync(credPath, 'utf8')));
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      opts.credential = admin.credential.applicationDefault();
    } else {
      console.error('Error: GOOGLE_APPLICATION_CREDENTIALS を設定するか、--credentials でサービスアカウント JSON を指定してください。');
      process.exit(1);
    }
    admin.initializeApp(opts);
  }

  const db = admin.firestore();
  console.log('Firestore からトリップを取得中…');

  const snapshot = await db.collection('trips').where('userId', '==', uid).get();

  const trips = snapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
  }));

  if (trips.length === 0) {
    console.error('Error: 該当するトリップがありません。UID が正しいか、Firestore に同期済みか確認してください。');
    process.exit(1);
  }

  const exportData = {
    trips: trips.map(t => sanitizeForExport(t)),
    exportedAt: Date.now(),
  };

  const outPath = path.resolve(output);
  const json = JSON.stringify(exportData, null, 2);
  if (output.endsWith('.gz')) {
    fs.writeFileSync(outPath, zlib.gzipSync(json, { level: 6 }));
  } else {
    fs.writeFileSync(outPath, json, 'utf8');
  }

  console.log(`完了: ${trips.length} 件を ${outPath} にエクスポートしました。`);
  console.log('');
  console.log('次のコマンドで Firestore に再移行（または別環境へ移行）できます:');
  console.log(`  node scripts/migrate-to-firestore.js ${path.basename(outPath)} --uid ${uid}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
