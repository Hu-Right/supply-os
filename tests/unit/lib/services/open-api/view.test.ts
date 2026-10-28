/**
 * 开放 API 行→视图 mapper（命名红线② 在 /api/open/v1/** 的收口点）。
 * 钉三件事：外发键全 camel、值原样透传（含 JSON 列不深改）、basic 档不出现 pro 键。
 */
import { describe, expect, it } from "vitest";
import {
  engineeringItemViewsOf,
  engineeringItemViewOf,
  engineeringStatsViewOf,
  type EngineeringRow,
} from "@/lib/services/open-api/view";

const SNAKE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

/** 递归收集全部键（数组元素也算），用来做「无 snake 键」的反向断言 */
function allKeys(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, acc));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      acc.push(k);
      // JSON 列（contacts/ai_products）是外部内容：其内部键不属于本契约，不扫
      if (!["contacts", "aiProducts", "aiAnalysis"].includes(k)) allKeys(v, acc);
    }
  }
  return acc;
}

const basicRow: EngineeringRow = {
  id: 42,
  title: "Construction of a solar park",
  reference: "EG/2026/PROC-1",
  notice_type: "WORKS",
  agency: "ERA",
  agency_full: "European Resilience Agency",
  country: "Egypt",
  published_date: "12 Mar 2026",
  deadline: "2026-04-30 10:00:00+03",
  deadline_ts: 1777000000,
  estimated_value: "1,200,000 USD",
  industry: "construction",
  status: 0,
  priority: 1,
  source_notice_id: "UNGM-9001",
};

const proRow: EngineeringRow = {
  ...basicRow,
  description: "<p>long text</p>",
  description_cn: "中文描述",
  bid_overview: "概览",
  supplier_conditions: "条件",
  eligibility: "资格",
  technical_hurdles: "技术门槛",
  ai_products: [{ name: "光伏组件", hs: "8541" }],
  ai_analysis: { risk: "high", score: 61 },
  contacts: [{ org: "Procurement Unit", email: "a@b.c" }],
  beneficiary_countries: "Egypt, Jordan",
  registration_level: "Open to all",
  source_url: "https://example.org/notice/9001",
};

describe("engineeringItemViewOf", () => {
  it("basic 行出 15 个键，且全是 camelCase（列名不再出网）", () => {
    const view = engineeringItemViewOf(basicRow);
    expect(Object.keys(view)).toEqual([
      "id",
      "title",
      "reference",
      "noticeType",
      "agency",
      "agencyFull",
      "country",
      "publishedDate",
      "deadline",
      "deadlineTs",
      "estimatedValue",
      "industry",
      "status",
      "priority",
      "sourceNoticeId",
    ]);
  });

  it("值原样透传：不格式化、不补默认、null 保留", () => {
    const view = engineeringItemViewOf({ ...basicRow, reference: null });
    expect(view.estimatedValue).toBe("1,200,000 USD"); // varchar 原值，不 Number()
    expect(view.deadlineTs).toBe(1777000000);
    expect(view.publishedDate).toBe("12 Mar 2026"); // 脏字符串日期不做 ISO 化
    expect(view.reference).toBeNull();
  });

  it("basic 行不产出 pro 键（不在 basic 响应上造一串 null）", () => {
    const view = engineeringItemViewOf(basicRow);
    expect(view).not.toHaveProperty("description");
    expect(view).not.toHaveProperty("contacts");
    expect(view).not.toHaveProperty("sourceUrl");
  });

  it("pro 行补齐 12 个 pro 键，JSON 列原样透传（内部键不深改、不序列化）", () => {
    const view = engineeringItemViewOf(proRow);
    expect(Object.keys(view)).toHaveLength(27);
    expect(view.descriptionCn).toBe("中文描述");
    expect(view.beneficiaryCountries).toBe("Egypt, Jordan");
    expect(view.registrationLevel).toBe("Open to all");
    expect(view.sourceUrl).toBe("https://example.org/notice/9001");
    expect(view.aiProducts).toEqual(proRow.ai_products);
    expect(view.aiAnalysis).toEqual(proRow.ai_analysis);
    expect(view.contacts).toEqual(proRow.contacts);
    // JSON 列里的 snake 键（如 hs）属外部内容，本契约不负责改名
    expect(view.aiProducts).toEqual([{ name: "光伏组件", hs: "8541" }]);
  });

  it("反向断言：视图（含嵌套）里不允许出现 snake 键", () => {
    for (const row of [basicRow, proRow]) {
      const keys = allKeys(engineeringItemViewOf(row));
      expect(keys.filter((k) => SNAKE_KEY.test(k))).toEqual([]);
    }
  });
});

describe("engineeringItemViewsOf / engineeringStatsViewOf", () => {
  it("批量转换保序不裁剪", () => {
    const views = engineeringItemViewsOf([basicRow, { ...basicRow, id: 43 }]);
    expect(views).toHaveLength(2);
    expect(views[0].id).toBe(42);
    expect(views[1].id).toBe(43);
  });

  it("stats 四个 SQL 别名收成 camel，值不动", () => {
    const stats = engineeringStatsViewOf({
      total_count: 1234,
      country_count: 56,
      earliest_date: "01 Jan 2019",
      latest_date: null,
    });
    expect(stats).toEqual({
      totalCount: 1234,
      countryCount: 56,
      earliestDate: "01 Jan 2019",
      latestDate: null,
    });
    expect(allKeys(stats).filter((k) => SNAKE_KEY.test(k))).toEqual([]);
  });
});
