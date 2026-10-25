#!/usr/bin/env bash
# vis-platform 数据备份脚本
set -euo pipefail

SERVICE_NAME="vis-platform"
DEFAULT_DATA_DIR="/data/vis-platform"
DEFAULT_BACKUP_ROOT="/data/vis-platform-backups"
DEFAULT_ENV_FILE="/etc/vis-platform/vis.env"

DATA_DIR=""
BACKUP_ROOT=""
ENV_FILE="$DEFAULT_ENV_FILE"
RESTART_SERVICE=0

log() {
  printf '%s\n' "$*"
}

warn() {
  printf '警告：%s\n' "$*" >&2
}

die() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：backup.sh [选项]

选项：
  --data-dir <目录>   数据目录，默认从 /etc/vis-platform/vis.env 读取，否则 /data/vis-platform
  --out-dir <目录>    备份输出根目录，默认 /data/vis-platform-backups
  --env-file <文件>   配置文件路径，默认 /etc/vis-platform/vis.env
  -h, --help          显示本帮助

说明：
  有 sqlite3 时使用 ".backup" 在线备份数据库；没有 sqlite3 时会短暂停止服务再复制。
EOF
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

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --data-dir)
        [[ $# -ge 2 ]] || die "--data-dir 需要一个目录"
        DATA_DIR="$2"
        shift 2
        ;;
      --data-dir=*)
        DATA_DIR="${1#*=}"
        shift
        ;;
      --out-dir)
        [[ $# -ge 2 ]] || die "--out-dir 需要一个目录"
        BACKUP_ROOT="$2"
        shift 2
        ;;
      --out-dir=*)
        BACKUP_ROOT="${1#*=}"
        shift
        ;;
      --env-file)
        [[ $# -ge 2 ]] || die "--env-file 需要一个文件"
        ENV_FILE="$2"
        shift 2
        ;;
      --env-file=*)
        ENV_FILE="${1#*=}"
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
}

validate_data_dir() {
  [[ "$DATA_DIR" == /* ]] || die "数据目录必须是绝对路径：${DATA_DIR}"
  [[ "$DATA_DIR" != "/" ]] || die "数据目录不能是根目录"
}

resolve_data_dir() {
  if [[ -z "$DATA_DIR" && -f "$ENV_FILE" ]]; then
    DATA_DIR="$(read_env_value DATA_DIR "$ENV_FILE")"
  fi
  [[ -n "$DATA_DIR" ]] || DATA_DIR="$DEFAULT_DATA_DIR"
  DATA_DIR="${DATA_DIR%/}"
  validate_data_dir
  [[ -d "$DATA_DIR" ]] || die "数据目录不存在：${DATA_DIR}"
  [[ -f "${DATA_DIR}/app.db" ]] || die "未找到数据库文件：${DATA_DIR}/app.db"
}

start_service_if_needed() {
  if [[ "$RESTART_SERVICE" -eq 1 ]]; then
    warn "备份完成后重新启动服务"
    if systemctl start "$SERVICE_NAME"; then
      RESTART_SERVICE=0
    else
      warn "服务重启失败，请立即手动执行：systemctl start ${SERVICE_NAME}"
    fi
  fi
}

backup_database() {
  local backup_dir="$1"
  local db_path="${DATA_DIR}/app.db"
  if command -v sqlite3 >/dev/null 2>&1; then
    log "使用 sqlite3 .backup 在线备份数据库"
    (
      cd "$backup_dir" || exit 1
      sqlite3 "$db_path" ".backup app.db"
    )
    sqlite3 "${backup_dir}/app.db" "PRAGMA integrity_check;" | grep -qx "ok" \
      || die "备份数据库完整性检查失败"
  else
    warn "未找到 sqlite3，将停止服务后复制数据库文件"
    if systemctl is-active --quiet "$SERVICE_NAME"; then
      RESTART_SERVICE=1
      systemctl stop "$SERVICE_NAME"
      trap start_service_if_needed EXIT
    fi
    cp -a "${DATA_DIR}"/app.db* "$backup_dir"/
    log "数据库文件已复制（服务已恢复后请自行验证）"
    start_service_if_needed
    trap - EXIT
  fi
}

backup_files() {
  local backup_dir="$1"
  if [[ -d "${DATA_DIR}/files" ]]; then
    log "打包上传文件目录"
    tar -czf "${backup_dir}/files.tar.gz" -C "$DATA_DIR" files
  else
    log "上传文件目录不存在，跳过"
  fi
}

write_manifest() {
  local backup_dir="$1"
  local version="unknown"
  if [[ -f /opt/vis-platform/VERSION ]]; then
    version="$(tr -d '[:space:]' < /opt/vis-platform/VERSION)"
  fi
  {
    printf 'backup_time=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf 'hostname=%s\n' "$(hostname 2>/dev/null || echo unknown)"
    printf 'version=%s\n' "$version"
    printf 'data_dir=%s\n' "$DATA_DIR"
    printf 'database=app.db\n'
    printf 'files=files.tar.gz\n'
  } > "${backup_dir}/MANIFEST.txt"
}

main() {
  parse_args "$@"
  [[ "$(id -u)" -eq 0 ]] || die "请使用 root 用户执行本脚本"
  resolve_data_dir
  [[ -n "$BACKUP_ROOT" ]] || BACKUP_ROOT="$DEFAULT_BACKUP_ROOT"

  local stamp=""
  local backup_dir=""
  stamp="$(date '+%Y%m%d-%H%M%S')"
  backup_dir="${BACKUP_ROOT}/vis-platform-${stamp}"
  install -d -m 0700 "$BACKUP_ROOT"
  install -d -m 0700 "$backup_dir"

  backup_database "$backup_dir"
  backup_files "$backup_dir"
  if [[ -f "$ENV_FILE" ]]; then
    install -m 0600 "$ENV_FILE" "${backup_dir}/vis.env"
  fi
  write_manifest "$backup_dir"

  log "备份完成：${backup_dir}"
  du -sh "$backup_dir" 2>/dev/null || true
  log "恢复方法：restore.sh --backup ${backup_dir}"
}

main "$@"
