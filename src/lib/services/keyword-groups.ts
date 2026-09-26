/**
 * 产品关键词组编排服务（spec §4）
 *
 * @module lib/services/keyword-groups
 * @description 校验（每组 1–20 词、词 ≤50 字、名 ≤100 字、去重）、
 *              容量（每人 50 组）、权益门控（product_keyword_lib）编排。
 *              读接口不抛 403（锁定态渲染依据 entitled 标志），写接口一律判档。
 */
import type { KeywordGroupsRepo, KeywordGroupRow } from "../repos/keyword-groups.repo";
import type { BenefitSystemRepo } from "../repos/benefit-system.repo";

export const MAX_TERMS_PER_GROUP = 20;
export const MAX_GROUPS_PER_USER = 50;

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
  | { ok: false; reason: "forbidden" | "pool_full" | "duplicate" | "invalid" };

export async function createKeywordGroup(
  repo: KeywordGroupsRepo,
  benefit: BenefitSystemRepo,
  userId: number,
  input: { name: unknown; terms: unknown },
): Promise<CreateGroupResult> {
  if (!(await benefit.isEntitled(userId, "product_keyword_lib"))) return { ok: false, reason: "forbidden" };
  const v = validateGroupInput(input);
  if (!v.ok) return { ok: false, reason: "invalid" };
  if ((await repo.countByUser(userId)) >= MAX_GROUPS_PER_USER) return { ok: false, reason: "pool_full" };
  const created = await repo.create(userId, v.name, v.terms);
  if (!created) return { ok: false, reason: "duplicate" };
  return { ok: true, id: created.id };
}
