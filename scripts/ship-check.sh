#!/usr/bin/env bash
# 一键验收：L1（后端类型检查+测试、前端构建+类型检查、离线外网地址检查、部署脚本检查）
#          → 本机测试环境（全新临时数据目录，端口 3901）→ 接口级业务链路冒烟 → 汇总
# 用法：bash scripts/ship-check.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=3901
ADMIN_INIT=Admin12345
SUMMARY=()
FAILED=0

record() { # record <名称> <结果码> <说明>
  if [ "$2" -eq 0 ]; then SUMMARY+=("✅ $1 — $3"); else SUMMARY+=("❌ $1 — $3"); FAILED=1; fi
}

echo "== L1 后端：类型检查与测试 =="
(cd "$ROOT/server" && pnpm -s typecheck) >/tmp/ship-tsc.log 2>&1
record "后端类型检查" $? "$(tail -1 /tmp/ship-tsc.log)"
(cd "$ROOT/server" && pnpm -s test) >/tmp/ship-test.log 2>&1
rc=$?
record "后端测试" $rc "$(grep -E 'Tests ' /tmp/ship-test.log | sed 's/\x1b\[[0-9;]*m//g' | xargs)"
(cd "$ROOT/server" && pnpm -s build) >/tmp/ship-sbuild.log 2>&1
record "后端构建" $? "tsc build"

if [ "$FAILED" -ne 0 ]; then
  echo "L1 后端未通过，停止（fail-fast）"; printf '%s\n' "${SUMMARY[@]}"; exit 1
fi

echo "== L1 前端：构建与类型检查 =="
(cd "$ROOT/web" && pnpm -s build) >/tmp/ship-wbuild.log 2>&1
record "前端构建" $? "$(grep -o 'built in [0-9.]*m\?s\?' /tmp/ship-wbuild.log | tail -1)"
new_tsc=$(cd "$ROOT/web" && pnpm exec vue-tsc --noEmit 2>&1 | grep 'error TS' | grep -vc node_modules)
[ "$new_tsc" -eq 0 ]; record "前端类型检查（src 新增错误）" $? "${new_tsc} 个"

echo "== L1 离线检查：dist 中的外网地址不得超出基线 =="
current=$(cd "$ROOT/web/dist" && grep -rhoE "https?://[a-zA-Z0-9.-]+" --include=*.js --include=*.html --include=*.css . | sed 's/\.$//' | sort -u)
new_hosts=$(comm -13 "$ROOT/scripts/offline-host-baseline.txt" <(echo "$current"))
[ -z "$new_hosts" ]; record "离线外网地址" $? "${new_hosts:-无新增（基线 $(wc -l < "$ROOT/scripts/offline-host-baseline.txt") 个，均为库内文档链接/默认值）}"

echo "== L1 部署脚本检查 =="
bash "$ROOT/deploy/test/run.sh" >/tmp/ship-deploy.log 2>&1
record "部署脚本静态检查与 dry-run" $? "$(grep '结果' /tmp/ship-deploy.log)"

if [ "$FAILED" -ne 0 ]; then
  echo "L1 未通过，不启动测试环境"; printf '%s\n' "${SUMMARY[@]}"; exit 1
fi

echo "== 测试环境：本机 $PORT 端口，全新数据目录 =="
DATA=$(mktemp -d)
export DATA_DIR="$DATA" DATABASE_URL="file:$DATA/app.db" JWT_SECRET="ship-$(date +%s)-check-secret" \
  ADMIN_INIT_PASSWORD="$ADMIN_INIT" WEB_DIST="$ROOT/web/dist" PORT=$PORT NODE_ENV=production
(cd "$ROOT/server" && pnpm -s prisma db push --skip-generate && pnpm -s db:seed) >/tmp/ship-db.log 2>&1
(cd "$ROOT/server" && node dist/server.js >"$DATA/server.log" 2>&1) &
SERVER_PID=$!
for _ in $(seq 1 30); do curl -sf "http://localhost:$PORT/api/goview/health" >/dev/null && break; sleep 1; done
curl -sf "http://localhost:$PORT/" >/dev/null; record "测试环境启动（首页可访问）" $? "http://localhost:$PORT"

echo "== L2 接口级业务链路 =="
node "$ROOT/scripts/smoke-api.mjs" "http://localhost:$PORT" "$ADMIN_INIT" | tee /tmp/ship-smoke.log
record "接口业务链路" "${PIPESTATUS[0]}" "$(tail -1 /tmp/ship-smoke.log)"

kill "$SERVER_PID" 2>/dev/null
# Windows 下 node 子进程可能不随 bash 退出，按端口兜底结束
command -v powershell >/dev/null && powershell -NoProfile -Command \
  "Get-NetTCPConnection -State Listen -LocalPort $PORT -ErrorAction SilentlyContinue | % { Stop-Process -Id \$_.OwningProcess -Force }" >/dev/null 2>&1
rm -rf "$DATA"

echo; echo "================ 汇总 ================"
printf '%s\n' "${SUMMARY[@]}"
exit $FAILED
