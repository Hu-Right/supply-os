/**
 * platform/alias-store 单测：唯一读表入口、缓存、降级、归一键折叠、i18n 容错。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import {
  loadPlatformAliasSnapshot,
  normalizePlatformKey,
  hostOf,
  invalidatePlatformAliasCache,
  __resetPlatformAliasStoreForTest,
} from "@/lib/services/platform/alias-store";

beforeEach(() => {
  __resetPlatformAliasStoreForTest();
  vi.restoreAllMocks();
});

describe("normalizePlatformKey（折叠多种拼法）", () => {
  it("域名 / 下划线码 归一到同一无空白键", () => {
    expect(normalizePlatformKey("mercadopublico.cl")).toBe("mercadopublicocl");
    expect(normalizePlatformKey("mercadopublico_cl")).toBe(normalizePlatformKey("mercadopublico.cl"));
    expect(normalizePlatformKey("eprocure.gov.in")).toBe(normalizePlatformKey("eprocure_gov_in"));
  });
  it("去协议 / www / 路径 / userinfo / 端口", () => {
    expect(normalizePlatformKey("https://www.sam.gov/notices/123")).toBe("samgov");
    expect(normalizePlatformKey("user@Host.com:8080/x")).toBe("hostcom");
  });
  it("显示名（含空格/重音）折叠", () => {
    expect(normalizePlatformKey("Mercado Público")).toBe("mercadopublico");
    expect(normalizePlatformKey("Contratación del Estado")).toBe("contrataciondelestado");
  });
});

describe("hostOf（提取点分 host，供后缀下钻）", () => {
  it("host 形态返回点分域（去 scheme/www/路径）", () => {
    expect(hostOf("http://public.mtender.gov.md/abc")).toBe("public.mtender.gov.md");
    expect(hostOf("www.SAM.gov")).toBe("sam.gov");
  });
  it("非 host（无点）视为码/名 → 空串", () => {
    expect(hostOf("ungm")).toBe("");
    expect(hostOf("TED")).toBe("");
    expect(hostOf("")).toBe("");
  });
});

describe("loadPlatformAliasSnapshot", () => {
  function makePool(rows: unknown[]) {
    const query = vi.fn(async () => [rows]);
    return { pool: { query } as unknown as Pool, query };
  }
  const ALIAS_ROWS = [
    { canonical: "TED", platform_code: "ted", alias: "ted.europa.eu", host: "ted.europa.eu", kind: "platform", name_i18n: '{"zh":"欧盟招标公告网","en":"TED"}' },
    { canonical: "TED", platform_code: "ted", alias: "TED", host: "ted.europa.eu", kind: "platform", name_i18n: '{"zh":"欧盟招标公告网"}' },
    { canonical: "DG Market", platform_code: "dgmarket", alias: "mcc.dgmarket.com", host: "dgmarket.com", kind: "platform", name_i18n: null },
    { canonical: "manual", platform_code: "manual", alias: "manual", host: null, kind: "invalid", name_i18n: null },
  ];

  it("按归一键 + host 维表建快照", async () => {
    const { pool } = makePool(ALIAS_ROWS);
    const snap = await loadPlatformAliasSnapshot(pool);
    expect(snap.byKey.get(normalizePlatformKey("ted.europa.eu"))?.canonical).toBe("TED");
    expect(snap.byKey.get("ted")?.zh).toBe("欧盟招标公告网");
    expect(snap.byHost.get("dgmarket.com")?.canonical).toBe("DG Market");
    expect(snap.byKey.get("manual")?.kind).toBe("invalid");
  });

  it("第二次命中缓存，不再查库", async () => {
    const { pool, query } = makePool(ALIAS_ROWS);
    await loadPlatformAliasSnapshot(pool);
    await loadPlatformAliasSnapshot(pool);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("失效缓存后重查", async () => {
    const { pool, query } = makePool(ALIAS_ROWS);
    await loadPlatformAliasSnapshot(pool);
    invalidatePlatformAliasCache();
    await loadPlatformAliasSnapshot(pool);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("name_i18n 非法 JSON：zh 置空但该行仍在，限频告警一次", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool } = makePool([{ canonical: "BAD", platform_code: "bad", alias: "bad", host: null, kind: "platform", name_i18n: "{坏json" }]);
    const snap = await loadPlatformAliasSnapshot(pool);
    expect(snap.byKey.get("bad")?.canonical).toBe("BAD");
    expect(snap.byKey.get("bad")?.zh).toBe("");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("查库失败：无缓存 → 空快照 + 告警", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = { query: vi.fn(async () => { throw new Error("db down"); }) } as unknown as Pool;
    const snap = await loadPlatformAliasSnapshot(pool);
    expect(snap.byKey.size).toBe(0);
    expect(snap.byHost.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
