#!/usr/bin/env bash
# vis-platform 离线安装包构建脚本（在联网的打包机上运行）
#
# 支持 Linux 与 Windows Git Bash。所有外部下载均带固定版本，并通过官方
# SHA256 清单校验；构建目标机为 glibc >= 2.28 的 Linux（x64 / arm64）。
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

# ---- 固定版本（升级时同步修改这里，并确保校验清单可访问） ----
NODE_VERSION="22.23.4"
FFMPEG_RELEASE_TAG="autobuild-2026-10-24-13-02"
FFMPEG_BUILD_NAME="ffmpeg-n9.0.2-35-g9a9b70bb8c"
FFMPEG_DISPLAY_VERSION="9.0.2"
MICROMAMBA_VERSION="2.9.0-0"
CONDA_PYTHON_VERSION="3.11"
PY3DTILES_SPEC="py3dtiles[las]==12.1.1"

# 目标平台固定产物的 SHA256（同时校验官方清单与脚本内置值，降低清单被篡改的风险）
NODE_SHA256_X64="1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce"
NODE_SHA256_ARM64="6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b"
FFMPEG_SHA256_X64="3e4b9dc35da45413baf39bc11363b16311e60f4d24a69b68ab61e61aefd54b6c"
FFMPEG_SHA256_ARM64="903e0376ec079a8f1c02622529cb269607a5a5f6dad7fd52af79354de23371be"
MICROMAMBA_SHA256_X64="366cd9cd8be14df1ab8ed50352a82111082a36686b2d389fdb79a92c3fafb3e3"
MICROMAMBA_SHA256_ARM64="9f93b974adcb4d166996af969b6cd371287d1a3e52733704727884d9b74cb7a7"

WORK_DIR="${VIS_BUILD_WORKDIR:-${REPO_ROOT}/.tools/deploy-build}"
OUT_DIR="${VIS_BUILD_OUTDIR:-${REPO_ROOT}/.tools/deploy-out}"
DOWNLOAD_DIR="${WORK_DIR}/downloads"
STAGE_PARENT="${WORK_DIR}/stage"
SOLVE_JSON="${WORK_DIR}/conda-solve.json"

ARCH=""
VERSION=""
HOST_OS=""
HOST_ARCH=""
HOST_MAMBA=""

log() {
  printf '%s\n' "$*"
}

step() {
  printf '\n==> [%s] %s\n' "$1" "$2"
}

warn() {
  printf '警告：%s\n' "$*" >&2
}

die() {
  printf '\n错误：%s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：build-package.sh --arch <x64|arm64> --version <x.y.z>

选项：
  --arch <x64|arm64>   目标服务器 CPU 架构
  --version <x.y.z>    发布版本号（写入安装包与健康检查接口）
  -h, --help           显示本帮助

环境变量：
  VIS_BUILD_WORKDIR    构建工作目录，默认 .tools/deploy-build
  VIS_BUILD_OUTDIR     安装包输出目录，默认 .tools/deploy-out

说明：
  本脚本需要联网下载 Node.js、ffmpeg、micromamba、conda-forge 包和 PyPI wheels。
  构建机需要：bash、node、pnpm、npm、python3(pip)、curl 或 wget、tar。
  在 Windows 上请使用 Git Bash。
EOF
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --arch)
        [[ $# -ge 2 ]] || die "--arch 需要 x64 或 arm64"
        ARCH="$2"
        shift 2
        ;;
      --arch=*)
        ARCH="${1#*=}"
        shift
        ;;
      --version)
        [[ $# -ge 2 ]] || die "--version 需要版本号"
        VERSION="$2"
        shift 2
        ;;
      --version=*)
        VERSION="${1#*=}"
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        die "未知参数：$1（使用 --help 查看用法）"
        ;;
    esac
  done

  [[ "$ARCH" == "x64" || "$ARCH" == "arm64" ]] || die "--arch 只支持 x64 或 arm64"
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]] \
    || die "--version 格式应为 x.y.z（可带 -rc.1 等后缀）：$VERSION"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "构建机缺少命令：$1"
}

detect_host() {
  case "$(uname -s 2>/dev/null || true)" in
    Linux*) HOST_OS="linux" ;;
    Darwin*) HOST_OS="macos" ;;
    MINGW* | MSYS* | CYGWIN*) HOST_OS="windows" ;;
    *) die "不支持的构建机系统：$(uname -s 2>/dev/null || echo unknown)" ;;
  esac
  case "$(uname -m 2>/dev/null || true)" in
    x86_64 | amd64) HOST_ARCH="x64" ;;
    aarch64 | arm64) HOST_ARCH="arm64" ;;
    *) die "不支持的构建机 CPU 架构：$(uname -m 2>/dev/null || echo unknown)" ;;
  esac
}

to_host_path() {
  if [[ "$HOST_OS" == "windows" ]]; then
    cygpath -w "$1"
  else
    printf '%s' "$1"
  fi
}

node_linux_arch() {
  case "$ARCH" in
    x64) printf 'x64' ;;
    arm64) printf 'arm64' ;;
  esac
}

ffmpeg_linux_arch() {
  case "$ARCH" in
    x64) printf 'linux64' ;;
    arm64) printf 'linuxarm64' ;;
  esac
}

conda_platform() {
  case "$ARCH" in
    x64) printf 'linux-64' ;;
    arm64) printf 'linux-aarch64' ;;
  esac
}

micromamba_target_asset() {
  case "$ARCH" in
    x64) printf 'micromamba-linux-64' ;;
    arm64) printf 'micromamba-linux-aarch64' ;;
  esac
}

pip_manylinux_arch() {
  case "$ARCH" in
    x64) printf 'x86_64' ;;
    arm64) printf 'aarch64' ;;
  esac
}

prisma_targets_csv() {
  printf '%s' "debian-openssl-3.0.x,debian-openssl-1.1.x,rhel-openssl-3.0.x,rhel-openssl-1.1.x,linux-arm64-openssl-3.0.x,linux-arm64-openssl-1.1.x"
}

prepare_workdirs() {
  case "$WORK_DIR" in
    "" | "/" | "$REPO_ROOT") die "构建工作目录不合法：$WORK_DIR" ;;
  esac
  mkdir -p "$DOWNLOAD_DIR" "$OUT_DIR"
  rm -rf "$STAGE_PARENT"
  mkdir -p "$STAGE_PARENT"
  STAGE_ROOT="${STAGE_PARENT}/vis-platform-${VERSION}-linux-${ARCH}"
  STAGE_APP="${STAGE_ROOT}/app"
  STAGE_RUNTIME="${STAGE_ROOT}/runtime"
  rm -rf "$STAGE_ROOT"
  mkdir -p "$STAGE_APP/server" "$STAGE_APP/web" "$STAGE_RUNTIME"
}

fetch() {
  local url="$1"
  local dest="$2"
  local tmp="${dest}.part"
  rm -f "$tmp"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 -o "$tmp" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$tmp" "$url"
  else
    die "需要 curl 或 wget 才能下载"
  fi
  [[ -s "$tmp" ]] || die "下载失败（文件为空）：$url"
  mv "$tmp" "$dest"
}

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$file" | awk '{print $NF}'
  else
    die "构建机缺少 sha256sum / shasum / openssl"
  fi
}

checksum_from_manifest() {
  local manifest="$1"
  local name="$2"
  local expected=""
  expected="$(awk -v n="$name" 'NF >= 2 && ($2 == n || $2 == "*" n) {print $1; exit}' "$manifest" || true)"
  if [[ -z "$expected" ]]; then
    expected="$(awk 'NR == 1 {print $1}' "$manifest" || true)"
  fi
  printf '%s' "$expected" | tr '[:upper:]' '[:lower:]'
}

download_verified() {
  local dest="$1"
  local url="$2"
  local sums_url="$3"
  local name="$4"
  local pinned="${5:-}"
  local sums="${DOWNLOAD_DIR}/${name}.sha256.txt"
  local expected=""
  local actual=""

  if [[ ! -s "$sums" ]]; then
    fetch "$sums_url" "$sums"
  fi
  expected="$(checksum_from_manifest "$sums" "$name")"
  [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || die "无法从校验清单中解析 ${name} 的 SHA256"
  if [[ -n "$pinned" && "$expected" != "$pinned" ]]; then
    die "官方 SHA256 清单与脚本内置值不一致：${name}（清单 ${expected}，内置 ${pinned}），请人工核实后再打包"
  fi
  if [[ -n "$pinned" ]]; then
    expected="$pinned"
  fi

  if [[ -s "$dest" ]]; then
    actual="$(sha256_file "$dest" | tr '[:upper:]' '[:lower:]')"
    if [[ "$actual" == "$expected" ]]; then
      log "复用已下载文件：$(basename -- "$dest")"
      return 0
    fi
    warn "已有文件校验不匹配，重新下载：$(basename -- "$dest")"
    rm -f "$dest"
  fi

  fetch "$url" "${dest}.part"
  actual="$(sha256_file "${dest}.part" | tr '[:upper:]' '[:lower:]')"
  if [[ "$actual" != "$expected" ]]; then
    rm -f "${dest}.part"
    die "SHA256 校验失败：$(basename -- "$dest")（期望 ${expected}，实际 ${actual}）"
  fi
  mv "${dest}.part" "$dest"
  log "已下载并校验：$(basename -- "$dest")"
}

require_build_inputs() {
  require_cmd tar
  require_cmd node
  require_cmd pnpm
  require_cmd npm
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    die "构建机需要 curl 或 wget"
  fi
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python)"
  else
    die "构建机需要 Python 3 与 pip"
  fi
  "$PYTHON_BIN" -m pip --version >/dev/null 2>&1 || die "Python 缺少 pip，请先安装"
  local file
  for file in \
    "${SCRIPT_DIR}/install.sh" \
    "${SCRIPT_DIR}/backup.sh" \
    "${SCRIPT_DIR}/restore.sh" \
    "${SCRIPT_DIR}/uninstall.sh" \
    "${SCRIPT_DIR}/README.md" \
    "${SCRIPT_DIR}/vis.env.example"; do
    [[ -f "$file" ]] || die "缺少部署文件：${file}"
  done
}

build_web() {
  step "构建" "前端（GoView / Vite）"
  (
    cd "${REPO_ROOT}/web" || exit 1
    pnpm install --frozen-lockfile
    pnpm build
  )
  [[ -f "${REPO_ROOT}/web/dist/index.html" ]] || die "前端构建产物缺失：web/dist/index.html"
}

build_server() {
  step "构建" "后端（TypeScript + Prisma Client）"
  (
    cd "${REPO_ROOT}/server" || exit 1
    pnpm install --frozen-lockfile
    pnpm exec prisma generate
    pnpm build
  )
  [[ -f "${REPO_ROOT}/server/dist/server.js" ]] || die "后端构建产物缺失：server/dist/server.js"
}

stage_app() {
  step "打包" "后端编译产物与生产依赖"
  cp -a "${REPO_ROOT}/web/dist" "${STAGE_APP}/web/dist"
  cp -a "${REPO_ROOT}/server/dist" "${STAGE_APP}/server/dist"
  cp -a "${REPO_ROOT}/server/seed-content" "${STAGE_APP}/server/seed-content"
  cp "${REPO_ROOT}/server/package.json" "${STAGE_APP}/server/package.json"
  cp "${REPO_ROOT}/server/pnpm-lock.yaml" "${STAGE_APP}/server/pnpm-lock.yaml"
  {
    printf 'nodeLinker: hoisted\n'
    cat "${REPO_ROOT}/server/pnpm-workspace.yaml"
  } > "${STAGE_APP}/server/pnpm-workspace.yaml"
  mkdir -p "${STAGE_APP}/server/prisma"
  cp "${REPO_ROOT}/server/prisma/schema.prisma" "${STAGE_APP}/server/prisma/schema.prisma"

  (
    cd "${STAGE_APP}/server" || exit 1
    # pnpm 11 从 pnpm-workspace.yaml 读取 nodeLinker；环境变量兼容旧版 pnpm
    npm_config_node_linker=hoisted pnpm install --prod --frozen-lockfile --ignore-scripts
  )

  step "打包" "生成 Prisma Client（含全部 Linux 引擎）"
  (
    cd "${STAGE_APP}/server" || exit 1
    export PRISMA_HIDE_UPDATE_MESSAGE=1
    export CHECKPOINT_DISABLE=1
    node "${REPO_ROOT}/server/node_modules/prisma/build/index.js" generate \
      --schema=prisma/schema.prisma
  )

  verify_prisma_client_engines

  node - "${STAGE_APP}/server/package.json" "$VERSION" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const version = process.argv[3];
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.version = version;
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
NODE

  stage_prisma_tools
  stage_seed_bundle
}

verify_prisma_client_engines() {
  local client_root="${STAGE_APP}/server/node_modules"
  local target=""
  local found=""
  for target in \
    debian-openssl-3.0.x \
    debian-openssl-1.1.x \
    rhel-openssl-3.0.x \
    rhel-openssl-1.1.x \
    linux-arm64-openssl-3.0.x \
    linux-arm64-openssl-1.1.x; do
    found="$(find "$client_root" -name "libquery_engine-${target}.so.node" -print -quit 2>/dev/null || true)"
    [[ -n "$found" ]] || die "Prisma Client 缺少目标引擎：${target}（请确认 schema.prisma 的 binaryTargets）"
  done
  log "Prisma Client 已包含全部 6 个 Linux 引擎"
}

stage_prisma_tools() {
  step "打包" "Prisma CLI（用于目标机离线 db push）"
  local tools_dir="${STAGE_APP}/server/tools"
  local targets=""
  local required=""
  local prisma_version=""
  targets="$(prisma_targets_csv)"
  prisma_version="$(node -e 'const pkg = require(process.argv[1]); process.stdout.write(pkg.devDependencies.prisma)' "${REPO_ROOT}/server/package.json")"
  [[ -n "$prisma_version" ]] || die "无法从 server/package.json 读取 prisma 版本"
  mkdir -p "$tools_dir"
  cat > "${tools_dir}/package.json" <<EOF
{
  "name": "vis-platform-prisma-tools",
  "private": true,
  "version": "1.0.0",
  "dependencies": {
    "prisma": "${prisma_version}"
  }
}
EOF
  (
    cd "$tools_dir" || exit 1
    PRISMA_CLI_BINARY_TARGETS="$targets" npm install --no-audit --no-fund --no-progress
  )

  case "$ARCH" in
    x64) required="debian-openssl-3.0.x rhel-openssl-3.0.x" ;;
    arm64) required="linux-arm64-openssl-3.0.x linux-arm64-openssl-1.1.x" ;;
  esac
  local -a required_targets=()
  local target
  read -r -a required_targets <<< "$required"
  for target in "${required_targets[@]}"; do
    [[ -f "${tools_dir}/node_modules/@prisma/engines/schema-engine-${target}" ]] \
      || die "Prisma CLI 缺少 ${ARCH} 平台的 schema-engine-${target}；请在 Linux 构建机重试"
  done
  log "Prisma CLI 已包含 ${ARCH} 平台 schema-engine"
}

stage_seed_bundle() {
  step "打包" "编译 seed 脚本（目标机无需 tsx）"
  local esbuild_bin=""
  esbuild_bin="$(find "${REPO_ROOT}/server/node_modules" -path '*/.bin/esbuild' -print -quit 2>/dev/null || true)"
  [[ -n "$esbuild_bin" && -x "$esbuild_bin" ]] || die "未找到可执行的 esbuild（应由 server 的 tsx 依赖提供）"
  "$esbuild_bin" "${REPO_ROOT}/server/prisma/seed.ts" \
    --bundle \
    --platform=node \
    --format=esm \
    --packages=external \
    --target=node22 \
    --outfile="${STAGE_APP}/server/prisma/seed.bundle.mjs"
  [[ -f "${STAGE_APP}/server/prisma/seed.bundle.mjs" ]] || die "seed 脚本编译失败"
}

stage_node_runtime() {
  step "下载" "Node.js v${NODE_VERSION} Linux ${ARCH}"
  local node_arch=""
  local asset=""
  local url=""
  local sums_url=""
  local archive=""
  local pinned=""
  local extract_dir="${WORK_DIR}/node-extract"
  node_arch="$(node_linux_arch)"
  asset="node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"
  url="https://nodejs.org/dist/v${NODE_VERSION}/${asset}"
  sums_url="https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  archive="${DOWNLOAD_DIR}/${asset}"
  if [[ "$ARCH" == "x64" ]]; then pinned="$NODE_SHA256_X64"; else pinned="$NODE_SHA256_ARM64"; fi
  download_verified "$archive" "$url" "$sums_url" "$asset" "$pinned"

  rm -rf "$extract_dir"
  mkdir -p "$extract_dir" "${STAGE_RUNTIME}/node"
  tar -xJf "$archive" -C "$extract_dir" --strip-components=1
  cp -a "${extract_dir}/." "${STAGE_RUNTIME}/node/"
  rm -rf "$extract_dir"
  chmod 0755 "${STAGE_RUNTIME}/node/bin/node"
  log "Node.js 运行时已放入 runtime/node（$(sha256_file "$archive" | cut -c1-12)…）"
}

stage_ffmpeg_runtime() {
  step "下载" "ffmpeg ${FFMPEG_DISPLAY_VERSION} 静态构建（LGPL）"
  local suffix=""
  local asset=""
  local url=""
  local sums_url=""
  local archive=""
  local pinned=""
  local extract_dir="${WORK_DIR}/ffmpeg-extract"
  local ffmpeg_bin=""
  suffix="$(ffmpeg_linux_arch)"
  asset="${FFMPEG_BUILD_NAME}-${suffix}-lgpl-9.0.tar.xz"
  url="https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_RELEASE_TAG}/${asset}"
  sums_url="https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_RELEASE_TAG}/checksums.sha256"
  archive="${DOWNLOAD_DIR}/${asset}"
  if [[ "$ARCH" == "x64" ]]; then pinned="$FFMPEG_SHA256_X64"; else pinned="$FFMPEG_SHA256_ARM64"; fi
  download_verified "$archive" "$url" "$sums_url" "$asset" "$pinned"

  rm -rf "$extract_dir"
  mkdir -p "$extract_dir" "${STAGE_RUNTIME}/ffmpeg/bin"
  tar -xJf "$archive" -C "$extract_dir" --strip-components=1
  ffmpeg_bin="$(find "$extract_dir" -type f -name ffmpeg -print -quit)"
  [[ -n "$ffmpeg_bin" ]] || die "ffmpeg 压缩包中未找到 ffmpeg 可执行文件"
  cp "$ffmpeg_bin" "${STAGE_RUNTIME}/ffmpeg/bin/ffmpeg"
  if [[ -f "${extract_dir}/ffprobe" ]]; then
    cp "${extract_dir}/ffprobe" "${STAGE_RUNTIME}/ffmpeg/bin/ffprobe"
  fi
  chmod 0755 "${STAGE_RUNTIME}/ffmpeg/bin/ffmpeg"
  [[ ! -f "${STAGE_RUNTIME}/ffmpeg/bin/ffprobe" ]] || chmod 0755 "${STAGE_RUNTIME}/ffmpeg/bin/ffprobe"

  local license_file=""
  license_file="$(find "$extract_dir" -maxdepth 2 -type f -iname 'LICENSE*' -print -quit)"
  if [[ -n "$license_file" ]]; then
    cp "$license_file" "${STAGE_RUNTIME}/ffmpeg/LICENSE.txt"
  fi
  fetch "https://www.gnu.org/licenses/old-licenses/lgpl-2.1.txt" \
    "${STAGE_RUNTIME}/ffmpeg/LICENSE.LGPL-2.1.txt"

  cat > "${STAGE_RUNTIME}/ffmpeg/SOURCE.txt" <<EOF
FFmpeg 静态构建来源与许可证说明
=================================
版本：FFmpeg n${FFMPEG_DISPLAY_VERSION}（${FFMPEG_BUILD_NAME}）
构建提供方：BtbN/FFmpeg-Builds
发布页：https://github.com/BtbN/FFmpeg-Builds/releases/tag/${FFMPEG_RELEASE_TAG}
构建配置：LGPL（未启用 GPL 组件），静态链接
源码获取：https://github.com/FFmpeg/FFmpeg（标签 n${FFMPEG_DISPLAY_VERSION}）
         https://ffmpeg.org/download.html
许可证文本：本目录 LICENSE.txt / LICENSE.LGPL-2.1.txt

本平台仅以独立子进程方式调用 ffmpeg 做 RTSP 转封装，未修改 ffmpeg 源码。
如需对应源码，请按上述地址获取同版本源码，或联系供应商获取构建源码包。
EOF
  rm -rf "$extract_dir"
  log "ffmpeg 已放入 runtime/ffmpeg"
}

stage_micromamba() {
  step "下载" "micromamba ${MICROMAMBA_VERSION}（目标机 Linux ${ARCH}）"
  local asset=""
  local url=""
  local sums_url=""
  local pinned=""
  asset="$(micromamba_target_asset)"
  url="https://github.com/mamba-org/micromamba-releases/releases/download/${MICROMAMBA_VERSION}/${asset}"
  sums_url="${url}.sha256"
  if [[ "$ARCH" == "x64" ]]; then pinned="$MICROMAMBA_SHA256_X64"; else pinned="$MICROMAMBA_SHA256_ARM64"; fi
  download_verified "${DOWNLOAD_DIR}/${asset}" "$url" "$sums_url" "$asset" "$pinned"
  cp "${DOWNLOAD_DIR}/${asset}" "${STAGE_RUNTIME}/micromamba"
  chmod 0755 "${STAGE_RUNTIME}/micromamba"
  log "micromamba 已放入 runtime/micromamba"
}

download_host_micromamba() {
  step "下载" "构建机用 micromamba（解析 Linux ${ARCH} 包清单）"
  local host_asset=""
  local checksum_name=""
  case "${HOST_OS}-${HOST_ARCH}" in
    linux-x64) host_asset="micromamba-linux-64" ;;
    linux-arm64) host_asset="micromamba-linux-aarch64" ;;
    macos-x64) host_asset="micromamba-osx-64" ;;
    macos-arm64) host_asset="micromamba-osx-arm64" ;;
    windows-x64) host_asset="micromamba-win-64.exe" ;;
    windows-arm64) host_asset="micromamba-win-arm64.exe" ;;
    *) die "没有适配当前构建机的 micromamba：${HOST_OS}-${HOST_ARCH}" ;;
  esac
  checksum_name="${host_asset%.exe}"
  local url=""
  local sums_url=""
  url="https://github.com/mamba-org/micromamba-releases/releases/download/${MICROMAMBA_VERSION}/${host_asset}"
  sums_url="https://github.com/mamba-org/micromamba-releases/releases/download/${MICROMAMBA_VERSION}/${checksum_name}.sha256"
  HOST_MAMBA="${WORK_DIR}/${host_asset}"
  download_verified "$HOST_MAMBA" "$url" "$sums_url" "$checksum_name"
  chmod 0755 "$HOST_MAMBA"
}

resolve_conda_packages() {
  step "下载" "解析 conda-forge GDAL 环境（目标平台 $(conda_platform)）"
  local mamba_root=""
  local solve_prefix=""
  mamba_root="$(to_host_path "${WORK_DIR}/mamba-root")"
  solve_prefix="$(to_host_path "${WORK_DIR}/solve-prefix")"
  rm -rf "${WORK_DIR}/solve-prefix"
  mkdir -p "${WORK_DIR}/mamba-root"

  if ! MAMBA_ROOT_PREFIX="$mamba_root" "$HOST_MAMBA" --no-rc create \
    --dry-run --json \
    --platform "$(conda_platform)" \
    --prefix "$solve_prefix" \
    --override-channels -c conda-forge \
    "gdal" "python=${CONDA_PYTHON_VERSION}" "pip" "setuptools" "wheel" > "$SOLVE_JSON"; then
    die "micromamba 解析 conda 依赖失败，请检查网络与 conda-forge 可用性"
  fi

  local urls_file="${WORK_DIR}/conda-urls.txt"
  node - "$SOLVE_JSON" "$urls_file" <<'NODE'
const fs = require('fs');
const [, , jsonPath, outPath] = process.argv;
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const records = (data.actions && (data.actions.LINK || data.actions.FETCH)) || [];
const urls = [];
for (const record of records) {
  let url = record.url;
  if (!url && record.filename) {
    let base = String(record.channel || 'https://conda.anaconda.org/conda-forge').replace(/\/+$/, '');
    if (!/^https?:\/\//.test(base)) base = `https://conda.anaconda.org/${base}`;
    const platform = record.platform || '';
    if (platform && !base.endsWith(`/${platform}`)) base = `${base}/${platform}`;
    url = `${base}/${record.filename}`;
  }
  if (url) urls.push(String(url));
}
const unique = [...new Set(urls)];
fs.writeFileSync(outPath, unique.length ? `${unique.join('\n')}\n` : '');
console.error(`解析到 ${unique.length} 个 conda 包`);
NODE
  [[ -s "$urls_file" ]] || die "micromamba 未返回任何 conda 包 URL"
  log "conda 依赖解析完成：$(wc -l < "$urls_file" | tr -d ' ') 个包"
}

download_conda_packages() {
  step "下载" "conda-forge 安装包（离线包缓存）"
  local urls_file="${WORK_DIR}/conda-urls.txt"
  local pkgs_dir="${STAGE_RUNTIME}/geo-pkgs"
  local url=""
  local platform=""
  local filename=""
  local target=""
  local count=0
  while IFS= read -r url; do
    [[ -n "$url" ]] || continue
    platform="$(printf '%s' "$url" | awk -F/ '{print $(NF-1)}')"
    filename="$(basename -- "$url")"
    case "$platform" in
      linux-64 | linux-aarch64 | noarch) ;;
      *) die "conda 包来自非 conda-forge 渠道：$url" ;;
    esac
    target="${pkgs_dir}/${platform}/${filename}"
    mkdir -p "${pkgs_dir}/${platform}"
    if [[ ! -s "$target" ]]; then
      fetch "$url" "$target"
    fi
    count=$((count + 1))
  done < "$urls_file"
  (( count > 0 )) || die "没有下载到 conda 包"
  log "已下载 ${count} 个 conda 包到 runtime/geo-pkgs"
}

stage_wheels() {
  step "下载" "py3dtiles ${PY3DTILES_SPEC} 离线 wheels（linux ${ARCH} / Python ${CONDA_PYTHON_VERSION}）"
  local wheels_dir="${STAGE_RUNTIME}/wheels"
  local platform=""
  local platform_228=""
  local python_tag="cp${CONDA_PYTHON_VERSION/./}"
  platform="$(pip_manylinux_arch)"
  platform_228="manylinux_2_28_${platform}"
  platform="manylinux2014_${platform}"
  mkdir -p "$wheels_dir"

  local pip_cmd=("$PYTHON_BIN" -m pip)
  if ! "${pip_cmd[@]}" download \
    --dest "$wheels_dir" \
    --only-binary=:all: \
    --platform "$platform" \
    --python-version "$CONDA_PYTHON_VERSION" \
    --implementation cp \
    --abi "$python_tag" \
    --no-cache-dir \
    "$PY3DTILES_SPEC"; then
    warn "manylinux2014 下载失败，尝试 manylinux_2_28"
    if ! "${pip_cmd[@]}" download \
      --dest "$wheels_dir" \
      --only-binary=:all: \
      --platform "$platform" \
      --platform "$platform_228" \
      --python-version "$CONDA_PYTHON_VERSION" \
      --implementation cp \
      --abi "$python_tag" \
      --no-cache-dir \
      "$PY3DTILES_SPEC"; then
      warn "二进制 wheel 下载失败，回退为 py3dtiles sdist + 依赖 wheels"
      "${pip_cmd[@]}" download --dest "$wheels_dir" --no-deps --no-binary=:all: "$PY3DTILES_SPEC"
      "${pip_cmd[@]}" download \
        --dest "$wheels_dir" \
        --only-binary=:all: \
        --platform "$platform" \
        --platform "$platform_228" \
        --python-version "$CONDA_PYTHON_VERSION" \
        --implementation cp \
        --abi "$python_tag" \
        --no-cache-dir \
        --no-deps \
        mapbox_earcut==1.0.3 lz4 "numba<0.64.0,>=0.59" "numpy<2.4.0,>=1.24.0" \
        psutil pyproj pyzmq pygltflib "laspy<3.0,>=2.5"
    fi
  fi

  compgen -G "${wheels_dir}/py3dtiles-*" >/dev/null || die "未下载到 py3dtiles 的 wheel 或 sdist"
  local wheel_count=0
  wheel_count="$(find "$wheels_dir" -maxdepth 1 -type f | wc -l | tr -d ' ')"
  (( wheel_count > 0 )) || die "wheels 目录为空"
  write_wheel_checksums "$wheels_dir"
  log "已下载 ${wheel_count} 个 wheel/sdist 到 runtime/wheels"
}

write_wheel_checksums() {
  local wheels_dir="$1"
  local file=""
  (
    cd "$wheels_dir" || exit 1
    for file in *; do
      [[ -f "$file" ]] || continue
      printf '%s  %s\n' "$(sha256_file "$file")" "$file"
    done
  ) > "${wheels_dir}/SHA256SUMS.txt"
}

stage_deploy_files() {
  step "打包" "部署脚本与说明"
  cp "${SCRIPT_DIR}/install.sh" "${STAGE_ROOT}/install.sh"
  cp "${SCRIPT_DIR}/backup.sh" "${STAGE_ROOT}/backup.sh"
  cp "${SCRIPT_DIR}/restore.sh" "${STAGE_ROOT}/restore.sh"
  cp "${SCRIPT_DIR}/uninstall.sh" "${STAGE_ROOT}/uninstall.sh"
  cp "${SCRIPT_DIR}/README.md" "${STAGE_ROOT}/README.md"
  cp "${SCRIPT_DIR}/vis.env.example" "${STAGE_ROOT}/vis.env.example"
  chmod 0755 "${STAGE_ROOT}/install.sh" "${STAGE_ROOT}/backup.sh" \
    "${STAGE_ROOT}/restore.sh" "${STAGE_ROOT}/uninstall.sh"

  printf '%s\n' "$VERSION" > "${STAGE_ROOT}/VERSION"
  printf '%s\n' "$ARCH" > "${STAGE_ROOT}/ARCH"

  {
    printf 'app_version=%s\n' "$VERSION"
    printf 'target_arch=%s\n' "$ARCH"
    printf 'built_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'node_version=%s\n' "$NODE_VERSION"
    printf 'ffmpeg_version=%s (%s)\n' "$FFMPEG_DISPLAY_VERSION" "$FFMPEG_RELEASE_TAG"
    printf 'micromamba_version=%s\n' "$MICROMAMBA_VERSION"
    printf 'py3dtiles_spec=%s\n' "$PY3DTILES_SPEC"
    printf 'conda_platform=%s\n' "$(conda_platform)"
  } > "${STAGE_RUNTIME}/BUILD-INFO.txt"
}

write_package_metadata() {
  local geo_urls="${WORK_DIR}/conda-urls.txt"
  {
    printf '@EXPLICIT\n'
    cat "$geo_urls"
  } > "${STAGE_RUNTIME}/geo-explicit.txt"
}

create_archive() {
  step "打包" "生成 tar.gz 与 SHA256"
  local archive_name="vis-platform-${VERSION}-linux-${ARCH}.tar.gz"
  local archive_path="${OUT_DIR}/${archive_name}"
  rm -f "$archive_path" "${archive_path}.sha256"
  tar --owner=0 --group=0 -C "$STAGE_PARENT" -czf "$archive_path" "$(basename -- "$STAGE_ROOT")"
  (
    cd "$OUT_DIR" || exit 1
    printf '%s  %s\n' "$(sha256_file "$archive_name")" "$archive_name" > "${archive_name}.sha256"
  )
  log "安装包：${archive_path}"
  log "大小：$(du -h "$archive_path" | awk '{print $1}')"
  log "SHA256：$(awk '{print $1}' "${archive_path}.sha256")"
  log "分发时请同时提供 .sha256 文件，目标机可用 sha256sum -c 校验。"
}

main() {
  parse_args "$@"
  detect_host
  require_build_inputs
  prepare_workdirs

  log "构建 vis-platform ${VERSION}（linux-${ARCH}），工作目录：${WORK_DIR}"
  build_web
  build_server
  stage_app

  stage_node_runtime
  stage_ffmpeg_runtime
  stage_micromamba
  download_host_micromamba
  resolve_conda_packages
  download_conda_packages
  stage_wheels

  stage_deploy_files
  write_package_metadata
  create_archive
}

main "$@"
