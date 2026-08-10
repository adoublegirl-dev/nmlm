# UTF-8 safe launcher for 牛马联盟 MCP server.
# 桌面端需先启动。用法：powershell -ExecutionPolicy Bypass -NoProfile -File .\scripts\mcp.ps1
param(
  [string]$Api = 'http://127.0.0.1:37129/api/call'
)
$ErrorActionPreference = 'Stop'

chcp 65001 > $null
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'
$env:NMLM_API = $Api

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $ProjectRoot

node .\src\mcp\server.mjs
