/**
 * 来源/采购平台归一 · 服务层解析器（一切以 crm_platform_aliases 表为准，无静态兜底）
 *
 * @module server/services/platform/resolve
 * @description 归一只认表：命中即用表内 canonical/code/kind/zh；查不到即视为「表不完善」，
 *              由调用方记为 unresolved 去补表，绝不回落任何静态映射或启发式。
 *              与 country 不同：一条公告/商机/中标只有「单一来源平台」，不拆多值。
 *              匹配次序：① 归一键整串命中（覆盖码 / 显示名 / 已入表的精确域名）；
 *                        ② host 形态沿注册域后缀下钻（`public.mtender.gov.md` → `mtender.gov.md`），
 *                           仍只认表里登记过的注册域，命中才返回；
 *                        ③ 都不满足 → unresolved（表缺这条，需补行）。
 */
import { normalizePlatformKey, hostOf } from "./alias-store";
import type { PlatformAliasSnapshot, PlatformAliasEntry } from "./alias-store";

export type { PlatformAliasEntry };

export interface PlatformResolve {
  ref: PlatformAliasEntry | null; // 命中的平台引用（含 other/invalid，由调用方按 kind 取舍）
  unresolved: string;             // 无法在表中定位时回填原始串（空串表示已解析/本就空）
}

/** 表驱动解析单个来源平台写法。 */
export function resolvePlatform(raw: string, snapshot: PlatformAliasSnapshot): PlatformResolve {
  const s = String(raw ?? "").trim();
  if (!s) return { ref: null, unresolved: "" };

  // ① 归一键整串命中
  const whole = snapshot.byKey.get(normalizePlatformKey(s));
  if (whole) return { ref: whole, unresolved: "" };

  // ② host 形态：沿注册域后缀下钻（去前导子域标签），只认 byHost 里登记过的域
  const host = hostOf(s);
  if (host) {
    const labels = host.split(".");
    for (let i = 0; i < labels.length - 1; i++) {
      const candidate = labels.slice(i).join(".");
      const hit = snapshot.byHost.get(candidate);
      if (hit) return { ref: hit, unresolved: "" };
    }
  }

  // ③ 表里没有、又不能后缀命中 → 记为未解析（表不完善，待补行）
  return { ref: null, unresolved: s };
}

/** 便捷：命中的可筛平台码（kind=platform 且有 code）；否则 null。 */
export function platformCodeOf(res: PlatformResolve): string | null {
  return res.ref && res.ref.kind === "platform" && res.ref.code ? res.ref.code : null;
}

/**
 * 由「平台写法/标准名」取其稳定 slug 码（供筛选谓词参数）。
 * 非 platform 或表里没有 → null（不兜底：调用方据此判定为不可筛）。
 */
export function platformCodeForName(name: string, snapshot: PlatformAliasSnapshot): string | null {
  const e = resolvePlatform(name, snapshot).ref;
  return e && e.kind === "platform" && e.code ? e.code : null;
}

/**
 * 平台展示信息（服务端回填给前端的精简体）：canonical 官方简称、code 稳定 slug、zh 中文名。
 * 非 platform 或未解析 → null（前端据此回退中性文案，不编造）。
 * 展示仍由前端按 locale 在 canonical/zh 间取舍（与国家展示 getCountryDisplayName 同为“数据源自表、语言本地选”）。
 */
export interface PlatformInfo {
  canonical: string;
  code: string | null;
  zh: string;
}
export function platformInfo(raw: string, snapshot: PlatformAliasSnapshot): PlatformInfo | null {
  const e = resolvePlatform(raw, snapshot).ref;
  if (!e || e.kind !== "platform") return null;
  return { canonical: e.canonical, code: e.code, zh: e.zh };
}

/**
 * 平台展示名（表驱动）：zh 环境优先 name_i18n.zh（缺省回退 canonical），
 * 其余语言返回 canonical（官方简称，各语言通用，与国家映射非 zh 回退原文口径一致）。
 * 未解析/other/invalid → 返回空串（调用方自行回退中性文案，不编造）。
 */
export function platformDisplayName(raw: string, snapshot: PlatformAliasSnapshot, locale: string): string {
  const e = resolvePlatform(raw, snapshot).ref;
  if (!e || e.kind !== "platform") return "";
  if (locale !== "zh") return e.canonical;
  return e.zh ? `${e.zh}（${e.canonical}）` : e.canonical;
}
