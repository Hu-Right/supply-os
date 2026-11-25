/**
 * sitemap XML 渲染回归：转义与最小字段
 *
 * 钉住两件事：
 * 1. URL 里的 `&` 必须转义（国别筛选 `?country=DE&page=2` 不转义会让整份 sitemap 无效）；
 * 2. 只输出 loc + lastmod —— changefreq/priority 已被 Google 忽略，写进去只是增大体积。
 */
import { describe, expect, it } from "vitest";
import { escapeXml, renderUrlset } from "@/lib/services/seo/sitemap-xml";

describe("escapeXml", () => {
  it("转义 XML 五个实体", () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
  });

  it("不改变普通 URL", () => {
    const url = "https://osneosmart.com/procurement/notice/1789413641";
    expect(escapeXml(url)).toBe(url);
  });
});

describe("renderUrlset", () => {
  it("空数组输出合法空 urlset（不是空字符串）", () => {
    const xml = renderUrlset([]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("</urlset>");
  });

  it("输出 loc + lastmod，且不带 changefreq/priority", () => {
    const xml = renderUrlset([
      { loc: "https://osneosmart.com/a", lastmod: "2026-11-25T00:00:00.000Z" },
      { loc: "https://osneosmart.com/b" },
    ]);
    expect(xml).toContain("<loc>https://osneosmart.com/a</loc><lastmod>2026-11-25T00:00:00.000Z</lastmod>");
    expect(xml).toContain("<url><loc>https://osneosmart.com/b</loc></url>");
    expect(xml).not.toContain("changefreq");
    expect(xml).not.toContain("priority");
  });

  it("筛选参数里的 & 被转义，xml 仍然可解析", () => {
    const xml = renderUrlset([{ loc: "https://osneosmart.com/procurement?country=DE&page=2" }]);
    expect(xml).toContain("country=DE&amp;page=2");
    expect(xml).not.toMatch(/country=DE&page=2/);
  });
});
