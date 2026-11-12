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

import { formatItems, ensureNoticePk } from "@/lib/services/search-orchestrator/format";

describe("formatItems", () => {
  it("空行 → 空数组", () => {
    expect(formatItems([])).toEqual([]);
  });

  it("服务表原字段直出：不再抹列、不再布尔归一", () => {
    const rows = [{
      id: 1, notice_pk: 1, buyer_name: "UNDP", is_featured: 1,
      source_url: "https://www.undp.org/x", organization: "UNDP", country_codes: ["US"],
    }] as never;
    const result = formatItems(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    // is_featured 直出服务表/主表原值（tinyint 0|1）：前端只做真值判断，
    // 这里曾把它强转 boolean，服务表切换后一律原字段直出，不再起转换别名
    expect(result[0].is_featured).toBe(1);
    expect(result[0].core_locked).toBe(true);
    // 旧版把 organization 硬置 null（当时宽表无真值）；服务表有值 ⇒ 不得再抹
    expect(result[0].organization).toBe("UNDP");
    // source_url / platform_name 是仅有的两个剔除列（2026-10-28 用户口径：来源平台
    // 属解锁后可见信息，列表不下发，/detail 独家）；其余列仍原字段直出
    expect(result[0].source_url).toBeUndefined();
    expect(result[0].platform_name).toBeUndefined();
    // 旧品类码快照列已物理退役：*_codes 形制只剩服务表真列 country_codes
    for (const k of Object.keys(result[0])) {
      if (/_codes$/.test(k)) expect(k).toBe("country_codes");
    }
  });

  it("附件计数由服务表 attachments 承担，formatItems 不再凭空造 breakdown_file_count", () => {
    // 列表侧不再解析 documents/procurement_files 造计数（详情未锁定分支走
    // collectBreakdownFiles(notice)，数据源是服务表 attachments JSON）
    const rows = [{ id: 1, attachments: [{ url: "https://a" }] }] as never;
    const result = formatItems(rows);
    expect(result[0].breakdown_file_count).toBeUndefined();
    expect(result[0].attachments).toEqual([{ url: "https://a" }]);
  });

  it("is_featured=0 → 原值直出 0（不转 boolean）", () => {
    const rows = [{ id: 1, is_featured: 0 }] as never;
    const result = formatItems(rows);
    expect(result[0].is_featured).toBe(0);
  });

  it("降级多表 JOIN 行（只带 id）→ 补齐 notice_pk，供 NoticeList key 使用", () => {
    // bid_notices.id 即 notice_pk（三表同值，见 baseline.sql）：宽表未就绪的降级路径
    // 与推荐路径按主表 id 投影，行里没有 notice_pk ⇒ formatItems 统一补齐，
    // 否则 NoticeList 的 key={item.notice_pk} 拿到 undefined 触发 React 缺失 key 警告
    const rows = [{ id: 123, notice_id: "N123", title: "T" }] as never;
    const result = formatItems(rows);
    expect(result[0].notice_pk).toBe(123);
  });

  it("服务表直读行（已带 notice_pk）→ 不被 id 覆盖", () => {
    const rows = [{ id: 5, notice_pk: 888, title: "T" }] as never;
    const result = formatItems(rows);
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
