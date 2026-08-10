# Create an ASCII-only junction for MCP clients that dislike Chinese paths.
# 默认创建 C:\nmlm -> 当前项目目录。
# 用法：powershell -ExecutionPolicy Bypass -NoProfile -File .\scripts\create-junction.ps1
param(
  [string]$LinkPath = 'C:\nmlm'
)
$ErrorActionPreference = 'Stop'

chcp 65001 > $null
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (Test-Path $LinkPath) {
  $item = Get-Item $LinkPath -Force
  if ($item.LinkType -eq 'Junction' -and $item.Target -eq $ProjectRoot) {
    Write-Output "[nmlm] Junction already exists: $LinkPath -> $ProjectRoot"
    exit 0
  }
  throw "Path already exists and is not the expected junction: $LinkPath"
}

New-Item -ItemType Junction -Path $LinkPath -Target $ProjectRoot | Out-Null
Write-Output "[nmlm] Created junction: $LinkPath -> $ProjectRoot"
Write-Output "[nmlm] MCP path can use: $LinkPath\src\mcp\server.mjs"
