# Local Meilisearch launcher for development.
#
# Every flag below exists because of a real failure; do not "simplify" them away:
#   1) --http-addr 127.0.0.1 : running bin\meilisearch.exe bare makes 1.52 bind
#      localhost -> ::1 (IPv6 only). The app connects to MEILI_HOST=http://127.0.0.1:7700
#      (IPv4) and fails forever, so search silently degrades to MySQL.
#   2) TMP/TEMP/TMPDIR -> bin\data.ms\tmp : otherwise Meilisearch writes request
#      payloads into the default temp dir and every document POST fails with
#      "os error 5 (Access denied)", i.e. the index can never be written.
#   3) MEILI_MASTER_KEY from .env : without it /version and friends return 401.
#   4) refuse to start when the port is taken : two processes on one LMDB store
#      corrupt data.ms.
#
# Usage: npm run meili      (Ctrl+C to stop)

$ErrorActionPreference = 'Stop'

# $PSScriptRoot is <repo>\scripts\dev -> go up twice to reach the repo root.
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$exe = Join-Path $repo 'bin\meilisearch.exe'
$dataPath = Join-Path $repo 'bin\data.ms'
$envFile = Join-Path $repo '.env'

if (-not (Test-Path $exe)) {
    Write-Host "[meili] binary not found: $exe" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $dataPath)) {
    Write-Host "[meili] data dir not found: $dataPath" -ForegroundColor Red
    exit 1
}

function Get-DotEnvValue([string]$name) {
    if (-not (Test-Path $envFile)) { return '' }
    $line = Get-Content -LiteralPath $envFile -ErrorAction SilentlyContinue |
        Where-Object { $_ -match "^\s*$name\s*=" } |
        Select-Object -First 1
    if (-not $line) { return '' }
    return ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
}

# Host/port come from MEILI_HOST so the launcher and the app can never disagree.
$hostUrl = Get-DotEnvValue 'MEILI_HOST'
if (-not $hostUrl) { $hostUrl = 'http://127.0.0.1:7700' }
$port = 7700
if ($hostUrl -match ':(\d+)\s*$') { $port = [int]$Matches[1] }
$bindAddr = "127.0.0.1:$port"

$busy = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($busy) {
    Write-Host "[meili] port $port is already in use (pid $($busy[0].OwningProcess))." -ForegroundColor Yellow
    Write-Host "        Stop it first, or you will corrupt $dataPath." -ForegroundColor Yellow
    exit 1
}

# Temp dirs must live inside data.ms and must not carry Deny ACEs.
$tmpDir = Join-Path $dataPath 'tmp'
$updDir = Join-Path $dataPath 'update_files'
foreach ($d in @($tmpDir, $updDir)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    $deny = @((Get-Acl -LiteralPath $d).Access | Where-Object { $_.AccessControlType -eq 'Deny' })
    if ($deny.Count -gt 0) {
        Write-Host "[meili] clearing $($deny.Count) Deny ACE(s) on $d"
        & "$env:WINDIR\System32\icacls.exe" $d /remove:d 'Everyone' | Out-Null
    }
}

$env:TMP = $tmpDir
$env:TEMP = $tmpDir
$env:TMPDIR = $tmpDir

$key = Get-DotEnvValue 'MEILI_MASTER_KEY'
if ($key) {
    $env:MEILI_MASTER_KEY = $key
} else {
    Write-Host "[meili] MEILI_MASTER_KEY missing in .env - running without auth" -ForegroundColor Yellow
}

Write-Host "[meili] db      : $dataPath"
Write-Host "[meili] listen  : http://$bindAddr"
Write-Host "[meili] tmp     : $tmpDir"
Write-Host "[meili] key     : $(if ($key) { 'set' } else { 'none' })"
Write-Host ""

& $exe --db-path $dataPath --http-addr $bindAddr --env development
