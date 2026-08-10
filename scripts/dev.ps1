# UTF-8 safe launcher for 牛马联盟 desktop app.
# 用法：powershell -ExecutionPolicy Bypass -NoProfile -File .\scripts\dev.ps1
$ErrorActionPreference = 'Stop'

chcp 65001 > $null
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'
$env:NODE_OPTIONS = "--enable-source-maps $env:NODE_OPTIONS".Trim()

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $ProjectRoot

Write-Output "[nmlm] UTF-8 mode enabled. Starting desktop app..."
npm run dev
