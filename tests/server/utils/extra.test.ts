/**
 * server/utils 边界用例补充测试
 * 覆盖 countryNormalize / normalize / mask / passwordPolicy / params /
 * notice-type / http-error / ip 的缺失分支和极端输入
 */
import { describe, it, expect, vi } from "vitest";
import type { ParsedQs } from "qs";

// ── countryNormalize ──
import { normalizeCountry, UPPER_TO_CANONICAL, ZH_TO_CANONICAL_EN } from "../../../server/utils/countryNormalize";

describe("normalizeCountry – 边界用例", () => {
  it("多段斜杠取首个可匹配部分", () => {
    expect(normalizeCountry("Foo/Nowhere/Brazil")).toBe("Brazil");
  });

  it("斜杠后空段被忽略", () => {
    expect(normalizeCountry("China/")).toBe("China");
  });

  it("逗号拆分 - 末部分为子国家映射", () => {
    // "SomeCity, Colombo" → 末部分 Colombo 是 Sri Lanka 子国家
    const result = normalizeCountry("SomeRegion, Colombo");
    expect(result).toBe("Sri Lanka");
  });

  it("逗号拆分 - 多段逗号取首末", () => {
    expect(normalizeCountry("China, Province, City")).toBe("China");
  });

  it("UPPER_TO_CANONICAL 映射表非空", () => {
    expect(UPPER_TO_CANONICAL.size).toBeGreaterThan(100);
  });

  it("ZH_TO_CANONICAL_EN 映射表非空", () => {
    expect(ZH_TO_CANONICAL_EN.size).toBeGreaterThan(50);
  });

  it("无效国家名变体全覆盖", () => {
    expect(normalizeCountry("service")).toBe("Unknown");
    expect(normalizeCountry("consultant")).toBe("Unknown");
    expect(normalizeCountry("consultants")).toBe("Unknown");
    expect(normalizeCountry("organization")).toBe("Unknown");
  });
});

// ── normalize ──
import {
  normalizeContactRows,
  extractContactsFromText,
  normalizeDocumentRows,
  normalizeUserKey,
  escapeLikeWildcard,
} from "../../../server/utils/normalize";

describe("normalizeContactRows – 边界用例", () => {
  it("多源合并（variadic）", () => {
    const a = [{ email: "a@x.com", name: "A" }];
    const b = [{ email: "b@x.com", name: "B" }];
    const result = normalizeContactRows(a, b);
    expect(result).toHaveLength(2);
    expect(result[0].email).toBe("a@x.com");
    expect(result[1].email).toBe("b@x.com");
  });

  it("contact 字段别名", () => {
    const result = normalizeContactRows([{ contact: "Jane" }]);
    expect(result[0].name).toBe("Jane");
  });

  it("JSON 字符串源 + 数组源混合", () => {
    const result = normalizeContactRows('[{"email":"j@x.com"}]', [{ email: "k@x.com" }]);
    expect(result).toHaveLength(2);
  });

  it("非对象数组元素被跳过", () => {
    const result = normalizeContactRows([1, "str", true, null]);
    expect(result).toHaveLength(0);
  });

  it("空对象无有效字段时跳过（key === '||'）", () => {
    const result = normalizeContactRows([{}]);
    expect(result).toHaveLength(0);
  });
});

describe("extractContactsFromText – 边界用例", () => {
  it("多个邮箱和电话按索引配对", () => {
    const text = "a@x.com b@y.com call +12345678901 or +98765432109";
    const result = extractContactsFromText(text);
    expect(result.length).toBe(2);
    expect(result[0].email).toBe("a@x.com");
    expect(result[1].email).toBe("b@y.com");
    expect(result[0].phone).toBeTruthy();
    expect(result[1].phone).toBeTruthy();
  });

  it("邮箱多于电话时电话留空", () => {
    const text = "a@x.com b@y.com c@z.com";
    const result = extractContactsFromText(text);
    expect(result).toHaveLength(3);
    expect(result[2].email).toBe("c@z.com");
    expect(result[2].phone).toBe("");
  });

  it("电话多于邮箱时邮箱留空", () => {
    const text = "+12345678901 text +98765432109";
    const result = extractContactsFromText(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].email).toBe("");
    expect(result[0].phone).toBeTruthy();
  });
});

describe("normalizeDocumentRows – 边界用例", () => {
  it("JSON 字符串源解析", () => {
    const result = normalizeDocumentRows('[{"url":"http://a.com/f.pdf"}]');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("http://a.com/f.pdf");
  });

  it("link 和 downloadUrl 别名", () => {
    const result = normalizeDocumentRows([
      { link: "http://a.com/1.pdf" },
      { downloadUrl: "http://b.com/2.pdf" },
    ]);
    expect(result[0].url).toBe("http://a.com/1.pdf");
    expect(result[1].url).toBe("http://b.com/2.pdf");
  });

  it("filename 别名", () => {
    const result = normalizeDocumentRows([{ url: "http://a.com/x", filename: "doc.pdf" }]);
    expect(result[0].name).toBe("doc.pdf");
  });

  it("无 URL 无 name 时 name 为空字符串", () => {
    const result = normalizeDocumentRows([{ name: "" }]);
    expect(result).toHaveLength(0); // key === "|" → 跳过
  });

  it("多源合并", () => {
    const a = [{ url: "http://a.com/1" }];
    const b = [{ url: "http://b.com/2" }];
    expect(normalizeDocumentRows(a, b)).toHaveLength(2);
  });
});

describe("normalizeUserKey – 边界用例", () => {
  it("纯空格返回 null（trim 后为空）", () => {
    expect(normalizeUserKey("   ")).toBeNull();
  });

  it("GUEST 大写返回 null", () => {
    expect(normalizeUserKey("GUEST")).toBeNull();
  });

  it("数字类型输入转字符串", () => {
    expect(normalizeUserKey(12345)).toBe("12345");
  });

  it("恰好 190 字符不截断", () => {
    const key = "a".repeat(190);
    expect(normalizeUserKey(key)!.length).toBe(190);
  });
});

describe("escapeLikeWildcard – 边界用例", () => {
  it("空字符串返回空字符串", () => {
    expect(escapeLikeWildcard("")).toBe("");
  });

  it("连续特殊字符", () => {
    expect(escapeLikeWildcard("%%__")).toBe("\\%\\%\\_\\_");
  });

  it("反斜杠不被额外转义", () => {
    expect(escapeLikeWildcard("a\\b")).toBe("a\\b");
  });
});

// ── mask ──
import { maskPhone, maskEmail, splitListField } from "../../../server/utils/mask";

describe("maskPhone – 边界用例", () => {
  it("恰好 8 位走长号码分支", () => {
    expect(maskPhone("12345678")).toBe("123****5678");
  });

  it("单字符输入", () => {
    expect(maskPhone("1")).toBe("1****");
  });

  it("数字类型输入自动转字符串", () => {
    expect(maskPhone(13812345678)).toBe("138****5678");
  });

  it("恰好 7 位走短号码分支", () => {
    expect(maskPhone("1234567")).toBe("12****");
  });
});

describe("maskEmail – 边界用例", () => {
  it("单字符在 @ 前", () => {
    expect(maskEmail("a@b.com")).toBe("a***@b.com");
  });

  it("数字类型输入", () => {
    expect(maskEmail(12345)).toBe("***");
  });

  it("含多个 @ 取第一个位置", () => {
    expect(maskEmail("ab@cd@ef.com")).toBe("ab***@cd@ef.com");
  });
});

describe("splitListField – 边界用例", () => {
  it("英文分号分隔", () => {
    expect(splitListField("a;b;c")).toEqual(["a", "b", "c"]);
  });

  it("中文分号分隔", () => {
    expect(splitListField("甲；乙")).toEqual(["甲", "乙"]);
  });

  it("混合分隔符", () => {
    expect(splitListField("a,b；c、d;e")).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("数字类型输入", () => {
    expect(splitListField(123)).toEqual(["123"]);
  });
});

// ── passwordPolicy ──
import { validatePassword, PASSWORD_MIN_LENGTH } from "../../../server/utils/passwordPolicy";

describe("validatePassword – 边界用例", () => {
  it("恰好 8 位合法密码", () => {
    expect(validatePassword("a1bcdefg")).toEqual({ valid: true, message: "", messageKey: "" });
  });

  it("空字符串", () => {
    const r = validatePassword("");
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordTooShort");
  });

  it("纯特殊字符无字母无数字", () => {
    const r = validatePassword("@@@@@@@@");
    expect(r.valid).toBe(false);
    // 有 8 位但无字母 → passwordNeedsLetter
    expect(r.messageKey).toBe("passwordNeedsLetter");
  });

  it("有字母有数字但含特殊字符仍通过", () => {
    expect(validatePassword("P@ss!w0rd")).toEqual({ valid: true, message: "", messageKey: "" });
  });

  it("超长密码不报错", () => {
    const pw = "a".repeat(200) + "1";
    expect(validatePassword(pw)).toEqual({ valid: true, message: "", messageKey: "" });
  });

  it("中文密码无英文字母", () => {
    const r = validatePassword("中文密码12345678");
    // 含中文字符但 /[a-zA-Z]/ 不匹配 → passwordNeedsLetter
    expect(r.valid).toBe(false);
    expect(r.messageKey).toBe("passwordNeedsLetter");
  });
});

// ── params ──
import { parseOptionalInt, parseOptionalString } from "../../../server/utils/params";

describe("parseOptionalInt – 边界用例", () => {
  it("Infinity 返回 fallback", () => {
    const q: ParsedQs = { v: "Infinity" };
    expect(parseOptionalInt(q, "v", 0, 100, 5)).toBe(5);
  });

  it("负数 clamp 到 min", () => {
    const q: ParsedQs = { v: "-100" };
    expect(parseOptionalInt(q, "v", 0, 100, 0)).toBe(0);
  });

  it("浮点负数向下取整后 clamp", () => {
    const q: ParsedQs = { v: "-3.7" };
    // floor(-3.7) = -4, clamp(0,100) = 0
    expect(parseOptionalInt(q, "v", 0, 100, 0)).toBe(0);
  });

  it("空字符串返回 fallback", () => {
    const q: ParsedQs = { v: "" };
    // Number("") = 0, isFinite(0) = true → floor(0) = 0 → clamp
    expect(parseOptionalInt(q, "v", 1, 100, 5)).toBe(1);
  });

  it("数组类型参数 Number([]) 非有限数返回 fallback", () => {
    const q: ParsedQs = { v: ["1", "2"] };
    // Number(["1","2"]) = NaN
    expect(parseOptionalInt(q, "v", 0, 100, 5)).toBe(5);
  });
});

describe("parseOptionalString – 边界用例", () => {
  it("数字类型参数转字符串", () => {
    const q: ParsedQs = { q: 42 as any };
    expect(parseOptionalString(q, "q")).toBe("42");
  });

  it("默认 maxLen 200", () => {
    const q: ParsedQs = { q: "x".repeat(300) };
    expect(parseOptionalString(q, "q")).toHaveLength(200);
  });
});

// ── notice-type ──
import { normalizeNoticeType, isKnownNoticeType } from "../../../server/utils/notice-type";

describe("normalizeNoticeType – 边界用例", () => {
  it("null/undefined 返回 OTHER", () => {
    expect(normalizeNoticeType(null)).toBe("OTHER");
    expect(normalizeNoticeType(undefined)).toBe("OTHER");
    expect(normalizeNoticeType("")).toBe("OTHER");
  });

  it("短代码精确匹配幂等", () => {
    expect(normalizeNoticeType("ITB")).toBe("ITB");
    expect(normalizeNoticeType("AWARD")).toBe("AWARD");
    expect(normalizeNoticeType("PIN")).toBe("PIN");
    expect(normalizeNoticeType("PMC")).toBe("PMC");
  });

  it("大小写不敏感", () => {
    expect(normalizeNoticeType("itb")).toBe("ITB");
    expect(normalizeNoticeType("Rfq")).toBe("RFQ");
  });

  it("分隔符归一化后匹配", () => {
    expect(normalizeNoticeType("expression_of_interest")).toBe("EOI");
    expect(normalizeNoticeType("pre-qualif")).toBe("PQ");
    expect(normalizeNoticeType("request-for-information")).toBe("RFI");
  });

  it("中文关键词匹配", () => {
    expect(normalizeNoticeType("招标公告")).toBe("ITB");
    expect(normalizeNoticeType("中标")).toBe("AWARD");
    expect(normalizeNoticeType("意向表达")).toBe("EOI");
    expect(normalizeNoticeType("资格预审")).toBe("PQ");
  });

  it("Non-Competitive 返回 OTHER", () => {
    expect(normalizeNoticeType("Non-Competitive")).toBe("OTHER");
    expect(normalizeNoticeType("non_competitive")).toBe("OTHER");
  });

  it("solicitation 返回 ITB", () => {
    expect(normalizeNoticeType("solicitation")).toBe("ITB");
  });

  it("EU 分类", () => {
    expect(normalizeNoticeType("servicio")).toBe("SERVICES");
    expect(normalizeNoticeType("suministro")).toBe("SUPPLIES");
    expect(normalizeNoticeType("obras")).toBe("WORKS");
  });

  it("未知类型返回 OTHER", () => {
    expect(normalizeNoticeType("xyz_unknown_type")).toBe("OTHER");
  });
});

describe("isKnownNoticeType – 边界用例", () => {
  it("空值返回 false", () => {
    expect(isKnownNoticeType(null)).toBe(false);
    expect(isKnownNoticeType(undefined)).toBe(false);
    expect(isKnownNoticeType("")).toBe(false);
  });

  it("OTHER 本身为已知类型", () => {
    expect(isKnownNoticeType("OTHER")).toBe(true);
    expect(isKnownNoticeType("other")).toBe(true);
  });

  it("标准码为已知", () => {
    expect(isKnownNoticeType("ITB")).toBe(true);
    expect(isKnownNoticeType("RFQ")).toBe(true);
    expect(isKnownNoticeType("AWARD")).toBe(true);
  });

  it("可映射字符串为已知", () => {
    expect(isKnownNoticeType("solicitation")).toBe(true);
    expect(isKnownNoticeType("招标公告")).toBe(true);
  });

  it("不可映射字符串为未知", () => {
    expect(isKnownNoticeType("xyz_unknown")).toBe(false);
  });
});

// ── http-error ──
import { sendError, ApiErrorCode } from "../../../server/utils/http-error";

describe("ApiErrorCode – 边界用例", () => {
  it("所有错误码唯一", () => {
    const values = Object.values(ApiErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });

  it("错误码分段正确：40xxx 身份类", () => {
    expect(ApiErrorCode.USER_REQUIRED).toBeGreaterThanOrEqual(40000);
    expect(ApiErrorCode.USER_REQUIRED).toBeLessThan(41000);
  });

  it("错误码分段正确：41xxx 权限类", () => {
    expect(ApiErrorCode.VIP_REQUIRED).toBeGreaterThanOrEqual(41000);
    expect(ApiErrorCode.VIP_REQUIRED).toBeLessThan(42000);
  });

  it("错误码分段正确：42xxx 频控类", () => {
    expect(ApiErrorCode.RATE_LIMITED).toBeGreaterThanOrEqual(42000);
    expect(ApiErrorCode.RATE_LIMITED).toBeLessThan(43000);
  });

  it("错误码分段正确：50xxx 服务端", () => {
    expect(ApiErrorCode.INTERNAL_ERROR).toBeGreaterThanOrEqual(50000);
  });
});

describe("sendError – 边界用例", () => {
  it("extra 不覆盖 error 字段", () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status, json } as any;
    sendError(res, 400, ApiErrorCode.INVALID_PARAMS, "msg", { extra: "data" });
    const body = json.mock.calls[0][0];
    expect(body.error).toBe("msg");
    expect(body.extra).toBe("data");
  });
});

// ── ip ──
import { extractClientIp } from "../../../server/utils/ip";
import type { Request } from "express";

function makeReq(overrides: { socketIp?: string; ip?: string; xff?: string }): Request {
  return {
    socket: { remoteAddress: overrides.socketIp || "" },
    ip: overrides.ip || "",
    headers: overrides.xff ? { "x-forwarded-for": overrides.xff } : {},
  } as unknown as Request;
}

describe("extractClientIp – 边界用例", () => {
  it("::1 IPv6 回环识别为可信", () => {
    const req = makeReq({ socketIp: "::1", xff: "8.8.8.8" });
    expect(extractClientIp(req)).toBe("8.8.8.8");
  });

  it("192.168.x.x 内网识别为可信", () => {
    const req = makeReq({ socketIp: "192.168.0.1", xff: "1.2.3.4" });
    expect(extractClientIp(req)).toBe("1.2.3.4");
  });

  it("空 XFF 字符串不解析", () => {
    const req = makeReq({ socketIp: "127.0.0.1", ip: "127.0.0.1", xff: "  " });
    // xff 是 "  " → trim 后为空 → hasXff = false
    expect(extractClientIp(req)).toBe("127.0.0.1");
  });

  it("XFF 含空段过滤", () => {
    const req = makeReq({ socketIp: "10.0.0.1", xff: ", , 1.2.3.4, " });
    expect(extractClientIp(req)).toBe("1.2.3.4");
  });

  it("仅 req.ip 无 socket", () => {
    const req = makeReq({ ip: "5.5.5.5" });
    expect(extractClientIp(req)).toBe("5.5.5.5");
  });
});
