/**
 * Feature Flag 系统单元测试
 * Feature Flag System Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isFeatureEnabled, getAllFlagsStatus, FEATURE_FLAGS } from "@/core/flags";

describe("core/flags", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isFeatureEnabled", () => {
    it('返回 true 当环境变量值为 "on"', () => {
      process.env.FEATURE_NEW_HOME = "on";
      expect(isFeatureEnabled("FEATURE_NEW_HOME")).toBe(true);
    });

    it('返回 true 当环境变量值为 "ON"（不区分大小写）', () => {
      process.env.FEATURE_NEW_HOME = "ON";
      expect(isFeatureEnabled("FEATURE_NEW_HOME")).toBe(true);
    });

    it('返回 true 当环境变量值为 "On"（混合大小写）', () => {
      process.env.FEATURE_NEW_HOME = "On";
      expect(isFeatureEnabled("FEATURE_NEW_HOME")).toBe(true);
    });

    it('返回 false 当环境变量值为 "off"', () => {
      process.env.FEATURE_NEW_HOME = "off";
      expect(isFeatureEnabled("FEATURE_NEW_HOME")).toBe(false);
    });

    it("返回 false 当环境变量未设置", () => {
      delete process.env.FEATURE_NEW_HOME;
      expect(isFeatureEnabled("FEATURE_NEW_HOME")).toBe(false);
    });

    it("返回 false 当环境变量为空字符串", () => {
      process.env.FEATURE_NEW_HOME = "";
      expect(isFeatureEnabled("FEATURE_NEW_HOME")).toBe(false);
    });

    it("返回 false 当环境变量为其他值", () => {
      process.env.FEATURE_NEW_HOME = "true";
      expect(isFeatureEnabled("FEATURE_NEW_HOME")).toBe(false);
    });
  });

  describe("FEATURE_FLAGS 常量", () => {
    it("包含所有预期的功能开关", () => {
      const expectedFlags = [
        "NEW_HOME",
        "ADVANCED_SEARCH",
        "NOTICE_DETAIL_ENHANCED",
        "SUPPLIER_LIBRARY_ENHANCED",
        "SUPPLIER_PROFILE",
        "AWARD_INTELLIGENCE",
        "MEMBERSHIP_TIERS_V2",
        "CRM_AUTH_GUARD",
        "SAVED_SEARCH",
        "RFQ",
        "KNOWLEDGE_CENTER_V2",
        "SERVICES_LIFECYCLE",
        "SHOWROOM_MAP",
        "TRAINING_V2",
      ];

      for (const flag of expectedFlags) {
        expect(FEATURE_FLAGS).toHaveProperty(flag);
        expect(typeof FEATURE_FLAGS[flag as keyof typeof FEATURE_FLAGS]).toBe("string");
      }
    });

    it("所有环境变量名遵循 FEATURE_ 前缀规范", () => {
      for (const envVar of Object.values(FEATURE_FLAGS)) {
        expect(envVar).toMatch(/^FEATURE_[A-Z0-9_]+$/);
      }
    });
  });

  describe("getAllFlagsStatus", () => {
    it("返回所有开关的状态对象", () => {
      process.env.FEATURE_NEW_HOME = "on";
      process.env.FEATURE_CRM_AUTH_GUARD = "on";

      const status = getAllFlagsStatus();

      expect(status.NEW_HOME).toBe(true);
      expect(status.CRM_AUTH_GUARD).toBe(true);
      expect(status.ADVANCED_SEARCH).toBe(false);
    });

    it("未设置的环境变量默认为 false", () => {
      // 清除所有 FEATURE_ 环境变量
      for (const envVar of Object.values(FEATURE_FLAGS)) {
        delete process.env[envVar];
      }

      const status = getAllFlagsStatus();

      for (const value of Object.values(status)) {
        expect(value).toBe(false);
      }
    });
  });

  describe("flags 代理对象", () => {
    it("动态读取环境变量", async () => {
      // 重新导入以获取最新的 process.env
      process.env.FEATURE_NEW_HOME = "on";

      const { flags } = await import("@/core/flags");

      expect(flags.NEW_HOME).toBe(true);
      expect(flags.ADVANCED_SEARCH).toBe(false);
    });

    it("访问不存在的属性返回 false", async () => {
      const { flags } = await import("@/core/flags");

      // @ts-expect-error - 测试不存在的属性
      expect(flags.NONEXISTENT_FLAG).toBe(false);
    });
  });
});
