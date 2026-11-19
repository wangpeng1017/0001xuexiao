# vis-platform Windows 离线安装脚本（Windows Server 2019 / Windows 10+ x64，需管理员 PowerShell）
#
# 用法：
#   .\install.ps1                              全新安装（默认 C:\vis-platform，数据 C:\vis-platform-data，端口 80）
#   .\install.ps1 -Port 8080 -DataDir D:\vis-data
#   .\install.ps1 -Upgrade                     升级程序，保留配置和数据
#   .\install.ps1 -DryRun                      只检查并打印计划
[CmdletBinding()]
param(
  [string]$InstallDir = 'C:\vis-platform',
  [string]$DataDir = 'C:\vis-platform-data',
  [int]$Port = 80,
  [switch]$Upgrade,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$PkgDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceName = 'VisPlatform'
$EnvFile = Join-Path $InstallDir 'vis.env'

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Die($m) { Write-Host "`n错误：$m" -ForegroundColor Red; exit 1 }

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function New-Secret([int]$bytes) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}

# vis.env：KEY=VALUE，每行一项
function Read-EnvFile($path) {
  $h = [ordered]@{}
  foreach ($line in Get-Content -LiteralPath $path -Encoding UTF8) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $h[$Matches[1]] = $Matches[2] }
  }
  return $h
}

function Write-EnvFile($path, $h) {
  $lines = @('# vis-platform 配置（修改后重启服务：Restart-Service VisPlatform）')
  foreach ($k in $h.Keys) { $lines += "$k=$($h[$k])" }
  [IO.File]::WriteAllLines($path, $lines, (New-Object Text.UTF8Encoding($false)))
  # 仅管理员和 SYSTEM 可读（含 JWT 密钥与管理员初始密码）
  icacls $path /inheritance:r /grant:r 'Administrators:F' 'SYSTEM:F' | Out-Null
}

function Escape-Xml($s) { return [Security.SecurityElement]::Escape($s) }

function Test-PortFree([int]$p) {
  $busy = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  return -not $busy
}

# ---------- 前置检查 ----------
if (-not (Test-Admin)) { Die '请用「以管理员身份运行」的 PowerShell 执行本脚本' }
if (-not [Environment]::Is64BitOperatingSystem) { Die '仅支持 64 位 Windows' }
foreach ($p in 'app\server\dist\server.js', 'app\web\dist\index.html', 'runtime\node\node.exe',
  'runtime\ffmpeg\bin\ffmpeg.exe', 'runtime\micromamba.exe', 'runtime\geo-explicit.txt',
  'runtime\winsw\WinSW-x64.exe', 'VERSION') {
  if (-not (Test-Path -LiteralPath (Join-Path $PkgDir $p))) { Die "安装包不完整，缺少：$p" }
}
$Version = (Get-Content -LiteralPath (Join-Path $PkgDir 'VERSION') -Raw).Trim()
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing -and -not $Upgrade) { Die "服务 $ServiceName 已存在。升级请加 -Upgrade，重装请先运行 uninstall.ps1" }
if ($Upgrade -and -not (Test-Path -LiteralPath $EnvFile)) { Die "未找到现有配置 $EnvFile，无法升级" }
if ($Upgrade) {
  $oldEnv = Read-EnvFile $EnvFile
  if ($oldEnv['PORT']) { $Port = [int]$oldEnv['PORT'] }
  if ($oldEnv['DATA_DIR']) { $DataDir = $oldEnv['DATA_DIR'] }
}
if ($Port -lt 1 -or $Port -gt 65535) { Die "端口不合法：$Port" }
if (-not $Upgrade -and -not (Test-PortFree $Port)) { Die "端口 $Port 已被占用（可能是 IIS），请加 -Port 8080 之类换一个" }
$freeGB = [math]::Round((Get-PSDrive ((Split-Path -Qualifier $InstallDir).TrimEnd(':'))).Free / 1GB, 1)
Write-Host "版本 $Version | 程序目录 $InstallDir | 数据目录 $DataDir | 端口 $Port | 程序盘剩余 ${freeGB}GB"
if ($freeGB -lt 5) { Die '程序盘剩余空间不足 5GB' }

if ($DryRun) {
  Write-Host "[dry-run] 将复制程序到 $InstallDir，用 micromamba 离线创建 GDAL/Python 环境，生成 vis.env，初始化数据库，注册服务 $ServiceName，放行防火墙端口 $Port"
  exit 0
}

# ---------- 升级：先停服务并备份程序目录 ----------
$backupApp = $null
if ($Upgrade) {
  Step '停止服务并备份旧程序'
  if ($existing) { Stop-Service $ServiceName -Force; Start-Sleep -Seconds 2 }
  $backupApp = "$InstallDir.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
  New-Item -ItemType Directory -Path $backupApp | Out-Null
  foreach ($d in 'app', 'runtime') { if (Test-Path "$InstallDir\$d") { Move-Item "$InstallDir\$d" $backupApp } }
  # 注意：升级时旧 runtime\geo 随旧目录移走，下面会重建
}

try {
  # ---------- 复制程序 ----------
  Step '复制程序文件'
  New-Item -ItemType Directory -Force -Path $InstallDir, $DataDir | Out-Null
  robocopy (Join-Path $PkgDir 'app') (Join-Path $InstallDir 'app') /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw 'robocopy 复制 app 失败' }
  robocopy (Join-Path $PkgDir 'runtime') (Join-Path $InstallDir 'runtime') /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw 'robocopy 复制 runtime 失败' }
  foreach ($f in 'VERSION', 'uninstall.ps1', 'backup.ps1', 'restore.ps1', '安装说明.md') {
    Copy-Item -LiteralPath (Join-Path $PkgDir $f) -Destination $InstallDir -Force
  }

  # ---------- GDAL / py3dtiles 离线环境 ----------
  Step '离线创建 GDAL / Python 环境（需要几分钟，请耐心等待）'
  $rt = Join-Path $InstallDir 'runtime'
  $geo = Join-Path $rt 'geo'
  $pkgs = Join-Path $rt 'geo-pkgs'
  $uriPkgs = 'file:///' + ($pkgs -replace '\\', '/')
  $explicit = Join-Path $env:TEMP "vis-explicit-$PID.txt"
  $lines = @('@EXPLICIT')
  foreach ($l in (Get-Content -LiteralPath (Join-Path $rt 'geo-explicit.txt') -Encoding UTF8)) {
    if ($l -match '^\s*$' -or $l -eq '@EXPLICIT') { continue }
    $lines += ($l -replace '^https?://conda\.anaconda\.org/conda-forge/', ($uriPkgs + '/'))
  }
  [IO.File]::WriteAllLines($explicit, $lines, (New-Object Text.UTF8Encoding($false)))
  # 忽略用户目录里的 Python 包，只用离线 wheels（否则会误用机器上已有的同名包）
  $env:PYTHONNOUSERSITE = '1'
  $env:MAMBA_ROOT_PREFIX = Join-Path $rt '.mamba-cache'
  & (Join-Path $rt 'micromamba.exe') --no-rc create --yes --offline --prefix $geo --file $explicit
  if ($LASTEXITCODE -ne 0) { throw "GDAL 离线环境创建失败（exit $LASTEXITCODE），请检查 $pkgs 是否完整" }
  Remove-Item $explicit -Force -ErrorAction SilentlyContinue
  & (Join-Path $geo 'python.exe') -m pip install --no-index --find-links (Join-Path $rt 'wheels') `
    --no-build-isolation --disable-pip-version-check 'py3dtiles[las]'
  if ($LASTEXITCODE -ne 0) { throw 'py3dtiles 离线安装失败' }
  & (Join-Path $geo 'python.exe') -c 'import py3dtiles'
  if ($LASTEXITCODE -ne 0) { throw 'py3dtiles 校验失败' }
  if (-not (Test-Path (Join-Path $geo 'Scripts\py3dtiles.exe'))) { throw 'py3dtiles.exe 未生成' }
  # gdal2tiles 装在 Scripts，而平台只认 GDAL_BIN_DIR（Library\bin），拷过去（启动器按同名 -script.py 找脚本）
  foreach ($f in 'gdal2tiles.exe', 'gdal2tiles-script.py') {
    Copy-Item (Join-Path $geo "Scripts\$f") (Join-Path $geo 'Library\bin') -Force
  }
  Remove-Item $env:MAMBA_ROOT_PREFIX -Recurse -Force -ErrorAction SilentlyContinue

  # ---------- 配置 ----------
  Step '生成配置'
  $dataFwd = $DataDir -replace '\\', '/'
  if ($Upgrade) { $cfg = $oldEnv } else {
    $cfg = [ordered]@{
      PORT = "$Port"; DATA_DIR = $DataDir; DATABASE_URL = "file:$dataFwd/app.db"
      JWT_SECRET = (New-Secret 32); ADMIN_INIT_PASSWORD = (New-Secret 9)
    }
  }
  # 以下几项与安装目录绑定，升级时也刷新
  $cfg['WEB_DIST'] = Join-Path $InstallDir 'app\web\dist'
  $cfg['GDAL_BIN_DIR'] = Join-Path $geo 'Library\bin'
  $cfg['GDAL_DATA'] = Join-Path $geo 'Library\share\gdal'
  $cfg['PROJ_DATA'] = Join-Path $geo 'Library\share\proj'
  $cfg['PY3DTILES_CMD'] = Join-Path $geo 'Scripts\py3dtiles.exe'
  $cfg['FFMPEG_PATH'] = Join-Path $rt 'ffmpeg\bin\ffmpeg.exe'
  $cfg['NODE_ENV'] = 'production'
  $cfg['APP_VERSION'] = $Version
  $cfg['PYTHONDONTWRITEBYTECODE'] = '1'
  $cfg['PYTHONNOUSERSITE'] = '1'
  Write-EnvFile $EnvFile $cfg
  $cfg.GetEnumerator() | ForEach-Object { Set-Item -Path "Env:$($_.Key)" -Value $_.Value }
  $env:PATH = "$geo;$geo\Library\bin;$geo\Scripts;$env:PATH"

  # ---------- 数据库 ----------
  Step '初始化数据库（prisma db push，不删数据）'
  $node = Join-Path $rt 'node\node.exe'
  $server = Join-Path $InstallDir 'app\server'
  Push-Location $server
  $env:PRISMA_HIDE_UPDATE_MESSAGE = '1'; $env:CHECKPOINT_DISABLE = '1'
  & $node 'tools\node_modules\prisma\build\index.js' db push --skip-generate --schema 'prisma\schema.prisma'
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'prisma db push 失败' }
  & $node 'prisma\seed.bundle.mjs'
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'seed 失败' }
  Pop-Location

  # ---------- 服务（WinSW） ----------
  Step '注册 Windows 服务'
  $svcExe = Join-Path $InstallDir "$ServiceName.exe"
  if ($Upgrade -and $existing) { & $svcExe uninstall | Out-Null }
  Copy-Item (Join-Path $rt 'winsw\WinSW-x64.exe') $svcExe -Force
  $envXml = ($cfg.GetEnumerator() | ForEach-Object { "  <env name=`"$($_.Key)`" value=`"$(Escape-Xml $_.Value)`"/>" }) -join "`r`n"
  $pathXml = "  <env name=`"PATH`" value=`"$(Escape-Xml "$geo;$geo\Library\bin;$geo\Scripts;$env:SystemRoot\system32;$env:SystemRoot")`"/>"
  $xml = @"
<service>
  <id>$ServiceName</id>
  <name>VIS Platform</name>
  <description>多源数据融合处理软件平台（GoView + Fastify）</description>
  <executable>$node</executable>
  <arguments>$(Escape-Xml (Join-Path $server 'dist\server.js'))</arguments>
  <workingdirectory>$(Escape-Xml $server)</workingdirectory>
$envXml
$pathXml
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="3 sec"/>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>8</keepFiles></log>
  <logpath>$(Escape-Xml (Join-Path $DataDir 'logs'))</logpath>
</service>
"@
  New-Item -ItemType Directory -Force -Path (Join-Path $DataDir 'logs') | Out-Null
  [IO.File]::WriteAllText((Join-Path $InstallDir "$ServiceName.xml"), $xml, (New-Object Text.UTF8Encoding($false)))
  icacls (Join-Path $InstallDir "$ServiceName.xml") /inheritance:r /grant:r 'Administrators:F' 'SYSTEM:F' | Out-Null
  & $svcExe install
  if ($LASTEXITCODE -ne 0) { throw '服务注册失败' }

  # ---------- 防火墙 ----------
  Step "放行防火墙入站端口 $Port"
  Get-NetFirewallRule -DisplayName 'VIS Platform' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName 'VIS Platform' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null

  # ---------- 启动与健康检查 ----------
  Step '启动服务并健康检查'
  & $svcExe start
  $ok = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/goview/health" -TimeoutSec 5
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch { }
  }
  if (-not $ok) { throw "健康检查未通过，请查看日志目录 $DataDir\logs" }
} catch {
  Write-Host "`n安装失败：$($_.Exception.Message)" -ForegroundColor Red
  if ($backupApp) {
    Write-Host "正在回滚到旧版本 ..." -ForegroundColor Yellow
    foreach ($d in 'app', 'runtime') {
      Remove-Item "$InstallDir\$d" -Recurse -Force -ErrorAction SilentlyContinue
      if (Test-Path "$backupApp\$d") { Move-Item "$backupApp\$d" $InstallDir }
    }
    if ($existing) { Start-Service $ServiceName -ErrorAction SilentlyContinue }
  }
  exit 1
}

Step '安装完成'
$ips = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127|169\.254)' }).IPAddress
$portPart = if ($Port -eq 80) { '' } else { ":$Port" }
Write-Host "访问地址（局域网浏览器打开）：" -ForegroundColor Green
$ips | ForEach-Object { Write-Host "  http://$_$portPart/" -ForegroundColor Green }
if (-not $Upgrade) {
  Write-Host "管理员账号：admin    初始密码：$($cfg['ADMIN_INIT_PASSWORD'])（首次登录强制修改，请记录后再关闭窗口）" -ForegroundColor Yellow
}
Write-Host "配置文件：$EnvFile | 数据目录：$DataDir | 日志：$DataDir\logs"
Write-Host "服务管理：Get-Service $ServiceName / Restart-Service $ServiceName"
if ($backupApp) { Write-Host "旧版本程序已备份到 $backupApp，确认无误后可手工删除" }
