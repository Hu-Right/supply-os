/**
 * 错误码表唯一性门禁
 *
 * 码表是一张平铺常量表（EC_<DOMAIN>_<REASON> = <number>），数值即对外契约：
 * 前端 error-map 按数值翻译文案。两个常量共用一个数值时，后写入域的语义会被
 * 先写入域的解释覆盖（实例：RFQ 需求域原稿取 40080，与 EC_PAYMENT_INDUSTRY_INVALID
 * 撞号，"需求不存在"会被翻成"支付行业参数非法"）。
 *
 * 本用例静态解析常量表，断言数值全局唯一、且都是正的安全整数。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const API_CONSTANTS_PATH = resolve(__dirname, "../../../../src/shared/constants/api.ts");

interface CodeEntry {
  name: string;
  code: number;
  line: number;
}

function parseErrorCodes(source: string): CodeEntry[] {
  const entries: CodeEntry[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    const m = /^\s*export const (EC_[A-Z0-9_]+)\s*=\s*(\d+)\s*;/.exec(line);
    if (m) {
      const raw = m[2] ?? "";
      entries.push({ name: m[1] ?? "", code: Number(raw), line: index + 1 });
    }
  });
  return entries;
}

describe("EC_ 错误码表", () => {
  const source = readFileSync(API_CONSTANTS_PATH, "utf8");
  const entries = parseErrorCodes(source);

  it("常量表可被解析（解析失败说明码表写法变了，本门禁需要同步）", () => {
    expect(entries.length).toBeGreaterThan(50);
  });

  it("同一数值不得被两个常量共用", () => {
    const byCode = new Map<number, CodeEntry[]>();
    for (const entry of entries) {
      const bucket = byCode.get(entry.code) ?? [];
      bucket.push(entry);
      byCode.set(entry.code, bucket);
    }
    const duplicates = [...byCode.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([code, list]) => `${code}: ${list.map((e) => `${e.name}(L${e.line})`).join(", ")}`);

    expect(duplicates).toEqual([]);
  });

  it("码值均为正的安全整数", () => {
    for (const entry of entries) {
      expect(Number.isSafeInteger(entry.code)).toBe(true);
      expect(entry.code).toBeGreaterThan(0);
    }
  });
});
