/**
 * Meili 文档映射 — 类目属性必须只有骨架节点码这一套口径（Task 16）
 *
 * 钉住四件事：
 * 1. `backbone_node` / `precise_backbone_node` 都只由 `fromBackbonePathColumn` 解析出来，
 *    形制不符的脏 token 挡在索引外（列形制全库一份口径，读侧不许自己 split）；
 * 2. 两个属性是**两条不同的列**：把 precise 写成 backbone_path（或反之）不会报错，
 *    只会让「人工审核后的精准口径」静默变成全量口径 —— 所以两条断言分开写死；
 * 3. 空列必须落成空数组而不是 null/空串：Meili 对 null 属性不建倒排，写空串又会多一个
 *    永远筛不出来的脏值；
 * 4. 两个名字都必须在 `filterableAttributes` 里 —— 少一个，带该筛选的请求就报未知属性错，
 *    整条检索降级 MySQL（语义一致但慢），而且没有任何红信号提示我属性没登记。
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

  it("precise_backbone_node 来自 precise_backbone_path（不是 backbone_path）", () => {
    const d = doc({
      backbone_path: "UGT-07,UGT-0702,UGT-070201",
      precise_backbone_path: "UGT-07,UGT-0702,UGT-070201,UGT-0702010204",
    });
    // 精准链比全量链深一层：两条列各取各的，写反了这里就会相等
    expect(d.precise_backbone_node).toEqual(d.backbone_node.concat("UGT-0702010204"));
    expect(d.precise_backbone_node).not.toEqual(d.backbone_node);
  });

  it("空列 / NULL 一律空数组，不写 null 也不写空串", () => {
    expect(doc({}).backbone_node).toEqual([]);
    expect(doc({ backbone_path: null }).precise_backbone_node).toEqual([]);
    expect(doc({ backbone_path: "" }).backbone_node).toEqual([]);
  });

  it("两个属性都登记进 filterableAttributes（漏一个就是整条链路静默降级）", () => {
    const filt = buildNoticeIndexSettings().filterableAttributes ?? [];
    expect(filt).toContain("backbone_node");
    expect(filt).toContain("precise_backbone_node");
  });
});
