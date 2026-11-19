# 从 backup.ps1 生成的 zip 恢复数据（会覆盖当前数据目录，先自动备份一份当前数据）
# 用法：.\restore.ps1 -BackupZip C:\vis-platform-backups\vis-backup-xxxx.zip
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$BackupZip)
$ErrorActionPreference = 'Stop'
$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceName = 'VisPlatform'
if (-not (Test-Path $BackupZip)) { Write-Host "找不到备份文件：$BackupZip" -ForegroundColor Red; exit 1 }
$envFile = Join-Path $InstallDir 'vis.env'
$m = Select-String -Path $envFile -Pattern '^DATA_DIR=(.*)$' | Select-Object -First 1
$dataDir = $m.Matches[0].Groups[1].Value
Write-Host "将用 $BackupZip 覆盖 $dataDir" -ForegroundColor Yellow
& (Join-Path $InstallDir 'backup.ps1') -OutDir (Join-Path (Split-Path $dataDir -Parent) 'vis-pre-restore')
$stage = Join-Path $env:TEMP "vis-restore-$PID"
Expand-Archive -LiteralPath $BackupZip -DestinationPath $stage -Force
Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
robocopy (Join-Path $stage 'data') $dataDir /MIR /XD logs /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'robocopy 恢复失败' }
Remove-Item $stage -Recurse -Force
Start-Service $ServiceName
Write-Host '恢复完成，服务已重启。' -ForegroundColor Green
