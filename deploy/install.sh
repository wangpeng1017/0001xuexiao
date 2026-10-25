#!/usr/bin/env bash
# vis-platform 离线安装 / 升级脚本（目标机全程不联网）
set -euo pipefail

SERVICE_NAME="vis-platform"
APP_USER="vis"
INSTALL_DIR="/opt/vis-platform"
DEFAULT_DATA_DIR="/data/vis-platform"
ENV_DIR="/etc/vis-platform"
ENV_FILE="${ENV_DIR}/vis.env"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
DEFAULT_PORT=80
HEALTH_TIMEOUT=60
HEALTH_INTERVAL=2

PORT="${DEFAULT_PORT}"
DATA_DIR="${DEFAULT_DATA_DIR}"
UPGRADE=0
DRY_RUN=0
UPGRADE_IN_PROGRESS=0
BACKUP_DIR=""
ADMIN_PASSWORD=""
VERSION="unknown"
ARCH="unknown"

PKG_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

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
  if [[ "${UPGRADE_IN_PROGRESS}" -eq 1 ]]; then
    upgrade_rollback
  fi
  exit 1
}

usage() {
  cat <<'EOF'
用法：install.sh [选项]

选项：
  --port <端口>       服务监听端口，默认 80
  --data-dir <目录>   数据目录（SQLite 与上传文件），默认 /data/vis-platform
  --upgrade           升级已安装的实例：保留数据与配置，替换程序文件
  --dry-run           只打印将要执行的操作，不修改系统
  -h, --help          显示本帮助

示例：
  sudo ./install.sh
  sudo ./install.sh --port 8080 --data-dir /data/vis-platform
  sudo ./install.sh --upgrade
EOF
}

validate_port() {
  local value="$1"
  [[ "$value" =~ ^[0-9]+$ ]] || die "端口必须是数字：$value"
  (( value >= 1 && value <= 65535 )) || die "端口必须在 1-65535 之间：$value"
}

validate_data_dir() {
  local value="${1%/}"
  [[ -n "$value" ]] || die "数据目录不能为空"
  [[ "$value" == /* ]] || die "数据目录必须是绝对路径：$value"
  [[ "$value" != "/" ]] || die "数据目录不能是根目录"
  [[ "$value" =~ ^/[A-Za-z0-9._/-]+$ ]] || die "数据目录只允许字母、数字、点、下划线、横线和斜杠：$value"
  DATA_DIR="$value"
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --port)
        [[ $# -ge 2 ]] || die "--port 需要一个端口号"
        PORT="$2"
        shift 2
        ;;
      --port=*)
        PORT="${1#*=}"
        shift
        ;;
      --data-dir)
        [[ $# -ge 2 ]] || die "--data-dir 需要一个绝对路径"
        DATA_DIR="$2"
        shift 2
        ;;
      --data-dir=*)
        DATA_DIR="${1#*=}"
        shift
        ;;
      --upgrade)
        UPGRADE=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
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

  validate_port "$PORT"
  validate_data_dir "$DATA_DIR"
}

read_metadata() {
  if [[ -f "${PKG_DIR}/VERSION" ]]; then
    VERSION="$(tr -d '[:space:]' < "${PKG_DIR}/VERSION")"
    [[ -n "$VERSION" ]] || VERSION="unknown"
  fi
  if [[ -f "${PKG_DIR}/ARCH" ]]; then
    ARCH="$(tr -d '[:space:]' < "${PKG_DIR}/ARCH")"
    [[ -n "$ARCH" ]] || ARCH="unknown"
  fi
}

detect_host_arch() {
  case "$(uname -m 2>/dev/null || true)" in
    x86_64 | amd64) printf 'x64' ;;
    aarch64 | arm64) printf 'arm64' ;;
    *) printf 'unknown' ;;
  esac
}

check_root() {
  [[ "$(id -u)" -eq 0 ]] || die "请使用 root 用户执行本脚本"
}

check_arch() {
  local host_arch
  host_arch="$(detect_host_arch)"
  [[ "$host_arch" != "unknown" ]] || die "无法识别当前服务器 CPU 架构（仅支持 x86_64 / arm64）"
  if [[ "$ARCH" != "x64" && "$ARCH" != "arm64" ]]; then
    warn "安装包缺少 ARCH 标识，跳过安装包架构校验"
    return 0
  fi
  [[ "$ARCH" == "$host_arch" ]] || die "安装包架构为 ${ARCH}，当前服务器为 ${host_arch}，请使用对应的安装包"
}

check_glibc() {
  local version="" major="" minor=""
  if command -v getconf >/dev/null 2>&1; then
    version="$(getconf GNU_LIBC_VERSION 2>/dev/null || true)"
    version="${version#glibc }"
  fi
  if [[ -z "$version" ]] && command -v ldd >/dev/null 2>&1; then
    version="$(ldd --version 2>&1 | head -n 1 | grep -oE '[0-9]+\.[0-9]+' | tail -n 1 || true)"
  fi
  if [[ -z "$version" ]]; then
    warn "无法检测 glibc 版本；Node.js 官方二进制要求 glibc >= 2.28"
    return 0
  fi
  major="${version%%.*}"
  minor="${version#*.}"
  minor="${minor%%.*}"
  if (( major < 2 || (major == 2 && minor < 28) )); then
    die "glibc 版本为 ${major}.${minor}，低于要求的 2.28"
  fi
  log "glibc 版本：${major}.${minor}"
}

check_systemd() {
  command -v systemctl >/dev/null 2>&1 || die "未找到 systemctl，本安装包要求 systemd"
  [[ -d /run/systemd/system ]] || die "systemd 未运行（/run/systemd/system 不存在）"
}

check_port() {
  local in_use=0
  if [[ "$UPGRADE" -eq 1 ]]; then
    log "升级模式：跳过端口占用检查（沿用当前配置端口 ${PORT}）"
    return 0
  fi
  if command -v ss >/dev/null 2>&1; then
    if ss -H -ltn "sport = :${PORT}" 2>/dev/null | grep -q .; then
      in_use=1
    fi
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${PORT}$"; then
      in_use=1
    fi
  else
    warn "未找到 ss 或 netstat，跳过端口占用检查"
    return 0
  fi
  if [[ "$in_use" -eq 1 ]]; then
    die "端口 ${PORT} 已被占用，请释放后重试，或使用 --port 指定其他端口"
  fi
  log "端口 ${PORT} 可用"
}

check_disk() {
  local dir="$DATA_DIR"
  local avail_kb=""
  while [[ ! -d "$dir" && "$dir" != "/" ]]; do
    dir="$(dirname -- "$dir")"
  done
  avail_kb="$(df -Pk "$dir" 2>/dev/null | awk 'NR==2 {print $4}' || true)"
  if [[ -n "$avail_kb" ]] && (( avail_kb < 50 * 1024 * 1024 )); then
    warn "数据目录所在磁盘可用空间不足 50GB（当前约 $(( avail_kb / 1024 / 1024 ))GB），点云等大文件可能导致磁盘写满"
  fi
}

prepare_user_and_dirs() {
  if ! getent group "$APP_USER" >/dev/null 2>&1; then
    groupadd --system "$APP_USER"
  fi
  if ! getent passwd "$APP_USER" >/dev/null 2>&1; then
    local nologin="/usr/sbin/nologin"
    [[ -x "$nologin" ]] || nologin="/sbin/nologin"
    [[ -x "$nologin" ]] || nologin="/bin/false"
    useradd --system --gid "$APP_USER" --home-dir "$DATA_DIR" --shell "$nologin" "$APP_USER"
  fi
  install -d -m 0755 "$INSTALL_DIR"
  install -d -m 0750 "$DATA_DIR"
  install -d -m 0755 "$ENV_DIR"
  chown "$APP_USER:$APP_USER" "$DATA_DIR"
  chmod 0750 "$DATA_DIR"
  log "系统用户 ${APP_USER} 与数据目录 ${DATA_DIR} 已就绪"
}

require_package_files() {
  local missing=0
  local file
  for file in \
    "${PKG_DIR}/app/server/dist/server.js" \
    "${PKG_DIR}/app/server/prisma/schema.prisma" \
    "${PKG_DIR}/app/server/prisma/seed.bundle.mjs" \
    "${PKG_DIR}/app/server/tools/node_modules/prisma/build/index.js" \
    "${PKG_DIR}/runtime/node/bin/node" \
    "${PKG_DIR}/runtime/ffmpeg/bin/ffmpeg" \
    "${PKG_DIR}/runtime/micromamba" \
    "${PKG_DIR}/runtime/geo-explicit.txt" \
    "${PKG_DIR}/runtime/wheels" \
    "${PKG_DIR}/install.sh" \
    "${PKG_DIR}/backup.sh" \
    "${PKG_DIR}/restore.sh" \
    "${PKG_DIR}/uninstall.sh"; do
    if [[ ! -e "$file" ]]; then
      warn "安装包缺少：${file#"${PKG_DIR}/"}"
      missing=1
    fi
  done
  if [[ "$missing" -eq 1 ]]; then
    die "安装包不完整，请重新下载完整的离线安装包"
  fi
}

copy_program_files() {
  install -d -m 0755 "$INSTALL_DIR" "$INSTALL_DIR/app" "$INSTALL_DIR/runtime" "$INSTALL_DIR/bin"
  cp -a "${PKG_DIR}/app/." "${INSTALL_DIR}/app/"
  cp -a "${PKG_DIR}/runtime/." "${INSTALL_DIR}/runtime/"
  install -m 0755 "${PKG_DIR}/install.sh" "${INSTALL_DIR}/bin/install.sh"
  install -m 0755 "${PKG_DIR}/backup.sh" "${INSTALL_DIR}/bin/backup.sh"
  install -m 0755 "${PKG_DIR}/restore.sh" "${INSTALL_DIR}/bin/restore.sh"
  install -m 0755 "${PKG_DIR}/uninstall.sh" "${INSTALL_DIR}/bin/uninstall.sh"
  install -m 0644 "${PKG_DIR}/README.md" "${INSTALL_DIR}/README.md"
  install -m 0644 "${PKG_DIR}/VERSION" "${INSTALL_DIR}/VERSION"
  chown -R root:root "${INSTALL_DIR}/app" "${INSTALL_DIR}/runtime" "${INSTALL_DIR}/bin"
  chmod 0755 "${INSTALL_DIR}/runtime/node/bin/node"
  chmod 0755 "${INSTALL_DIR}/runtime/ffmpeg/bin/ffmpeg"
  chmod 0755 "${INSTALL_DIR}/runtime/micromamba"
  log "程序文件已复制到 ${INSTALL_DIR}"
}

random_hex() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
    return 0
  fi
  if [[ -r /dev/urandom ]]; then
    od -An -N "$bytes" -tx1 /dev/urandom | tr -d ' \n'
    return 0
  fi
  return 1
}

build_env_content() {
  local port="$1"
  local data_dir="$2"
  local install_dir="$3"
  local version="$4"
  local jwt_secret="$5"
  local admin_password="$6"
  cat <<EOF
# 由 install.sh 生成；请勿手工改动格式，修改后需重启服务
PORT=${port}
DATA_DIR="${data_dir}"
DATABASE_URL="file:${data_dir}/app.db"
JWT_SECRET=${jwt_secret}
ADMIN_INIT_PASSWORD=${admin_password}
WEB_DIST="${install_dir}/app/web/dist"
GDAL_BIN_DIR="${install_dir}/runtime/geo/bin"
PY3DTILES_CMD="${install_dir}/runtime/geo/bin/py3dtiles"
FFMPEG_PATH="${install_dir}/runtime/ffmpeg/bin/ffmpeg"
NODE_ENV=production
APP_VERSION=${version}
PYTHONDONTWRITEBYTECODE=1
EOF
}

write_env_file() {
  local target="$1"
  local content="$2"
  local previous_umask=""
  previous_umask="$(umask)"
  install -d -m 0755 "$(dirname -- "$target")"
  umask 077
  printf '%s\n' "$content" > "$target"
  chmod 0600 "$target"
  umask "$previous_umask"
}

ensure_env_file() {
  local target="$1"
  local content="$2"
  if [[ -e "$target" ]]; then
    return 1
  fi
  write_env_file "$target" "$content"
  return 0
}

create_env_file() {
  local jwt_secret=""
  local admin_password=""
  local content=""
  if [[ -f "$ENV_FILE" ]]; then
    chmod 0600 "$ENV_FILE"
    log "配置文件已存在，保持不覆盖：${ENV_FILE}"
  else
    jwt_secret="$(random_hex 32)" || die "无法生成随机密钥（缺少 openssl 且 /dev/urandom 不可读）"
    admin_password="$(random_hex 8)" || die "无法生成初始管理员密码"
    content="$(build_env_content "$PORT" "$DATA_DIR" "$INSTALL_DIR" "$VERSION" "$jwt_secret" "$admin_password")"
    ensure_env_file "$ENV_FILE" "$content" || log "配置文件已存在，保持不覆盖：${ENV_FILE}"
    chmod 0600 "$ENV_FILE"
    log "已写入配置文件 ${ENV_FILE}（权限 600，含随机密钥）"
  fi
  ADMIN_PASSWORD="$(read_env_value ADMIN_INIT_PASSWORD "$ENV_FILE")"
}

read_env_value() {
  local key="$1"
  local file="$2"
  local line=""
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  printf '%s' "$line"
}

load_existing_env() {
  [[ -f "$ENV_FILE" ]] || die "升级失败：找不到配置文件 ${ENV_FILE}"
  local env_port=""
  local env_data_dir=""
  env_port="$(read_env_value PORT "$ENV_FILE")"
  env_data_dir="$(read_env_value DATA_DIR "$ENV_FILE")"
  [[ -n "$env_port" ]] || die "配置文件缺少 PORT：${ENV_FILE}"
  [[ -n "$env_data_dir" ]] || die "配置文件缺少 DATA_DIR：${ENV_FILE}"
  PORT="$env_port"
  DATA_DIR="${env_data_dir%/}"
  validate_port "$PORT"
  validate_data_dir "$DATA_DIR"
  log "沿用现有配置：端口 ${PORT}，数据目录 ${DATA_DIR}"
}

install_geo_env() {
  local mamba="${INSTALL_DIR}/runtime/micromamba"
  local geo_dir="${INSTALL_DIR}/runtime/geo"
  local explicit_src="${INSTALL_DIR}/runtime/geo-explicit.txt"
  local pkgs_dir="${INSTALL_DIR}/runtime/geo-pkgs"
  local wheels_dir="${INSTALL_DIR}/runtime/wheels"
  local mamba_cache="${INSTALL_DIR}/runtime/.mamba-cache"
  local explicit_local=""
  local line=""
  local local_path=""

  [[ -x "$mamba" ]] || die "缺少 micromamba：${mamba}"
  [[ -f "$explicit_src" ]] || die "缺少 conda explicit 清单：${explicit_src}"
  [[ -d "$wheels_dir" ]] || die "缺少 Python wheels 目录：${wheels_dir}"

  rm -rf "$geo_dir"
  explicit_local="$(mktemp)"
  {
    printf '@EXPLICIT\n'
    grep -v '^@EXPLICIT' "$explicit_src" \
      | grep -v '^[[:space:]]*$' \
      | sed -e "s#https://conda.anaconda.org/conda-forge/#file://${pkgs_dir}/#" \
        -e "s#http://conda.anaconda.org/conda-forge/#file://${pkgs_dir}/#"
  } > "$explicit_local"

  while IFS= read -r line; do
    case "$line" in
      '' | @EXPLICIT) continue ;;
    esac
    local_path="${line#file://}"
    if [[ ! -f "$local_path" ]]; then
      rm -f "$explicit_local"
      die "离线 conda 包缺失：${local_path}"
    fi
  done < "$explicit_local"

  install -d -m 0755 "$mamba_cache"
  log "使用 micromamba 离线创建 GDAL/Python 环境（可能需要几分钟）"
  if ! MAMBA_ROOT_PREFIX="$mamba_cache" "$mamba" --no-rc create --yes --offline \
    --prefix "$geo_dir" --file "$explicit_local"; then
    rm -f "$explicit_local"
    die "GDAL 离线环境创建失败，请检查 ${pkgs_dir} 中的安装包是否完整"
  fi
  rm -f "$explicit_local"

  log "从本地 wheels 安装 py3dtiles"
  if ! "${geo_dir}/bin/python" -m pip install --no-index --find-links "$wheels_dir" \
    --no-build-isolation --disable-pip-version-check "py3dtiles[las]"; then
    die "py3dtiles 离线安装失败，请检查 ${wheels_dir}"
  fi

  "${geo_dir}/bin/gdalinfo" --version >/dev/null || die "GDAL 安装校验失败"
  "${geo_dir}/bin/python" -c "import py3dtiles" || die "py3dtiles 安装校验失败"
  rm -rf "$mamba_cache"
  log "GDAL 与 py3dtiles 离线环境已就绪"
}

init_database() {
  local node="${INSTALL_DIR}/runtime/node/bin/node"
  local prisma_cli="${INSTALL_DIR}/app/server/tools/node_modules/prisma/build/index.js"
  local schema="${INSTALL_DIR}/app/server/prisma/schema.prisma"
  [[ -x "$node" ]] || die "缺少 Node.js 运行时：${node}"
  [[ -f "$prisma_cli" ]] || die "安装包缺少 Prisma CLI：${prisma_cli}"

  log "初始化 / 校验数据库结构（prisma db push，不删除数据）"
  (
    cd "${INSTALL_DIR}/app/server"
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
    export NODE_ENV=production
    export PRISMA_HIDE_UPDATE_MESSAGE=1
    export CHECKPOINT_DISABLE=1
    "$node" "$prisma_cli" db push --skip-generate --schema "$schema"
  )
  chown "$APP_USER:$APP_USER" "$DATA_DIR"
  local db_file
  for db_file in "$DATA_DIR"/app.db*; do
    [[ -e "$db_file" ]] || continue
    chown "$APP_USER:$APP_USER" "$db_file"
  done
}

seed_database() {
  local node="${INSTALL_DIR}/runtime/node/bin/node"
  local seed="${INSTALL_DIR}/app/server/prisma/seed.bundle.mjs"
  [[ -f "$seed" ]] || die "安装包缺少 seed 脚本：${seed}"
  log "创建初始管理员账号（若已存在则跳过）"
  (
    cd "${INSTALL_DIR}/app/server"
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
    export NODE_ENV=production
    "$node" "$seed"
  )
  chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
  chmod 0750 "$DATA_DIR"
}

write_service_unit() {
  local node="${INSTALL_DIR}/runtime/node/bin/node"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=VIS Platform (GoView + Fastify)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${INSTALL_DIR}/app/server
EnvironmentFile=${ENV_FILE}
Environment=HOME=${DATA_DIR}
ExecStart=${node} ${INSTALL_DIR}/app/server/dist/server.js
Restart=always
RestartSec=3
LimitNOFILE=65535
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
  chmod 0644 "$SERVICE_FILE"
  log "systemd 单元已写入 ${SERVICE_FILE}"
}

health_check() {
  local node="${INSTALL_DIR}/runtime/node/bin/node"
  local started_at=0
  started_at=$SECONDS
  while (( SECONDS - started_at < HEALTH_TIMEOUT )); do
    # shellcheck disable=SC2016
    if "$node" -e '
      const port = process.argv[1];
      fetch(`http://127.0.0.1:${port}/api/goview/health`, { signal: AbortSignal.timeout(2000) })
        .then(async (response) => {
          const body = await response.json();
          process.exit(body && body.code === 200 && body.data && body.data.status === "ok" ? 0 : 1);
        })
        .catch(() => process.exit(1));
    ' "$PORT" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

print_log_hint() {
  warn "查看服务日志：journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
  warn "服务状态：systemctl status ${SERVICE_NAME}"
}

collect_ipv4_addresses() {
  local ips=""
  ips="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+(\.[0-9]+){3}$' | grep -v '^127\.' | sort -u || true)"
  if [[ -z "$ips" ]] && command -v ip >/dev/null 2>&1; then
    ips="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | sort -u || true)"
  fi
  printf '%s\n' "$ips"
}

print_summary() {
  local ips=""
  local ip=""
  local port_suffix=""
  [[ "$PORT" == "80" ]] || port_suffix=":${PORT}"
  ips="$(collect_ipv4_addresses)"
  printf '\n============================================================\n'
  printf ' VIS Platform %s 部署完成\n' "$VERSION"
  printf '============================================================\n'
  if [[ -n "$ips" ]]; then
    while IFS= read -r ip; do
      [[ -n "$ip" ]] || continue
      printf ' 访问地址：http://%s%s\n' "$ip" "$port_suffix"
    done <<< "$ips"
  else
    printf ' 访问地址：http://<服务器IP>%s\n' "$port_suffix"
  fi
  printf ' 本机健康检查：http://127.0.0.1%s/api/goview/health\n' "$port_suffix"
  printf ' 管理员账号：admin\n'
  if [[ "$UPGRADE" -eq 1 ]]; then
    printf ' 管理员密码：沿用原有密码（升级不会修改）\n'
  else
    printf ' 初始密码：%s\n' "${ADMIN_PASSWORD:-（见安装输出或配置文件）}"
    printf ' 首次登录需要修改密码！\n'
  fi
  printf '\n 程序目录：%s\n' "$INSTALL_DIR"
  printf ' 数据目录：%s\n' "$DATA_DIR"
  printf ' 配置文件：%s（权限 600）\n' "$ENV_FILE"
  printf '\n 常用命令：\n'
  printf '   systemctl status %s\n' "$SERVICE_NAME"
  printf '   systemctl restart %s\n' "$SERVICE_NAME"
  printf '   journalctl -u %s -f\n' "$SERVICE_NAME"
  printf '   %s/bin/backup.sh\n' "$INSTALL_DIR"
  printf '============================================================\n'
}

fresh_install() {
  step "1/8" "检查运行环境"
  check_root
  check_arch
  check_glibc
  check_systemd

  if [[ -e "${INSTALL_DIR}/app" || -e "${INSTALL_DIR}/runtime" ]]; then
    die "检测到 ${INSTALL_DIR} 下已有程序，如需升级请执行 ${PKG_DIR}/install.sh --upgrade"
  fi

  check_port
  check_disk
  require_package_files

  step "2/8" "创建系统用户与目录"
  prepare_user_and_dirs

  step "3/8" "复制程序文件"
  copy_program_files

  step "4/8" "生成配置文件"
  create_env_file

  step "5/8" "安装离线 GDAL / py3dtiles 环境"
  install_geo_env

  step "6/8" "初始化数据库"
  init_database
  seed_database

  step "7/8" "注册并启动 systemd 服务"
  write_service_unit
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null
  systemctl restart "$SERVICE_NAME"

  step "8/8" "健康检查"
  if ! health_check; then
    warn "健康检查失败（${HEALTH_TIMEOUT} 秒内未就绪）"
    print_log_hint
    warn "修复问题后可删除 ${INSTALL_DIR} 重新执行全新安装（数据目录 ${DATA_DIR} 不受影响）"
    exit 1
  fi
  log "健康检查通过"
  print_summary
}

upgrade_rollback() {
  trap - ERR
  set +e
  warn "开始回滚到升级前的程序版本..."
  systemctl stop "$SERVICE_NAME" 2>/dev/null
  if [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]]; then
    rm -rf "${INSTALL_DIR}/app" "${INSTALL_DIR}/runtime"
    [[ -d "${BACKUP_DIR}/app" ]] && mv "${BACKUP_DIR}/app" "${INSTALL_DIR}/app"
    [[ -d "${BACKUP_DIR}/runtime" ]] && mv "${BACKUP_DIR}/runtime" "${INSTALL_DIR}/runtime"
  fi
  systemctl daemon-reload 2>/dev/null
  systemctl start "$SERVICE_NAME" 2>/dev/null
  if health_check; then
    warn "回滚完成，旧版本服务已恢复。"
  else
    warn "回滚后健康检查仍然失败，请查看日志：journalctl -u ${SERVICE_NAME} -n 200 --no-pager"
  fi
  if [[ -n "$BACKUP_DIR" ]]; then
    warn "备份目录保留在：${BACKUP_DIR}"
  fi
  exit 1
}

on_error() {
  local rc=$?
  trap - ERR
  if [[ "$UPGRADE_IN_PROGRESS" -eq 1 ]]; then
    upgrade_rollback
  fi
  printf '\n错误：命令执行失败（退出码 %s），安装中止。\n' "$rc" >&2
  printf '失败命令：%s\n' "$BASH_COMMAND" >&2
  if [[ -d "${INSTALL_DIR}/app" ]]; then
    printf '如需重新执行全新安装，请先删除 %s（数据目录 %s 不受影响）。\n' "$INSTALL_DIR" "$DATA_DIR" >&2
  fi
  exit "$rc"
}

upgrade_install() {
  step "1/7" "检查运行环境"
  check_root
  check_arch
  check_glibc
  check_systemd
  load_existing_env
  check_disk
  require_package_files

  [[ -d "${INSTALL_DIR}/app" ]] || die "${INSTALL_DIR}/app 不存在，无法升级；请执行全新安装"
  [[ -d "${INSTALL_DIR}/runtime" ]] || die "${INSTALL_DIR}/runtime 不存在，无法升级；请执行全新安装"

  step "2/7" "停止服务并备份当前程序"
  BACKUP_DIR="${INSTALL_DIR}/backup-$(date +%Y%m%d-%H%M%S)"
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  install -d -m 0755 "$BACKUP_DIR"
  if ! mv "${INSTALL_DIR}/app" "${BACKUP_DIR}/app"; then
    systemctl start "$SERVICE_NAME" 2>/dev/null || true
    die "备份旧程序 app 失败，已尝试重启服务，请检查磁盘与权限"
  fi
  if ! mv "${INSTALL_DIR}/runtime" "${BACKUP_DIR}/runtime"; then
    mv "${BACKUP_DIR}/app" "${INSTALL_DIR}/app"
    systemctl start "$SERVICE_NAME" 2>/dev/null || true
    die "备份旧程序 runtime 失败，已恢复 app 并尝试重启服务"
  fi
  UPGRADE_IN_PROGRESS=1
  log "旧程序已移动到 ${BACKUP_DIR}"

  step "3/7" "安装新程序文件"
  copy_program_files

  step "4/7" "重建离线 GDAL / py3dtiles 环境"
  install_geo_env

  step "5/7" "升级数据库结构（保留数据）"
  init_database

  step "6/7" "重启服务"
  write_service_unit
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null
  systemctl restart "$SERVICE_NAME"

  step "7/7" "健康检查"
  if ! health_check; then
    warn "升级后健康检查失败，自动回滚"
    upgrade_rollback
  fi
  UPGRADE_IN_PROGRESS=0
  log "健康检查通过"
  printf '\n升级成功。旧版本程序备份在：%s\n' "$BACKUP_DIR"
  printf '确认新版本稳定后可删除该备份目录以释放磁盘空间。\n'
  print_summary
}

dry_run_plan() {
  local upgrade_text="全新安装"
  [[ "$UPGRADE" -eq 1 ]] && upgrade_text="升级安装"
  log "[dry-run] 模式：${upgrade_text}；以下操作只会打印，不会修改系统。"
  log "[dry-run] 安装包目录：${PKG_DIR}，版本：${VERSION}，架构：${ARCH}"
  log "[dry-run] 1. 检查 root 权限、CPU 架构、glibc >= 2.28、systemd、端口 ${PORT} 占用、磁盘剩余空间"
  if [[ "$UPGRADE" -eq 1 ]]; then
    log "[dry-run] 2. 读取现有配置 ${ENV_FILE}（PORT / DATA_DIR）"
    log "[dry-run] 3. systemctl stop ${SERVICE_NAME}，将 app 与 runtime 移动到 ${INSTALL_DIR}/backup-<时间戳>"
    log "[dry-run] 4. 复制新版本 app 与 runtime 到 ${INSTALL_DIR}"
  else
    log "[dry-run] 2. 创建系统用户 ${APP_USER}、程序目录 ${INSTALL_DIR}、数据目录 ${DATA_DIR}"
    log "[dry-run] 3. 复制安装包中的 app 与 runtime 到 ${INSTALL_DIR}"
    log "[dry-run] 4. 生成 ${ENV_FILE}（权限 600，已存在则不覆盖）"
  fi
  log "[dry-run] 5. micromamba 离线创建 ${INSTALL_DIR}/runtime/geo，随后从本地 wheels 安装 py3dtiles"
  log "[dry-run] 6. 使用 Prisma 执行 db push --skip-generate；全新安装随后执行 seed"
  log "[dry-run] 7. 写入 ${SERVICE_FILE}，systemctl daemon-reload / enable / restart"
  log "[dry-run] 8. 轮询 http://127.0.0.1:${PORT}/api/goview/health，最多 ${HEALTH_TIMEOUT} 秒"
  log "[dry-run] 将生成的配置项：PORT DATA_DIR DATABASE_URL JWT_SECRET（随机） ADMIN_INIT_PASSWORD（随机）"
  log "[dry-run]                   WEB_DIST GDAL_BIN_DIR PY3DTILES_CMD FFMPEG_PATH NODE_ENV APP_VERSION"
  if [[ "$UPGRADE" -eq 1 ]]; then
    log "[dry-run] 升级健康检查失败时，会用备份目录自动回滚 app 与 runtime。"
  fi
  log "[dry-run] 完成。未做任何修改。"
}

main() {
  parse_args "$@"
  read_metadata
  if [[ "$DRY_RUN" -eq 1 ]]; then
    dry_run_plan
    exit 0
  fi
  trap on_error ERR
  if [[ "$UPGRADE" -eq 1 ]]; then
    upgrade_install
  else
    fresh_install
  fi
}

if [[ "${BASH_SOURCE[0]:-}" == "${0}" ]]; then
  main "$@"
fi
