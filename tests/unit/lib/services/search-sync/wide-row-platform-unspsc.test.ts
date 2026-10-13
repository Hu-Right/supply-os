/**
 * 平台公告分类兜底（D8 回归）—— 兜底位置已从 buildWideRow 上移到装载层
 *
 * 原状：平台 RFQ 的分类写在主表 `category_l1_id/l2_id`（旧字典行 id），而爬虫存的 UNSPSC 在
 * `crm_bid_notice_unspsc_codes` 桥接表 —— 平台行在桥表里没有记录，导致宽表 `unspsc_level1/2` 恒空，
 * 平台公告在全局搜索 / 热榜 / 推荐的分类维度上永久缺席。当年修法是「读取侧合并进 unspsc_level1/2」。
 *
 * 现状（2026-10-12 B1）：公告分类的唯一口径已是 `backbone_path`，而 `backbone_path` 只由桥表 8 位码
 * 算出 ⇒ 「合并进 unspsc_level1/2」等于修在一条没人读的路径上（D8 在 backbone 化那天就已复发，
 * 只是旧断言还绿着）。⇒ 兜底改为在 `loadUnspscByNoticeIds` 里把 `category_l*_id` 经旧字典翻成
 * 8 位码，再走**同一份**挂靠规则；用例见 `wide-row-loaders.test.ts` 的两条「★ D8」。
 *
 * 本文件因此只钉四件事，防止兜底再次落回错层或第二口径复活：
 * 1. `buildWideRow` 不读 `category_l*_id` 拼任何分类列；
 * 2. 宽表行里不再出现任何旧字典分类列（unspsc_level1~5 / precise_level1~5）；
 * 3. 主表两列仍原样带出（指纹锚与主表镜像用途，不是分类口径）；
 * 4. 无归属落 NULL 而不是空串（门禁 BB7 把空串算违规）。
 */
import { describe, it, expect } from "vitest";
import { buildWideRow } from "@/lib/services/search-sync/wide-row-builder";

const base = {
  id: 1, notice_id: "OSRFQ-000000000001", title: "T", reference: "R", description: "D",
  country: "China", agency: "", notice_type: "RFQ", deadline_sec: 0, is_featured: 0,
  estimated_value: 0, entry_source: "platform", published_date: "2026-09-20",
};

/** B1 起停写的十个旧字典分类列：出现在宽表行里就说明第二口径复活 */
const LEGACY_COLUMNS = [
  "unspsc_level1", "unspsc_level2", "unspsc_level3", "unspsc_level4", "unspsc_level5",
  "precise_level1", "precise_level2", "precise_level3", "precise_level4", "precise_level5",
];

describe("平台公告分类兜底的落位（D8）", () => {
  it("category_l*_id 不再进任何分类列：归属只来自装载层算好的 backbone", () => {
    const row = buildWideRow(
      { ...base, category_l1_id: 10000000, category_l2_id: 10100000 },
      new Map(),
      { backbone: "UGT-01" },
    );
    expect(row.backbone_path).toBe("UGT-01");
    for (const col of LEGACY_COLUMNS) expect(row).not.toHaveProperty(col);
  });

  it("主表自填分类仍原样带出（指纹锚 / 主表镜像，不参与分类口径）", () => {
    const row = buildWideRow({ ...base, category_l1_id: 999, category_l2_id: null }, new Map());
    expect(row.category_l1_id).toBe(999);
    expect(row.category_l2_id).toBeNull();
  });

  it("爬虫行行为不变：归属同样只来自 backbone", () => {
    const row = buildWideRow(
      { ...base, entry_source: "crawl", category_l1_id: null, category_l2_id: null },
      new Map(),
      { backbone: "UGT-01,UGT-0101" },
    );
    expect(row.backbone_path).toBe("UGT-01,UGT-0101");
  });

  it("无归属与空串都落 NULL；precise_backbone_path 不在运行期产出（归 ops 回填）", () => {
    expect(buildWideRow(base, new Map(), { backbone: "" }).backbone_path).toBeNull();
    expect(buildWideRow(base, new Map()).backbone_path).toBeNull();
    // 硬事实：allColumns 只含 backbone_path，precise 侧由 ops 用同一份纯函数回填，两处不同写入方
    expect(buildWideRow(base, new Map(), { backbone: "UGT-01" })).not.toHaveProperty("precise_backbone_path");
  });
});
