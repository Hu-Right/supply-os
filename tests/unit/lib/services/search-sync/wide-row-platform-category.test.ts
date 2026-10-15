/**
 * 平台公告分类维度的现状钉桩（原 D8 回归位）—— 读取侧兜底已随旧字典一并退出
 *
 * 历史（已随旧字典一并退役，细节见 docs/adr 与 git 历史）：平台 RFQ 的分类写在主表
 * `category_l1_id/l2_id`（旧字典行 id），而爬虫的品类码落在旧公告桥接表 —— 平台行在桥表里没有记录，
 * 导致宽表旧五级列恒空，平台公告在全局搜索 / 热榜 / 推荐的分类维度上永久缺席。
 * 当年修法是「读取侧把主表分类经旧字典翻成码，再合并进旧五级列」。
 *
 * 现状（2026-10-12 B1 起）：公告分类唯一口径是 `backbone_path`，它只由落点表算出（`loadBackboneMap`）。
 * 旧字典与桥表都已物理 DROP ⇒ 上面那条「读取侧兜底」没有落脚之地：平台行缺归属就是 NULL，
 * 补归属归归属链路，不再在宽表构建里长出第二口径。当年的 ★ D8 用例随该兜底一并退出
 * （`wide-row-loaders.test.ts` 已无该类用例）。
 *
 * 本文件因此只钉四件事，防止兜底再次落回错层或第二口径复活：
 * 1. `buildWideRow` 不读 `category_l*_id` 拼任何分类列；
 * 2. 宽表行里不再出现任何旧口径分类列（按 *level1~5 列族拦截，改名复活同样报错）；
 * 3. 主表两列不再随快照带出（2026-10-15 扫尾批次：线上全 NULL 纯死列，随列 DROP 收刀，
 *    指纹表达式同批摘除）；
 * 4. 无归属落 NULL 而不是空串（门禁 BB7 把空串算违规）。
 */
import { describe, it, expect } from "vitest";
import { buildWideRow } from "@/lib/services/search-sync/wide-row-builder";

const base = {
  id: 1, notice_id: "OSRFQ-000000000001", title: "T", reference: "R", description: "D",
  country: "China", agency: "", notice_type: "RFQ", deadline_sec: 0, is_featured: 0,
  estimated_value: 0, entry_source: "platform", published_date: "2026-09-20",
};

/** 旧口径分类列族（B1 起停写）：宽表行里出现任何 *level1~5 形态都说明第二口径复活 */
const LEGACY_LEVEL_RE = /^\w*level[1-5]$/;

describe("平台公告分类兜底的落位（D8）", () => {
  it("category_l*_id 不再进任何分类列：归属只来自装载层算好的 backbone", () => {
    const row = buildWideRow(
      { ...base, category_l1_id: 10000000, category_l2_id: 10100000 } as never,
      new Map(),
      { backbone: "UGT-01" },
    );
    expect(row.backbone_path).toBe("UGT-01");
    for (const key of Object.keys(row)) expect(key).not.toMatch(LEGACY_LEVEL_RE);
  });

  it("主表自填分类不再随快照带出（2026-10-15 死列收刀，指纹表达式同批摘除）", () => {
    const row = buildWideRow({ ...base } as never, new Map());
    expect(row).not.toHaveProperty("category_l1_id");
    expect(row).not.toHaveProperty("category_l2_id");
  });

  it("爬虫行行为不变：归属同样只来自 backbone", () => {
    const row = buildWideRow(
      { ...base, entry_source: "crawl" },
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
