#!/bin/bash
# ライフプランアプリ ローカルサーバー起動スクリプト
# ダブルクリックで起動できます

PORT=8080
DIR="$(cd "$(dirname "$0")" && pwd)"

# ポートが使用中か確認
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "ポート $PORT はすでに使用中です。ブラウザを開きます..."
else
  echo "サーバーを起動しています... (http://localhost:$PORT)"
  cd "$DIR"
  python3 -m http.server $PORT &
  sleep 1
fi

# ブラウザで支出管理アプリを開く
open "http://localhost:$PORT/spending/index.html"

echo ""
echo "=========================================="
echo "  ライフプランアプリが起動しました"
echo "=========================================="
echo ""
echo "  支出管理:    http://localhost:$PORT/spending/"
echo "  ライフプラン: http://localhost:$PORT/"
echo "  データ読込:  http://localhost:$PORT/spending/load-data.html"
echo ""
echo "  終了するには Ctrl+C を押してください"
echo "=========================================="

# サーバーが終了するまで待機
wait
