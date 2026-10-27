/**
 * 产品关键词组编排服务（spec §4）
 *
 * @module lib/services/keyword-groups
 * @description 校验（每组 1–20 词、词 ≤50 字、名 ≤100 字、去重）、
 *              容量（每人 10 组）、权益门控（product_keyword_lib）编排。
 *              读接口不抛 403（锁定态渲染依据 entitled 标志），写接口一律判档。
 */
import type { KeywordGroupsRepo, KeywordGroupRow } from "../repos/keyword-groups.repo";
import type { OfficialKeywordGroupsRepo } from "../repos/official-keyword-groups.repo";
import type { BenefitSystemRepo } from "../repos/benefit-system.repo";
import { CACHE_TTL_MEDIUM_MS } from "@/shared/constants/time";

export const MAX_TERMS_PER_GROUP = 20;
export const MAX_GROUPS_PER_USER = 10;

export type GroupValidation =
  | { ok: true; name: string; terms: string[] }
  | { ok: false; reason: "name_invalid" | "terms_invalid" };

export function validateGroupInput(input: { name: unknown; terms: unknown }): GroupValidation {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 100) : "";
  if (!name) return { ok: false, reason: "name_invalid" };
  if (!Array.isArray(input.terms)) return { ok: false, reason: "terms_invalid" };
  const terms = Array.from(
    new Set(input.terms.map((t) => String(t ?? "").trim()).filter(Boolean)),
  );
  if (!terms.length || terms.some((t) => t.length > 50)) return { ok: false, reason: "terms_invalid" };
  return { ok: true, name, terms: terms.slice(0, MAX_TERMS_PER_GROUP) };
}

export async function listKeywordGroups(
  repo: KeywordGroupsRepo,
  benefit: BenefitSystemRepo,
  userId: number,
): Promise<{ entitled: boolean; groups: KeywordGroupRow[] }> {
  if (!(await benefit.isEntitled(userId, "product_keyword_lib"))) {
    return { entitled: false, groups: [] };
  }
  return { entitled: true, groups: await repo.listByUser(userId) };
}

export type CreateGroupResult =
  | { ok: true; id: number }
  | { ok: false; reason: "forbidden" | "pool_full" | "duplicate" | "name_reserved" | "invalid" };

export async function createKeywordGroup(
  repo: KeywordGroupsRepo,
  benefit: BenefitSystemRepo,
  userId: number,
  input: { name: unknown; terms: unknown },
  official: Pick<OfficialKeywordGroupsRepo, "isOfficialName">,
): Promise<CreateGroupResult> {
  if (!(await benefit.isEntitled(userId, "product_keyword_lib"))) return { ok: false, reason: "forbidden" };
  const v = validateGroupInput(input);
  if (!v.ok) return { ok: false, reason: "invalid" };
  if ((await repo.countByUser(userId)) >= MAX_GROUPS_PER_USER) return { ok: false, reason: "pool_full" };
  // 保留名硬约束（spec §2.2）：用户建组不得占用官方词组名；反向对后台仅软约定
  if (await official.isOfficialName(v.name)) return { ok: false, reason: "name_reserved" };
  const created = await repo.create(userId, v.name, v.terms);
  if (!created) return { ok: false, reason: "duplicate" };
  return { ok: true, id: created.id };
}

/**
 * 官方精选词组只读编排：进程内单值缓存（公开数据、低频变更，10 分钟 TTL）。
 * 与用户私有词组的跨标签页失效机制完全分离；表缺失不在这里容错，
 * ER_NO_SUCH_TABLE 原样上抛交 withRoute 统一处理（一切以表为准）。
 */
export type OfficialGroupSummary = Awaited<ReturnType<OfficialKeywordGroupsRepo["listEnabled"]>>;

let officialCache: { groups: OfficialGroupSummary; expires: number } | null = null;

export async function listOfficialKeywordGroups(
  repo: Pick<OfficialKeywordGroupsRepo, "listEnabled">,
  force = false,
): Promise<OfficialGroupSummary> {
  if (!force && officialCache && officialCache.expires > Date.now()) return officialCache.groups;
  const groups = await repo.listEnabled();
  officialCache = { groups, expires: Date.now() + CACHE_TTL_MEDIUM_MS };
  return groups;
}
