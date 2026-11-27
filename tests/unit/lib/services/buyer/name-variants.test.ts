/**
 * buyer/name-variants：机构路径 → 候选匹配键
 *
 * @description 2026-11-27 新增。ES/US 源把机构层级拼成 `A>B>C` 当买家名，整串匹配不上，
 *              这里锁住「整串优先、末段向上回溯、层级词跳过、最多 3 个末段候选」的形状。
 */
import { describe, expect, it } from "vitest";
import { buyerNameKeys, isHierarchySegment, orgPathSegments } from "@/lib/services/buyer/name-variants";

describe("orgPathSegments", () => {
  it("按 > / ＞ / » / || 拆段，去空白", () => {
    expect(orgPathSegments("A>B>C")).toEqual(["A", "B", "C"]);
    expect(orgPathSegments("A ＞ B » C")).toEqual(["A", "B", "C"]);
    expect(orgPathSegments("A||B||C")).toEqual(["A", "B", "C"]);
    expect(orgPathSegments("   ")).toEqual([]);
    expect(orgPathSegments(null)).toEqual([]);
  });

  it("单个 | 与 / 不当作分隔符（避免误伤机构名）", () => {
    expect(orgPathSegments("Ministry of Health/NHS")).toEqual(["Ministry of Health/NHS"]);
    expect(orgPathSegments("A|B")).toEqual(["A|B"]);
  });
});

describe("isHierarchySegment", () => {
  it("整段是层级名的才算层级词", () => {
    expect(isHierarchySegment("AYUNTAMIENTOS")).toBe(true);
    expect(isHierarchySegment("DEPT OF DEFENSE")).toBe(true);
    expect(isHierarchySegment("Entidades Locales")).toBe(true);
  });

  it("带专名的段不是层级词", () => {
    expect(isHierarchySegment("Ayuntamiento de Almería")).toBe(false);
    expect(isHierarchySegment("Defense Logistics Agency")).toBe(false);
    expect(isHierarchySegment("TRAGSA")).toBe(false);
  });
});

describe("buyerNameKeys", () => {
  it("普通机构名：只有一个键，行为与改造前一致", () => {
    expect(buyerNameKeys("Prefeitura de X")).toEqual(["PREFEITURA DE X"]);
    expect(buyerNameKeys("")).toEqual([]);
  });

  it("西语路径：整串 + 末段 + 跳过层级词后的上一段", () => {
    expect(buyerNameKeys("ENTIDADES LOCALES>Andalucía>Almería>Ayuntamientos>Almería")).toEqual([
      "ENTIDADES LOCALES>ANDALUCÍA>ALMERÍA>AYUNTAMIENTOS>ALMERÍA",
      "ALMERÍA",
      "ANDALUCÍA",
    ]);
  });

  it("美方路径：跳过 DEPT OF DEFENSE，先取末段", () => {
    expect(
      buyerNameKeys("DEPT OF DEFENSE > DEFENSE LOGISTICS AGENCY > DLA TROOP SUPPORT"),
    ).toEqual([
      "DEPT OF DEFENSE > DEFENSE LOGISTICS AGENCY > DLA TROOP SUPPORT",
      "DLA TROOP SUPPORT",
      "DEFENSE LOGISTICS AGENCY",
    ]);
  });

  it("最多 3 个末段候选，长路径不会无限回溯", () => {
    const keys = buyerNameKeys("AAA1>BBB2>CCC3>DDD4>EEE5>FFF6");
    expect(keys).toHaveLength(4);
    expect(keys.slice(1)).toEqual(["FFF6", "EEE5", "DDD4"]);
  });

  it("全是层级段 → 只有整串一个键", () => {
    expect(buyerNameKeys("ENTIDADES LOCALES>AYUNTAMIENTOS")).toEqual([
      "ENTIDADES LOCALES>AYUNTAMIENTOS",
    ]);
  });
});
