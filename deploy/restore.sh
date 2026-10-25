#!/usr/bin/env bash
# vis-platform 数据恢复脚本
set -euo pipefail

SERVICE_NAME="vis-platform"
DEFAULT_DATA_DIR="/data/vis-platform"
DEFAULT_ENV_FILE="/etc/vis-platform/vis.env"

DATA_DIR=""
ENV_FILE="$DEFAULT_ENV_FILE"
BACKUP_DIR=""
ASSUME_YES=0

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
用法：restore.sh --backup <备份目录> [选项]

选项：
  --backup <目录>     必填，backup.sh 生成的备份目录
  --data-dir <目录>   数据目录，默认从 vis.env 读取，否则 /data/vis-platform
  --env-file <文件>   配置文件路径，默认 /etc/vis-platform/vis.env
  --yes               不再交互确认（危险操作，请确认备份正确）
  -h, --help          显示本帮助
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
      --backup)
        [[ $# -ge 2 ]] || die "--backup 需要一个目录"
        BACKUP_DIR="$2"
        shift 2
        ;;
      --backup=*)
        BACKUP_DIR="${1#*=}"
        shift
        ;;
      --data-dir)
        [[ $# -ge 2 ]] || die "--data-dir 需要一个目录"
        DATA_DIR="$2"
        shift 2
        ;;
      --data-dir=*)
        DATA_DIR="${1#*=}"
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
      --yes)
        ASSUME_YES=1
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
  [[ -n "$BACKUP_DIR" ]] || die "必须使用 --backup 指定备份目录"
}

resolve_paths() {
  [[ -d "$BACKUP_DIR" ]] || die "备份目录不存在：${BACKUP_DIR}"
  [[ -f "${BACKUP_DIR}/app.db" ]] || die "备份中缺少 app.db：${BACKUP_DIR}/app.db"

  if [[ -z "$DATA_DIR" && -f "$ENV_FILE" ]]; then
    DATA_DIR="$(read_env_value DATA_DIR "$ENV_FILE")"
  fi
  [[ -n "$DATA_DIR" ]] || DATA_DIR="$DEFAULT_DATA_DIR"
  DATA_DIR="${DATA_DIR%/}"
  [[ "$DATA_DIR" == /* ]] || die "数据目录必须是绝对路径：${DATA_DIR}"
  [[ "$DATA_DIR" != "/" ]] || die "数据目录不能是根目录"
  install -d -m 0750 "$DATA_DIR"
}

confirm() {
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    return 0
  fi
  printf '将用 %s 覆盖 %s 中的数据库和文件，确认继续？[yes/N] ' "$BACKUP_DIR" "$DATA_DIR"
  local answer=""
  read -r answer
  case "$answer" in
    yes | YES | y | Y | 是) return 0 ;;
    *) die "已取消恢复" ;;
  esac
}

stop_service() {
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "停止服务 ${SERVICE_NAME}"
    systemctl stop "$SERVICE_NAME"
  fi
}

start_service() {
  log "启动服务 ${SERVICE_NAME}"
  systemctl start "$SERVICE_NAME"
}

health_check() {
  local node="/opt/vis-platform/runtime/node/bin/node"
  local port=""
  [[ -x "$node" ]] || return 1
  if [[ -f "$ENV_FILE" ]]; then
    port="$(read_env_value PORT "$ENV_FILE")"
  fi
  [[ -n "$port" ]] || port="80"
  local started_at=0
  started_at=$SECONDS
  while (( SECONDS - started_at < 60 )); do
    # shellcheck disable=SC2016
    if "$node" -e '
      const port = process.argv[1];
      fetch(`http://127.0.0.1:${port}/api/goview/health`, { signal: AbortSignal.timeout(3000) })
        .then(async (response) => {
          const body = await response.json();
          process.exit(body && body.code === 200 && body.data && body.data.status === "ok" ? 0 : 1);
        })
        .catch(() => process.exit(1));
    ' "$port" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

restore_data() {
  local safety_dir=""
  local has_files=0
  safety_dir="${DATA_DIR}/.restore-safety-$(date '+%Y%m%d-%H%M%S')"
  install -d -m 0700 "$safety_dir"
  [[ -f "${BACKUP_DIR}/files.tar.gz" ]] && has_files=1

  if [[ -f "${DATA_DIR}/app.db" ]]; then
    cp -a "${DATA_DIR}"/app.db* "$safety_dir"/ 2>/dev/null || true
  fi
  if [[ "$has_files" -eq 1 && -d "${DATA_DIR}/files" ]]; then
    mv "${DATA_DIR}/files" "${safety_dir}/files"
  fi

  log "恢复数据库"
  rm -f "${DATA_DIR}/app.db-wal" "${DATA_DIR}/app.db-shm"
  cp -a "${BACKUP_DIR}/app.db" "${DATA_DIR}/app.db"
  if [[ -f "${BACKUP_DIR}/app.db-wal" ]]; then
    cp -a "${BACKUP_DIR}/app.db-wal" "${DATA_DIR}/app.db-wal"
  fi
  if [[ -f "${BACKUP_DIR}/app.db-shm" ]]; then
    cp -a "${BACKUP_DIR}/app.db-shm" "${DATA_DIR}/app.db-shm"
  fi

  if [[ "$has_files" -eq 1 ]]; then
    log "恢复上传文件"
    tar -xzf "${BACKUP_DIR}/files.tar.gz" -C "$DATA_DIR"
  fi

  chown -R vis:vis "$DATA_DIR"
  chmod 0750 "$DATA_DIR"
  log "恢复前的原数据已保留在：${safety_dir}"
}

main() {
  parse_args "$@"
  [[ "$(id -u)" -eq 0 ]] || die "请使用 root 用户执行本脚本"
  resolve_paths
  confirm

  if [[ ! -f "$ENV_FILE" && -f "${BACKUP_DIR}/vis.env" ]]; then
    install -d -m 0755 "$(dirname -- "$ENV_FILE")"
    install -m 0600 "${BACKUP_DIR}/vis.env" "$ENV_FILE"
    log "已恢复缺失的配置文件：${ENV_FILE}"
  fi

  stop_service
  trap 'warn "恢复失败，服务保持停止状态，请检查备份文件"; exit 1' ERR
  restore_data
  trap - ERR
  start_service

  if health_check; then
    log "恢复完成，健康检查通过。"
  else
    warn "数据已恢复，但健康检查未通过。"
    warn "查看日志：journalctl -u ${SERVICE_NAME} -n 100 --no-pager"
    exit 1
  fi
}

main "$@"
