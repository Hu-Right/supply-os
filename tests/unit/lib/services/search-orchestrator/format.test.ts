import { describe, it, expect, vi } from "vitest";

// Mock 外部依赖
vi.mock("@/lib/services/notice-search/agencies/index", () => ({
  getAgencyCacheData: () => null,
}));
vi.mock("@/lib/services/agency/index", () => ({
  classifyAgencyType: () => null,
}));
vi.mock("@/lib/data/agency-i18n/translate", () => ({
  translateByPattern: () => null,
}));

import { matchScoreToTierLabel, formatItems, ensureNoticePk } from "@/lib/services/search-orchestrator/format";

describe("matchScoreToTierLabel", () => {
  it("score ≥ 5 → precise", () => {
    expect(matchScoreToTierLabel(5)).toBe("precise");
    expect(matchScoreToTierLabel(10)).toBe("precise");
  });

  it("score ≥ 2 且 < 5 → relevant", () => {
    expect(matchScoreToTierLabel(2)).toBe("relevant");
    expect(matchScoreToTierLabel(4)).toBe("relevant");
  });

  it("score < 2 → unmatched", () => {
    expect(matchScoreToTierLabel(0)).toBe("unmatched");
    expect(matchScoreToTierLabel(1)).toBe("unmatched");
  });
});

describe("formatItems", () => {
  it("空行 → 空数组", () => {
    expect(formatItems([], "en")).toEqual([]);
  });

  it("服务表原字段直出：不再抹列、不再布尔归一", () => {
    const rows = [{
      id: 1, notice_pk: 1, buyer_name: "UNDP", is_featured: 1,
      source_url: "https://www.undp.org/x", organization: "UNDP", country_codes: ["US"],
    }] as never;
    const result = formatItems(rows, "en");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    // is_featured 直出服务表/主表原值（tinyint 0|1）：前端只做真值判断，
    // 这里曾把它强转 boolean，服务表切换后一律原字段直出，不再起转换别名
    expect(result[0].is_featured).toBe(1);
    expect(result[0].core_locked).toBe(true);
    // 旧版把 organization/source_url 硬置 null（当时宽表无真值）；服务表两列有值 ⇒ 不得再抹
    expect(result[0].organization).toBe("UNDP");
    expect(result[0].source_url).toBe("https://www.undp.org/x");
    // 旧品类码快照列已物理退役：*_codes 形制只剩服务表真列 country_codes
    for (const k of Object.keys(result[0])) {
      if (/_codes$/.test(k)) expect(k).toBe("country_codes");
    }
  });

  it("附件计数由服务表 attachments 承担，formatItems 不再凭空造 breakdown_file_count", () => {
    // 列表侧不再解析 documents/procurement_files 造计数（详情未锁定分支走
    // collectBreakdownFiles(notice)，数据源是服务表 attachments JSON）
    const rows = [{ id: 1, attachments: [{ url: "https://a" }] }] as never;
    const result = formatItems(rows, "en");
    expect(result[0].breakdown_file_count).toBeUndefined();
    expect(result[0].attachments).toEqual([{ url: "https://a" }]);
  });

  it("画像节点码命中公告 backbone 链 → match_score + match_tier", () => {
    const rows = [{ id: 1, backbone_path: "UGT-43,UGT-4321,UGT-432115,UGT-43211503" }] as never;
    const profileNodes = [{ level: 4, node: "UGT-43211503" }];
    const result = formatItems(rows, "en", profileNodes);
    expect(result[0].match_score).toBe(5);
    expect(result[0].match_tier).toBe("precise");
  });

  it("深浅两档同时命中 → 取最深档定分（放宽到 L2 也不能把精准命中降成 relevant）", () => {
    const rows = [{ id: 1, backbone_path: "UGT-43,UGT-4321,UGT-432115,UGT-43211503" }] as never;
    const profileNodes = [
      { level: 4, node: "UGT-43211503" },
      { level: 2, node: "UGT-4321" },
    ];
    expect(formatItems(rows, "en", profileNodes)[0].match_score).toBe(5);
  });

  it("backbone 链不含任何一档节点码 / 列为空 → 不挂徽章", () => {
    const miss = [{ id: 1, backbone_path: "UGT-30,UGT-3011" }] as never;
    const result = formatItems(miss, "en", [{ level: 4, node: "UGT-43211503" }]);
    expect(result[0].match_score).toBeUndefined();
    expect(result[0].match_tier).toBeUndefined();
    // 降级多表 JOIN 路径的行根本没有这一列：同样不挂徽章，不能因为 undefined 就报错
    const noCol = [{ id: 2 }] as never;
    expect(formatItems(noCol, "en", [{ level: 2, node: "UGT-43" }])[0].match_tier).toBeUndefined();
  });

  it("列里的脏 token 不参与命中：只认 UGT- 形制的码", () => {
    const rows = [{ id: 1, backbone_path: "721015,UGT-XY" }] as never;
    const result = formatItems(rows, "en", [{ level: 2, node: "721015" }, { level: 3, node: "UGT-XY" }]);
    expect(result[0].match_tier).toBeUndefined();
  });

  it("is_featured=0 → 原值直出 0（不转 boolean）", () => {
    const rows = [{ id: 1, is_featured: 0 }] as never;
    const result = formatItems(rows, "en");
    expect(result[0].is_featured).toBe(0);
  });

  it("降级多表 JOIN 行（只带 id）→ 补齐 notice_pk，供 NoticeList key 使用", () => {
    // crm_bid_notices.id 即 notice_pk（三表同值，见 baseline.sql）：宽表未就绪的降级路径
    // 与推荐路径按主表 id 投影，行里没有 notice_pk ⇒ formatItems 统一补齐，
    // 否则 NoticeList 的 key={item.notice_pk} 拿到 undefined 触发 React 缺失 key 警告
    const rows = [{ id: 123, notice_id: "N123", title: "T" }] as never;
    const result = formatItems(rows, "en");
    expect(result[0].notice_pk).toBe(123);
  });

  it("服务表直读行（已带 notice_pk）→ 不被 id 覆盖", () => {
    const rows = [{ id: 5, notice_pk: 888, title: "T" }] as never;
    const result = formatItems(rows, "en");
    expect(result[0].notice_pk).toBe(888);
  });
});

describe("ensureNoticePk — 列表项主键统一（id 即 notice_pk）", () => {
  it("只带 id 的行 → 补 notice_pk = Number(id)", () => {
    const out = ensureNoticePk({ id: 42, title: "x" } as Record<string, unknown>);
    expect(out.notice_pk).toBe(42);
  });

  it("已带 notice_pk 的行不动（服务表直读口径优先）", () => {
    const out = ensureNoticePk({ id: 7, notice_pk: 99 } as Record<string, unknown>);
    expect(out.notice_pk).toBe(99);
  });

  it("id 与 notice_pk 皆无 → 不凭空造字段", () => {
    const out = ensureNoticePk({ title: "x" } as Record<string, unknown>);
    expect(out.notice_pk).toBeUndefined();
  });
});
