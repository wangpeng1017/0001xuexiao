#!/usr/bin/env bash
# vis-platform Windows 离线安装包构建脚本（在联网的 Windows 打包机上用 Git Bash 运行）
#
# 目标机：Windows Server 2019 / Windows 10+ x64。产物：
#   .tools/deploy-out/vis-platform-<版本>-windows-x64.zip(.sha256)
# 与 Linux 包（deploy/build-package.sh）并列，共用同一份应用代码与同一批固定版本。
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

# ---- 固定版本（与 Linux 包保持一致；升级时同步修改） ----
NODE_VERSION="22.23.4"
# BtbN 的带日期 autobuild 发布会被清理（原固定标签已 404），Windows 包改用滚动的 latest 标签，
# 实际文件的 SHA256 写入 BUILD-INFO.txt 留档
FFMPEG_RELEASE_TAG="latest"
FFMPEG_BUILD_NAME="ffmpeg-n9.0-latest"
FFMPEG_DISPLAY_VERSION="9.0（latest 滚动构建）"
MICROMAMBA_VERSION="2.9.0-0"
CONDA_PYTHON_VERSION="3.11"
PY3DTILES_SPEC="py3dtiles[las]==12.1.1"
WINSW_VERSION="2.12.0"

WORK_DIR="${VIS_BUILD_WORKDIR:-${REPO_ROOT}/.tools/deploy-build-win}"
OUT_DIR="${VIS_BUILD_OUTDIR:-${REPO_ROOT}/.tools/deploy-out}"
DOWNLOAD_DIR="${WORK_DIR}/downloads"
STAGE_PARENT="${WORK_DIR}/stage"

VERSION=""
PYTHON_BIN=""

log() { printf '%s\n' "$*"; }
step() { printf '\n==> [%s] %s\n' "$1" "$2"; }
warn() { printf '警告：%s\n' "$*" >&2; }
die() { printf '\n错误：%s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
用法：build-package-win.sh --version <x.y.z>

在 Windows 打包机的 Git Bash 中运行，需要联网。
构建机需要：bash、node、pnpm、npm、python(pip)、curl、tar。
产物：.tools/deploy-out/vis-platform-<版本>-windows-x64.zip
EOF
}

while (($# > 0)); do
  case "$1" in
    --version) [[ $# -ge 2 ]] || die "--version 需要版本号"; VERSION="$2"; shift 2 ;;
    --version=*) VERSION="${1#*=}"; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
done
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]] \
  || die "--version 格式应为 x.y.z（可带 -rc.1 等后缀）：$VERSION"

case "$(uname -s 2>/dev/null || true)" in
  MINGW* | MSYS* | CYGWIN*) ;;
  *) die "本脚本只能在 Windows 的 Git Bash 中运行（Linux 包请用 deploy/build-package.sh）" ;;
esac

to_win() { cygpath -w "$1"; }

fetch() {
  local url="$1" dest="$2" tmp="${2}.part"
  rm -f "$tmp"
  curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 -o "$tmp" "$url"
  [[ -s "$tmp" ]] || die "下载失败（文件为空）：$url"
  mv "$tmp" "$dest"
}

sha256_file() { sha256sum "$1" | awk '{print $1}'; }

# 下载并按官方清单校验；清单第 2 列是文件名，找不到则取首行（单文件 .sha256）
download_verified() {
  local dest="$1" url="$2" sums_url="$3" name="$4"
  local sums="${DOWNLOAD_DIR}/${name}.sha256.txt" expected="" actual=""
  [[ -s "$sums" ]] || fetch "$sums_url" "$sums"
  expected="$(awk -v n="$name" 'NF >= 2 && ($2 == n || $2 == "*" n) {print $1; exit}' "$sums" || true)"
  [[ -n "$expected" ]] || expected="$(awk 'NR == 1 {print $1}' "$sums")"
  expected="$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')"
  [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || die "无法从校验清单解析 ${name} 的 SHA256"
  if [[ -s "$dest" && "$(sha256_file "$dest")" == "$expected" ]]; then
    log "复用已下载文件：$(basename -- "$dest")"
    return 0
  fi
  rm -f "$dest"
  fetch "$url" "${dest}.part"
  actual="$(sha256_file "${dest}.part")"
  if [[ "$actual" != "$expected" ]]; then
    rm -f "${dest}.part"
    die "SHA256 校验失败：${name}（期望 ${expected}，实际 ${actual}）"
  fi
  mv "${dest}.part" "$dest"
  log "已下载并校验：$(basename -- "$dest")"
}

unzip_to() {
  "$PYTHON_BIN" -I -m zipfile -e "$(to_win "$1")" "$(to_win "$2")"
}

require_inputs() {
  local c
  for c in tar node pnpm npm curl sha256sum; do
    command -v "$c" >/dev/null 2>&1 || die "构建机缺少命令：$c"
  done
  for c in python3 python; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -m pip --version >/dev/null 2>&1; then
      PYTHON_BIN="$(command -v "$c")"
      break
    fi
  done
  [[ -n "$PYTHON_BIN" ]] || die "构建机需要 Python 3 与 pip"
  local f
  for f in install.ps1 uninstall.ps1 backup.ps1 restore.ps1 安装说明.md; do
    [[ -f "${SCRIPT_DIR}/${f}" ]] || die "缺少部署文件：${SCRIPT_DIR}/${f}"
  done
}

prepare_workdirs() {
  mkdir -p "$DOWNLOAD_DIR" "$OUT_DIR"
  rm -rf "$STAGE_PARENT"
  STAGE_ROOT="${STAGE_PARENT}/vis-platform-${VERSION}-windows-x64"
  STAGE_APP="${STAGE_ROOT}/app"
  STAGE_RUNTIME="${STAGE_ROOT}/runtime"
  mkdir -p "$STAGE_APP/server" "$STAGE_APP/web" "$STAGE_RUNTIME"
}

build_web() {
  step "构建" "前端（GoView / Vite）"
  (cd "${REPO_ROOT}/web" && pnpm install --frozen-lockfile && pnpm build)
  [[ -f "${REPO_ROOT}/web/dist/index.html" ]] || die "前端构建产物缺失"
}

build_server() {
  step "构建" "后端（TypeScript + Prisma Client）"
  (cd "${REPO_ROOT}/server" && pnpm install --frozen-lockfile && pnpm exec prisma generate && pnpm build)
  [[ -f "${REPO_ROOT}/server/dist/server.js" ]] || die "后端构建产物缺失"
}

stage_app() {
  step "打包" "后端编译产物与生产依赖"
  cp -a "${REPO_ROOT}/web/dist" "${STAGE_APP}/web/dist"
  cp -a "${REPO_ROOT}/server/dist" "${STAGE_APP}/server/dist"
  cp -a "${REPO_ROOT}/server/seed-content" "${STAGE_APP}/server/seed-content"
  cp "${REPO_ROOT}/server/package.json" "${REPO_ROOT}/server/pnpm-lock.yaml" "${STAGE_APP}/server/"
  { printf 'nodeLinker: hoisted\n'; cat "${REPO_ROOT}/server/pnpm-workspace.yaml"; } \
    > "${STAGE_APP}/server/pnpm-workspace.yaml"
  mkdir -p "${STAGE_APP}/server/prisma"
  cp "${REPO_ROOT}/server/prisma/schema.prisma" "${STAGE_APP}/server/prisma/schema.prisma"

  (cd "${STAGE_APP}/server" && npm_config_node_linker=hoisted pnpm install --prod --frozen-lockfile --ignore-scripts)

  step "打包" "生成 Prisma Client（Windows 引擎）"
  (
    cd "${STAGE_APP}/server"
    export PRISMA_HIDE_UPDATE_MESSAGE=1 CHECKPOINT_DISABLE=1
    node "${REPO_ROOT}/server/node_modules/prisma/build/index.js" generate --schema=prisma/schema.prisma
  )
  local engine
  engine="$(find "${STAGE_APP}/server/node_modules" -name 'query_engine-windows.dll.node' -print -quit)"
  [[ -n "$engine" ]] || die "Prisma Client 缺少 Windows 查询引擎（query_engine-windows.dll.node）"
  # Windows 包不需要 Linux 引擎，删掉省体积
  find "${STAGE_APP}/server/node_modules" \( -name 'libquery_engine-*.so.node' \) -delete
  log "Prisma Client 已含 Windows 引擎，已移除 Linux 引擎"

  node - "${STAGE_APP}/server/package.json" "$VERSION" <<'NODE'
const fs = require('fs');
const [, , file, version] = process.argv;
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.version = version;
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
NODE

  stage_prisma_tools
  stage_seed_bundle
}

stage_prisma_tools() {
  step "打包" "Prisma CLI（目标机离线 db push）"
  local tools_dir="${STAGE_APP}/server/tools" prisma_version
  prisma_version="$(node -e 'process.stdout.write(require(process.argv[1]).devDependencies.prisma)' "${REPO_ROOT}/server/package.json")"
  mkdir -p "$tools_dir"
  cat > "${tools_dir}/package.json" <<EOF
{ "name": "vis-platform-prisma-tools", "private": true, "version": "1.0.0",
  "dependencies": { "prisma": "${prisma_version}" } }
EOF
  (cd "$tools_dir" && npm install --no-audit --no-fund --no-progress)
  [[ -f "${tools_dir}/node_modules/@prisma/engines/schema-engine-windows.exe" ]] \
    || die "Prisma CLI 缺少 schema-engine-windows.exe"
  log "Prisma CLI 已含 Windows schema-engine"
}

stage_seed_bundle() {
  step "打包" "编译 seed 脚本"
  local esbuild_bin
  esbuild_bin="$(find "${REPO_ROOT}/server/node_modules" -path '*/esbuild/bin/esbuild' -print -quit 2>/dev/null || true)"
  [[ -n "$esbuild_bin" ]] || die "未找到 esbuild（应由 tsx 依赖提供）"
  node "$esbuild_bin" "${REPO_ROOT}/server/prisma/seed.ts" \
    --bundle --platform=node --format=esm --packages=external --target=node22 \
    --outfile="${STAGE_APP}/server/prisma/seed.bundle.mjs"
  [[ -f "${STAGE_APP}/server/prisma/seed.bundle.mjs" ]] || die "seed 脚本编译失败"
}

stage_node_runtime() {
  step "下载" "Node.js v${NODE_VERSION} Windows x64"
  local asset="node-v${NODE_VERSION}-win-x64.zip" ex="${WORK_DIR}/node-extract"
  download_verified "${DOWNLOAD_DIR}/${asset}" "https://nodejs.org/dist/v${NODE_VERSION}/${asset}" \
    "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" "$asset"
  rm -rf "$ex"; mkdir -p "$ex"
  unzip_to "${DOWNLOAD_DIR}/${asset}" "$ex"
  mkdir -p "${STAGE_RUNTIME}/node"
  cp -a "${ex}/node-v${NODE_VERSION}-win-x64/node.exe" "${ex}/node-v${NODE_VERSION}-win-x64/LICENSE" "${STAGE_RUNTIME}/node/"
  rm -rf "$ex"
  [[ -f "${STAGE_RUNTIME}/node/node.exe" ]] || die "Node.js 解压失败"
}

stage_ffmpeg_runtime() {
  step "下载" "ffmpeg ${FFMPEG_DISPLAY_VERSION} Windows 静态构建（LGPL）"
  local asset="${FFMPEG_BUILD_NAME}-win64-lgpl-9.0.zip" ex="${WORK_DIR}/ffmpeg-extract" bin=""
  local base="https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_RELEASE_TAG}"
  download_verified "${DOWNLOAD_DIR}/${asset}" "${base}/${asset}" "${base}/checksums.sha256" "$asset"
  FFMPEG_SHA="$(sha256_file "${DOWNLOAD_DIR}/${asset}")"
  rm -rf "$ex"; mkdir -p "$ex" "${STAGE_RUNTIME}/ffmpeg/bin"
  unzip_to "${DOWNLOAD_DIR}/${asset}" "$ex"
  bin="$(find "$ex" -type f -name ffmpeg.exe -print -quit)"
  [[ -n "$bin" ]] || die "ffmpeg 压缩包中未找到 ffmpeg.exe"
  cp "$bin" "${STAGE_RUNTIME}/ffmpeg/bin/ffmpeg.exe"
  local probe; probe="$(find "$ex" -type f -name ffprobe.exe -print -quit)"
  [[ -z "$probe" ]] || cp "$probe" "${STAGE_RUNTIME}/ffmpeg/bin/ffprobe.exe"
  local lic; lic="$(find "$ex" -maxdepth 2 -type f -iname 'LICENSE*' -print -quit)"
  [[ -z "$lic" ]] || cp "$lic" "${STAGE_RUNTIME}/ffmpeg/LICENSE.txt"
  fetch "https://www.gnu.org/licenses/old-licenses/lgpl-2.1.txt" "${STAGE_RUNTIME}/ffmpeg/LICENSE.LGPL-2.1.txt"
  cat > "${STAGE_RUNTIME}/ffmpeg/SOURCE.txt" <<EOF
FFmpeg 静态构建来源与许可证说明
版本：FFmpeg n${FFMPEG_DISPLAY_VERSION}（${FFMPEG_BUILD_NAME}），LGPL 构建，静态链接
构建提供方：BtbN/FFmpeg-Builds  ${base/download/tag}
源码：https://github.com/FFmpeg/FFmpeg（标签 n${FFMPEG_DISPLAY_VERSION}）
本平台仅以独立子进程方式调用 ffmpeg 做 RTSP 转封装，未修改 ffmpeg 源码。
EOF
  rm -rf "$ex"
}

stage_micromamba_and_conda() {
  step "下载" "micromamba ${MICROMAMBA_VERSION}（win-64）"
  local asset="micromamba-win-64.exe" base="https://github.com/mamba-org/micromamba-releases/releases/download/${MICROMAMBA_VERSION}"
  download_verified "${DOWNLOAD_DIR}/${asset}" "${base}/${asset}" "${base}/micromamba-win-64.sha256" "micromamba-win-64"
  cp "${DOWNLOAD_DIR}/${asset}" "${STAGE_RUNTIME}/micromamba.exe"

  step "下载" "解析 conda-forge GDAL 环境（win-64）"
  local mroot solve_prefix solve_json="${WORK_DIR}/conda-solve.json" urls="${WORK_DIR}/conda-urls.txt"
  mroot="$(to_win "${WORK_DIR}/mamba-root")"; solve_prefix="$(to_win "${WORK_DIR}/solve-prefix")"
  rm -rf "${WORK_DIR}/solve-prefix"; mkdir -p "${WORK_DIR}/mamba-root"
  MAMBA_ROOT_PREFIX="$mroot" "${DOWNLOAD_DIR}/${asset}" --no-rc create --dry-run --json \
    --platform win-64 --prefix "$solve_prefix" --override-channels -c conda-forge \
    "gdal" "python=${CONDA_PYTHON_VERSION}" "pip" "setuptools" "wheel" > "$solve_json" \
    || die "micromamba 解析 conda 依赖失败"
  node - "$solve_json" "$urls" <<'NODE'
const fs = require('fs');
const [, , jsonPath, outPath] = process.argv;
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const records = (data.actions && (data.actions.LINK || data.actions.FETCH)) || [];
const urls = [];
for (const r of records) {
  let url = r.url;
  if (!url && r.filename) {
    let base = String(r.channel || 'https://conda.anaconda.org/conda-forge').replace(/\/+$/, '');
    if (!/^https?:\/\//.test(base)) base = `https://conda.anaconda.org/${base}`;
    if (r.platform && !base.endsWith(`/${r.platform}`)) base = `${base}/${r.platform}`;
    url = `${base}/${r.filename}`;
  }
  if (url) urls.push(String(url));
}
fs.writeFileSync(outPath, [...new Set(urls)].join('\n') + '\n');
NODE
  [[ -s "$urls" ]] || die "micromamba 未返回任何 conda 包 URL"

  step "下载" "conda-forge 安装包（$(wc -l < "$urls" | tr -d ' ') 个）"
  local url platform name target count=0
  while IFS= read -r url; do
    [[ -n "$url" ]] || continue
    platform="$(printf '%s' "$url" | awk -F/ '{print $(NF-1)}')"
    name="$(basename -- "$url")"
    case "$platform" in win-64 | noarch) ;; *) die "conda 包来自非预期渠道：$url" ;; esac
    target="${STAGE_RUNTIME}/geo-pkgs/${platform}/${name}"
    mkdir -p "${STAGE_RUNTIME}/geo-pkgs/${platform}"
    [[ -s "$target" ]] || fetch "$url" "$target"
    count=$((count + 1))
  done < "$urls"
  { printf '@EXPLICIT\n'; cat "$urls"; } > "${STAGE_RUNTIME}/geo-explicit.txt"
  log "已下载 ${count} 个 conda 包"
}

stage_wheels() {
  step "下载" "${PY3DTILES_SPEC} 离线 wheels（win_amd64 / Python ${CONDA_PYTHON_VERSION}）"
  local wd="${STAGE_RUNTIME}/wheels"
  mkdir -p "$wd"
  "$PYTHON_BIN" -m pip download --dest "$wd" --only-binary=:all: --platform win_amd64 \
    --python-version "$CONDA_PYTHON_VERSION" --implementation cp --abi "cp${CONDA_PYTHON_VERSION/./}" \
    --no-cache-dir "$PY3DTILES_SPEC" || die "py3dtiles wheels 下载失败"
  compgen -G "${wd}/py3dtiles-*" >/dev/null || die "未下载到 py3dtiles"
  (cd "$wd" && for f in *; do [[ -f "$f" && "$f" != SHA256SUMS.txt ]] && printf '%s  %s\n' "$(sha256_file "$f")" "$f"; done) \
    > "${WORK_DIR}/wheel-sums.txt"
  mv "${WORK_DIR}/wheel-sums.txt" "${wd}/SHA256SUMS.txt"
  log "已下载 $(find "$wd" -maxdepth 1 -type f | wc -l | tr -d ' ') 个文件"
}

stage_winsw() {
  step "下载" "WinSW ${WINSW_VERSION}（Windows 服务包装器）"
  local dest="${DOWNLOAD_DIR}/WinSW-x64-${WINSW_VERSION}.exe"
  [[ -s "$dest" ]] || fetch "https://github.com/winsw/winsw/releases/download/v${WINSW_VERSION}/WinSW-x64.exe" "$dest"
  mkdir -p "${STAGE_RUNTIME}/winsw"
  cp "$dest" "${STAGE_RUNTIME}/winsw/WinSW-x64.exe"
  WINSW_SHA="$(sha256_file "$dest")"
}

# PowerShell 5.1 把无 BOM 的 UTF-8 当 ANSI 读，中文会乱码，所以写入 UTF-8 BOM
stage_deploy_files() {
  step "打包" "部署脚本与说明"
  local f
  for f in install.ps1 uninstall.ps1 backup.ps1 restore.ps1; do
    { printf '\xEF\xBB\xBF'; cat "${SCRIPT_DIR}/${f}"; } > "${STAGE_ROOT}/${f}"
  done
  cp "${SCRIPT_DIR}/安装说明.md" "${STAGE_ROOT}/安装说明.md"
  printf '%s\n' "$VERSION" > "${STAGE_ROOT}/VERSION"
  {
    printf 'app_version=%s\ntarget=windows-x64\nbuilt_at=%s\n' "$VERSION" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'node_version=%s\nffmpeg_version=%s (%s)\n' "$NODE_VERSION" "$FFMPEG_DISPLAY_VERSION" "$FFMPEG_RELEASE_TAG"
    printf 'micromamba_version=%s\npy3dtiles_spec=%s\nwinsw_version=%s sha256=%s\n' \
      "$MICROMAMBA_VERSION" "$PY3DTILES_SPEC" "$WINSW_VERSION" "$WINSW_SHA"
  } > "${STAGE_RUNTIME}/BUILD-INFO.txt"
}

create_archive() {
  step "打包" "生成 zip 与 SHA256"
  local name="vis-platform-${VERSION}-windows-x64.zip" out="${OUT_DIR}/vis-platform-${VERSION}-windows-x64.zip"
  rm -f "$out" "${out}.sha256"
  "$PYTHON_BIN" -I - "$(to_win "$STAGE_PARENT")" "$(basename -- "$STAGE_ROOT")" "$(to_win "$out")" <<'PY'
import os, sys, zipfile
parent, top, out = sys.argv[1:4]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=3, allowZip64=True) as z:
    for root, _, files in os.walk(os.path.join(parent, top)):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, parent))
PY
  printf '%s  %s\n' "$(sha256_file "$out")" "$name" > "${out}.sha256"
  log "安装包：${out}"
  log "大小：$(du -h "$out" | awk '{print $1}')"
  log "SHA256：$(awk '{print $1}' "${out}.sha256")"
}

main() {
  require_inputs
  prepare_workdirs
  log "构建 vis-platform ${VERSION}（windows-x64），工作目录：${WORK_DIR}"
  # VIS_SKIP_BUILD=1：沿用已有的 web/dist 与 server/dist（构建中途失败后重跑时省时间）
  if [[ "${VIS_SKIP_BUILD:-0}" != "1" ]]; then build_web; build_server; fi
  stage_app
  stage_node_runtime
  stage_ffmpeg_runtime
  stage_micromamba_and_conda
  stage_wheels
  stage_winsw
  stage_deploy_files
  create_archive
}

main
