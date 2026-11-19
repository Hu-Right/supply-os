/**
 * 错误码目录（ADR-0021）一致性校验
 * @module tests/unit/shared/errors/catalog
 * @description catalog 是错误码体系的单一事实源：本测试钉住它的完备性与规则一致性。
 *              CI 门禁（check-error-codes.mjs）做静态扫描，这里做运行时结构校验。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as api from "@/shared/constants/api";
import { ERROR_CATALOG, activeErrorDefs, lookupErrorDef, expectedTypeFromConstantName, type ErrorKind } from "@/shared/errors/catalog";

const VALID_STATUSES = [400, 401, 402, 403, 404, 409, 410, 413, 429, 500, 502, 503] as const;
const KINDS: ErrorKind[] = ["system", "network", "auth", "forbidden", "vipGate", "industryWall", "quota", "payment", "business", "ai", "unknown"];
const I18N_LANGS = ["zh", "en", "fr", "ru", "es", "ar", "pt"] as const;

/** 从 api.ts 文本提取全部 EC_ 导出常量名（比 import * 断言更直接：防漏导出） */
const apiSource = readFileSync(join(process.cwd(), "src/shared/constants/api.ts"), "utf8");
const EC_EXPORTED_NAMES = [...apiSource.matchAll(/export const (EC_[A-Z0-9_]+) = (\d+)/g)].map(
  ([, name, value]) => ({ name, code: Number(value) }),
);

describe("ERROR_CATALOG — 完备性", () => {
  it("api.ts 每个 EC_ 导出都在 catalog 登记，且无 catalog 外码", () => {
    expect(EC_EXPORTED_NAMES.length).toBeGreaterThan(100);
    for (const { name, code } of EC_EXPORTED_NAMES) {
      const def = lookupErrorDef(code);
      expect(def, `${name}(${code}) 未登记 catalog`).toBeTruthy();
    }
    for (const def of Object.values(ERROR_CATALOG)) {
      const exported = EC_EXPORTED_NAMES.find((e) => e.code === def.code);
      expect(exported, `catalog 中的 ${def.code} 不是 api.ts 的 EC_ 导出`).toBeTruthy();
    }
    expect(Object.keys(ERROR_CATALOG).length).toBe(EC_EXPORTED_NAMES.length);
  });

  it("code 与 type 均唯一", () => {
    const codes = Object.keys(ERROR_CATALOG).map(Number);
    const types = Object.values(ERROR_CATALOG).map((d) => d.type);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(types).size).toBe(types.length);
  });

  it("status 在判据表合法集内", () => {
    for (const d of Object.values(ERROR_CATALOG)) {
      expect(VALID_STATUSES, `${d.type} status=${d.status} 不在判据表`).toContain(d.status);
    }
  });

  it("kind 是 11 枚举之一；type 是 snake_case", () => {
    for (const d of Object.values(ERROR_CATALOG)) {
      expect(KINDS, `${d.type} kind=${d.kind}`).toContain(d.kind);
      expect(d.type).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe("ERROR_CATALOG — type 派生规则", () => {
  it("生效码 type = EC_ 常量名 snake_case 派生", () => {
    for (const d of activeErrorDefs()) {
      const exported = EC_EXPORTED_NAMES.find((e) => e.code === d.code);
      expect(exported, `${d.type} 找不到对应导出`).toBeTruthy();
      expect(d.type, `${exported!.name} 派生不一致`).toBe(expectedTypeFromConstantName(exported!.name));
    }
  });

  it("deprecated 码 type = 语义名派生 + _legacy（剥改名 _LEGACY 尾），且 aliasOf 指向存在且生效的码", () => {
    for (const d of Object.values(ERROR_CATALOG)) {
      if (!d.deprecatedAliasOf) continue;
      const exported = EC_EXPORTED_NAMES.find((e) => e.code === d.code);
      const semanticName = exported!.name.replace(/_LEGACY$/, "");
      expect(d.type).toBe(`${expectedTypeFromConstantName(semanticName)}_legacy`);
      const target = lookupErrorDef(d.deprecatedAliasOf);
      expect(target, `${d.type} aliasOf ${d.deprecatedAliasOf} 不存在`).toBeTruthy();
      expect(target!.deprecatedAliasOf, "aliasOf 不得指向另一个 deprecated 码").toBeUndefined();
    }
  });
});

describe("ERROR_CATALOG — i18n 覆盖", () => {
  it("每个生效码的 i18nKey 在 7 语 errors.json 中全部存在", () => {
    const bundles = Object.fromEntries(
      I18N_LANGS.map((lang) => [
        lang,
        JSON.parse(readFileSync(join(process.cwd(), `src/core/i18n/locales/${lang}/errors.json`), "utf8")) as Record<string, string>,
      ]),
    );
    for (const d of activeErrorDefs()) {
      for (const lang of I18N_LANGS) {
        expect(typeof bundles[lang][d.i18nKey], `${lang}/${d.i18nKey} 缺失（${d.type}）`).toBe("string");
      }
    }
  });
});

describe("ERROR_CATALOG — 判据表抽查（ADR-0021 §2.1）", () => {
  const cases: Array<[number, number, string, ErrorKind]> = [
    // [code, status, type, kind]
    [40042, 401, "auth_required", "auth"],
    [40013, 401, "account_issue", "auth"], // 密码错误回归 401（ADR-0021 修正）
    [40043, 403, "password_reset_required", "auth"],
    [41201, 403, "content_locked", "forbidden"],
    [40041, 403, "vip_only", "vipGate"],
    [40045, 403, "out_of_category", "industryWall"],
    [40044, 404, "not_found", "business"],
    [40404, 404, "notice_not_found", "business"],
    [40057, 404, "chat_session_missing", "business"],
    [44001, 404, "rfq_not_found", "business"],
    [41001, 402, "free_limit_reached", "quota"],
    [42001, 429, "rate_limited", "system"],
    [41010, 410, "endpoint_retired", "business"],
    [40069, 413, "proxy_response_too_large", "business"],
    [41111, 502, "sms_send_failed", "system"],
    [41109, 503, "sms_not_configured", "system"],
    [44002, 409, "rfq_state_invalid", "business"],
    [41105, 409, "phone_already_bound", "business"],
  ];
  it.each(cases)("code %i → %s / %s / %s", (code, status, type, kind) => {
    const d = lookupErrorDef(code);
    expect(d, `code ${code} 未登记`).toBeTruthy();
    expect(d!.status).toBe(status);
    expect(d!.type).toBe(type);
    expect(d!.kind).toBe(kind);
  });
});
