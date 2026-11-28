/**
 * Meili 文档构建 — 零映射口径（2026-11-28）
 *
 * 钉住四件事：
 * 1. 文档字段用服务表原生名（title_cn / deadline_ts / notice_type_code / buyer_name /
 *    has_attachments / estimated_value），不再出现宽表别名（title_zh / deadline_sec /
 *    notice_type_normalized / documents_count / is_featured / agency / country）；
 * 2. `deadline_ts` 文档内用 0 表示无截止（服务表 DB 是 NULL），`has_deadline` 只服务排序；
 * 3. `backbone_node` 由 `fromBackbonePathColumn` 解析，脏 token 挡在索引外，空列落空数组；
 * 4. 索引 settings 的 filterable 与文档字段一一对应。
 */
import { describe, it, expect } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { buildSyncDocFromPublic } from "@/lib/services/meilisearch/sync";
import { buildNoticeIndexSettings } from "@/lib/services/meilisearch/client";

const doc = (over: Record<string, unknown>) =>
  buildSyncDocFromPublic({ notice_pk: 1, notice_id: "X", ...over } as unknown as RowDataPacket);

describe("meili 文档零映射口径", () => {
  it("字段名 = 服务表原生名，宽表别名一个不留", () => {
    const d = doc({ title_cn: "标题", deadline_ts: 1790000000, has_attachments: 1 });
    expect(d.title_cn).toBe("标题");
    expect(d.deadline_ts).toBe(1790000000);
    expect(d.has_attachments).toBe(1);
    for (const legacy of ["title_zh", "deadline_sec", "notice_type_normalized", "documents_count", "is_featured", "agency", "country"]) {
      expect(d).not.toHaveProperty(legacy);
    }
  });

  it("无截止：deadline_ts=0、has_deadline=0（文档内部约定，DB 仍是 NULL）", () => {
    const d = doc({ deadline_ts: null });
    expect(d.deadline_ts).toBe(0);
    expect(d.has_deadline).toBe(0);
  });

  it("country_codes 支持 JSON 数组与逗号串两种来源", () => {
    expect(doc({ country_codes: ["BR", "AR"] }).country_codes).toEqual(["BR", "AR"]);
    expect(doc({ country_codes: '["BR","AR"]' }).country_codes).toEqual(["BR", "AR"]);
  });

  it("backbone_node 来自 backbone_path，脏 token 不进索引；空列落空数组", () => {
    expect(doc({ backbone_path: "UGT-07,UGT-0702,JUNK,UGT-XY" }).backbone_node).toEqual(["UGT-07", "UGT-0702"]);
    expect(doc({}).backbone_node).toEqual([]);
    expect(doc({ backbone_path: null }).backbone_node).toEqual([]);
    expect(doc({ backbone_path: "" }).backbone_node).toEqual([]);
  });

  it("索引 settings 与文档字段对齐（新属性在、旧别名不在）", () => {
    const filt = buildNoticeIndexSettings().filterableAttributes ?? [];
    for (const f of ["country_code", "country_codes", "buyer_name", "notice_type_code", "deadline_ts", "has_attachments", "estimated_value", "is_opportunity", "backbone_node"]) {
      expect(filt).toContain(f);
    }
    for (const legacy of ["country", "agency", "notice_type_normalized", "deadline_sec", "documents_count", "is_featured"]) {
      expect(filt).not.toContain(legacy);
    }
    const searchable = buildNoticeIndexSettings().searchableAttributes ?? [];
    for (const f of ["title_cn", "description_cn", "title_en", "description_en"]) {
      expect(searchable).toContain(f);
    }
    expect(searchable).not.toContain("title_zh");
    const sortable = buildNoticeIndexSettings().sortableAttributes ?? [];
    expect(sortable).toContain("deadline_ts");
    expect(sortable).not.toContain("deadline_sec");
  });
});

