# M2~M4 接口与集成契约（三个并行任务共同遵守）

> 通用约定沿用 `docs/API-M1.md` 第 0 节：前缀 `/api/goview`、HTTP 状态码一律 200、看 body.code、列表的 `count` 与 `data` 平级、所有路由必须声明 `config.auth`。
> 三个任务分别在三个 git worktree 里并行开发，最后合并。**本文件是唯一契约；任务之间不能互相依赖对方未合并的代码**，只依赖这里定义的接口和数据结构。

## 0. 并行分工与文件归属（避免合并冲突）

| 任务 | 负责功能 | 后端新增 | 前端新增 |
|---|---|---|---|
| M2 三维 | F007~F011 | 无（只做前端） | `web/src/packages/components/Scenes/**`、`web/src/components/Scene3D/**`（Cesium 封装、图层树、图层弹窗）、Cesium 静态资源 |
| M3 数据 | F012~F014 | `server/src/{routes,services}/{dataset,datafile,video}*.ts`、`server/src/lib/{geo-tools,flv,chunk-upload}*.ts` | 页面 `web/src/views/data/**`（数据集、数据文件、支持格式）、组件 `web/src/packages/components/Informations/Mores/RtspVideo/**` |
| M4 协作素材 | F015~F017 | `server/src/{routes,services}/{team,material,template}*.ts`；修改 `services/project.ts` 的权限和 version | 页面 `web/src/views/team/**`、`web/src/views/material/**`、`web/src/views/project/template/**`；修改项目列表和编辑器保存逻辑 |

**共享文件只允许“追加”，不允许改动别人已有的行**：
- `server/prisma/schema.prisma`：只追加自己的 model；如果要在 `User`/`Project` 上加关系字段，只追加字段行
- `server/src/app.ts`：只追加自己的路由注册行
- `server/test/guard.test.ts`：只往 public 白名单数组里追加自己的路由
- `web/src/router/modules/project.router.ts` 和侧边菜单 `web/src/views/project/layout/components/ProjectLayoutSider/menu.ts`：只追加自己的条目
- `web/package.json`：只追加自己的依赖

## 1. 侧边菜单（最终形态，各任务只追加自己那部分）

```
项目
  ├ 全部项目            （已有）
  ├ 模板库              M4
数据
  ├ 数据集              M3
  ├ 数据文件            M3
  ├ 支持格式            M3
协作与素材
  ├ 团队管理            M4（admin/teacher 可见）
  ├ 素材库              M4
用户管理                （已有，admin）
```

## 2. 数据文件（M3 提供，M2 消费）

DataFile 对象：
```json
{ "id": "", "name": "", "originFormat": "LAS", "kind": "vector|raster|pointcloud|tiles3d",
  "status": "pending|converting|success|failed", "progress": 0, "errorMsg": "",
  "srs": "EPSG:4547", "outputUrl": "", "createTime": "", "createUserName": "" }
```
`outputUrl` 的约定（M2 直接拿来加载）：
| kind | outputUrl | M2 加载方式 |
|---|---|---|
| vector | `/files/datafiles/<id>/data.geojson` | `GeoJsonDataSource` |
| raster | `/files/datafiles/<id>/tiles/{z}/{x}/{y}.png`（XYZ，Google 方案） | `UrlTemplateImageryProvider` |
| pointcloud / tiles3d | `/files/datafiles/<id>/3dtiles/tileset.json` | `Cesium3DTileset.fromUrl` |

| 方法 路径 | 权限 | 说明 |
|---|---|---|
| POST `datafile/upload/init` `{ fileName, size }` | 登录用户 | data `{ uploadId, chunkSize, uploadedChunks: number[] }`；同一用户、同名、同大小的未完成上传会复用 uploadId（断点续传）；chunkSize 固定 8MB |
| PUT `datafile/upload/chunk?uploadId=&index=` | 登录用户 | body 为 `application/octet-stream` 原始字节；单片 ≤ 8MB |
| POST `datafile/upload/complete` `{ uploadId, srs? }` | 登录用户 | 合并分片 → 入队转换；data `{ id }` |
| GET `datafile/list?page&limit&kind&status&keyword` | 登录用户 | 本人的 + admin 看全部；data 为 DataFile 数组 + count |
| GET `datafile/detail?id=` | 登录用户 | 单个 DataFile |
| DELETE `datafile/delete?ids=` | 创建者或 admin | 同时删除磁盘文件 |
| POST `datafile/retry` `{ id, srs? }` | 创建者或 admin | 失败的任务重新转换 |
| GET `datafile/formats` | 登录用户 | data `{ total, groups: [{ name: "栅格"|"矢量"|"三维/点云", items: [{ code, name }] }] }` |

## 3. 数据集（M3）

| 方法 路径 | 权限 | 说明 |
|---|---|---|
| GET `dataset/list?page&limit&keyword` | 登录用户 | 本人的 + admin 看全部；敏感字段（密码）不返回 |
| POST `dataset/create` `{ name, type: "http"|"mysql", config }` | 登录用户 | |
| POST `dataset/edit` `{ id, name?, config? }` | 创建者或 admin | config 里密码为空串表示不修改 |
| DELETE `dataset/delete?ids=` | 创建者或 admin | |
| POST `dataset/test` `{ type, config }` 或 `{ id }` | 登录用户 | 实际请求一次，data 为预览结果（最多 50 行或截断到 64KB） |
| GET `open/dataset/:id/data` | **public** | data 为结果 JSON；**GoView 组件“动态请求”直接填这个地址**（GoView 取 body.data） |

config：
- http：`{ url, method: "GET"|"POST", headers: {k:v}, body: string, dataPath: "data.list" }`
- mysql：`{ host, port, database, user, password, sql }`（只允许单条 SELECT，超时 10 秒，最多 5000 行）

## 4. RTSP 视频（M3）

| 方法 路径 | 权限 | 说明 |
|---|---|---|
| POST `video/register` `{ rtspUrl }` | 登录用户 | 校验必须是 `rtsp://`（开发配置 `VIDEO_ALLOW_FILE=1` 时也允许本地文件路径）；同一个地址返回同一个 streamId；data `{ streamId }` |
| GET `open/video/:streamId.flv` | **public** | HTTP-FLV 直播流；同一个 streamId 共用一个 ffmpeg 进程；最后一个观看者断开 30 秒后结束进程；ffmpeg 不存在或拉流失败时返回 HTTP 502 和文字原因 |

RtspVideo 组件的 option：`{ rtspUrl, streamId, autoplay: true, muted: true, fit: "contain"|"fill"|"cover" }`。编辑器里填好地址后调用 register 拿到 streamId，并保存到 option 中；预览页只用 streamId 播放。

## 5. 团队（M4）

| 方法 路径 | 权限 | 说明 |
|---|---|---|
| GET `team/list` | 登录用户 | admin 看全部；其他人看自己作为成员或负责人的团队；data `[{ id, name, leaderId, leaderName, memberCount, createTime }]` |
| GET `team/detail?id=` | 团队成员或 admin | 含 `members: [{ userId, username, nickname, role }]` |
| POST `team/create` `{ name, leaderId? }` | admin、teacher | 默认由创建者担任负责人，并自动成为成员 |
| POST `team/edit` `{ id, name?, leaderId? }` | 负责人或 admin | |
| DELETE `team/delete?id=` | 负责人或 admin | 团队里的项目改为归创建者个人所有 |
| POST `team/addMembers` `{ id, userIds: [] }` / POST `team/removeMember` `{ id, userId }` | 负责人或 admin | |
| GET `user/options?keyword=` | admin、teacher | 选人下拉框：`[{ id, username, nickname, role }]`，最多返回 50 条，排除已禁用账号 |

## 6. 项目接口变更（M4 修改 `project/*`）

- ProjectItem 增加字段：`teamId`、`teamName`、`isTemplate`、`templateCategory`、`version`、`updateUserName`
- `project/list` 增加参数 `scope=mine|team|all`（all 只有 admin 能用）、`teamId`
- 访问权限：创建者、admin、**项目所属团队的成员**都能读写；删除只允许创建者、团队负责人、admin
- `project/create` 增加可选参数 `teamId`（必须是该团队成员）
- `project/save/data` 增加参数 `version`：如果和库里的版本不一致 → 返回 **code 409**，`data: { updateUserName, updateTime, version }`；带上 `force=1` 时强制覆盖。保存成功返回 `data: { version }`（新的版本号）
- **模板**：
  - POST `project/setTemplate` `{ id, isTemplate: boolean, templateCategory? }`（admin、teacher）
  - GET `project/templates?category=` → 全部模板（所有登录用户可见）
  - POST `project/createFromTemplate` `{ templateId, projectName, teamId? }` → data `{ id }`

## 7. 素材（M4 提供，M2 消费）

Material 对象：`{ id, category: "model"|"map"|"image2d", name, url, thumb, scope: "public"|"private", createUserName, createTime }`

| category | 允许的文件 | url |
|---|---|---|
| model | .glb / .gltf（.gltf 必须打包成 zip 后上传） | `/files/materials/<id>/model.glb` 或 `.../scene.gltf` |
| map | .geojson / XYZ 瓦片 zip（解压后包含 `{z}/{x}/{y}.png`） | `/files/materials/<id>/data.geojson` 或 `/files/materials/<id>/tiles/{z}/{x}/{y}.png` |
| image2d | png/jpg/jpeg/svg/gif/webp | `/files/materials/<id>/<原文件名>` |

| 方法 路径 | 权限 | 说明 |
|---|---|---|
| GET `material/list?category&scope&keyword&page&limit` | 登录用户 | 公共素材 + 本人的私有素材 |
| POST `material/upload`（multipart：`file`、`category`、`name`、`scope`） | 登录用户；只有 admin 能传 public | ≤ 200MB |
| POST `material/thumb?id=`（multipart：`file`） | 创建者或 admin | 前端截图生成缩略图后上传 |
| DELETE `material/delete?ids=` | 创建者或 admin | |

## 8. 三维场景组件 option（M2 定义，M4 的模板会用到）

```json
{
  "sceneMode": "3D|2.5D|2D",
  "camera": { "lon": 116.39, "lat": 39.9, "height": 15000000, "heading": 0, "pitch": -90, "roll": 0 },
  "baseLayer": "naturalEarth",
  "layerSets": [ { "id": "", "name": "", "visible": true,
    "layers": [ { "id": "", "name": "", "type": "raster|vector|model|service|panorama",
                  "source": {}, "visible": true, "opacity": 1, "style": {} } ] } ]
}
```
source 按 type 区分：
- raster：`{ from: "datafile"|"material", refId, url }`
- vector：`{ from, refId, url }`；style：`{ fill, stroke, strokeWidth, pointColor }`
- model：`{ from: "material"|"datafile"|"url", refId, url, format: "gltf"|"3dtiles", position: { lon, lat, height }, rotation: { heading, pitch, roll }, scale }`；点云 style：`{ pointSize, colorBy: "rgb"|"height" }`
- service：`{ product, protocol: "arcgis"|"wms"|"wmts"|"xyz", url, layers, style, tileMatrixSet, format }`
- panorama：`{ points: [ { id, name, lon, lat, imageUrl } ] }`
