/**
 * server/data/agency-i18n/translate.ts 测试
 * 覆盖 translateByPattern 的各优先级分支：
 *   精确缩写 > 巴西前缀 > 肯尼亚前缀 > 国际前缀 > 连字符递归 > 关键词兜底 > 非英文直通
 */
import { describe, it, expect } from "vitest";
import { translateByPattern } from "../../../../server/data/agency-i18n/translate";

describe("translateByPattern", () => {
  // ── 空值/空白 ──
  it("空字符串返回 null", () => {
    expect(translateByPattern("")).toBeNull();
    expect(translateByPattern("   ")).toBeNull();
  });

  // ── 精确缩写匹配（最高优先级）──
  it("精确匹配 UNDP", () => {
    const result = translateByPattern("UNDP");
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe("UNDP");
    expect(result!.i18n.zh).toBe("联合国开发计划署");
    expect(result!.i18n.fr).toBe("PNUD");
  });

  it("精确匹配 WHO（大小写不敏感）", () => {
    const result = translateByPattern("who");
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe("WHO");
    expect(result!.i18n.zh).toBe("世界卫生组织");
  });

  it("精确匹配 UNICEF", () => {
    const result = translateByPattern("UNICEF");
    expect(result!.i18n.zh).toBe("联合国儿童基金会");
  });

  // ── 巴西前缀模式 ──
  it("MUNICIPIO DE 前缀", () => {
    const result = translateByPattern("MUNICIPIO DE SAO PAULO");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("市");
    expect(result!.i18n.fr).toContain("Municipalité");
  });

  it("SECRETARIA DE 前缀", () => {
    const result = translateByPattern("SECRETARIA DE SAUDE");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("厅");
  });

  it("FUNDO MUNICIPAL DE 前缀", () => {
    const result = translateByPattern("FUNDO MUNICIPAL DE SAUDE");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("基金");
  });

  it("ESTADO DE 前缀", () => {
    const result = translateByPattern("ESTADO DE MINAS GERAIS");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("州");
  });

  // ── 关键词兜底 ──
  it("COMMITTEE 关键词", () => {
    const result = translateByPattern("SOME COMMITTEE");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("委员会");
  });

  it("MINISTRY 关键词", () => {
    const result = translateByPattern("MINISTRY OF FINANCE");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("部");
  });

  it("UNIVERSITY 关键词", () => {
    const result = translateByPattern("HARVARD UNIVERSITY");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("大学");
  });

  it("BANK 关键词", () => {
    const result = translateByPattern("WORLD BANK");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("银行");
  });

  it("HOSPITAL 关键词", () => {
    const result = translateByPattern("CITY HOSPITAL");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toContain("医院");
  });

  // ── 连字符递归 ──
  it("连字符前缀递归匹配", () => {
    const result = translateByPattern("SANEBAVI - SANEAMENTO BASIC");
    expect(result).not.toBeNull();
    // 递归部分 "SANEAMENTO BASIC" 不含关键词，走英文直通
    expect(result!.canonical).toBeTruthy();
  });

  // ── 非英文直通 ──
  it("纯中文机构名直通", () => {
    const result = translateByPattern("北京市财政局");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toBe("北京市财政局");
    expect(result!.canonical).toBe("北京市财政局");
  });

  // ── 英文无关键词直通 ──
  it("英文无匹配关键词时直通", () => {
    const result = translateByPattern("SOME RANDOM ORG");
    expect(result).not.toBeNull();
    expect(result!.i18n.zh).toBe("SOME RANDOM ORG");
  });

  // ── trim 行为 ──
  it("前后空白被 trim", () => {
    const result = translateByPattern("  UNDP  ");
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe("UNDP");
  });
});
