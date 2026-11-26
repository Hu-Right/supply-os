/**
 * text-preview：锁定态公告概况的截断规则
 *
 * @description 上游（/detail 列表载荷）已按 300 字截断，但硬截常落在句中/词中，
 *              页面看起来像坏了。本测试锁定三级回退：句末标点 > 空格 > 硬切。
 */
import { describe, expect, it } from "vitest";
import { buildNoticeTeaser } from "@/shared/utils/text-preview";

describe("buildNoticeTeaser", () => {
  it("短文本原样返回，不补省略号", () => {
    expect(buildNoticeTeaser("采购 IT 设备一批。")).toBe("采购 IT 设备一批。");
  });

  it("空白归一：换行与连续空格压成一个空格", () => {
    expect(buildNoticeTeaser("a\n\n  b\tc")).toBe("a b c");
  });

  it("超长文本在句末标点处收尾", () => {
    const text = "第一句说明采购内容。" + "第二句补充技术要求。".repeat(40);
    const out = buildNoticeTeaser(text, { limit: 60 });
    expect(out.endsWith("。…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61);
  });

  it("没有句末标点时退到空格（英文长句）", () => {
    const text =
      "Contratacao de empresa para o fornecimento de equipamentos de informatica para camara municipal e demais orgaos";
    const out = buildNoticeTeaser(text, { limit: 60 });
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("  ");
    // 切点必须落在空格上：省略号前不应是半个单词
    const body = out.slice(0, -1);
    expect(text.slice(0, body.length)).toBe(body);
  });

  it("truncated=true 时即使未超限也收尾到句末", () => {
    const text =
      "Prefeitura municipal abre licitacao para aquisicao de equipamentos, com prazo de entrega definido em edital proprio";
    const out = buildNoticeTeaser(text, { limit: 200, truncated: true });
    expect(out.endsWith("…")).toBe(true);
  });

  it("空输入返回空串", () => {
    expect(buildNoticeTeaser("")).toBe("");
    expect(buildNoticeTeaser(null as unknown as string)).toBe("");
  });
});
