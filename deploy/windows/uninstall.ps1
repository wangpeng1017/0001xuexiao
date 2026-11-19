# 卸载 vis-platform（默认保留数据目录；加 -PurgeData 才删除数据）
[CmdletBinding()]
param([switch]$PurgeData)
$ErrorActionPreference = 'Stop'
$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceName = 'VisPlatform'
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host '请用管理员 PowerShell 运行' -ForegroundColor Red; exit 1
}
$dataDir = $null
$envFile = Join-Path $InstallDir 'vis.env'
if (Test-Path $envFile) {
  $m = Select-String -Path $envFile -Pattern '^DATA_DIR=(.*)$' | Select-Object -First 1
  if ($m) { $dataDir = $m.Matches[0].Groups[1].Value }
}
$svcExe = Join-Path $InstallDir "$ServiceName.exe"
if (Get-Service $ServiceName -ErrorAction SilentlyContinue) {
  Stop-Service $ServiceName -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  if (Test-Path $svcExe) { & $svcExe uninstall | Out-Null }
}
Get-NetFirewallRule -DisplayName 'VIS Platform' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($PurgeData -and $dataDir -and (Test-Path $dataDir)) {
  Remove-Item $dataDir -Recurse -Force
  Write-Host "已删除数据目录 $dataDir"
} elseif ($dataDir) {
  Write-Host "已保留数据目录 $dataDir（如需删除，重新运行并加 -PurgeData）"
}
# 脚本自身在安装目录内，交给后台进程在退出后删除
Start-Process cmd.exe -ArgumentList "/c timeout /t 2 >nul & rmdir /s /q `"$InstallDir`"" -WindowStyle Hidden
Write-Host '卸载完成。'
