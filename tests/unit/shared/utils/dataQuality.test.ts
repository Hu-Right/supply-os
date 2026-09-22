import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isDeadlineValid,
  formatBudget,
  hasValidSource,
  inferStatusBadge,
} from "@/shared/utils/dataQuality";

describe("dataQuality", () => {
  describe("isDeadlineValid", () => {
    it("null/undefined/0 → 无效", () => {
      expect(isDeadlineValid(null)).toBe(false);
      expect(isDeadlineValid(undefined)).toBe(false);
      expect(isDeadlineValid(0)).toBe(false);
    });

    it("合理截止日期 → 有效", () => {
      // 2027-06-01 (秒级时间戳)
      const sec = Math.floor(new Date("2027-06-01T00:00:00Z").getTime() / 1000);
      expect(isDeadlineValid(sec)).toBe(true);
    });

    it("超出当前年份+2 → 无效", () => {
      // 2126-01-01 (异常年份)
      const sec = Math.floor(new Date("2126-01-01T00:00:00Z").getTime() / 1000);
      expect(isDeadlineValid(sec)).toBe(false);
    });
  });

  describe("formatBudget", () => {
    it("null/undefined/空字符串 → 未公开", () => {
      expect(formatBudget(null)).toBe("未公开");
      expect(formatBudget(undefined)).toBe("未公开");
      expect(formatBudget("")).toBe("未公开");
    });

    it("0/0.00 → 未公开", () => {
      expect(formatBudget("0")).toBe("未公开");
      expect(formatBudget("0.00")).toBe("未公开");
    });

    it("有效金额 → USD 格式化", () => {
      expect(formatBudget("50000")).toBe("USD 50,000");
      expect(formatBudget("1500000")).toBe("USD 1,500,000");
    });
  });

  describe("hasValidSource", () => {
    it("全部为空 → 无效", () => {
      expect(hasValidSource(null, null)).toBe(false);
      expect(hasValidSource("", "")).toBe(false);
      expect(hasValidSource(undefined, undefined)).toBe(false);
    });

    it("有 source_url → 有效", () => {
      expect(hasValidSource("https://example.com", null)).toBe(true);
    });

    it("有 source_name → 有效", () => {
      expect(hasValidSource(null, "UNDP")).toBe(true);
    });
  });

  describe("inferStatusBadge", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("48h 内新建 → new", () => {
      const nowSec = Date.now() / 1000;
      expect(inferStatusBadge({ createSec: nowSec - 3600 })).toBe("new");
    });

    it("截止日期 <= 7 天 → closing-soon", () => {
      const nowSec = Date.now() / 1000;
      // 创建时间超过 48h，避免被 new 优先匹配
      expect(inferStatusBadge({
        createSec: nowSec - 100 * 3600,
        deadlineSec: nowSec + 3 * 24 * 3600,
      })).toBe("closing-soon");
    });

    it("72h 内更新且非新建 → updated", () => {
      const nowSec = Date.now() / 1000;
      expect(inferStatusBadge({
        createSec: nowSec - 100 * 3600,
        updateSec: nowSec - 3600,
      })).toBe("updated");
    });

    it("有附件 → has-attachment", () => {
      expect(inferStatusBadge({ hasAttachment: true })).toBe("has-attachment");
    });

    it("锁定状态 → member-unlock", () => {
      expect(inferStatusBadge({ isLocked: true })).toBe("member-unlock");
    });

    it("无特殊状态 → null", () => {
      const nowSec = Date.now() / 1000;
      expect(inferStatusBadge({
        createSec: nowSec - 100 * 3600,
        updateSec: nowSec - 100 * 3600,
      })).toBeNull();
    });
  });
});
