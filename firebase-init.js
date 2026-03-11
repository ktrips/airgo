/**
 * Firebase 初期化（CDN 版）
 * firebase-config.js の FIREBASE_CONFIG を読み込み、Firebase を初期化します。
 */
(function() {
  if (typeof firebase === 'undefined' || typeof FIREBASE_CONFIG === 'undefined') {
    console.warn('Firebase: 未設定。firebase-config.example.js を firebase-config.js にコピーし、Firebase Console の値を入力してください。');
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
    window.firebaseDb = firebase.firestore(app);
    console.log('Firebase: 初期化完了');
  } catch (err) {
    console.error('Firebase: 初期化エラー', err);
  }
})();
