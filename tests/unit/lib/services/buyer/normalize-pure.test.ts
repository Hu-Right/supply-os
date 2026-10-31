/**
 * 中文规范名纯度口径（2026-10-31 用户拍板「中文名就是纯中文」）。
 * 覆盖：判定纯中文、确定性兜底清洗（剥外文片段）、容忍数字/中文标点。
 */
import { describe, it, expect } from "vitest";
import {
  isPureChineseBuyerName, isTooGenericBuyerName, stripForeignSegments,
} from "@/lib/services/buyer/normalize";

describe("isPureChineseBuyerName", () => {
  it("纯中文（含数字/中文标点）→ true", () => {
    expect(isPureChineseBuyerName("南非国家电力公司")).toBe(true);
    expect(isPureChineseBuyerName("第275号管理处")).toBe(true);
    expect(isPureChineseBuyerName("通信、信息技术和媒体部（信息通信技术执行秘书处）")).toBe(true);
    expect(isPureChineseBuyerName("圣保罗州环境公司—环境技术中心")).toBe(true);
  });

  it("含任何外文字母/外文单词 → false（含全角字母、缩写、品牌）", () => {
    expect(isPureChineseBuyerName("国家电力公司（Eskom）")).toBe(false);
    expect(isPureChineseBuyerName("教育部 AEDP 项目")).toBe(false);
    expect(isPureChineseBuyerName("ＥＳＫＯＭ 国家电力公司")).toBe(false);
    expect(isPureChineseBuyerName("Kingston and Richmond Hospital NHS基金会信托")).toBe(false);
    expect(isPureChineseBuyerName("Южная тепловая компания")).toBe(false);
    expect(isPureChineseBuyerName("株式会社テスト")).toBe(false);
  });

  it("空值/纯外文/无汉字 → false", () => {
    expect(isPureChineseBuyerName("")).toBe(false);
    expect(isPureChineseBuyerName(null)).toBe(false);
    expect(isPureChineseBuyerName("Eskom Holdings")).toBe(false);
  });
});

describe("isTooGenericBuyerName", () => {
  it("只剩通用词 → true（不能作为规范名落库）", () => {
    expect(isTooGenericBuyerName("有限公司")).toBe(true);
    expect(isTooGenericBuyerName("采购集团")).toBe(true);
    expect(isTooGenericBuyerName("机构")).toBe(true);
    expect(isTooGenericBuyerName("项目管理办公室")).toBe(true);
    expect(isTooGenericBuyerName("管理部门")).toBe(true);
  });

  it("带地域/专名/编号 → false（有身份信息）", () => {
    expect(isTooGenericBuyerName("西部天然气有限公司")).toBe(false);
    expect(isTooGenericBuyerName("卡齐纳州项目")).toBe(false);
    expect(isTooGenericBuyerName("第275号管理处")).toBe(false);
    expect(isTooGenericBuyerName("农业与林业部")).toBe(false);
    expect(isTooGenericBuyerName("南非国家电力公司")).toBe(false);
  });
});

describe("stripForeignSegments（确定性兜底）", () => {
  it("删除含外文的括号段，保留中文主体", () => {
    expect(stripForeignSegments("西部天然气有限公司（PGCL）")).toBe("西部天然气有限公司");
    expect(stripForeignSegments("国际劳工组织国际培训中心（ITC-ILO）")).toBe("国际劳工组织国际培训中心");
  });

  it("删除括号外英文单词/短语", () => {
    expect(stripForeignSegments("教育部 AEDP 项目")).toBe("教育部项目");
    expect(stripForeignSegments("Mutua Universal Mugenat，社会保障合作互助机构第10号"))
      .toBe("社会保障合作互助机构第10号");
  });

  it("重复括号/重复短语残迹被收敛", () => {
    expect(stripForeignSegments("机场安全部队 (ASF) (机场安全部队 (ASF))")).toBe("机场安全部队");
    expect(stripForeignSegments("能源基础设施开发与管理公司 (EIDMC) (能源基础设施开发与管理公司 (EIDMC))"))
      .toBe("能源基础设施开发与管理公司");
  });

  it("剥完没有汉字 → 空串（交给人工复核，不落库）", () => {
    expect(stripForeignSegments("AB Via Lietuva（采购方）")).toBe("");
    expect(stripForeignSegments("Eskom Holdings")).toBe("");
  });
});
