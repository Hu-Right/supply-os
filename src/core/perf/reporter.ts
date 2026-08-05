/**
 * 性能报告生成器
 * Performance Report Generator
 *
 * @module core/perf/reporter
 * @description 对比两次性能快照，生成 Markdown 格式的优化前后对比报告。
 *              支持存储多个快照并自动生成对比表格。
 *              Compare two performance snapshots and generate Markdown
 *              before/after optimization report.
 */

import type { PerfSnapshot } from "./metrics";

// ── 快照存储（内存，最多保留 10 个） ──

const MAX_SNAPSHOTS = 10;
const snapshots: PerfSnapshot[] = [];

/** 保存快照到历史列表 */
export function saveSnapshot(snapshot: PerfSnapshot): void {
  snapshots.push(snapshot);
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.shift();
  }
}

/** 获取所有已保存的快照 */
export function getSnapshots(): readonly PerfSnapshot[] {
  return [...snapshots];
}

/** 获取最近两个快照用于对比 */
export function getLatestPair(): [PerfSnapshot, PerfSnapshot] | null {
  if (snapshots.length < 2) return null;
  return [snapshots[snapshots.length - 2], snapshots[snapshots.length - 1]];
}

// ── 对比计算 ──

interface DiffItem {
  label: string;
  before: string;
  after: string;
  delta: string;
  improved: boolean | null; // true=改善, false=恶化, null=无变化或不可比
}

function calcDiff(before: number | null, after: number | null): { delta: string; improved: boolean | null } {
  if (before == null || after == null) {
    return { delta: "N/A", improved: null };
  }
  const diff = after - before;
  const pct = before !== 0 ? ((diff / before) * 100).toFixed(1) : "0.0";
  const sign = diff > 0 ? "+" : "";
  const improved = diff < 0 ? true : diff > 0 ? false : null;
  return {
    delta: `${sign}${diff.toFixed(0)}ms (${sign}${pct}%)`,
    improved,
  };
}

function formatMs(value: number | null): string {
  if (value == null) return "N/A";
  return `${value}ms`;
}

// ── 报告生成 ──

/** 生成两个快照的对比 Markdown 报告 */
export function generateComparisonReport(
  before: PerfSnapshot,
  after: PerfSnapshot,
): string {
  const lines: string[] = [];
  const bs = before.summary;
  const as = after.summary;

  lines.push(`# 性能优化对比报告`);
  lines.push("");
  lines.push(`| 项目 | 优化前 (${before.label}) | 优化后 (${after.label}) | 变化 |`);
  lines.push("|------|---------|---------|------|");

  const rows: DiffItem[] = [];

  // Web Vitals
  const vitalPairs: [string, number | null, number | null][] = [
    ["TTFB (首字节时间)", bs.ttfb, as.ttfb],
    ["FCP (首次内容绘制)", bs.fcp, as.fcp],
    ["LCP (最大内容绘制)", bs.lcp, as.lcp],
    ["DOM Interactive", bs.domInteractive, as.domInteractive],
  ];

  for (const [label, bv, av] of vitalPairs) {
    const { delta, improved } = calcDiff(bv, av);
    rows.push({ label, before: formatMs(bv), after: formatMs(av), delta, improved });
  }

  // API 指标
  rows.push({
    label: "API 平均响应时间",
    before: formatMs(bs.avgApiMs),
    after: formatMs(as.avgApiMs),
    ...calcDiff(bs.avgApiMs || null, as.avgApiMs || null),
  });

  rows.push({
    label: "API 调用总数",
    before: String(bs.totalApiCalls),
    after: String(as.totalApiCalls),
    delta: `${as.totalApiCalls - bs.totalApiCalls >= 0 ? "+" : ""}${as.totalApiCalls - bs.totalApiCalls}`,
    improved: null,
  });

  rows.push({
    label: "API 缓存命中数",
    before: String(bs.cachedApiCalls),
    after: String(as.cachedApiCalls),
    delta: `${as.cachedApiCalls - bs.cachedApiCalls >= 0 ? "+" : ""}${as.cachedApiCalls - bs.cachedApiCalls}`,
    improved: null,
  });

  // 渲染指标
  rows.push({
    label: "组件平均渲染时间",
    before: formatMs(bs.avgRenderMs),
    after: formatMs(as.avgRenderMs),
    ...calcDiff(bs.avgRenderMs || null, as.avgRenderMs || null),
  });

  for (const row of rows) {
    const icon = row.improved === true ? " ✅" : row.improved === false ? " ⚠️" : "";
    lines.push(`| ${row.label} | ${row.before} | ${row.after} | ${row.delta}${icon} |`);
  }

  // 首屏加载详情
  if (before.firstScreen.length > 0 || after.firstScreen.length > 0) {
    lines.push("");
    lines.push("## 首屏加载详情");
    lines.push("");
    lines.push("| 页面 | 优化前 | 优化后 | 变化 |");
    lines.push("|------|--------|--------|------|");

    const allPages = new Set([
      ...before.firstScreen.map((f) => f.page),
      ...after.firstScreen.map((f) => f.page),
    ]);

    for (const page of allPages) {
      const bf = before.firstScreen.find((f) => f.page === page);
      const af = after.firstScreen.find((f) => f.page === page);
      const bv = bf?.loadMs ?? null;
      const av = af?.loadMs ?? null;
      const { delta, improved } = calcDiff(bv, av);
      const icon = improved === true ? " ✅" : improved === false ? " ⚠️" : "";
      const beforeStr = bf ? `${bf.loadMs}ms (${bf.itemCount} items)` : "N/A";
      const afterStr = af ? `${af.loadMs}ms (${af.itemCount} items)` : "N/A";
      lines.push(`| ${page} | ${beforeStr} | ${afterStr} | ${delta}${icon} |`);
    }
  }

  // 最慢 API 对比
  if (bs.slowestApi || as.slowestApi) {
    lines.push("");
    lines.push("## 最慢 API 请求");
    lines.push("");
    lines.push("| 阶段 | 端点 | 耗时 |");
    lines.push("|------|------|------|");
    if (bs.slowestApi) {
      lines.push(`| 优化前 | \`${bs.slowestApi.endpoint}\` | ${bs.slowestApi.durationMs}ms |`);
    }
    if (as.slowestApi) {
      lines.push(`| 优化后 | \`${as.slowestApi.endpoint}\` | ${as.slowestApi.durationMs}ms |`);
    }
  }

  // 元信息
  lines.push("");
  lines.push("---");
  lines.push(`**优化前快照**: ${before.createdAt} | **优化后快照**: ${after.createdAt}`);
  lines.push(`**User Agent**: ${after.userAgent.slice(0, 80)}...`);

  return lines.join("\n");
}

/** 生成单快照摘要报告 */
export function generateSummaryReport(snapshot: PerfSnapshot): string {
  const s = snapshot.summary;
  const lines: string[] = [];

  lines.push(`# 性能摘要报告 — ${snapshot.label}`);
  lines.push("");
  lines.push(`**时间**: ${snapshot.createdAt}`);
  lines.push("");
  lines.push("## Web Vitals");
  lines.push("");
  lines.push(`| 指标 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| TTFB | ${formatMs(s.ttfb)} |`);
  lines.push(`| FCP | ${formatMs(s.fcp)} |`);
  lines.push(`| LCP | ${formatMs(s.lcp)} |`);
  lines.push(`| DOM Interactive | ${formatMs(s.domInteractive)} |`);
  lines.push("");
  lines.push("## API 请求统计");
  lines.push("");
  lines.push(`- 总调用: ${s.totalApiCalls}`);
  lines.push(`- 缓存命中: ${s.cachedApiCalls}`);
  lines.push(`- 平均响应: ${s.avgApiMs}ms`);
  if (s.slowestApi) {
    lines.push(`- 最慢: \`${s.slowestApi.endpoint}\` (${s.slowestApi.durationMs}ms)`);
  }
  lines.push("");
  lines.push("## 组件渲染统计");
  lines.push("");
  lines.push(`- 平均渲染: ${s.avgRenderMs}ms`);
  if (s.slowestRender) {
    lines.push(`- 最慢: \`${s.slowestRender.component}\` (${s.slowestRender.renderMs}ms)`);
  }

  if (snapshot.firstScreen.length > 0) {
    lines.push("");
    lines.push("## 首屏加载");
    lines.push("");
    lines.push(`| 页面 | 耗时 | 数据项 |`);
    lines.push(`|------|------|--------|`);
    for (const fs of snapshot.firstScreen) {
      lines.push(`| ${fs.page} | ${fs.loadMs}ms | ${fs.itemCount} |`);
    }
  }

  return lines.join("\n");
}

/** 将报告输出到控制台 */
export function printReport(markdown: string): void {
  console.log("%c[Perf Report]", "color: #0d9488; font-weight: bold");
  console.log(markdown);
}
