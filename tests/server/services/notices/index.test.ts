/**
 * server/services/notices/ 单元测试
 * 覆盖 normalizeNoticeDetailPayload (数据合并/归一化)
 */
import { describe, it, expect } from "vitest";
import { normalizeNoticeDetailPayload } from "../../../../server/services/notices/index";

describe("normalizeNoticeDetailPayload", () => {
  const baseNotice = {
    id: 1,
    notice_id: "NOTICE-001",
    title: "Test Notice",
    reference: "REF-001",
    description: "Test description",
    agency: "Test Agency",
    country: "US",
    contacts: null,
    documents: null,
    url: "https://example.com/notice",
  };

  it("无 opportunity 时使用 notice 字段", () => {
    const result = normalizeNoticeDetailPayload(baseNotice);
    expect(result.title).toBe("Test Notice");
    expect(result.reference).toBe("REF-001");
    expect(result.agency).toBe("Test Agency");
    expect(result.source_url).toBe("https://example.com/notice");
    expect(result.report_available).toBe(false);
    expect(result.report_url).toBe("");
  });

  it("opportunity 字段优先于 notice", () => {
    const opp = {
      id: 100,
      title: "Opp Title",
      reference: "REF-002",
      agency_full: "Full Agency Name",
      description: "Opp description",
      description_cn: "中文描述",
    };
    const result = normalizeNoticeDetailPayload(baseNotice, null, opp);
    expect(result.title).toBe("Opp Title");
    expect(result.reference).toBe("REF-002");
    expect(result.agency).toBe("Full Agency Name");
    expect(result.description).toBe("Opp description");
    expect(result.description_cn).toBe("中文描述");
    expect(result.report_available).toBe(true);
    expect(result.report_url).toBe("/api/notices/1/report");
  });

  it("core_info 结构正确", () => {
    const opp = { id: 100, reference: "REF-OPP" };
    const result = normalizeNoticeDetailPayload(baseNotice, null, opp);
    expect(result.core_info).toBeDefined();
    expect(result.core_info.notice_id).toBe("NOTICE-001");
    expect(result.core_info.opportunity_id).toBe(100);
    expect(result.core_info.detail_source).toBe("opportunity");
    expect(result.core_info.reference).toBe("REF-OPP");
  });

  it("opportunity_info 存在时结构正确", () => {
    const opp = {
      id: 100,
      status: "active",
      is_qualified: 1,
      audit_status: "approved",
      priority: "high",
    };
    const result = normalizeNoticeDetailPayload(baseNotice, null, opp);
    expect(result.opportunity_info).toBeDefined();
    expect(result.opportunity_info.id).toBe(100);
    expect(result.opportunity_info.status).toBe("active");
    expect(result.opportunity_info.is_qualified).toBe(1);
  });

  it("无 opportunity 时 opportunity_info 为 null", () => {
    const result = normalizeNoticeDetailPayload(baseNotice);
    expect(result.opportunity_info).toBeNull();
  });

  it("unlock 信息正确传递", () => {
    const unlock = { unlock_type: "full", unlocked_at: "2026-01-01" };
    const result = normalizeNoticeDetailPayload(baseNotice, unlock);
    expect(result.unlock_type).toBe("full");
    expect(result.unlocked_at).toBe("2026-01-01");
    expect(result.core_locked).toBe(false);
  });

  it("空 notice 不抛错", () => {
    expect(() => normalizeNoticeDetailPayload({})).not.toThrow();
  });
});
