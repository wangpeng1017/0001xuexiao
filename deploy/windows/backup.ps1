# 备份数据（数据库 + 上传文件 + 配置）到 zip。服务会短暂停止以保证 SQLite 一致。
# 用法：.\backup.ps1 [-OutDir D:\backups]
[CmdletBinding()]
param([string]$OutDir = 'C:\vis-platform-backups')
$ErrorActionPreference = 'Stop'
$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceName = 'VisPlatform'
$envFile = Join-Path $InstallDir 'vis.env'
$m = Select-String -Path $envFile -Pattern '^DATA_DIR=(.*)$' | Select-Object -First 1
if (-not $m) { Write-Host "无法从 $envFile 读取 DATA_DIR" -ForegroundColor Red; exit 1 }
$dataDir = $m.Matches[0].Groups[1].Value
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$out = Join-Path $OutDir ("vis-backup-{0}.zip" -f (Get-Date -Format yyyyMMdd-HHmmss))
$svc = Get-Service $ServiceName -ErrorAction SilentlyContinue
$wasRunning = $svc -and $svc.Status -eq 'Running'
try {
  if ($wasRunning) { Stop-Service $ServiceName -Force; Start-Sleep -Seconds 2 }
  $stage = Join-Path $env:TEMP "vis-backup-$PID"
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  robocopy $dataDir (Join-Path $stage 'data') /E /XD logs /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw 'robocopy 失败' }
  Copy-Item $envFile (Join-Path $stage 'vis.env')
  Compress-Archive -Path "$stage\*" -DestinationPath $out -CompressionLevel Fastest
  Remove-Item $stage -Recurse -Force
  Write-Host "备份完成：$out" -ForegroundColor Green
} finally {
  if ($wasRunning) { Start-Service $ServiceName }
}
