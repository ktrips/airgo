/**
 * Firebase 初期化（CDN 版）
 * firebase-config.js の FIREBASE_CONFIG を読み込み、Firebase を初期化します。
 */
(function() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase: firebase の CDN が読み込まれていません。');
    return;
  }
  if (typeof FIREBASE_CONFIG === 'undefined') {
    console.warn('Firebase: firebase-config.js が読み込まれていません（404の可能性）。ローカルではファイルの存在を確認し、本番では GitHub Secrets の FIREBASE_CONFIG_JS を設定してください。');
    return;
  }
  if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    console.warn('Firebase: firebase-config.js に Firebase Console の設定値を入力してください。');
    return;
  }
  try {
    const app = firebase.initializeApp(FIREBASE_CONFIG);
    window.firebaseApp = app;
    window.firebaseAuth = firebase.auth(app);
    const db = firebase.firestore(app);
    db.settings({ ignoreUndefinedProperties: true });
    window.firebaseDb = db;
    console.log('Firebase: 初期化完了');

    // Firebase初期化完了イベントを発火
    window.dispatchEvent(new CustomEvent('firebase-ready'));
  } catch (err) {
    console.error('Firebase: 初期化エラー', err);
  }
})();
