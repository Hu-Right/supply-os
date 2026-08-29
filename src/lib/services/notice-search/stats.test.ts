import { describe, it, expect } from "vitest";
import { statsKeyFor } from "./stats";
import type { NoticeSearchParams } from "./types";

const base: NoticeSearchParams = {
  page: 1, pageSize: 9, q: "", country: "", agency: "",
  deadlineFrom: "", deadlineTo: "", sort: "deadline_farthest",
  deadlineWithinDays: 0, noticeType: "", featuredOnly: false,
};

describe("statsKeyFor", () => {
  it("无筛选 → active_total", () => {
    expect(statsKeyFor(base)).toContain("active_total");
  });

  it("有 q → null（走 COUNT 查询）", () => {
    expect(statsKeyFor({ ...base, q: "test" })).toBeNull();
  });

  it("有 country → country:key", () => {
    expect(statsKeyFor({ ...base, country: "China" })).toContain("country:China");
  });

  it("有 agency → agency:key", () => {
    expect(statsKeyFor({ ...base, agency: "UNDP" })).toContain("agency:UNDP");
  });

  it("country + agency → null", () => {
    expect(statsKeyFor({ ...base, country: "China", agency: "UNDP" })).toBeNull();
  });

  it("featuredOnly → featured key", () => {
    expect(statsKeyFor({ ...base, featuredOnly: true })).toContain("featured");
  });

  it("有 deadlineFrom → null", () => {
    expect(statsKeyFor({ ...base, deadlineFrom: "2026-01-01" })).toBeNull();
  });

  it("有 noticeType → null", () => {
    expect(statsKeyFor({ ...base, noticeType: "ITB" })).toBeNull();
  });

  it("有 codeId → null", () => {
    expect(statsKeyFor({ ...base, codeId: 42 })).toBeNull();
  });

  it("聚合机构名（_BR 后缀）→ null", () => {
    expect(statsKeyFor({ ...base, agency: "MUNICIPIO_BR" })).toBeNull();
  });

  it("聚合机构名（FORCE_COUNTRY_）→ null", () => {
    expect(statsKeyFor({ ...base, agency: "FORCE_COUNTRY_XYZ" })).toBeNull();
  });
});
