# SHIP-PROFILE — 多源数据融合处理软件平台（学校私有化版）发版档案

> 一键验收脚本：`bash scripts/ship-check.sh`（L1 → 启动本机测试环境 → L2 接口业务链路 → 汇总；L1 失败即停）
> 浏览器 UI 验证由王老师手工完成（2026-10-25 决定），清单见 `docs/手工测试清单.md`

## 构建与静态检查
- 后端类型检查：`cd server && pnpm typecheck`
- 前端类型检查：`cd web && pnpm exec vue-tsc --noEmit`；口径为 **src 下新增错误 = 0**（`node_modules/@types/lodash` 与旧版 TS 不兼容的 4 条为既有基线）
- Lint：未配置
- 构建：`cd web && pnpm build`（脚本内置 4GB 堆内存）；`cd server && pnpm build`

## 测试矩阵（全绿定义，任何一项失败都禁止发版）
| 层 | 命令 | 覆盖内容 |
|----|------|---------|
| L1 后端单测 | `cd server && pnpm test` | 鉴权守卫（全量枚举路由）、外部命令唯一入口守卫、登录锁定、强制改密、用户与 CSV、项目全生命周期与越权、团队与乐观锁、素材、模板、数据集 SQL 白名单、分片上传与转换队列、FLV 解析、健康检查 |
| L1 前端 | `cd web && pnpm build` + vue-tsc | 构建成功、src 新增类型错误 0 |
| L1 离线检查 | ship-check.sh 内置：`web/dist` 中出现的外网主机不得超出 `scripts/offline-host-baseline.txt` | 防止新引入外网依赖（运行时的最终确认由手工清单的 Network 面板检查完成） |
| L1 部署脚本 | `bash deploy/test/run.sh` | 语法检查、参数解析、env 生成、dry-run |
| L2 接口业务链路 | `node scripts/smoke-api.mjs`（ship-check.sh 自动执行） | 健康检查 → admin 强制改密 → 建学生 → 学生按 GoView 原样参数建大屏并保存 → 未发布匿名不可读 → 发布可读 → 取消发布不可读 → 支持格式 ≥200 → RESTful 数据集公开出口 → 越权 403 → 删除 |
| L3 浏览器手工 | 王老师按 `docs/手工测试清单.md` 执行 | 全部界面操作与离线网络检查 |

## 测试环境（本机直跑）
- 部署命令：`bash scripts/ship-check.sh` 自动完成：web/server 构建 → 用全新临时 DATA_DIR 执行 `db push` 和 `db:seed` → 以 `WEB_DIST=web/dist PORT=3901` 启动后端 → 跑完自动结束进程并清理
- 地址：http://localhost:3901
- 冒烟方式：轮询 `/api/goview/health` → 执行 L2 接口脚本
- 测试数据：每次都用全新的临时目录，跑完自动清理，不污染开发库

## 线上演示环境（阿里云）
- 地址：http://8.130.182.148:3020/ ，登录：`ssh root@8.130.182.148`（密钥登录，密码和密钥不写入本档案）
- **共用服务器**：同机有 LIMS、宇树等其他项目，只能操作 PM2 的 `vis-platform`，不要动其他服务、nginx 和 `mysql-lims`；内存 3.5GB、磁盘紧张，部署前先看 `df -h /`
- 目录：程序 `/root/vis-platform`（`server/` + `web/dist`，不是 git 仓库，也不是 install.sh 安装），配置 `server/.env`，数据 `/root/vis-platform-data`
- 服务器没有 curl、python3，探测用 node；Node 20.19，不在服务器上构建
- 部署步骤：
  1. 本机 `bash deploy/build-package.sh --arch x64 --version <版本>`，从安装包抽出 `app/` 和 `VERSION` 上传，校验 sha256
  2. 解压到 `/root/vis-platform.new`（`app/server`、`app/web` 移到其根目录），复制旧的 `server/.env`，给 `server/tools/node_modules/@prisma/engines/schema-engine-*` 补执行位
  3. `pm2 stop vis-platform`，备份 `app.db` 和数据目录到 `/root/backups/vis-platform-<时间>`，并核对备份可读
  4. 旧程序改名 `/root/vis-platform.bak-<时间>`，新目录改名 `/root/vis-platform`
  5. 在 `server/` 下加载 `.env`，执行 `node tools/node_modules/prisma/build/index.js db push --skip-generate --schema prisma/schema.prisma`（**不加** `--accept-data-loss`），再执行 `node prisma/seed.bundle.mjs`
  6. `pm2 restart vis-platform`，健康检查通过后 `pm2 save`
- 失败回滚：换回旧程序目录，用备份恢复 `app.db`，重启 `vis-platform`
- 部署后验证：公网 `/api/goview/health` 版本正确、`/files/templates/*.png` 封面 200、其他 PM2 应用未重启；界面操作由王老师用 admin 验证（线上管理员密码不在档案内）
- 注意：seed 会覆盖预置模板，已用模板新建的项目不受影响
- 当前版本：`1.0.0-rc.2`（代码 `1646b89`，2026-11-14 部署，王老师验证通过）

## 生产环境（学校内网）
- **尚未部署**。学校内网是离线服务器，用离线安装包交付，**不用 Docker**
- **学校服务器是 Windows Server 2019（10.10.30.207，RDP 端口 23389）**，交付用 Windows 包：`bash deploy/windows/build-package-win.sh --version <版本>`（Git Bash，需联网；`VIS_SKIP_BUILD=1` 沿用已构建的前后端）→ `.tools/deploy-out/vis-platform-<版本>-windows-x64.zip`；目标机管理员 PowerShell 运行 `install.ps1`（WinSW 服务 + 防火墙放行），说明见 `deploy/windows/安装说明.md`。2026-11-17 已在本机 Windows 11 实装验证（服务、健康检查、GDAL、ffmpeg、LAS→3D Tiles 13.8M 点 167 秒转换通过），尚未在 Server 2019 真机验证
- Linux 包（tar.gz + install.sh + systemd）保留，供 Linux 服务器使用；其 ffmpeg 固定标签已被上游清理，重新打 Linux 包前需更新
- 交付前必须先在 Linux 测试机实跑一次 `install.sh`（目前只跑过 dry-run）
- `install.sh --upgrade` 目前不导入预置内容，已安装的系统升级前要先解决这一点
- 在学校内网部署之前，ship 到“测试环境验证 + 推送 GitHub”为止；需要线上演示时再按上一节部署到阿里云，内网发版一步标记为“不适用”

## GitHub
- 远程：`origin` = https://github.com/wangpeng1017/0001xuexiao.git（凭据走 Git Credential Manager）
- 分支：`main`（推送命令 `git push -u origin main`）
- 排除目录：`node_modules/`、`dist/`、`server/data/`、`artifacts/`、`*.db`

## 文档同步清单
- `docs/PRD.md`：功能状态、变更历史
- `docs/API-*.md`：接口契约（接口有改动时先改这里）
