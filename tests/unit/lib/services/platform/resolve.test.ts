/**
 * platform/resolve 单测：纯表驱动解析（整键命中 / host 子域后缀下钻 / 未解析回填 / 展示分语言）。
 */
import { describe, it, expect } from "vitest";
import { resolvePlatform, platformCodeForName, platformInfo, platformInfoWithFallback } from "@/lib/services/platform/resolve";
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

describe("platformCodeForName", () => {
  it("取码：platform 命中给 slug，非 platform / 未命中给 null", () => {
    expect(platformCodeForName("TED", S)).toBe("ted");
    expect(platformCodeForName("manual", S)).toBeNull(); // invalid
    expect(platformCodeForName("nope.gov", S)).toBeNull();
  });
});

describe("platformInfo（服务端回填体）", () => {
  it("命中 platform 给 {canonical,code,zh}；other/invalid/未命中给 null", () => {
    expect(platformInfo("ted.europa.eu", S)).toEqual({ canonical: "TED", code: "ted", zh: "欧盟招标公告网" });
    expect(platformInfo("https://www.sam.gov/n/1", S)).toEqual({ canonical: "SAM.gov", code: "sam", zh: "美国联邦采购网" });
    expect(platformInfo("manual", S)).toBeNull();
    expect(platformInfo("nope.gov", S)).toBeNull();
  });
});

describe("platformInfoWithFallback（详情/预览：未命中回落服务表 platform_name）", () => {
  it("表命中 → 表值优先，服务表名不参与", () => {
    expect(platformInfoWithFallback("sam.gov", S, "SAM.gov")).toEqual({ canonical: "SAM.gov", code: "sam", zh: "美国联邦采购网" });
  });
  it("未命中 → 服务表 platform_name 兜底（build 侧域名/canonical 产物），code/zh 置空", () => {
    expect(platformInfoWithFallback("information1.gov-procurement.go.jp", S, "information1.gov-procurement.go.jp"))
      .toEqual({ canonical: "information1.gov-procurement.go.jp", code: null, zh: "" });
  });
  it("两者皆空 → null（调用方显示占位符）", () => {
    expect(platformInfoWithFallback("", S, "")).toBeNull();
    expect(platformInfoWithFallback("nope.gov", S, null)).toBeNull();
  });
});
