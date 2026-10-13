/**
 * Meili 文档映射 — 类目属性只有 backbone_node 这一套口径（precise 已随 candidates 表退役）
 *
 * 钉住三件事：
 * 1. `backbone_node` 只由 `fromBackbonePathColumn` 解析出来，形制不符的脏 token 挡在索引外
 *    （列形制全库一份口径，读侧不许自己 split）；
 * 2. 空列必须落成空数组而不是 null/空串：Meili 对 null 属性不建倒排，写空串又会多一个
 *    永远筛不出来的脏值；
 * 3. backbone_node 必须在 `filterableAttributes` 里、precise_backbone_node 必须不在 ——
 *    前者缺位带该筛选就报未知属性错降级 MySQL，后者残留说明退役没到位。
 */
import { describe, it, expect } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { buildSyncDocFromWideTable } from "@/lib/services/meilisearch/sync";
import { buildNoticeIndexSettings } from "@/lib/services/meilisearch/client";

const doc = (over: Record<string, unknown>) =>
  buildSyncDocFromWideTable({ id: 1, notice_id: "X", ...over } as unknown as RowDataPacket);

describe("meili 文档类目属性", () => {
  it("backbone_node 来自 backbone_path，脏 token 不进索引", () => {
    const d = doc({ backbone_path: "UGT-07,UGT-0702,JUNK,UGT-XY" });
    expect(d.backbone_node).toEqual(["UGT-07", "UGT-0702"]);
  });

  it("空列 / NULL 一律空数组，不写 null 也不写空串", () => {
    expect(doc({}).backbone_node).toEqual([]);
    expect(doc({ backbone_path: null }).backbone_node).toEqual([]);
    expect(doc({ backbone_path: "" }).backbone_node).toEqual([]);
  });

  it("backbone_node 登记进 filterableAttributes，precise_backbone_node 已退役缺席", () => {
    const filt = buildNoticeIndexSettings().filterableAttributes ?? [];
    expect(filt).toContain("backbone_node");
    expect(filt).not.toContain("precise_backbone_node");
  });
});
