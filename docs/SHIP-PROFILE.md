# SHIP-PROFILE — 多源数据融合可视化平台（学校私有化版）发版档案

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

## 生产环境
- **目前还没有**。生产环境是学校内网的离线服务器，M5 交付离线安装包（tar.gz + install.sh + systemd，**不用 Docker**）时再补充本节
- M1~M4 的 ship 到“测试环境验证 + 推送 GitHub”为止，生产发版这一步标记为“不适用”

## GitHub
- 远程：`origin` = https://github.com/wangpeng1017/0001xuexiao.git（凭据走 Git Credential Manager）
- 分支：`main`（推送命令 `git push -u origin main`）
- 排除目录：`node_modules/`、`dist/`、`server/data/`、`artifacts/`、`*.db`

## 文档同步清单
- `docs/PRD.md`：功能状态、变更历史
- `docs/API-*.md`：接口契约（接口有改动时先改这里）
