/**
 * 用户行业画像解析
 * User industry profile resolution
 *
 * @module server/services/industry-match/resolve
 * @description 读取 crm_user_industry_prefs（用户五级行业）并解析为匹配画像：
 *              最深选了哪一级、各级类目 id、行业分支码前缀、行业中文名。
 *              防御脏数据：最深级类目在分类树中查不到时逐级上溯，避免"选了行业却匹配不到"。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { unspscPrefixFromCode } from "../unspsc";
import type { UserIndustryProfile } from "./types";

interface UnspscNodeRow {
  id: number;
  code: string | null;
  title_zh: string | null;
  title: string | null;
  level: number;
}

/** 类目树节点行转画像 */
function buildProfile(
  userKey: string,
  levelIds: (number | null)[],
  deepestLevel: number,
  deepestId: number,
  node: UnspscNodeRow,
): UserIndustryProfile {
  const branchPrefix = unspscPrefixFromCode(String(node.code || ""));
  return {
    userKey,
    deepestLevel,
    deepestId,
    levelIds,
    branchPrefix: branchPrefix || null,
    industryTitleZh: node.title_zh || node.title || null,
  };
}

/**
 * 解析用户行业画像。
 * @returns 无行业偏好或偏好全部失效时返回 null（调用方按 no_prefs 处理）
 */
export async function resolveUserIndustryProfile(
  pool: Pool,
  userKey: string,
): Promise<UserIndustryProfile | null> {
  const [rows] = await pool.query(
    `SELECT level1_id, level2_id, level3_id, level4_id, level5_id
     FROM crm_user_industry_prefs WHERE user_key = ? LIMIT 1`,
    [userKey],
  );
  const row = (rows as RowDataPacket[])[0];
  if (!row) return null;

  const levelIds = [1, 2, 3, 4, 5].map((n) => {
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
    const [nodeRows] = await pool.query(
      "SELECT id, code, title_zh, title, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
      [id],
    );
    const node = (nodeRows as UnspscNodeRow[])[0];
    if (node) {
      return buildProfile(userKey, levelIds, lvl, id, node);
    }
  }

  return null;
}
