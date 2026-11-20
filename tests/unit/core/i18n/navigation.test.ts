/**
 * 语言切换 URL 归属 单测
 *
 * 为什么要有这条门禁：语言曾经只写在 Cookie 里，切换后 URL 不变，
 * 导致同一页面既是中文页又是英文页（canonical/收录互相打架）。
 * 这里把「哪个语言对应哪个 URL」的映射钉死在测试里。
 */
import { describe, it, expect } from "vitest";
import {
  isEnglishPath,
  stripEnglishPrefix,
  englishPathFor,
  localeHref,
} from "@/core/i18n/navigation";

describe("isEnglishPath", () => {
  it("识别 /en 前缀", () => {
    expect(isEnglishPath("/en")).toBe(true);
    expect(isEnglishPath("/en/procurement")).toBe(true);
    expect(isEnglishPath("/procurement")).toBe(false);
    // 不能把 /enterprise 之类误判成英文站
    expect(isEnglishPath("/enterprise")).toBe(false);
    expect(isEnglishPath("/enx")).toBe(false);
  });
});

describe("stripEnglishPrefix", () => {
  it("去掉前缀后得到中文路径", () => {
    expect(stripEnglishPrefix("/en")).toBe("/");
    expect(stripEnglishPrefix("/en/procurement")).toBe("/procurement");
    expect(stripEnglishPrefix("/en/procurement/notice/42")).toBe("/procurement/notice/42");
  });

  it("中文路径原样返回", () => {
    expect(stripEnglishPrefix("/procurement")).toBe("/procurement");
    expect(stripEnglishPrefix("/")).toBe("/");
  });
});

describe("englishPathFor", () => {
  it("已建英文页的中文路径有对应关系", () => {
    expect(englishPathFor("/")).toBe("/en");
    expect(englishPathFor("/procurement")).toBe("/en/procurement");
    expect(englishPathFor("/procurement/notice/1788469359")).toBe("/en/procurement/notice/1788469359");
  });

  it("没有英文页返回 null（由调用方回落到 /en）", () => {
    expect(englishPathFor("/membership")).toBeNull();
    expect(englishPathFor("/settings/profile")).toBeNull();
  });
});

describe("localeHref", () => {
  it("中文页切英文 → 原地翻译（Cookie），不跳 /en", () => {
    expect(localeHref("/", "en")).toBeNull();
    expect(localeHref("/procurement", "en")).toBeNull();
    expect(localeHref("/procurement/notice/7", "en")).toBeNull();
    expect(localeHref("/membership", "en")).toBeNull();
  });

  it("英文页切英文 → 停留", () => {
    expect(localeHref("/en/procurement", "en")).toBeNull();
  });

  it("英文页切中文/其他语言 → 回到去掉前缀的中文路径", () => {
    expect(localeHref("/en/procurement", "zh")).toBe("/procurement");
    expect(localeHref("/en", "zh")).toBe("/");
    expect(localeHref("/en/procurement/notice/7", "fr")).toBe("/procurement/notice/7");
  });

  it("中文页切非 URL 化语言 → 停留当前 URL（Cookie 生效）", () => {
    expect(localeHref("/procurement", "fr")).toBeNull();
    expect(localeHref("/procurement", "ar")).toBeNull();
    expect(localeHref("/procurement", "zh")).toBeNull();
  });
});
