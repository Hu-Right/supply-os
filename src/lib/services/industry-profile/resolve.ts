/**
 * 用户行业画像解析
 * User industry profile resolution
 *
 * @module server/services/industry-profile/resolve
 * @description 读取 crm_user_industry_prefs 并解析为匹配画像：偏好表存
 *              最深已选 UGT 节点码（commodity_code），层级由码长现算（BB1 不变量），
 *              所属大类（L1 树码）由码前缀纯切片得出；节点中文名按 code 点查品目树补齐。
 *              防御脏数据：码形制非法或树里查无此码时返回 null（按 no_prefs 处理），
 *              不逐级上溯——祖先链可由码纯切片得出，消费方（mode-resolver）自己放宽。
 *              （旧版读旧品类字典五级行 id 的实现随字典退役删除）
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { UserPrefsRepo } from "../../repos/user-prefs.repo";
import { commodityNodeLevel, isCommodityNodeKey, l1CodeOfNode } from "../commodity/tree";
import type { UserIndustryProfile } from "./types";

// ── 用户行业画像内存缓存（60s TTL，偏好变更时主动失效）──
const _profileCache = new Map<number, { profile: UserIndustryProfile | null; expires: number }>();
const PROFILE_CACHE_TTL = 60 * 1000;
const PROFILE_CACHE_MAX = 500;

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
 * @returns 无偏好、码形制非法或树里查无此码时返回 null（调用方按 no_prefs 处理）
 */
export async function resolveUserIndustryProfile(
  pool: Pool,
  userId: number,
): Promise<UserIndustryProfile | null> {
  // ── 缓存命中检查 ──
  const cached = _profileCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.profile;

  // 偏好读取经 UserPrefsRepo 单一端口（与 industry-prefs 路由同口径）
  const userPrefsRepo = new UserPrefsRepo(pool);
  const row = userId ? await userPrefsRepo.getIndustryPrefs(userId) : null;
  const code = String(row?.commodity_code ?? "");
  if (!row || !code || !isCommodityNodeKey(code)) {
    _profileCache.set(userId, { profile: null, expires: Date.now() + PROFILE_CACHE_TTL });
    if (_profileCache.size > PROFILE_CACHE_MAX) _profileCache.clear();
    return null;
  }

  // 节点名补齐（一条 uk_code 点查；查不到 = 树里没有此码，按无偏好处理）
  let titleZh: string | null;
  try {
    const [nodes] = await pool.query(
      `SELECT name_zh FROM crm_commodity_backbone WHERE code = ? AND status = 1 LIMIT 1`,
      [code],
    );
    titleZh = (String((nodes as RowDataPacket[])[0]?.name_zh ?? "") || null);
  } catch {
    return null;
  }
  if (titleZh === null) {
    _profileCache.set(userId, { profile: null, expires: Date.now() + PROFILE_CACHE_TTL });
    if (_profileCache.size > PROFILE_CACHE_MAX) _profileCache.clear();
    return null;
  }

  const profile: UserIndustryProfile = {
    userId,
    commodityCode: code,
    deepestLevel: commodityNodeLevel(code),
    // 大类 = L1 树码，由码前缀纯切片得出（2026-10-15 G 码退役，偏好表不再存大类列）
    l1Code: l1CodeOfNode(code) || null,
    industryTitleZh: titleZh,
  };
  _profileCache.set(userId, { profile, expires: Date.now() + PROFILE_CACHE_TTL });
  if (_profileCache.size > PROFILE_CACHE_MAX) _profileCache.clear();
  return profile;
}
