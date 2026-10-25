# VIS Platform 离线部署手册

本平台**不使用 Docker**。交付物是一个离线安装包，在学校不联网的 Linux 服务器上解压后执行
`./install.sh` 即可完成安装。运行时不访问外网，也不需要预装 Node.js、GDAL、ffmpeg 或 Python。

安装包文件名：

```
vis-platform-<版本>-linux-<x64|arm64>.tar.gz
vis-platform-<版本>-linux-<x64|arm64>.tar.gz.sha256
```

## 1. 服务器要求

| 项目 | 要求 |
|------|------|
| CPU 架构 | x86_64（x64 包）或 aarch64/arm64（arm64 包） |
| 操作系统 | 主流 Linux，glibc >= 2.28，systemd（Ubuntu 20.04+/22.04、麒麟 V10、openEuler 等） |
| 权限 | root |
| 磁盘 | 建议程序盘 20GB 以上；数据盘 500GB 以上（点云按原始文件 2 倍预留） |
| 内存 / CPU | 16GB / 4 核起步，点云转换和栅格切片建议 32GB / 8 核 |
| 端口 | 对内网开放 80（或安装时指定的端口） |
| 网络 | 安装与运行都不需要外网；如需视频和数据接入，需能访问摄像头 RTSP 与相关业务系统 |
| 依赖软件 | 无（脚本会用安装包内自带的 Node.js、GDAL、py3dtiles、ffmpeg） |

> 注意：安装包与服务器架构必须一致。x64 包不能装在 arm64 服务器上，反之亦然。

## 2. 安装包内容

```
vis-platform-<版本>-linux-<arch>/
├── install.sh              # 安装 / 升级入口
├── backup.sh               # 数据备份
├── restore.sh              # 数据恢复
├── uninstall.sh            # 卸载
├── README.md               # 本手册
├── vis.env.example         # 配置文件示例
├── VERSION                 # 版本号
├── ARCH                    # 目标架构（x64 / arm64）
├── app/
│   ├── server/             # 后端编译产物 + 生产依赖 + Prisma CLI
│   └── web/dist/           # 前端静态资源
└── runtime/
    ├── node/               # Node.js 官方 Linux 二进制
    ├── ffmpeg/             # ffmpeg 静态二进制、许可证、源码说明
    ├── micromamba          # 离线创建 conda 环境用
    ├── geo-pkgs/           # conda-forge 离线安装包
    ├── geo-explicit.txt    # conda 包清单
    ├── wheels/             # py3dtiles 及依赖的离线 wheels
    └── BUILD-INFO.txt      # 构建信息与固定版本
```

安装后的目录：

| 路径 | 用途 |
|------|------|
| `/opt/vis-platform` | 程序目录（app、runtime、运维脚本） |
| `/data/vis-platform` | 数据目录（app.db、files 上传文件） |
| `/etc/vis-platform/vis.env` | 环境配置，权限 600 |
| `/etc/systemd/system/vis-platform.service` | systemd 服务单元 |
| `/data/vis-platform-backups` | `backup.sh` 默认备份输出目录 |

## 3. 安装前检查

1. 校验安装包完整性（将两个文件放在同一目录）：

   ```bash
   sha256sum -c vis-platform-<版本>-linux-<arch>.tar.gz.sha256
   ```

2. 确认服务器架构：

   ```bash
   uname -m    # x86_64 对应 x64 包；aarch64 对应 arm64 包
   ```

3. 确认 80 端口空闲（如被 Nginx 等占用，可改用 `--port`）：

   ```bash
   ss -ltnp | grep ':80 '
   ```

4. 检查 glibc：

   ```bash
   getconf GNU_LIBC_VERSION    # 应 >= 2.28
   ```

## 4. 全新安装

```bash
tar -xzf vis-platform-<版本>-linux-<arch>.tar.gz
cd vis-platform-<版本>-linux-<arch>
chmod +x install.sh backup.sh restore.sh uninstall.sh
sudo ./install.sh
```

可选参数：

```bash
sudo ./install.sh --port 8080                     # 监听 8080
sudo ./install.sh --data-dir /data/vis-platform   # 自定义数据目录
sudo ./install.sh --dry-run                       # 只打印将执行的操作，不改系统
```

安装脚本依次执行：

1. 检查 root、CPU 架构、glibc、systemd、端口占用、磁盘空间（不足 50GB 会警告）；
2. 创建系统用户 `vis`（nologin）和数据目录；
3. 复制程序到 `/opt/vis-platform`；
4. 用 micromamba **离线**创建 GDAL/Python 环境，并用本地 wheels 安装 py3dtiles；
5. 生成 `/etc/vis-platform/vis.env`（随机 JWT 密钥、随机初始管理员密码，权限 600，已存在不覆盖）；
6. 执行 `prisma db push --skip-generate` 初始化数据库，再创建初始管理员；
7. 注册 systemd 服务并设置开机自启（80 端口通过 `CAP_NET_BIND_SERVICE` 绑定）；
8. 轮询健康接口，最多 60 秒；
9. 打印访问地址、管理员账号与初始密码。

安装成功后，终端会输出类似：

```
访问地址：http://192.168.1.10
管理员账号：admin
初始密码：xxxxxxxxxxxxxxxx
首次登录需要修改密码！
```

> 请立即记录初始密码，并在首次登录后修改。之后该密码不会再次显示（可在 vis.env 中看到
> `ADMIN_INIT_PASSWORD`，但账号已存在时它不再生效）。

如果服务器启用了防火墙，请放行服务端口：

```bash
firewall-cmd --permanent --add-port=80/tcp && firewall-cmd --reload   # firewalld
ufw allow 80/tcp                                                      # ufw
```

## 5. 升级

升级不会修改数据目录和 `vis.env`，只替换程序文件并执行数据库结构升级（`prisma db push`，不会删除数据）。

```bash
tar -xzf vis-platform-<新版本>-linux-<arch>.tar.gz
cd vis-platform-<新版本>-linux-<arch>
chmod +x install.sh
sudo ./install.sh --upgrade
```

升级流程：

1. 读取现有 `vis.env` 中的端口与数据目录；
2. 停止服务，把旧的 `app` 与 `runtime` 移动到 `/opt/vis-platform/backup-<时间戳>/`；
3. 复制新程序，重建离线 GDAL/py3dtiles 环境；
4. 停止状态下执行 `prisma db push --skip-generate`；
5. 启动服务并健康检查；
6. **健康检查失败会自动回滚**到备份的 `app` 与 `runtime`，并重新启动旧版本。

升级成功后请确认：

```bash
systemctl status vis-platform
journalctl -u vis-platform -n 50 --no-pager
curl http://127.0.0.1/api/goview/health
```

确认稳定后可删除备份目录释放空间：

```bash
rm -rf /opt/vis-platform/backup-<时间戳>
```

> 跨架构升级（例如从 x64 换成 arm64 服务器）不在 `--upgrade` 范围内，请备份数据后在新服务器全新安装再恢复数据。

> 自动回滚只恢复 `app` 与 `runtime` 程序文件；数据库结构由 `prisma db push` 升级，不会自动降级。
> 因此重大版本升级前请先执行 `backup.sh`，并在测试环境验证。

## 6. 备份与恢复

### 6.1 备份

```bash
# 使用默认路径（读取 vis.env 中的数据目录，输出到 /data/vis-platform-backups）
sudo /opt/vis-platform/bin/backup.sh

# 自定义输出目录
sudo /opt/vis-platform/bin/backup.sh --out-dir /data/backups
```

- 有 `sqlite3` 时使用 `.backup` 在线备份，服务不中断；
- 没有 `sqlite3` 时会短暂停止服务，复制数据库文件后再启动；
- 上传文件会打包为 `files.tar.gz`；
- 备份目录内包含 `MANIFEST.txt`；若存在配置文件，也会保留一份 `vis.env`（权限 600）。

建议按周备份，并把备份复制到另一台机器或移动硬盘。备份目录不要与数据目录放在同一块故障盘上。

### 6.2 恢复

恢复会覆盖当前数据，脚本会先停止服务，并把现有数据移到数据目录下的 `.restore-safety-<时间戳>`。

```bash
sudo /opt/vis-platform/bin/restore.sh --backup /data/vis-platform-backups/vis-platform-20261024-120000
# 自动化场景可加 --yes 跳过确认
```

恢复后脚本会启动服务并做健康检查。如果恢复过程中出错，服务会保持停止状态，原数据保留在
`/data/vis-platform/.restore-safety-<时间戳>`，请检查备份文件后重试或手动启动服务。

## 7. 常用运维命令

```bash
systemctl status vis-platform          # 查看状态
systemctl restart vis-platform         # 重启
systemctl stop vis-platform            # 停止
systemctl start vis-platform           # 启动
systemctl enable vis-platform          # 开机自启（安装时已设置）

journalctl -u vis-platform -f          # 实时日志
journalctl -u vis-platform -n 200 --no-pager
journalctl -u vis-platform --since "1 hour ago"

cat /opt/vis-platform/VERSION          # 当前版本
cat /etc/vis-platform/vis.env          # 配置（含密钥，注意权限）
ls -lah /data/vis-platform             # 数据目录
du -sh /data/vis-platform /opt/vis-platform

curl http://127.0.0.1/api/goview/health   # 健康检查（无 curl 时可用浏览器访问）
```

健康接口返回示例：

```json
{"code":200,"msg":"ok","data":{"status":"ok","version":"1.0.0","db":"ok"}}
```

修改端口或数据目录等配置后需要重启服务。**不要手工修改 vis.env 的格式**（键=值，路径含空格会破坏解析）。

## 8. 故障排查

### 8.1 端口被占用

安装时提示端口被占用：

```bash
ss -ltnp | grep ':80 '
```

释放端口或改用 `--port 8080` 重新安装（安装后访问地址要带端口号）。

> 通过 `--port` 安装后，升级时端口从 `vis.env` 读取，不需要再次指定。

### 8.2 磁盘满

```bash
df -h /data /opt
du -sh /data/vis-platform/* | sort -h
journalctl --disk-usage
journalctl --vacuum-size=200M
```

常见占用：点云原始文件与转换结果、上传文件、旧升级备份（`/opt/vis-platform/backup-*`）、
旧数据备份（`/data/vis-platform-backups`）。清理前请先确认可以删除。

### 8.3 服务起不来

```bash
systemctl status vis-platform -l
journalctl -u vis-platform -n 200 --no-pager
```

按日志排查：

| 现象 | 排查点 |
|------|--------|
| `缺少 JWT_SECRET` | `vis.env` 是否完整、是否被误改 |
| `EACCES` / `SQLITE_CANTOPEN` | `/data/vis-platform` 是否属于 `vis` 用户、磁盘是否满 |
| `libquery_engine-*.so.node` 找不到 | 使用了错误架构的安装包；重新用对应架构包安装 |
| `Error: Cannot find module` | 安装包不完整，重新解压并校验 SHA256 |
| 80 端口无权限 | 不要手工改 ExecStart；systemd 单元已配置 `AmbientCapabilities=CAP_NET_BIND_SERVICE` |
| 健康检查超时 | `journalctl` 看启动日志；确认数据库结构已完成 `db push` |

检查运行用户与权限：

```bash
id vis
ls -ld /opt/vis-platform /data/vis-platform /etc/vis-platform/vis.env
```

### 8.4 GDAL / py3dtiles 相关

```bash
/opt/vis-platform/runtime/geo/bin/gdalinfo --version
/opt/vis-platform/runtime/geo/bin/python -c "import py3dtiles; print(py3dtiles.__version__)"
/opt/vis-platform/runtime/ffmpeg/bin/ffmpeg -version
```

如果重新安装后这些命令失败，通常是安装包下载不完整。请重新获取安装包并校验 SHA256，再执行升级。

### 8.5 SELinux（麒麟 / openEuler）

若系统启用 SELinux 且服务无法读取数据目录，可先查看：

```bash
getenforce
ausearch -m avc -ts recent
```

临时验证：`setenforce 0` 后重启服务，如恢复则说明是 SELinux 策略问题。生产环境建议为
`/data/vis-platform` 设置合适的上下文（例如 `chcon -R -t var_t /data/vis-platform`），或联系系统管理员添加策略，
不建议长期关闭 SELinux。

### 8.6 浏览器打不开

- 确认使用的是服务器内网 IP，而不是 127.0.0.1；
- 确认防火墙已放行端口；
- 使用 Chrome / Edge 新版本（需要 WebGL2），不支持 IE；
- 大屏三维渲染在浏览器端完成，客户端需要可用的显卡/WebGL。

## 9. 卸载

默认保留数据与配置：

```bash
sudo /opt/vis-platform/bin/uninstall.sh
```

彻底删除程序、配置、数据与系统用户（不可恢复，务必先备份）：

```bash
sudo /opt/vis-platform/bin/uninstall.sh --purge --yes
```

`/data/vis-platform-backups` 下的备份不会被自动删除，请按需清理。

## 10. 构建安装包（打包机操作）

> 本节给研发/交付人员使用，学校服务器不需要执行。

打包机需要：联网、Node.js + pnpm + npm、Python 3 + pip、curl 或 wget、tar。
Linux 或 Windows Git Bash 均可；建议 Linux x64，便于验证 Prisma 引擎。

```bash
bash deploy/build-package.sh --arch x64 --version 1.0.0
bash deploy/build-package.sh --arch arm64 --version 1.0.0
```

输出：`.tools/deploy-out/vis-platform-<版本>-linux-<arch>.tar.gz` 与 `.sha256`。

修改部署脚本后可先运行静态检查与 dry-run 单测（不会联网、不会改动系统）：

```bash
bash deploy/test/run.sh
```

脚本固定并校验以下组件（见 `deploy/build-package.sh` 顶部常量）：

| 组件 | 固定版本 / 来源 |
|------|----------------|
| Node.js | v22.23.4，nodejs.org 官方 `SHASUMS256.txt` |
| ffmpeg | BtbN/FFmpeg-Builds 固定 autobuild（LGPL 静态构建），`checksums.sha256` |
| micromamba | 2.9.0-0 官方 release，`.sha256` |
| GDAL 等 | conda-forge，micromamba `--dry-run --json` 解析，包文件随包分发 |
| py3dtiles | 12.1.1（PyPI wheel/sdist），按 manylinux2014 平台下载 |

构建要点：

- 后端生产依赖在 staging 目录用 pnpm 重新安装（hoisted），Prisma Client 生成 6 个 Linux 引擎；
- Prisma CLI 单独安装到 `app/server/tools`，通过 `PRISMA_CLI_BINARY_TARGETS` 预置目标平台的 schema-engine；
- seed 在打包机用 esbuild 编译为 `seed.bundle.mjs`，目标机不需要 tsx；
- 安装包不含 `server/.env` 等本地敏感文件。

更新组件版本时，修改脚本顶部常量，并确认新的 SHA256 清单可访问。**不要跳过哈希校验**。

目标机验收（在 Linux 测试机执行）：

1. 断网，全新系统，执行 `./install.sh`，记录耗时（目标 10 分钟内）；
2. 登录、修改密码、新建大屏、上传点云（验证 GDAL/py3dtiles）、配置 RTSP（验证 ffmpeg）；
3. 执行 `./install.sh --upgrade`，确认数据保留、健康检查通过；
4. 模拟升级失败（例如故意替换坏程序）验证自动回滚；
5. 执行 `backup.sh`，删除测试数据后 `restore.sh` 恢复；
6. 卸载并确认数据保留，再 `--purge` 清理。

## 11. 安全建议

- 首次登录必须修改管理员密码；
- `/etc/vis-platform/vis.env` 权限保持 600，不要提交到版本库或发送到聊天工具；
- 服务以 `vis` 普通用户运行，仅保留绑定 80 端口的能力；
- 不要把数据目录放在 Web 可下载路径之外的其他位置；
- 定期备份并做恢复演练。
