#!/bin/bash

echo "🚀 AirGo パフォーマンステストサーバー起動中..."
echo ""
echo "📊 テスト方法:"
echo "  1. ブラウザで http://localhost:8080 を開く"
echo "  2. Chrome DevTools (F12) を開く"
echo "  3. Console タブでパフォーマンス測定結果を確認"
echo "     例: ⏱️ loadTripAndShowPhoto: 245.30ms"
echo ""
echo "📖 詳細なテスト方法: PERFORMANCE_TEST_GUIDE.md を参照"
echo ""
echo "🛑 サーバーを停止するには Ctrl+C を押してください"
echo ""
echo "----------------------------------------"
echo ""

python3 -m http.server 8080
