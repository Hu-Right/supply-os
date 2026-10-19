/**
 * platform/resolve 单测：纯表驱动解析（整键命中 / host 子域后缀下钻 / 未解析回填 / 展示分语言）。
 */
import { describe, it, expect } from "vitest";
import { resolvePlatform, platformCodeForName, platformDisplayName } from "@/lib/services/platform/resolve";
import { normalizePlatformKey } from "@/lib/services/platform/alias-store";
import type { PlatformAliasSnapshot, PlatformAliasEntry } from "@/lib/services/platform/alias-store";

function snap(defs: Array<{ canonical: string; code?: string; kind?: "platform" | "other" | "invalid"; zh?: string; host?: string; aliases: string[] }>): PlatformAliasSnapshot {
  const byKey = new Map<string, PlatformAliasEntry>();
  const byHost = new Map<string, PlatformAliasEntry>();
  for (const d of defs) {
    const entry: PlatformAliasEntry = { canonical: d.canonical, code: d.code ?? null, kind: d.kind ?? "platform", zh: d.zh ?? "", host: d.host ?? "" };
    for (const a of d.aliases) byKey.set(normalizePlatformKey(a), entry);
    if (d.host) byHost.set(d.host.toLowerCase(), entry);
  }
  return { byKey, byHost, formsByCanonical: new Map() };
}

const S = snap([
  { canonical: "TED", code: "ted", zh: "欧盟招标公告网", host: "ted.europa.eu", aliases: ["ted", "TED", "ted.europa.eu"] },
  { canonical: "SAM.gov", code: "sam", zh: "美国联邦采购网", host: "sam.gov", aliases: ["sam", "SAM.gov", "sam.gov"] },
  { canonical: "MTender", code: "mtender", host: "mtender.gov.md", aliases: ["mtender.gov.md"] },
  { canonical: "manual", kind: "invalid", aliases: ["manual"] },
]);

describe("resolvePlatform", () => {
  it("整键命中：短码 / 显示名 / 精确域名", () => {
    expect(resolvePlatform("ted", S).ref?.canonical).toBe("TED");
    expect(resolvePlatform("SAM.gov", S).ref?.canonical).toBe("SAM.gov");
  });
  it("host 形态沿注册域后缀下钻（子域 → 母平台）", () => {
    const r = resolvePlatform("public.mtender.gov.md", S);
    expect(r.ref?.canonical).toBe("MTender");
    expect(r.unresolved).toBe("");
  });
  it("带 scheme/路径的完整 URL 也能命中", () => {
    expect(resolvePlatform("https://www.sam.gov/notice/12345", S).ref?.canonical).toBe("SAM.gov");
  });
  it("表里没有 → 回填 unresolved（不兜底）", () => {
    const r = resolvePlatform("totally-unknown.gov.xx", S);
    expect(r.ref).toBeNull();
    expect(r.unresolved).toBe("totally-unknown.gov.xx");
  });
  it("空串 → 已解析空", () => {
    expect(resolvePlatform("", S)).toEqual({ ref: null, unresolved: "" });
  });
});

describe("platformCodeForName / platformDisplayName", () => {
  it("取码：platform 命中给 slug，非 platform / 未命中给 null", () => {
    expect(platformCodeForName("TED", S)).toBe("ted");
    expect(platformCodeForName("manual", S)).toBeNull(); // invalid
    expect(platformCodeForName("nope.gov", S)).toBeNull();
  });
  it("展示名：zh 用「中文名（简称）」，非 zh 用简称，未解析/invalid 返回空串", () => {
    expect(platformDisplayName("sam.gov", S, "zh")).toBe("美国联邦采购网（SAM.gov）");
    expect(platformDisplayName("sam.gov", S, "en")).toBe("SAM.gov");
    expect(platformDisplayName("nope.gov", S, "zh")).toBe("");
    expect(platformDisplayName("manual", S, "zh")).toBe("");
  });
});
