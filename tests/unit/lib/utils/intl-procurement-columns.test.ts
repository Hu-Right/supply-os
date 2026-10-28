/**
 * 国际采购 17 列退役守卫（2026-10-12）+ 详情透出口径不回退
 *
 * 原用例守的是「清单与类型键集相等且详情必透出 17 键」；这批列已整族退役
 * （判据见 scripts/tools/opp-slim-plan.mjs 与 docs/数据库设计/bid_opportunities-投标商机表.md），
 * 守卫随之**反向**：即便机会行里还带着这些键，详情合并也不得再向下游透出。
 *
 * 退役键名在本文件**独立钉死**（不复用 opp-slim-plan 的导出）：清单与守卫来自两份
 * 独立认知，任一侧被改动时用例才会真的报错，而不是跟着一起漂移。
 * 结构层守卫（读取点 SELECT 不得再含退役列）由 scripts/gates/check-opp-slim.mjs 承担。
 */
import { describe, it, expect } from "vitest";

import { normalizeNoticeDetailPayload } from "@/lib/services/notices";

const RETIRED_KEYS = [
  "procurement_procedure",
  "prequalification_required",
  "lot_structure",
  "contract_form",
  "consortium_rule",
  "bid_validity_days",
  "submission_mode",
  "submission_requirement",
  "submission_address",
  "funding_agency",
  "evaluation_method",
  "language_requirement",
  "execution_period",
  "local_content",
  "eshs_requirements",
  "eligible_countries",
  "key_dates",
];

const NOTICE_ROW = {
  id: 1786999999,
  notice_id: "SP4130189",
  reference: "AOI n° SP4130189",
  title: "STEP El Menzel",
  description: "原始公告描述",
  deadline: "2026-10-28 09:30:00",
  deadline_ts: 1793176200,
  entry_source: "crawl",
};

describe("国际采购 17 列退役守卫", () => {
  it("退役键共 17 个且无重复（基数与旧契约一致，防止清单被悄悄改写）", () => {
    expect(new Set(RETIRED_KEYS).size).toBe(RETIRED_KEYS.length);
    expect(RETIRED_KEYS.length).toBe(17);
  });

  it("即便机会行带着退役键，详情合并也不得透出 intl_procurement 或散键", () => {
    const opportunity = Object.fromEntries(RETIRED_KEYS.map((c, i) => [c, `v${i}`]));
    const payload = normalizeNoticeDetailPayload(NOTICE_ROW, undefined, opportunity) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("intl_procurement");
    for (const key of RETIRED_KEYS) expect(payload).not.toHaveProperty(key);
  });

  it("无机会行时同样不存在 intl_procurement 键", () => {
    const payload = normalizeNoticeDetailPayload(NOTICE_ROW) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("intl_procurement");
  });

  it("仍在用的详情键不回退：截止时区与非中文原文摘要随机会行透出", () => {
    const payload = normalizeNoticeDetailPayload(
      { ...NOTICE_ROW, deadline_timezone: "" },
      undefined,
      { deadline_timezone: "Africa/Casablanca", description_other: "Résumé en français" },
    ) as { deadline_timezone: string; description_other: string };
    expect(payload.deadline_timezone).toBe("Africa/Casablanca");
    expect(payload.description_other).toBe("Résumé en français");
  });

  it("机会描述经 preferValue 优先于公告描述（宽表 COALESCE 同口径）", () => {
    const payload = normalizeNoticeDetailPayload(NOTICE_ROW, undefined, {
      description: "机会级精编正文",
    }) as { description: string };
    expect(payload.description).toBe("机会级精编正文");
  });
});
