#!/usr/bin/env node
/**
 * ローカル IndexedDB からトリップデータを JSON ファイルにエクスポートする CLI スクリプト
 *
 * IndexedDB はブラウザ専用のため、このスクリプトは:
 * 1. 受信用のローカルサーバーを起動
 * 2. ブラウザでエクスポートページを開く（同じオリジンで IndexedDB にアクセス可能な状態で）
 * 3. ページがエクスポートデータを POST で送信
 * 4. 受信した JSON をファイルに保存
 *
 * 使い方:
 *   1. 別ターミナルで Airgo アプリを起動: python3 -m http.server 8080
 *   2. ブラウザで http://localhost:8080 を開き、アプリを使用（IndexedDB にデータがある状態）
 *   3. このスクリプトを実行:
 *      node scripts/export-from-indexeddb.js [--app-url http://localhost:8080] [--output airgo_export_for_migrate.json]
 *
 * 出力形式は migrate-to-firestore.js で使用可能
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    appUrl: 'http://localhost:8080',
    output: 'airgo_export_for_migrate.json.gz',
    port: 0,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--app-url' && args[i + 1]) {
      result.appUrl = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      result.output = args[++i];
    } else if (args[i] === '--port' && args[i + 1]) {
      result.port = parseInt(args[++i], 10);
    }
  }
  return result;
}

function openBrowser(url) {
  const plat = process.platform;
  const cmd =
    plat === 'darwin' ? 'open' : plat === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`, (err) => {
    if (err) console.warn('ブラウザを開けませんでした。手動で以下の URL を開いてください:', url);
  });
}

async function main() {
  const { appUrl, output, port } = parseArgs();

  let doneResolver;
  const exportDone = new Promise((r) => { doneResolver = r; });

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/receive') {
      const chunks = [];
      req.on('data', (chunk) => { chunks.push(chunk); });
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks);
          const outPath = path.resolve(output);
          const zlib = require('zlib');
          const isGzip = req.headers['content-encoding'] === 'gzip';
          let data;
          if (isGzip) {
            fs.writeFileSync(outPath, body);
            data = JSON.parse(zlib.gunzipSync(body).toString('utf8'));
          } else {
            data = JSON.parse(body.toString('utf8'));
            fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
          }
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify({ ok: true, path: outPath }));
          const trips = data?.trips || [];
          console.log(`完了: ${trips.length} 件を ${outPath} にエクスポートしました。`);
          console.log('');
          console.log('次のコマンドで Firestore にアップロード:');
          console.log('  node scripts/migrate-to-firestore.js ' + path.basename(output) + ' --uid YOUR_FIREBASE_UID');
          doneResolver();
        } catch (err) {
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, '127.0.0.1', () => {
    const addr = server.address();
    const actualPort = addr.port;
    const callbackUrl = `http://127.0.0.1:${actualPort}/receive`;
    const exportPageUrl = `${appUrl.replace(/\/$/, '')}/scripts/export-for-migrate.html?callback=${encodeURIComponent(callbackUrl)}`;

    console.log('IndexedDB エクスポート');
    console.log('');
    console.log('1. 以下を確認してください:');
    console.log('   - Airgo アプリが起動していること（例: python3 -m http.server 8080）');
    console.log('   - ブラウザで ' + appUrl + ' を開き、IndexedDB にデータがあること');
    console.log('');
    console.log('2. ブラウザが開きます。エクスポートページで「エクスポート」をクリックしてください。');
    console.log('');

    openBrowser(exportPageUrl);
  });

  try {
    await exportDone;
  } catch (e) {
    // ignore
  }
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
