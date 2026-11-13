/**
 * 金样回归：三个日期消费方在 2,950 条真实语料上的输出不得漂移。
 *
 * 语料来源：云库 `bid_notices` 的 DISTINCT `deadline` / `published_date` 各 1,500 条
 * （2026-11-13 由 `tmp/capture-golden.mts` 采集，跨 ISO / D-Mon / 点时 / 带时区 /
 *  AM-PM / 无时分等全部活跃形态）。
 *
 * 基线语义：`golden.jsonl` 记录的是**收敛前**三套独立解析器的输出。
 * 阶段 1+2（识别器统一 + 三处接入）要求 zero-diff——本测试就是那条防线：
 *   - 任何一格变化都说明「顺手改了口径」，必须显式决策后重新生成基线；
 *   - 已知待退役的旧口径见 `source-date.ts` 的 legacy 说明（D-Mon 丢时分等）。
 *
 * 重新生成（仅在**有意**变更口径后）：
 *   npx tsx scripts/tools/capture-notice-date-golden.mts
 *
 * 记录格式：`[源串, toEpoch, parseNoticeDate|null, classify]`
 *   parseNoticeDate: [ts, hasTime] | null
 *   classify:        [state, effectiveTs, timezone, timezoneSource]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { toEpoch } from "@/lib/services/notice-public/build";
import { classifyDeadline } from "@/lib/services/notice-deadline/classify";
import { parseNoticeDate } from "@/shared/utils/notice-datetime/parse";

type Row = [
  string,
  number | null,
  [number, boolean] | null,
  [string, number | null, string | null, string | null],
];

// 测试运行目录固定为仓库根（vitest root），用 cwd 解析，避免 jsdom 下 import.meta.url 不是 file: 协议
const FIXTURE = resolve(process.cwd(), "tests/fixtures/notice-datetime/golden.jsonl");

const rows: Row[] = readFileSync(FIXTURE, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Row);

describe("notice 日期解析 · 金样回归", () => {
  it("语料规模未被截断（2,950 条唯一串）", () => {
    expect(rows.length).toBe(2950);
  });

  it("三个消费方逐条与收敛前基线一致（zero-diff）", () => {
    const diffs: string[] = [];

    for (const [src, epoch, parsed, cls] of rows) {
      const nowEpoch = toEpoch(src);
      if (nowEpoch !== epoch) {
        diffs.push(`toEpoch ${JSON.stringify(src)}: ${epoch} → ${nowEpoch}`);
      }

      const p = parseNoticeDate(src);
      const nowParsed = p ? [p.ts, p.hasTime] : null;
      if (JSON.stringify(nowParsed) !== JSON.stringify(parsed)) {
        diffs.push(`parseNoticeDate ${JSON.stringify(src)}: ${JSON.stringify(parsed)} → ${JSON.stringify(nowParsed)}`);
      }

      const v = classifyDeadline({ deadline: src, deadlineTs: null, publishedDate: null });
      const nowCls = [v.state, v.effectiveTs, v.timezone ?? null, v.timezoneSource ?? null];
      if (JSON.stringify(nowCls) !== JSON.stringify(cls)) {
        diffs.push(`classify ${JSON.stringify(src)}: ${JSON.stringify(cls)} → ${JSON.stringify(nowCls)}`);
      }
    }

    // 只展示前 20 条，避免一次失败刷屏；总数单独断言保证不遗漏
    expect(diffs.slice(0, 20)).toEqual([]);
    expect(diffs.length).toBe(0);
  });
});
