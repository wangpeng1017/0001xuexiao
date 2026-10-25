#!/usr/bin/env bash
# 部署脚本静态检查与 dry-run 单测（不会修改系统、不会联网下载）
set -uo pipefail

TEST_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd -- "${TEST_DIR}/.." && pwd)"
INSTALL_SCRIPT="${DEPLOY_DIR}/install.sh"
BUILD_SCRIPT="${DEPLOY_DIR}/build-package.sh"

PASS=0
FAIL=0
FAILED_NAMES=()

pass() {
  PASS=$((PASS + 1))
  printf '  [PASS] %s\n' "$1"
}

fail() {
  FAIL=$((FAIL + 1))
  FAILED_NAMES+=("$1")
  printf '  [FAIL] %s\n' "$1"
}

section() {
  printf '\n== %s ==\n' "$1"
}

contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]]
}

test_env_functions() {
  local tmp=""
  tmp="$(mktemp -d)"
  local rc=0
  (
    set +e
    # shellcheck source=/dev/null
    source "$INSTALL_SCRIPT"
    set +e
    local content=""
    content="$(build_env_content 8080 /srv/visdata /opt/vis-platform 1.2.3 jwtsecret123 adminpass456)" || exit 1

    local expected=""
    local -a expected_lines=(
      'PORT=8080'
      'DATA_DIR="/srv/visdata"'
      'DATABASE_URL="file:/srv/visdata/app.db"'
      'JWT_SECRET=jwtsecret123'
      'ADMIN_INIT_PASSWORD=adminpass456'
      'WEB_DIST="/opt/vis-platform/app/web/dist"'
      'GDAL_BIN_DIR="/opt/vis-platform/runtime/geo/bin"'
      'PY3DTILES_CMD="/opt/vis-platform/runtime/geo/bin/py3dtiles"'
      'FFMPEG_PATH="/opt/vis-platform/runtime/ffmpeg/bin/ffmpeg"'
      'NODE_ENV=production'
      'APP_VERSION=1.2.3'
    )
    for expected in "${expected_lines[@]}"; do
      if ! grep -qxF "$expected" <<< "$content"; then
        printf '缺少配置行：%s\n' "$expected" >&2
        exit 1
      fi
    done

    local first_rc=0
    local second_rc=0
    local original=""
    ensure_env_file "$tmp/vis.env" "$content"
    first_rc=$?
    original="$(cat "$tmp/vis.env")"
    ensure_env_file "$tmp/vis.env" "PORT=9999"
    second_rc=$?
    [[ "$first_rc" -eq 0 ]] || exit 1
    [[ "$second_rc" -eq 1 ]] || exit 1
    [[ "$(cat "$tmp/vis.env")" == "$original" ]] || exit 1
    grep -qxF 'JWT_SECRET=jwtsecret123' "$tmp/vis.env" || exit 1

    local hex=""
    hex="$(random_hex 16)" || exit 1
    [[ "$hex" =~ ^[0-9a-f]{32}$ ]] || exit 1

    parse_args --port 8081 --data-dir /srv/data --upgrade --dry-run || exit 1
    [[ "$PORT" == "8081" ]] || exit 1
    [[ "$DATA_DIR" == "/srv/data" ]] || exit 1
    [[ "$UPGRADE" -eq 1 ]] || exit 1
    [[ "$DRY_RUN" -eq 1 ]] || exit 1

    (parse_args --port 70000) >/dev/null 2>&1 && exit 1
    (parse_args --data-dir relative/path) >/dev/null 2>&1 && exit 1
    (parse_args --unknown-flag) >/dev/null 2>&1 && exit 1
    exit 0
  )
  rc=$?
  rm -rf "$tmp"
  return "$rc"
}

section "Bash 语法检查"
SCRIPTS=(
  "build-package.sh"
  "install.sh"
  "backup.sh"
  "restore.sh"
  "uninstall.sh"
  "test/run.sh"
)
for script in "${SCRIPTS[@]}"; do
  if bash -n "${DEPLOY_DIR}/${script}" 2>/dev/null; then
    pass "bash -n ${script}"
  else
    fail "bash -n ${script}"
  fi
done

section "ShellCheck"
if command -v shellcheck >/dev/null 2>&1; then
  if shellcheck -x "${DEPLOY_DIR}/build-package.sh" \
    "${DEPLOY_DIR}/install.sh" \
    "${DEPLOY_DIR}/backup.sh" \
    "${DEPLOY_DIR}/restore.sh" \
    "${DEPLOY_DIR}/uninstall.sh" \
    "${DEPLOY_DIR}/test/run.sh"; then
    pass "shellcheck 全部脚本"
  else
    fail "shellcheck 全部脚本"
  fi
else
  printf '  [SKIP] 本机未安装 shellcheck\n'
fi

section "install.sh 参数解析与 dry-run"
output=""
if output="$(bash "$INSTALL_SCRIPT" --dry-run 2>&1)"; then
  if contains "$output" "[dry-run]" \
    && contains "$output" "/opt/vis-platform" \
    && contains "$output" "端口 80" \
    && contains "$output" "ADMIN_INIT_PASSWORD"; then
    pass "默认参数 dry-run 输出包含预期步骤"
  else
    fail "默认参数 dry-run 输出不完整"
  fi
else
  fail "默认参数 dry-run 应成功退出"
fi

if output="$(bash "$INSTALL_SCRIPT" --dry-run --port 8080 --data-dir /tmp/vis-platform-dryrun 2>&1)"; then
  if contains "$output" "端口 8080" \
    && contains "$output" "/tmp/vis-platform-dryrun"; then
    pass "自定义端口/数据目录 dry-run"
  else
    fail "自定义端口/数据目录未出现在 dry-run 输出"
  fi
else
  fail "自定义参数 dry-run 应成功退出"
fi

if output="$(bash "$INSTALL_SCRIPT" --dry-run --upgrade 2>&1)"; then
  if contains "$output" "读取现有配置" && contains "$output" "回滚"; then
    pass "升级模式 dry-run 包含备份与回滚说明"
  else
    fail "升级模式 dry-run 输出不完整"
  fi
else
  fail "升级模式 dry-run 应成功退出"
fi

if bash "$INSTALL_SCRIPT" --dry-run --port 0 >/dev/null 2>&1; then
  fail "端口 0 应被拒绝"
else
  pass "非法端口被拒绝"
fi

if bash "$INSTALL_SCRIPT" --dry-run --data-dir relative/path >/dev/null 2>&1; then
  fail "相对数据目录应被拒绝"
else
  pass "相对数据目录被拒绝"
fi

if bash "$INSTALL_SCRIPT" --dry-run --unknown-flag >/dev/null 2>&1; then
  fail "未知参数应被拒绝"
else
  pass "未知参数被拒绝"
fi

if output="$(bash "$INSTALL_SCRIPT" --help 2>&1)" && contains "$output" "用法"; then
  pass "install.sh --help"
else
  fail "install.sh --help"
fi

section "install.sh 配置生成函数"
if test_env_functions; then
  pass "env 内容生成、随机密钥、已存在不覆盖、参数解析"
else
  fail "env 生成函数单测"
fi

section "构建脚本参数校验（不触发下载）"
if bash "$BUILD_SCRIPT" --arch mips --version 1.0.0 >/dev/null 2>&1; then
  fail "非法架构应被拒绝"
else
  pass "非法架构被拒绝且未开始构建"
fi

if bash "$BUILD_SCRIPT" --version 1.0.0 >/dev/null 2>&1; then
  fail "缺少 --arch 应被拒绝"
else
  pass "缺少 --arch 被拒绝"
fi

if output="$(bash "$BUILD_SCRIPT" --help 2>&1)" && contains "$output" "用法"; then
  pass "build-package.sh --help"
else
  fail "build-package.sh --help"
fi

section "运维脚本 --help"
for script in backup.sh restore.sh uninstall.sh; do
  if bash "${DEPLOY_DIR}/${script}" --help >/dev/null 2>&1; then
    pass "${script} --help"
  else
    fail "${script} --help"
  fi
done

printf '\n========================================\n'
printf '结果：%d 通过，%d 失败\n' "$PASS" "$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  printf '失败项：\n'
  for name in "${FAILED_NAMES[@]}"; do
    printf '  - %s\n' "$name"
  done
  exit 1
fi
printf '全部通过。\n'
