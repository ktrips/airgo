#!/usr/bin/env node
/**
 * IndexedDB エクスポート JSON を Firestore に移行する CLI スクリプト
 *
 * 使い方:
 *   1. ブラウザで http://localhost:8080/scripts/export-for-migrate.html を開く
 *      （Airgo アプリを同じオリジンで起動していること）
 *   2. エクスポートボタンをクリック → airgo_export_for_migrate.json をダウンロード
 *   3. Firebase UID を取得（アプリで Google ログイン後、Console で firebase.auth().currentUser.uid）
 *   4. 実行:
 *      npx firebase-admin scripts/migrate-to-firestore.js airgo_export_for_migrate.json --uid YOUR_UID
 *      または
 *      node scripts/migrate-to-firestore.js airgo_export_for_migrate.json --uid YOUR_UID
 *
 * 必要な環境変数:
 *   GOOGLE_APPLICATION_CREDENTIALS - サービスアカウント JSON のパス
 *   または --credentials で指定
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { jsonPath: null, uid: null, credentials: null, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--uid' && args[i + 1]) {
      result.uid = args[++i];
    } else if (args[i] === '--credentials' && args[i + 1]) {
      result.credentials = args[++i];
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
    } else if (!args[i].startsWith('-')) {
      result.jsonPath = args[i];
    }
  }
  return result;
}

function sanitizeForFirestore(obj) {
  if (obj == null || typeof obj === 'number' || typeof obj === 'boolean' || typeof obj === 'string') return obj;
  if (Number.isNaN(obj) || obj === Infinity || obj === -Infinity) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore).filter(v => v !== undefined);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      const s = sanitizeForFirestore(v);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }
  return obj;
}

async function main() {
  const { jsonPath, uid, credentials, dryRun } = parseArgs();

  if (!jsonPath) {
    console.error('Usage: node migrate-to-firestore.js <export.json> --uid FIREBASE_UID [--credentials path/to/sa.json] [--dry-run]');
    console.error('');
    console.error('  1. Export: Open http://localhost:8080/scripts/export-for-migrate.html in browser');
    console.error('  2. Get UID: firebase.auth().currentUser.uid from app console when logged in');
    console.error('  3. Run: GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/migrate-to-firestore.js export.json --uid YOUR_UID');
    process.exit(1);
  }

  if (!uid) {
    console.error('Error: --uid FIREBASE_UID is required');
    process.exit(1);
  }

  const resolvedPath = path.resolve(jsonPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error('Error: File not found:', resolvedPath);
    process.exit(1);
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch (e) {
    console.error('Error: firebase-admin is required. Run: npm install firebase-admin');
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
      console.error('Error: Set GOOGLE_APPLICATION_CREDENTIALS or use --credentials path/to/serviceAccount.json');
      process.exit(1);
    }
    admin.initializeApp(opts);
  }

  const db = admin.firestore();
  let raw;
  if (resolvedPath.endsWith('.gz')) {
    raw = zlib.gunzipSync(fs.readFileSync(resolvedPath)).toString('utf8');
  } else {
    raw = fs.readFileSync(resolvedPath, 'utf8');
  }
  const data = JSON.parse(raw);
  const trips = Array.isArray(data) ? data : (data.trips || []);

  if (trips.length === 0) {
    console.error('Error: No trips in export file');
    process.exit(1);
  }

  console.log(`Migrating ${trips.length} trips to Firestore (userId: ${uid})${dryRun ? ' [DRY RUN]' : ''}`);
  let ok = 0;
  for (const trip of trips) {
    if (!trip.id) {
      console.warn('Skipping trip without id:', trip.name || '(unnamed)');
      continue;
    }
    const payload = sanitizeForFirestore({ ...trip, userId: uid });
    if (!payload || typeof payload !== 'object') {
      console.warn('Skipping invalid trip:', trip.id);
      continue;
    }
    if (dryRun) {
      console.log('  Would write:', trip.id, trip.name || '');
      ok++;
      continue;
    }
    try {
      await db.collection('trips').doc(trip.id).set(payload, { merge: true });
      console.log('  OK:', trip.id, trip.name || '');
      ok++;
    } catch (err) {
      console.error('  FAIL:', trip.id, err.message);
    }
  }
  console.log(`Done: ${ok}/${trips.length} trips migrated`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
