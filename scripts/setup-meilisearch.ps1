<#
.SYNOPSIS
    Meilisearch 搜索引擎自动安装脚本（Windows）
.DESCRIPTION
    从 GitHub 官方发布页下载指定版本的 Meilisearch 二进制到 bin/ 目录。
    部署方拉取代码后运行此脚本即可自动获取搜索引擎，无需手动传输大文件。
    
    用法：
      .\scripts\setup-meilisearch.ps1
      .\scripts\setup-meilisearch.ps1 -Version "1.52.0"   # 指定版本
      .\scripts\setup-meilisearch.ps1 -Force              # 强制重新下载
.NOTES
    安装完成后：
    1. 在 .env 中设置 MEILI_ENABLED=on 启用搜索
    2. 启动 Meilisearch: .\bin\meilisearch.exe --master-key <你的密钥> --db-path .\bin\data.ms
    3. 启动应用后，搜索索引会从 MySQL 自动全量同步
#>

param(
    [string]$Version = "1.52.0",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$binDir = Join-Path $PSScriptRoot ".." "bin"
$exePath = Join-Path $binDir "meilisearch.exe"
$dataDir = Join-Path $binDir "data.ms"

# ── 检查是否已安装 ──
if (Test-Path $exePath -and -not $Force) {
    $existingVersion = & $exePath --version 2>$null
    if ($existingVersion) {
        Write-Host "[OK] Meilisearch 已安装: $existingVersion" -ForegroundColor Green
        Write-Host "     路径: $exePath"
        Write-Host "     如需重新安装，请运行: .\scripts\setup-meilisearch.ps1 -Force"
        exit 0
    }
}

# ── 创建目录 ──
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir | Out-Null
    Write-Host "[INIT] 创建目录: $binDir"
}

# ── 构建下载 URL ──
$downloadUrl = "https://github.com/meilisearch/meilisearch/releases/download/v${Version}/meilisearch-windows-amd64"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Meilisearch v${Version} 安装脚本 (Windows)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[DOWNLOAD] 正在从 GitHub 下载 Meilisearch v${Version}..."
Write-Host "           URL: $downloadUrl"
Write-Host "           目标: $exePath"
Write-Host ""

# ── 下载 ──
try {
    # 使用 TLS 1.2+ 确保 HTTPS 连接
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $progressPreference = 'SilentlyContinue'  # 加速下载（禁用进度条）
    Invoke-WebRequest -Uri $downloadUrl -OutFile $exePath -UseBasicParsing
    $progressPreference = 'Continue'

    $fileSize = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
    Write-Host "[OK] 下载完成: meilisearch.exe (${fileSize} MB)" -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] 下载失败: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "可能的原因："
    Write-Host "  1. 网络连接问题（GitHub 在国内可能较慢）"
    Write-Host "  2. 版本号不正确，当前版本: v${Version}"
    Write-Host ""
    Write-Host "手动下载方式："
    Write-Host "  访问 https://github.com/meilisearch/meilisearch/releases/tag/v${Version}"
    Write-Host "  下载 meilisearch-windows-amd64 并放到 bin/ 目录，重命名为 meilisearch.exe"
    exit 1
}

# ── 创建数据目录 ──
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
    Write-Host "[INIT] 创建数据目录: $dataDir"
}

# ── 生成 MEILI_MASTER_KEY（如果 .env 中未配置）──
$envFile = Join-Path $PSScriptRoot ".." ".env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -notmatch "MEILI_MASTER_KEY") {
        $masterKey = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
        Add-Content -Path $envFile -Value ""
        Add-Content -Path $envFile -Value "# ── Meilisearch ──"
        Add-Content -Path $envFile -Value "MEILI_ENABLED=`"on`""
        Add-Content -Path $envFile -Value "MEILI_HOST=`"http://127.0.0.1:7700`""
        Add-Content -Path $envFile -Value "MEILI_MASTER_KEY=`"${masterKey}`""
        Write-Host "[CONFIG] 已在 .env 中追加 Meilisearch 配置（含随机密钥）" -ForegroundColor Yellow
    }
    else {
        Write-Host "[CONFIG] .env 中已存在 MEILI_MASTER_KEY 配置，跳过"
    }
}

# ── 验证安装 ──
Write-Host ""
Write-Host "[VERIFY] 验证安装..."
try {
    $ver = & $exePath --version 2>&1
    Write-Host "[OK] 版本: $ver" -ForegroundColor Green
}
catch {
    Write-Host "[WARN] 无法验证版本（二进制可能需要首次运行初始化）" -ForegroundColor Yellow
}

# ── 完成 ──
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "后续步骤："
Write-Host "  1. 启动 Meilisearch（后台运行）："
Write-Host "     .\bin\meilisearch.exe --db-path .\bin\data.ms"
Write-Host ""
Write-Host "  2. 确保 .env 中已设置："
Write-Host "     MEILI_ENABLED=`"on`""
Write-Host "     MEILI_HOST=`"http://127.0.0.1:7700`""
Write-Host ""
Write-Host "  3. 启动应用后，搜索索引会自动从 MySQL 全量同步"
Write-Host ""
