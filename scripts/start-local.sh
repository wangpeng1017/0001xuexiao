#!/usr/bin/env bash
# 本机启动一套“类生产”环境供手工测试：后端托管前端 dist，端口 3901，数据在 .local-test/
# 用法：bash scripts/start-local.sh            （首次会构建前后端）
#       bash scripts/start-local.sh --rebuild  （代码有更新时重新构建）
#       bash scripts/start-local.sh --reset    （清空测试数据，从全新管理员开始）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.local-test"
PORT=3901

for arg in "$@"; do
  case "$arg" in
    --reset) rm -rf "$DATA"; echo "已清空测试数据" ;;
    --rebuild) rm -rf "$ROOT/web/dist" "$ROOT/server/dist" ;;
    *) echo "未知参数：$arg"; exit 1 ;;
  esac
done

[ -d "$ROOT/web/dist" ] || { echo "构建前端（约 1 分钟）..."; (cd "$ROOT/web" && pnpm -s install && pnpm -s build); }
[ -d "$ROOT/server/dist" ] || { echo "构建后端..."; (cd "$ROOT/server" && pnpm -s install && pnpm -s prisma generate && pnpm -s build); }

mkdir -p "$DATA"
if [ ! -f "$DATA/admin-password.txt" ]; then
  # 随机初始密码：8 位字母 + 2 位数字，满足密码强度要求
  echo "Vis$(LC_ALL=C tr -dc 'a-z' </dev/urandom | head -c 5)$((RANDOM % 90 + 10))" > "$DATA/admin-password.txt"
fi
[ -f "$DATA/jwt-secret.txt" ] || LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 64 > "$DATA/jwt-secret.txt"

export DATA_DIR="$DATA" DATABASE_URL="file:$DATA/app.db" JWT_SECRET="$(cat "$DATA/jwt-secret.txt")" \
  ADMIN_INIT_PASSWORD="$(cat "$DATA/admin-password.txt")" WEB_DIST="$ROOT/web/dist" PORT=$PORT NODE_ENV=production

(cd "$ROOT/server" && pnpm -s prisma db push --skip-generate >/dev/null && pnpm -s db:seed >/dev/null)

echo "=============================================="
echo " 访问地址：http://localhost:$PORT"
echo " 管理员：admin / $(cat "$DATA/admin-password.txt")（首次登录需修改；改过后以新密码为准）"
echo " 停止：在本窗口按 Ctrl+C"
echo "=============================================="
cd "$ROOT/server" && exec node dist/server.js
