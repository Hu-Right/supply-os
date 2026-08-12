<#
.SYNOPSIS
    Downloads and configures Meilisearch for Windows.
.DESCRIPTION
    Downloads the selected Meilisearch Windows binary into bin/meilisearch.exe,
    creates the data directory, and adds Meilisearch settings to .env when
    MEILI_MASTER_KEY is not already configured.

    Usage:
      .\scripts\setup-meilisearch.ps1
      .\scripts\setup-meilisearch.ps1 -Version "1.52.0"
      .\scripts\setup-meilisearch.ps1 -Force
#>

param(
    [string]$Version = "1.52.0",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$binDir = Join-Path $projectRoot "bin"
$exePath = Join-Path $binDir "meilisearch.exe"
$dataDir = Join-Path $binDir "data.ms"
$envFile = Join-Path $projectRoot ".env"
$downloadUrl = "https://github.com/meilisearch/meilisearch/releases/download/v${Version}/meilisearch-windows-amd64.exe"

if ((Test-Path $exePath) -and -not $Force) {
    try {
        $existingVersion = & $exePath --version 2>$null
        if ($existingVersion) {
            Write-Host "[OK] Meilisearch is already installed: $existingVersion" -ForegroundColor Green
            Write-Host "     Path: $exePath"
            Write-Host "     Run .\scripts\setup-meilisearch.ps1 -Force to reinstall."
            exit 0
        }
    }
    catch {
        Write-Host "[WARN] Existing meilisearch.exe could not be checked; reinstalling." -ForegroundColor Yellow
    }
}

if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir | Out-Null
    Write-Host "[INIT] Created directory: $binDir"
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Meilisearch v${Version} setup (Windows)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[DOWNLOAD] Downloading Meilisearch v${Version} from GitHub..."
Write-Host "           URL: $downloadUrl"
Write-Host "           Target: $exePath"
Write-Host ""

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $previousProgressPreference = $ProgressPreference
    $ProgressPreference = "SilentlyContinue"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $exePath -UseBasicParsing
    $ProgressPreference = $previousProgressPreference

    $fileSize = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
    Write-Host "[OK] Download complete: meilisearch.exe (${fileSize} MB)" -ForegroundColor Green
}
catch {
    if (Test-Path $exePath) {
        Remove-Item -LiteralPath $exePath -Force -ErrorAction SilentlyContinue
    }

    Write-Host "[ERROR] Download failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible causes:"
    Write-Host "  1. Network access to GitHub failed."
    Write-Host "  2. The requested version does not exist: v${Version}"
    Write-Host ""
    Write-Host "Manual install:"
    Write-Host "  1. Open https://github.com/meilisearch/meilisearch/releases/tag/v${Version}"
    Write-Host "  2. Download meilisearch-windows-amd64.exe"
    Write-Host "  3. Save it as bin/meilisearch.exe"
    exit 1
}
finally {
    if ($null -ne $previousProgressPreference) {
        $ProgressPreference = $previousProgressPreference
    }
}

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
    Write-Host "[INIT] Created data directory: $dataDir"
}

if (Test-Path $envFile) {
    $envContent = Get-Content -LiteralPath $envFile -Raw
    if ($envContent -notmatch "(?m)^\s*MEILI_MASTER_KEY\s*=") {
        $masterKey = -join ((1..32) | ForEach-Object { "{0:x}" -f (Get-Random -Max 16) })

        Add-Content -LiteralPath $envFile -Value ""
        Add-Content -LiteralPath $envFile -Value "# Meilisearch"
        Add-Content -LiteralPath $envFile -Value "MEILI_ENABLED=`"on`""
        Add-Content -LiteralPath $envFile -Value "MEILI_HOST=`"http://127.0.0.1:7700`""
        Add-Content -LiteralPath $envFile -Value "MEILI_MASTER_KEY=`"${masterKey}`""

        Write-Host "[CONFIG] Added Meilisearch settings to .env." -ForegroundColor Yellow
    }
    else {
        Write-Host "[CONFIG] .env already contains MEILI_MASTER_KEY; leaving it unchanged."
    }
}
else {
    Write-Host "[CONFIG] .env not found; create it from .env.example before starting the app." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[VERIFY] Checking installation..."
try {
    $ver = & $exePath --version 2>&1
    Write-Host "[OK] Version: $ver" -ForegroundColor Green
}
catch {
    Write-Host "[WARN] Could not verify the binary: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Setup complete" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Start Meilisearch:"
Write-Host "     .\bin\meilisearch.exe --master-key <your-key> --db-path .\bin\data.ms"
Write-Host ""
Write-Host "  2. Make sure .env contains:"
Write-Host "     MEILI_ENABLED=`"on`""
Write-Host "     MEILI_HOST=`"http://127.0.0.1:7700`""
Write-Host "     MEILI_MASTER_KEY=`"<your-key>`""
Write-Host ""
