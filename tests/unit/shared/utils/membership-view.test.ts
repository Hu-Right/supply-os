import { describe, it, expect } from "vitest";
import {
  unlockRemaining,
  isUnlimitedQuota,
  hasUnlockQuota,
  UNLIMITED_QUOTA,
  UNLOCK_BENEFIT_CODE,
} from "@/shared/utils/membership-view";
import type { QuotaBalanceRow } from "@/types";

const pool = (remaining: number | null): QuotaBalanceRow =>
  ({ benefit_code: UNLOCK_BENEFIT_CODE, remaining }) as QuotaBalanceRow;

describe("membership-view — 不限额度哨兵 -1（清理旧 9999 魔法数）", () => {
  it("UNLIMITED_QUOTA 为 -1（与后端 quota_total=-1 同源）", () => {
    expect(UNLIMITED_QUOTA).toBe(-1);
  });

  it("unlockRemaining：缺池→0；remaining=null→-1；有限取非负；负夹到 0", () => {
    expect(unlockRemaining([])).toBe(0);
    expect(unlockRemaining(null)).toBe(0);
    expect(unlockRemaining([pool(null)])).toBe(UNLIMITED_QUOTA);
    expect(unlockRemaining([pool(5)])).toBe(5);
    expect(unlockRemaining([pool(-3)])).toBe(0);
  });

  it("isUnlimitedQuota：仅 -1 为真（含旧 9999 不再视为不限）", () => {
    expect(isUnlimitedQuota(-1)).toBe(true);
    expect(isUnlimitedQuota(0)).toBe(false);
    expect(isUnlimitedQuota(9999)).toBe(false);
  });

  it("hasUnlockQuota：不限或余额>0 为真，0 为假（门控口径）", () => {
    expect(hasUnlockQuota(-1)).toBe(true);
    expect(hasUnlockQuota(3)).toBe(true);
    expect(hasUnlockQuota(0)).toBe(false);
  });
});
