#!/usr/bin/env bash
# 本地/ Linux 一键跑全部测试（单元 / 集成 / API·E2E / 门禁自测）。
#
# 顺序执行、互不短路；日志在 test-results/<suite>.log，汇总在 test-results/summary.txt。
#
# 用法：
#   bash run_tests.sh                     # 全部（e2e 只跑 chromium 主链路 + 接口覆盖）
#   bash run_tests.sh --skip-e2e          # 不跑 E2E
#   bash run_tests.sh --suite=unit        # 只跑单元测试
#   bash run_tests.sh --with-checks       # 先跑 typecheck + lint
#   bash run_tests.sh --no-coverage       # 跳过覆盖率（更快）
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
RESULTS_DIR="$ROOT/test-results"
mkdir -p "$RESULTS_DIR"

SUITE="all"
SKIP_INTEGRATION=0
SKIP_E2E=0
SKIP_GATES=0
WITH_CHECKS=0
NO_COVERAGE=0

for arg in "$@"; do
  case "$arg" in
    --suite=*) SUITE="${arg#--suite=}" ;;
    --skip-integration) SKIP_INTEGRATION=1 ;;
    --skip-e2e) SKIP_E2E=1 ;;
    --skip-gates) SKIP_GATES=1 ;;
    --with-checks) WITH_CHECKS=1 ;;
    --no-coverage) NO_COVERAGE=1 ;;
    *) echo "[run_tests] 未知参数：$arg"; exit 2 ;;
  esac
done

if [ ! -d node_modules ]; then
  echo "[run_tests] 缺少 node_modules，请先执行 npm ci"
  exit 1
fi

if [ "$NO_COVERAGE" = "1" ]; then
  UNIT_CMD='npx vitest run'
  INTEGRATION_CMD='npm run test:integration'
else
  UNIT_CMD='npm run test:unit && npm run test:coverage-gate -- coverage/unit 90'
  INTEGRATION_CMD='npm run test:integration:coverage && npm run test:coverage-gate -- coverage/integration 80'
fi

# e2e 跑全部 spec × 全部 project；跑前重置测试账号的采购主体（发布链会写入真库）
E2E_CMD='npx tsx scripts/tools/e2e-reset-fixtures.ts && npm run test:e2e'

run_suite() {
  local name="$1"
  local cmd="$2"
  local log="$RESULTS_DIR/$name.log"
  local start end code
  # 覆盖率目录残留可能让 v8 报告器撞 .tmp ENOENT，跑前清干净
  [ "$name" = "unit" ] && rm -rf "$ROOT/coverage/unit"
  [ "$name" = "integration" ] && rm -rf "$ROOT/coverage/integration"
  start=$(date +%s)
  echo ""
  echo "===== $name ====="
  bash -c "$cmd" 2>&1 | tee "$log"
  code=${PIPESTATUS[0]}
  end=$(date +%s)
  RESULTS+=("$name|$code|$((end - start))")
  if [ "$code" -eq 0 ]; then
    echo "[PASS] $name ($((end - start))s)"
  else
    echo "[FAIL] $name ($((end - start))s)"
  fi
}

RESULTS=()

if [ "$WITH_CHECKS" = "1" ]; then
  run_suite "typecheck" "npm run typecheck"
  run_suite "lint" "npm run lint"
fi

case "$SUITE" in
  all)
    run_suite "unit" "$UNIT_CMD"
    [ "$SKIP_INTEGRATION" = "1" ] || run_suite "integration" "$INTEGRATION_CMD"
    [ "$SKIP_E2E" = "1" ] || run_suite "e2e" "$E2E_CMD"
    [ "$SKIP_GATES" = "1" ] || run_suite "gates" "npm run test:css-compat"
    ;;
  unit) run_suite "unit" "$UNIT_CMD" ;;
  integration) run_suite "integration" "$INTEGRATION_CMD" ;;
  e2e) run_suite "e2e" "$E2E_CMD" ;;
  gates) run_suite "gates" "npm run test:css-compat" ;;
  *) echo "[run_tests] 未知 suite：$SUITE"; exit 2 ;;
esac

# ── 汇总 ──
{
  echo "测试汇总 $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
} > "$RESULTS_DIR/summary.txt"

failed=0
for row in "${RESULTS[@]}"; do
  name="${row%%|*}"
  rest="${row#*|}"
  code="${rest%%|*}"
  secs="${rest#*|}"
  if [ "$code" -eq 0 ]; then
    status="通过"
  else
    status="失败"
    failed=$((failed + 1))
  fi
  printf '%-12s %-4s %7ss\n' "$name" "$status" "$secs" | tee -a "$RESULTS_DIR/summary.txt"
done

{
  echo ""
  echo "合计：${#RESULTS[@]} 套，通过 $(( ${#RESULTS[@]} - failed ))，失败 $failed"
} | tee -a "$RESULTS_DIR/summary.txt"

[ "$failed" -eq 0 ] || exit 1
exit 0
