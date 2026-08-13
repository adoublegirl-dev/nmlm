# Isolated Windows release pipeline for Niuma Union.
$ErrorActionPreference = 'Stop'

chcp 65001 > $null
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$WorkspaceName = [string]([char]0x725B) + [char]0x9A6C + [char]0x8054 + [char]0x76DF + '-' + [char]0x53D1 + [char]0x884C + [char]0x5DE5 + [char]0x4F5C + [char]0x533A
$ReleaseRoot = Join-Path (Split-Path $ProjectRoot -Parent) $WorkspaceName
$OutputDir = Join-Path $ReleaseRoot 'output'
$ResourceDir = Join-Path $ReleaseRoot 'resources'
Set-Location $ProjectRoot

Write-Host '[1/6] Checking isolated release workspace...'
New-Item -ItemType Directory -Force -Path $OutputDir, $ResourceDir | Out-Null
if (-not (Test-Path (Join-Path $ResourceDir 'icon.ico'))) { throw 'Missing release icon: resources/icon.ico' }

Write-Host '[2/6] Checking Electron process lock...'
$electron = Get-Process -Name electron -ErrorAction SilentlyContinue
if ($electron) { throw 'Electron is still running. Exit the app before packaging.' }

Write-Host '[3/6] Checking source tree for user data...'
$patterns = @('niuma.db', '*.sqlite', '*.sqlite3')
foreach ($pattern in $patterns) {
  $hits = Get-ChildItem $ProjectRoot -File -Recurse -Filter $pattern -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\node_modules\\|\\release\\|\\dist\\' }
  if ($hits) { throw ('Forbidden data file found: ' + ($hits.FullName -join ', ')) }
}

Write-Host '[4/6] Building renderer...'
npm run build:renderer
if ($LASTEXITCODE -ne 0) { throw 'Renderer build failed.' }

Write-Host '[5/6] Rebuilding better-sqlite3 for Electron ABI...'
npm run rebuild
if ($LASTEXITCODE -ne 0) { throw 'Electron ABI rebuild failed.' }

Write-Host '[6/6] Building assisted NSIS installer...'
npx electron-builder --config electron-builder.release.yml --win nsis
if ($LASTEXITCODE -ne 0) { throw 'electron-builder failed.' }

Get-ChildItem $OutputDir -File | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
Write-Host ('Release output: ' + $OutputDir)
