/**
 * src/features/services/data.ts 测试
 * 覆盖 SERVICES 和 SUCCESS_STORIES 静态数据
 */
import { describe, it, expect } from "vitest";
import { SERVICES, SUCCESS_STORIES } from "@/data/services";

describe("SERVICES", () => {
  it("包含 6 个服务项", () => {
    expect(SERVICES).toHaveLength(6);
  });

  it("每个服务项有 title/desc/icon/specs/active", () => {
    for (const svc of SERVICES) {
      expect(svc.title).toBeTruthy();
      expect(svc.desc).toBeTruthy();
      expect(svc.icon).toBeDefined();
      expect(Array.isArray(svc.specs)).toBe(true);
      expect(svc.specs.length).toBeGreaterThan(0);
      expect(typeof svc.active).toBe("boolean");
    }
  });

  it("所有服务项当前为 active", () => {
    expect(SERVICES.every((s) => s.active)).toBe(true);
  });
});

describe("SUCCESS_STORIES", () => {
  it("包含 3 个案例", () => {
    expect(SUCCESS_STORIES).toHaveLength(3);
  });

  it("每个案例有 date/title/description", () => {
    for (const story of SUCCESS_STORIES) {
      expect(story.date).toBeTruthy();
      expect(story.title).toBeTruthy();
      expect(story.description).toBeTruthy();
    }
  });
});
