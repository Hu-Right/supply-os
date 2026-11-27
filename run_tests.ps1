<#
.SYNOPSIS
  本地一键跑全部测试（单元 / 集成 / API·E2E / 门禁自测）。

.DESCRIPTION
  顺序执行、互不短路：某一套失败也会继续跑完后面的，最后统一汇总并返回非零退出码。
  日志落在 test-results/<suite>.log，汇总落在 test-results/summary.txt。

.EXAMPLE
  .\run_tests.ps1                     # 全部：单元 + 集成 + 全量 E2E + 门禁自测
  .\run_tests.ps1 -SkipE2E            # 不跑 E2E（不需要浏览器/服务）
  .\run_tests.ps1 -Suite unit         # 只跑单元测试
  .\run_tests.ps1 -WithChecks         # 先跑 typecheck + lint 再跑测试
#>
param(
  [ValidateSet("all", "unit", "integration", "e2e", "gates")]
  [string]$Suite = "all",
  [switch]$SkipIntegration,
  [switch]$SkipE2E,
  [switch]$SkipGates,
  [switch]$WithChecks,
  [switch]$NoCoverage
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$Root = Split-Path -Parent $PSCommandPath
Set-Location $Root
$ResultsDir = Join-Path $Root "test-results"
New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "[run_tests] 缺少 node_modules，请先执行 npm ci" -ForegroundColor Red
  exit 1
}

# 每一套 = @{ Name; Command }；Command 走 cmd /c，保证 && 与退出码语义和 CI 一致
$Suites = New-Object System.Collections.Generic.List[hashtable]

if ($WithChecks) {
  $Suites.Add(@{ Name = "typecheck"; Command = "npm run typecheck" })
  $Suites.Add(@{ Name = "lint"; Command = "npm run lint" })
}

$unitCmd = if ($NoCoverage) {
  "npx vitest run"
} else {
  "npm run test:unit && npm run test:coverage-gate -- coverage/unit 90"
}
$integrationCmd = if ($NoCoverage) {
  "npm run test:integration"
} else {
  "npm run test:integration:coverage && npm run test:coverage-gate -- coverage/integration 80"
}
# e2e 跑全部 spec × 全部 project；跑前重置测试账号的采购主体（发布链会写入真库）
$e2eCmd = "npx tsx scripts/tools/e2e-reset-fixtures.ts && npm run test:e2e"

switch ($Suite) {
  "all" {
    $Suites.Add(@{ Name = "unit"; Command = $unitCmd })
    if (-not $SkipIntegration) { $Suites.Add(@{ Name = "integration"; Command = $integrationCmd }) }
    if (-not $SkipE2E) { $Suites.Add(@{ Name = "e2e"; Command = $e2eCmd }) }
    if (-not $SkipGates) { $Suites.Add(@{ Name = "gates"; Command = "npm run test:css-compat" }) }
  }
  "unit" { $Suites.Add(@{ Name = "unit"; Command = $unitCmd }) }
  "integration" { $Suites.Add(@{ Name = "integration"; Command = $integrationCmd }) }
  "e2e" { $Suites.Add(@{ Name = "e2e"; Command = $e2eCmd }) }
  "gates" { $Suites.Add(@{ Name = "gates"; Command = "npm run test:css-compat" }) }
}

$Results = New-Object System.Collections.Generic.List[hashtable]

# npm 会把 notice 写到 stderr；Stop 会让 Tee 管道把正常输出当致命错误
$ErrorActionPreference = "Continue"

foreach ($item in $Suites) {
  $name = $item.Name
  $log = Join-Path $ResultsDir "$name.log"
  # 覆盖率目录残留会让 v8 报告器在 Windows 上撞 .tmp ENOENT，跑前清干净
  if ($name -eq "unit") { Remove-Item -Recurse -Force (Join-Path $Root "coverage/unit") -ErrorAction SilentlyContinue }
  if ($name -eq "integration") { Remove-Item -Recurse -Force (Join-Path $Root "coverage/integration") -ErrorAction SilentlyContinue }
  Write-Host ""
  Write-Host "===== $name =====" -ForegroundColor Cyan
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  & cmd.exe /c $item.Command 2>&1 | Tee-Object -FilePath $log
  $code = $LASTEXITCODE
  $sw.Stop()
  $Results.Add(@{ Name = $name; Code = $code; Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 1) })
  $color = if ($code -eq 0) { "Green" } else { "Red" }
  $seconds = $Results[$Results.Count - 1].Seconds
  Write-Host ("[{0}] {1} ({2}s)" -f $(if ($code -eq 0) { "PASS" } else { "FAIL" }), $name, $seconds) -ForegroundColor $color
}

# ── 汇总 ──
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("测试汇总 $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))")
$lines.Add("")
$failed = 0
foreach ($r in $Results) {
  if ($r.Code -eq 0) {
    $status = "通过"
  } else {
    $status = "失败"
    $failed += 1
  }
  $lines.Add(("{0,-12} {1,-4} {2,7}s" -f $r.Name, $status, $r.Seconds))
}
$lines.Add("")
$lines.Add(("合计：{0} 套，通过 {1}，失败 {2}" -f $Results.Count, ($Results.Count - $failed), $failed))
$lines | ForEach-Object { Write-Host $_ }
$lines | Set-Content -Path (Join-Path $ResultsDir "summary.txt") -Encoding utf8

if ($failed -gt 0) { exit 1 }
exit 0
