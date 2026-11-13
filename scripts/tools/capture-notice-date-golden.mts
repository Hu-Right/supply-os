/**
 * 重新生成 notice 日期解析金样基线（仅在**有意**变更口径后执行）。
 *
 * 输入/输出同一文件：`tests/fixtures/notice-datetime/golden.jsonl`
 * 第一列是源串（真实语料），其余列是当前实现算出的结果。重新生成后必须
 * `git diff` 逐条确认——每一处变化都是对外口径（published_ts / deadline effectiveTs /
 * 展示日期）的变更，不是“测试跑绿了”就完事。
 *
 * 用法：
 *   npx tsx scripts/tools/capture-notice-date-golden.mts            # 只预览差异，不写文件
 *   npx tsx scripts/tools/capture-notice-date-golden.mts --write    # 落盘覆盖基线
 */
import { readFileSync, writeFileSync } from "node:fs";
import { toEpoch } from "../../src/lib/services/notice-public/build";
import { classifyDeadline } from "../../src/lib/services/notice-deadline/classify";
import { parseNoticeDate } from "../../src/shared/utils/notice-datetime/parse";

const FIXTURE = "tests/fixtures/notice-datetime/golden.jsonl";
const WRITE = process.argv.includes("--write");

type Row = [string, number | null, [number, boolean] | null, [string, number | null, string | null, string | null]];

const rows: Row[] = readFileSync(FIXTURE, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Row);

const next: Row[] = [];
let changed = 0;

for (const [src, epoch, parsed, cls] of rows) {
  const p = parseNoticeDate(src);
  const c = classifyDeadline({ deadline: src, deadlineTs: null, publishedDate: null });
  const row: Row = [
    src,
    toEpoch(src),
    p ? [p.ts, p.hasTime] : null,
    [c.state, c.effectiveTs, c.timezone ?? null, c.timezoneSource ?? null],
  ];
  const same = JSON.stringify(row) === JSON.stringify([src, epoch, parsed, cls]);
  if (!same) {
    changed++;
    if (changed <= 20) {
      console.log(`~ ${JSON.stringify(src)}`);
      console.log(`    old: ${JSON.stringify([epoch, parsed, cls])}`);
      console.log(`    new: ${JSON.stringify([row[1], row[2], row[3]])}`);
    }
  }
  next.push(row);
}

console.log(`\n语料 ${rows.length} 条，口径变化 ${changed} 条`);
if (!WRITE) {
  console.log("（预览模式，未写文件。确认无误后加 --write）");
} else {
  writeFileSync(FIXTURE, next.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  console.log(`✓ 已写入 ${FIXTURE}`);
}
