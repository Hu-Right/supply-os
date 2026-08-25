#!/usr/bin/env node
/**
 * 覆盖率门禁检查脚本
 * Coverage gate check script
 *
 * 用法: node scripts/coverage-gate.mjs [reportsDirectory] [threshold]
 * 示例: node scripts/coverage-gate.mjs coverage/unit 90
 *
 * 读取 istanbul coverage-final.json，计算语句覆盖率，
 * 低于阈值时以 exit code 1 退出（CI 自动失败）。
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const reportsDir = process.argv[2] || "coverage";
const threshold = parseFloat(process.argv[3] || "90");

const reportPath = resolve(reportsDir, "coverage-final.json");

let raw;
try {
  raw = readFileSync(reportPath, "utf-8");
} catch {
  console.error(`✗ 覆盖率报告不存在: ${reportPath}`);
  process.exit(1);
}

const report = JSON.parse(raw);
const files = Object.values(report);

if (files.length === 0) {
  console.error("✗ 覆盖率报告为空");
  process.exit(1);
}

const totals = files.reduce(
  (acc, f) => {
    const s = f.s || {};
    acc.total += Object.keys(s).length;
    acc.covered += Object.values(s).filter((v) => v > 0).length;

    const b = f.b || {};
    for (const branches of Object.values(b)) {
      for (const count of branches) {
        acc.branchTotal++;
        if (count > 0) acc.branchCovered++;
      }
    }

    const fn = f.fnMap ? f.f || {} : {};
    acc.fnTotal += Object.keys(fn).length;
    acc.fnCovered += Object.values(fn).filter((v) => v > 0).length;

    return acc;
  },
  { total: 0, covered: 0, branchTotal: 0, branchCovered: 0, fnTotal: 0, fnCovered: 0 },
);

const stmtPct = ((totals.covered / totals.total) * 100).toFixed(1);
const branchPct = totals.branchTotal > 0
  ? ((totals.branchCovered / totals.branchTotal) * 100).toFixed(1)
  : "N/A";
const fnPct = totals.fnTotal > 0
  ? ((totals.fnCovered / totals.fnTotal) * 100).toFixed(1)
  : "N/A";

console.log("┌────────────────────────────────────┐");
console.log("│       覆盖率门禁检查结果            │");
console.log("├────────────────────────────────────┤");
console.log(`│ 报告目录:  ${reportsDir.padEnd(22)}│`);
console.log(`│ 语句覆盖率: ${stmtPct.padEnd(5)}%  (${totals.covered}/${totals.total})`.padEnd(39) + "│");
console.log(`│ 分支覆盖率: ${branchPct.padEnd(5)}%  (${totals.branchCovered}/${totals.branchTotal})`.padEnd(39) + "│");
console.log(`│ 函数覆盖率: ${fnPct.padEnd(5)}%  (${totals.fnCovered}/${totals.fnTotal})`.padEnd(39) + "│");
console.log(`│ 门禁阈值:   ${(threshold + "%").padEnd(5)}                          │`);
console.log("└────────────────────────────────────┘");

if (parseFloat(stmtPct) < threshold) {
  console.error(`\n✗ 语句覆盖率 ${stmtPct}% 低于阈值 ${threshold}%，门禁不通过`);
  process.exit(1);
}

console.log(`\n✓ 覆盖率门禁通过 (${stmtPct}% ≥ ${threshold}%)`);
