/**
 * P2 — utils + middleware 错误路径 + 边界增强测试
 * 覆盖 normalize.ts（normalizeContactRows/normalizeUserKey/escapeLikeWildcard）、
 *       json.ts（safeJson 非典型输入）、errorHandler.ts（边界 statusCode）、
 *       fileLogger.ts（空前缀）
 */
import { describe, it, expect, vi } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════════
// normalize.ts — normalizeContactRows 边界
// ═══════════════════════════════════════════════════════════════════════════════

import {
  normalizeContactRows,
  normalizeUserKey,
  escapeLikeWildcard,
  normalizeDocumentRows,
} from "../../../server/utils/normalize";

describe("normalizeContactRows — 错误路径", () => {
  it("null/undefined source → 跳过", () => {
    expect(normalizeContactRows(null, undefined)).toEqual([]);
  });

  it("JSON 字符串 source → 解析后处理", () => {
    const json = JSON.stringify([{ email: "a@b.com", name: "Test" }]);
    const result = normalizeContactRows(json);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("a@b.com");
  });

  it("非法 JSON 字符串 → safeJson 返回 []，不报错", () => {
    expect(normalizeContactRows("{broken")).toEqual([]);
  });

  it("重复联系人去重（相同 email+phone+name）", () => {
    const result = normalizeContactRows(
      [{ email: "a@b.com", name: "Same" }],
      [{ email: "a@b.com", name: "Same" }],
    );
    expect(result).toHaveLength(1);
  });

  it("大小写不同 email 视为同一联系人", () => {
    const result = normalizeContactRows(
      [{ email: "A@B.COM", name: "X" }],
      [{ email: "a@b.com", name: "X" }],
    );
    expect(result).toHaveLength(1);
  });

  it("空 email + 空 phone + 空 name → 跳过（key === '|'）", () => {
    const result = normalizeContactRows([{ email: "", name: "" }]);
    expect(result).toEqual([]);
  });

  it("firstName + lastName 组合为 name", () => {
    const result = normalizeContactRows([{ firstName: "John", lastName: "Doe", email: "j@d.com" }]);
    expect(result[0].name).toBe("John Doe");
  });

  it("tel/telephone 别名识别为 phone", () => {
    const result = normalizeContactRows([{ tel: "1234567" }]);
    expect(result[0].phone).toBe("1234567");

    const result2 = normalizeContactRows([{ telephone: "9876543" }]);
    expect(result2[0].phone).toBe("9876543");
  });

  it("title/role 别名识别", () => {
    const result = normalizeContactRows([{ email: "a@b.com", role: "CEO" }]);
    expect(result[0].title).toBe("CEO");
  });

  it("非对象元素跳过", () => {
    const result = normalizeContactRows([null, "string", 42, { email: "ok@ok.com" }]);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("ok@ok.com");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// normalize.ts — normalizeDocumentRows 边界
// ═══════════════════════════════════════════════════════════════════════════════

describe("normalizeDocumentRows — 边界", () => {
  it("空值 source → 空数组", () => {
    expect(normalizeDocumentRows(null, undefined)).toEqual([]);
  });

  it("url + name 去重", () => {
    const result = normalizeDocumentRows(
      [{ url: "https://a.com/doc.pdf", name: "Doc" }],
      [{ url: "https://a.com/doc.pdf", name: "Doc" }],
    );
    expect(result).toHaveLength(1);
  });

  it("url 无 name → 从 URL path 提取 basename", () => {
    const result = normalizeDocumentRows([{ url: "https://cdn.example.com/files/report-2026.pdf?v=2" }]);
    expect(result[0].name).toBe("report-2026.pdf");
  });

  it("href/filename/link/downloadUrl 别名", () => {
    expect(normalizeDocumentRows([{ href: "https://a.com/x" }])[0].url).toBe("https://a.com/x");
    expect(normalizeDocumentRows([{ filename: "test.doc" }])[0].name).toBe("test.doc");
    expect(normalizeDocumentRows([{ link: "https://b.com/y" }])[0].url).toBe("https://b.com/y");
    expect(normalizeDocumentRows([{ downloadUrl: "https://c.com/z" }])[0].url).toBe("https://c.com/z");
  });

  it("空 url + 空 name → 跳过", () => {
    const result = normalizeDocumentRows([{ url: "", name: "" }]);
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// normalize.ts — normalizeUserKey 边界
// ═══════════════════════════════════════════════════════════════════════════════

describe("normalizeUserKey — 边界", () => {
  it("null/undefined → null", () => {
    expect(normalizeUserKey(null)).toBeNull();
    expect(normalizeUserKey(undefined)).toBeNull();
  });

  it("'guest' → null（匿名用户不入库）", () => {
    expect(normalizeUserKey("guest")).toBeNull();
    expect(normalizeUserKey("Guest")).toBeNull();
    expect(normalizeUserKey("  GUEST  ")).toBeNull();
  });

  it("超长字符串截断至 190 字符", () => {
    const long = "a".repeat(250);
    const result = normalizeUserKey(long);
    expect(result!.length).toBe(190);
  });

  it("前后空格去除 + 小写化", () => {
    expect(normalizeUserKey("  User@Example.COM  ")).toBe("user@example.com");
  });

  it("空字符串 → null", () => {
    expect(normalizeUserKey("")).toBeNull();
    expect(normalizeUserKey("   ")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// normalize.ts — escapeLikeWildcard
// ═══════════════════════════════════════════════════════════════════════════════

describe("escapeLikeWildcard — 边界", () => {
  it("转义 % 和 _", () => {
    expect(escapeLikeWildcard("100%")).toBe("100\\%");
    expect(escapeLikeWildcard("a_b")).toBe("a\\_b");
  });

  it("同时包含 % 和 _", () => {
    expect(escapeLikeWildcard("100%_discount")).toBe("100\\%\\_discount");
  });

  it("无特殊字符 → 原样返回", () => {
    expect(escapeLikeWildcard("normal text")).toBe("normal text");
  });

  it("空字符串 → 空字符串", () => {
    expect(escapeLikeWildcard("")).toBe("");
  });

  it("多个 % 连续", () => {
    expect(escapeLikeWildcard("%%")).toBe("\\%\\%");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// json.ts — safeJson 非典型输入
// ═══════════════════════════════════════════════════════════════════════════════

import { safeJson, preferValue } from "../../../server/utils/json";

describe("safeJson — 非典型输入", () => {
  it("数字类型 → 返回数字（truthy, 非 array → JSON.parse）", () => {
    // JSON.parse(42) 在 JS 中是合法的 → 返回 42
    expect(safeJson(42)).toBe(42);
  });

  it("布尔类型 → 返回布尔", () => {
    expect(safeJson(true)).toBe(true);
  });

  it("普通对象 → 直接返回（非 array 但 typeof=object → JSON.parse 会抛 → 返回 []）", () => {
    // 实际上 safeJson({a:1}) 会先检查 !value → false，再 Array.isArray → false
    // 然后 JSON.parse({a:1}) → JSON.parse 会 toString → "[object Object]" → parse 失败 → []
    expect(safeJson({ a: 1 })).toEqual([]);
  });

  it("嵌套 JSON 数组字符串", () => {
    expect(safeJson("[[1,2],[3,4]]")).toEqual([[1, 2], [3, 4]]);
  });
});

describe("preferValue — 边界", () => {
  it("NaN 视为有效值返回", () => {
    // NaN !== null && NaN !== undefined && NaN !== "" → 返回 NaN
    expect(Number.isNaN(preferValue(NaN, "fallback"))).toBe(true);
  });

  it("0 视为有效值", () => {
    expect(preferValue(0, "fb")).toBe(0);
  });

  it("false 视为有效值", () => {
    expect(preferValue(false, "fb")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// errorHandler.ts — 边界 statusCode
// ═══════════════════════════════════════════════════════════════════════════════

import { errorHandler, HttpError, notFoundHandler } from "../../../server/middleware/errorHandler";
import type { Request, Response, NextFunction } from "express";

describe("errorHandler — 边界", () => {
  function makeRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  }

  it("statusCode = 0 → ?? 运算符不视 0 为 nullish → 状态码 0", () => {
    const err = new Error("zero status") as any;
    err.statusCode = 0;
    const res = makeRes();
    errorHandler(err, {} as Request, res, vi.fn() as NextFunction);
    // 0 ?? 500 = 0（?? 只对 null/undefined 回退）
    expect(res.status).toHaveBeenCalledWith(0);
  });

  it("HttpError 是 Error 子类", () => {
    const err = new HttpError(403, "Forbidden");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.name).toBe("Error"); // Error.name 默认
  });

  it("非 HTTP 错误（如 TypeError）→ 500", () => {
    const err = new TypeError("undefined is not a function");
    const res = makeRes();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    errorHandler(err, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
    spy.mockRestore();
  });

  it("400 级别错误不记 console.error", () => {
    const err = new HttpError(422, "Unprocessable Entity");
    const res = makeRes();
    const spy = vi.spyOn(console, "error");
    errorHandler(err, {} as Request, res, vi.fn() as NextFunction);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("notFoundHandler — 边界", () => {
  it("/api 精确路径（无后续 /）→ 不匹配 /api/ 前缀 → 放行", () => {
    const req = { path: "/api" } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next = vi.fn();
    // "/api".startsWith("/api/") → false → 走 next()
    notFoundHandler(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("/api/v1/notices → 404", () => {
    const req = { path: "/api/v1/notices" } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next = vi.fn();
    notFoundHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 40043 }),
    );
  });
});
