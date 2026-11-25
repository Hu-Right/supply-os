/**
 * 公开展示取值回归：中文优先 + 回退规则
 *
 * 钉住产品的语言规则：
 * 1. 有有效中文标题 → 用中文；
 * 2. 中文为空/过短/与原文相同 → 回退原文（避免半截机翻顶到 H1）；
 * 3. 摘要中文优先，且固定 300 字上限（付费边界不变）。
 */
import { describe, expect, it } from "vitest";
import { pickDisplayTitle, pickDisplaySummary, pickMetaTitle } from "@/lib/services/notice-public/display";

describe("pickDisplayTitle", () => {
  it("中文标题有效时优先中文", () => {
    expect(
      pickDisplayTitle({
        title: "Multimodal Surface Transportation Services for Contingent Owned Equipment",
        title_cn: "为支持联合国而提供的多式联运地面运输服务",
      }),
    ).toBe("为支持联合国而提供的多式联运地面运输服务");
  });

  it("中文为空回退原文", () => {
    expect(pickDisplayTitle({ title: "Air Charter Services", title_cn: null })).toBe("Air Charter Services");
    expect(pickDisplayTitle({ title: "Air Charter Services", title_cn: "   " })).toBe("Air Charter Services");
  });

  it("中文过短（<4 字）视为不可用", () => {
    expect(pickDisplayTitle({ title: "Tender for IT services", title_cn: "见附件" })).toBe("Tender for IT services");
  });

  it("中文与原文相同视为未翻译", () => {
    expect(pickDisplayTitle({ title: "联合国采购公告", title_cn: "联合国采购公告" })).toBe("联合国采购公告");
  });

  it("两者都空时给出占位", () => {
    expect(pickDisplayTitle({ title: null, title_cn: null, notice_pk: 42 })).toBe("#42");
  });
});

describe("pickDisplaySummary", () => {
  it("中文摘要优先并压平空白", () => {
    expect(pickDisplaySummary({ description: "English body", description_cn: "中文  摘要\n内容" })).toBe(
      "中文 摘要 内容",
    );
  });

  it("无中文时回退原文", () => {
    expect(pickDisplaySummary({ description: "English body", description_cn: null })).toBe("English body");
  });

  it("默认截断 300 字（付费边界）", () => {
    const long = "字".repeat(500);
    expect(pickDisplaySummary({ description_cn: long })).toHaveLength(300);
  });

  it("空内容返回空串", () => {
    expect(pickDisplaySummary({})).toBe("");
  });
});

describe("pickMetaTitle", () => {
  it("短标题不截断", () => {
    expect(pickMetaTitle("短标题")).toBe("短标题");
  });

  it("超长标题截到 60 字并加省略号", () => {
    const long = "字".repeat(80);
    const out = pickMetaTitle(long);
    expect(out).toHaveLength(60);
    expect(out.endsWith("…")).toBe(true);
  });
});
