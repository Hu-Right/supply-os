/**
 * 平台公告分类兜底（D8 回归）
 *
 * 平台 RFQ 的分类写在主表 category_l1_id/l2_id（迁移 069），而爬虫存的 UNSPSC 在
 * crm_bid_notice_unspsc_codes 桥接表 —— 平台行在桥接表里没有记录，导致宽表
 * unspsc_level1/2 恒空，平台公告在全局搜索 / 热榜 / 推荐的分类维度上永久缺席。
 * 优先级：precise（approved 精准码）> legacy（桥接表）> platform category（主表列）。
 */
import { describe, it, expect } from "vitest";
import { buildWideRow } from "@/lib/services/search-sync/wide-row-builder";

const base = {
  id: 1, notice_id: "OSRFQ-000000000001", title: "T", reference: "R", description: "D",
  country: "China", agency: "", notice_type: "RFQ", deadline_sec: 0, is_featured: 0,
  estimated_value: 0, entry_source: "platform", published_date: "2026-09-20",
};

describe("平台公告分类入宽表", () => {
  it("无桥接表记录时用 category_l1_id/l2_id 填 unspsc_level1/2", () => {
    const row = buildWideRow({ ...base, category_l1_id: 10000000, category_l2_id: 10100000 }, new Map());
    expect(row.unspsc_level1).toBe("10000000");
    expect(row.unspsc_level2).toBe("10100000");
    expect(row.unspsc_level3).toBe("");
  });

  it("桥接表已有记录时以桥接表为准并合并平台分类（两者都可被筛到）", () => {
    const row = buildWideRow({ ...base, category_l1_id: 999 }, new Map(), {
      level1: "10", level2: "20", level3: "30", level4: "40", level5: "50",
    });
    expect(row.unspsc_level1.split(",")).toEqual(["10", "999"]);
    expect(row.unspsc_level2).toBe("20");
    expect(row.unspsc_level5).toBe("50");
  });

  it("重复值合并去重（外部标签与用户自填同码时不产生重复项）", () => {
    const row = buildWideRow({ ...base, category_l1_id: 10 }, new Map(), {
      level1: "10", level2: "", level3: "", level4: "", level5: "",
    });
    expect(row.unspsc_level1).toBe("10");
  });

  it("爬虫行（分类列为 NULL）行为不变", () => {
    const row = buildWideRow(
      { ...base, entry_source: "crawl", category_l1_id: null, category_l2_id: null },
      new Map(),
    );
    expect(row.unspsc_level1).toBe("");
    expect(row.unspsc_level2).toBe("");
  });

  it("多值桥接表串与平台分类合并后仍按逗号分隔", () => {
    const row = buildWideRow({ ...base, category_l1_id: 777 }, new Map(), {
      level1: "10,20", level2: "", level3: "", level4: "", level5: "",
    });
    expect(row.unspsc_level1.split(",")).toEqual(["10", "20", "777"]);
  });
});
