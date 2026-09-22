/**
 * 国际采购字段的「单一事实源」守卫：
 * - 运行期清单 INTL_PROCUREMENT_COLUMNS 与类型键集 IntlProcurementKey 必须完全相等
 *   （下面两个编译期断言在 tsc 阶段生效：任一侧漏改即类型报错）
 * - 详情合并必须透出全部键：有机会行取机会值，无机会行取 null 而非缺键
 * - 搜索侧不进宽表：这些列只经机会表进详情，宽表靠 opp.description 承载（见 088 头注释）
 */
import { describe, it, expect } from "vitest";

import { INTL_PROCUREMENT_COLUMNS } from "@/lib/utils/notice-field-limits";
import { normalizeNoticeDetailPayload } from "@/lib/services/notices";
import type { IntlProcurementKey } from "@/types/procurement";

type ListKeys = (typeof INTL_PROCUREMENT_COLUMNS)[number];

// 编译期双向断言：类型有而清单没有 → 详情页读不到；清单有而类型没有 → 前端无类型可用
const _missingFromList: Exclude<IntlProcurementKey, ListKeys> extends never ? true : false = true;
const _extraInList: Exclude<ListKeys, IntlProcurementKey> extends never ? true : false = true;

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

describe("国际采购字段口径", () => {
  it("清单与类型键集完全一致（编译期断言已生效，此处校验基数与无重复）", () => {
    expect(_missingFromList).toBe(true);
    expect(_extraInList).toBe(true);
    expect(new Set(INTL_PROCUREMENT_COLUMNS).size).toBe(INTL_PROCUREMENT_COLUMNS.length);
    expect(INTL_PROCUREMENT_COLUMNS.length).toBe(17);
  });

  it("有机会行时逐键透出，键集恰等于清单", () => {
    const opportunity = Object.fromEntries(
      INTL_PROCUREMENT_COLUMNS.map((c, i) => [c, `v${i}`]),
    );
    const payload = normalizeNoticeDetailPayload(NOTICE_ROW, undefined, opportunity) as {
      intl_procurement: Record<string, unknown>;
    };
    expect(Object.keys(payload.intl_procurement).sort()).toEqual([...INTL_PROCUREMENT_COLUMNS].sort());
    expect(payload.intl_procurement.evaluation_method).toBe("v10");
    expect(payload.intl_procurement.submission_mode).toBe("v6");
  });

  it("无机会行时全键存在且为 null（不缺键，前端无需字段存在性判断）", () => {
    const payload = normalizeNoticeDetailPayload(NOTICE_ROW) as {
      intl_procurement: Record<string, unknown>;
    };
    for (const col of INTL_PROCUREMENT_COLUMNS) {
      expect(payload.intl_procurement).toHaveProperty(col);
      expect(payload.intl_procurement[col]).toBeNull();
    }
  });

  it("截止时区与原文摘要随机会行透出（无它则国际标 09:30 当地时间截止无法正确倒计时）", () => {
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
