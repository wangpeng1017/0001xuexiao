#!/usr/bin/env bash
# vis-platform 卸载脚本
set -euo pipefail

SERVICE_NAME="vis-platform"
APP_USER="vis"
INSTALL_DIR="/opt/vis-platform"
ENV_DIR="/etc/vis-platform"
ENV_FILE="${ENV_DIR}/vis.env"
DEFAULT_DATA_DIR="/data/vis-platform"
DATA_DIR=""

PURGE=0
ASSUME_YES=0

log() {
  printf '%s\n' "$*"
}

die() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法：uninstall.sh [选项]

选项：
  --purge      同时删除数据目录、配置文件和系统用户（默认保留）
  --yes        不再交互确认
  -h, --help   显示本帮助

默认行为：停止并删除服务与程序目录，保留数据目录和配置文件。
EOF
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --purge)
        PURGE=1
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

resolve_data_dir() {
  if [[ -f "$ENV_FILE" ]]; then
    DATA_DIR="$(read_env_value DATA_DIR "$ENV_FILE")"
  fi
  [[ -n "$DATA_DIR" ]] || DATA_DIR="$DEFAULT_DATA_DIR"
  DATA_DIR="${DATA_DIR%/}"
  [[ "$DATA_DIR" == /* ]] || die "数据目录必须是绝对路径：${DATA_DIR}"
  [[ "$DATA_DIR" != "/" ]] || die "数据目录不能是根目录"
}

confirm() {
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    return 0
  fi
  if [[ "$PURGE" -eq 1 ]]; then
    printf '警告：--purge 将删除程序、配置和全部数据（%s）。确认继续？[yes/N] ' "$DATA_DIR"
  else
    printf '将卸载程序和 systemd 服务，但保留数据与配置。确认继续？[yes/N] '
  fi
  local answer=""
  read -r answer
  case "$answer" in
    yes | YES | y | Y | 是) return 0 ;;
    *) die "已取消卸载" ;;
  esac
}

main() {
  parse_args "$@"
  [[ "$(id -u)" -eq 0 ]] || die "请使用 root 用户执行本脚本"
  resolve_data_dir
  confirm

  if systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1; then
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  fi
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload 2>/dev/null || true

  if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    log "已删除程序目录：${INSTALL_DIR}"
  fi

  if [[ "$PURGE" -eq 1 ]]; then
    rm -rf "$DATA_DIR" "$ENV_DIR"
    log "已删除数据目录与配置：${DATA_DIR}、${ENV_DIR}"
    if getent passwd "$APP_USER" >/dev/null 2>&1; then
      userdel "$APP_USER" 2>/dev/null || log "用户 ${APP_USER} 删除失败（可能有进程占用），可稍后手动删除"
    fi
    if getent group "$APP_USER" >/dev/null 2>&1; then
      groupdel "$APP_USER" 2>/dev/null || true
    fi
    log "注意：/data/vis-platform-backups 下的备份未删除，如有需要请手动清理。"
  else
    log "数据目录已保留：${DATA_DIR}"
    log "配置文件已保留：${ENV_DIR}"
    log "如需彻底删除，请执行：uninstall.sh --purge"
  fi

  log "卸载完成。"
}

main "$@"
