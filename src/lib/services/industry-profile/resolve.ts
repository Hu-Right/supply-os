/**
 * 用户行业画像解析
 * User industry profile resolution
 *
 * @module server/services/industry-profile/resolve
 * @description 读取 crm_user_industry_prefs（用户五级行业）并解析为匹配画像：
 *              最深选了哪一级、各级类目 id、行业分支码前缀、行业中文名。
 *              防御脏数据：最深级类目在分类树中查不到时逐级上溯，避免"选了行业却匹配不到"。
 *              （#11 清扫，2026-08-20：自 industry-match/ 更名迁入；
 *              N6 收敛，2026-08-20：裸 SQL 改经 UserPrefsRepo/CatalogRepo 单一数据访问端口）
 */
import type { Pool } from "mysql2/promise";
import { UserPrefsRepo } from "../../repos/user-prefs.repo";
import { CatalogRepo, type UnspscRow } from "../../repos/catalog.repo";
import { unspscPrefixFromCode } from "../unspsc";
import type { UserIndustryProfile } from "./types";

// ── B2 优化：用户行业画像内存缓存（60s TTL，偏好变更时主动失效）──
const _profileCache = new Map<number, { profile: UserIndustryProfile | null; expires: number }>();
const PROFILE_CACHE_TTL = 60 * 1000;
const PROFILE_CACHE_MAX = 500;

interface UnspscNodeRow {
  id: number;
  code: string | null;
  title_zh: string | null;
  title: string | null;
  level: number;
}
/** 类目树节点行转画像 */
function buildProfile(
  userId: number,
  levelIds: (number | null)[],
  deepestLevel: number,
  deepestId: number,
  node: UnspscNodeRow,
): UserIndustryProfile {
  const branchPrefix = unspscPrefixFromCode(String(node.code || ""));
  return {
    userId,
    deepestLevel,
    deepestId,
    levelIds,
    branchPrefix: branchPrefix || null,
    industryTitleZh: node.title_zh || node.title || null,
  };
}

/** 失效用户行业画像缓存（用户修改行业偏好时调用） */
export function invalidateProfileCache(userId?: number): void {
  if (!userId) {
    _profileCache.clear();
    return;
  }
  _profileCache.delete(userId);
}

/**
 * 解析用户行业画像（带 60s 内存缓存，避免每请求穿透 DB）。
 * @returns 无行业偏好或偏好全部失效时返回 null（调用方按 no_prefs 处理）
 */
export async function resolveUserIndustryProfile(
  pool: Pool,
  userId: number,
): Promise<UserIndustryProfile | null> {
  // ── 缓存命中检查 ──
  const cached = _profileCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.profile;

  // N6 收敛：偏好读取经 UserPrefsRepo 单一端口（与 user-prefs.routes 同口径），
  // 类目节点查询经 CatalogRepo；保持 pool 签名不变，避免上游编排器连锁改造。
  const userPrefsRepo = new UserPrefsRepo(pool);
  const catalogRepo = new CatalogRepo(pool);

  const row = userId ? await userPrefsRepo.getIndustryPrefs(userId) : null;
  if (!row) {
    _profileCache.set(userId, { profile: null, expires: Date.now() + PROFILE_CACHE_TTL });
    if (_profileCache.size > PROFILE_CACHE_MAX) _profileCache.clear();
    return null;
  }

  const levelIds = ([1, 2, 3, 4, 5] as const).map((n) => {
    const value = Number(row[`level${n}_id`] || 0);
    return Number.isInteger(value) && value > 0 ? value : null;
  });

  // 最深非空级
  let deepestLevel = 0;
  for (let i = 4; i >= 0; i -= 1) {
    if (levelIds[i]) {
      deepestLevel = i + 1;
      break;
    }
  }
  if (deepestLevel === 0) return null;

  // 校验最深级类目在分类树中存在；查不到（脏偏好）则逐级上溯
  for (let lvl = deepestLevel; lvl >= 1; lvl -= 1) {
    const id = levelIds[lvl - 1];
    if (!id) continue;
    const node = (await catalogRepo.findUnspscNodeById(id)) as UnspscRow | null;
    if (node) {
      const profile = buildProfile(userId, levelIds, lvl, id, node);
      _profileCache.set(userId, { profile, expires: Date.now() + PROFILE_CACHE_TTL });
      if (_profileCache.size > PROFILE_CACHE_MAX) _profileCache.clear();
      return profile;
    }
  }

  _profileCache.set(userId, { profile: null, expires: Date.now() + PROFILE_CACHE_TTL });
  if (_profileCache.size > PROFILE_CACHE_MAX) _profileCache.clear();
  return null;
}
