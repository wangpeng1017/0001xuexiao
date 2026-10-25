# SHIP-PROFILE — 多源数据融合可视化平台（学校私有化版）发版档案

> 一键验收脚本：`bash scripts/ship-check.sh`（L1 → 构建 → 启动测试环境 → L2 业务链路 → 汇总表）

## 构建与静态检查
- 后端类型检查：`cd server && pnpm typecheck`
- 前端类型检查：`cd web && pnpm exec vue-tsc --noEmit`（GoView 原有代码有遗留错误；口径为**新增错误数 = 0**，基线记在 `scripts/vue-tsc-baseline.txt`）
- Lint：未配置
- 构建：`cd web && pnpm build`；`cd server && pnpm build`

## 测试矩阵（全绿定义，任何一项失败都禁止发版）
| 层 | 命令 | 覆盖内容 |
|----|------|---------|
| L1 后端单测 | `cd server && pnpm test` | 路由鉴权守卫（全量枚举）、登录与锁定、强制改密码、用户管理与 CSV 导入、项目全生命周期、越权、上传 |
| L1 前端构建 | `cd web && pnpm build` + vue-tsc 新增错误为 0 | 编译通过 |
| L1 离线检查 | `scripts/ship-check.sh` 内置：grep `web/dist` 中的外网地址，与白名单比对 | 运行时零外网请求 |
| L2 业务链路 | `node scripts/e2e-m1.mjs`（Playwright，无头 Chromium） | 见下方“业务链路” |

- UI 改动验证方式：L2 Playwright 脚本 + 关键页面截图存到 `artifacts/`

### L2 业务链路（M1）
1. admin 首次登录 → 被强制修改密码 → 修改成功后进入项目页
2. admin 新建用户；CSV 批量导入 2 个学生（其中 1 行故意写错）→ 结果正确
3. 学生登录（强制改密码）→ 新建大屏 → 编辑器里拖入一个柱状图 → 保存
4. 项目列表：重命名 → 复制 → 拖拽排序 → 刷新后顺序保持
5. 发布 → 无痕上下文匿名打开预览链接，能看到图表 → 取消发布 → 匿名打开显示“未发布”
6. 学生 B 看不到学生 A 的项目；直接调用接口编辑 A 的项目返回 403
7. 删除项目 → 从列表消失

## 测试环境（本机直跑）
- 部署命令：`bash scripts/ship-check.sh` 自动完成：web 打包 → server 打包 → 用全新临时 DATA_DIR 执行 `db:push` 和 `db:seed` → 以 `WEB_DIST=../web/dist PORT=3901` 启动后端
- 地址：http://localhost:3901
- 冒烟方式：`curl /api/goview/sys/getOssInfo` 返回 code 200 → 执行 L2 脚本
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
