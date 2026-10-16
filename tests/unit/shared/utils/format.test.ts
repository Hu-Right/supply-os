/**
 * shared/utils/format — avatarColorFromName 回归
 * （函数从 ContentColumns 组件文件内联定义上收，行为必须一致）
 */
import { describe, expect, it } from "vitest";
import { avatarColorFromName } from "@/shared/utils/format";

describe("avatarColorFromName", () => {
  it("同一名称永远同色（确定性哈希）", () => {
    expect(avatarColorFromName("某某建设集团")).toBe(avatarColorFromName("某某建设集团"));
  });

  it("输出合法 hsl 字符串，色相在 0-359", () => {
    for (const name of ["A", "阿里巴巴", "", "测试-T est 123"]) {
      const color = avatarColorFromName(name);
      const m = /^hsl\((\d{1,3}), 55%, 50%\)$/.exec(color);
      expect(m, `name=${name} → ${color}`).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(0);
      expect(Number(m![1])).toBeLessThan(360);
    }
  });

  it("不同名称大概率得到不同色相（哈希不是常函数）", () => {
    const hues = new Set(["甲公司", "乙公司", "丙公司", "甲公司 "].map((n) => avatarColorFromName(n)));
    expect(hues.size).toBeGreaterThan(1);
  });
});
