# M1 接口契约（前后端共同遵守的唯一依据）

> 对应 PRD：F001~F006。前端为 `web/`（GoView master-fetch 二开），后端为 `server/`（Fastify + Prisma + SQLite）。
> 本文件是前后端并行开发的唯一契约。任何一方需要变更，先改这里。

## 0. 通用约定

- 统一前缀：`/api/goview`（与 GoView 的 `axiosPre` 一致）
- 开发端口：前端 Vite `3000`，后端 `3001`；Vite 把 `/api` 和 `/files` 代理到 `http://localhost:3001`
- 生产环境：后端同时托管前端 dist，同源访问，前端 `VITE_PRO_PATH` 置空
- **HTTP 状态码一律 200**，业务结果看响应体里的 `code`：

```json
{ "code": 200, "msg": "ok", "data": {} }
```

| code | 含义 | 前端行为（GoView 现有逻辑） |
|------|------|------|
| 200 | 成功 | — |
| 400 | 参数错误（msg 写明原因） | 弹出 msg |
| 403 | 无权限 | 跳 403 页 |
| 404 | 资源不存在 | 跳 404 页 |
| 500 | 服务器错误 | 跳 500 页 |
| 886 | 未登录 / token 失效 / 账号被禁用 | 跳登录页 |
| 887 | 必须先修改密码 | 跳“修改密码”页 |

- 分页列表：`count` 与 `data` 平级 → `{ "code": 200, "msg": "ok", "data": [...], "count": 37 }`
- 鉴权请求头：`Authorization: Bearer <jwt>`（登录接口返回 `tokenName`/`tokenValue`，GoView 拦截器按 `tokenName` 设置请求头）
- ID 一律为字符串
- 时间一律为 ISO 字符串
- 角色：`admin` | `teacher` | `student`

## 1. 系统 `sys/*`

### POST `/api/goview/sys/login`（免登录）
请求 `{ "username": "", "password": "" }`

响应 data：
```json
{
  "token": { "tokenName": "Authorization", "tokenValue": "Bearer eyJ..." },
  "userinfo": { "id": "", "username": "", "nickname": "", "role": "admin", "mustChangePwd": false }
}
```
失败：code 400，msg 为“用户名或密码错误” / “账号已禁用” / “登录失败次数过多，请 10 分钟后再试”（连续失败 5 次锁定 10 分钟）

### GET `/api/goview/sys/logout`
返回 code 200（JWT 无状态，前端清理本地即可）

### GET `/api/goview/sys/getOssInfo`（免登录）
data：`{ "bucketURL": "" }`（文件 URL 都是完整相对路径，不需要前缀）

### GET `/api/goview/sys/me`
data：同 login 的 `userinfo`

### POST `/api/goview/sys/changePassword`
请求 `{ "oldPassword": "", "newPassword": "" }`，新密码至少 8 位，且同时包含字母和数字。成功后 `mustChangePwd=false`
**注意**：`mustChangePwd=true` 的用户只能调用 `sys/*`，其余接口一律返回 code 887

## 2. 用户管理 `user/*`（仅 admin）

### GET `/api/goview/user/list?page=1&limit=10&keyword=`
data：`[{ "id", "username", "nickname", "role", "disabled", "createTime" }]` + `count`。keyword 模糊匹配用户名或姓名

### POST `/api/goview/user/create`
请求 `{ "username", "nickname", "role", "password"? }`
- username：4~32 位，只允许字母、数字和下划线，唯一
- 不传 password 时由后端生成 10 位随机密码
- data：`{ "id", "initialPassword" }`；新用户 `mustChangePwd=true`

### POST `/api/goview/user/edit`
请求 `{ "id", "nickname"?, "role"?, "disabled"? }`。admin 不能禁用自己，也不能修改自己的角色

### POST `/api/goview/user/resetPassword`
请求 `{ "id" }` → data `{ "initialPassword" }`；同时设置 `mustChangePwd=true`，并清除锁定

### POST `/api/goview/user/import`（multipart，字段名 `file`，UTF-8 CSV，≤1MB）
- 表头：`username,nickname,role[,password]`；role 填 `teacher` / `student`（也接受中文“教师” / “学生”）
- 逐行处理，部分失败不影响其它行
- data：`[{ "line": 2, "username": "", "ok": true, "reason": "", "initialPassword": "" }]`

## 3. 大屏项目 `project/*`

> M1 权限：本人创建的项目 + admin 能看全部。团队维度在 M4 加。

ProjectItem：
```json
{ "id": "", "projectName": "", "state": -1, "createTime": "", "updateTime": "",
  "indexImage": "", "createUserId": "", "createUserName": "", "remarks": "", "sortOrder": 0 }
```
`state`：-1 未发布，1 已发布

| 方法 路径 | 请求 | 说明 |
|---|---|---|
| GET `project/list` | `page, limit` | 按 `sortOrder` 升序、`createTime` 降序；返回 `data` + `count` |
| POST `project/create` | `{ projectName, remarks?, indexImage? }` | data `{ id }`；新项目排在最前（sortOrder = 当前最小值 - 1） |
| GET `project/getData` **（免登录白名单）** | `projectId` | 见下方规则 |
| POST `project/save/data` | `projectId, content`（**同时支持** `application/x-www-form-urlencoded` 和 `multipart/form-data`；content 最大 50MB） | 保存大屏 JSON |
| POST `project/edit` | `{ id, projectName?, indexImage?, remarks? }` | 重命名也走这个接口；projectName 1~50 字 |
| DELETE `project/delete` | query `ids`（逗号分隔） | 逻辑删除 |
| PUT `project/publish` | `{ id, state }` | 1 发布 / -1 取消发布；内容为空（空串、`{}`、`componentList` 为空数组）的项目发布时返回 400“项目还没有内容，请先在编辑器里添加组件并保存，再发布” |
| POST `project/upload` | multipart 字段 `object` | 只允许图片（png/jpg/jpeg/gif/svg/webp），≤10MB；data `{ fileName, fileurl }`，fileurl 形如 `/files/uploads/202610/<uuid>.png` |
| POST `project/copy` **（新增）** | `{ id }` | 复制出“原名-副本”，未发布，排在最前；data `{ id }` |
| PUT `project/sort` **（新增）** | `{ ids: string[] }` | 按数组顺序重写这些项目的 sortOrder（只处理当前用户有权限的项目） |

**getData 规则**（编辑器和预览页共用这一个接口）：
1. 带有效 token，且是项目创建者或 admin → 返回完整 ProjectDetail（ProjectItem + `content`）
2. 否则，如果项目已发布 → 返回完整 ProjectDetail
3. 否则 → 返回 `{ code:200, data:{ id, state:-1, content:"" } }`，不泄露内容；预览页看到 `state=-1` 会跳“未发布”页
4. 项目不存在或已删除 → code 404

## 4. 静态文件

- `GET /files/**` → `DATA_DIR/files/**`（免登录，大屏里的图片需要匿名访问）
- 生产环境：`GET /*` → 前端 dist（SPA，hash 路由，只需提供 index.html）
