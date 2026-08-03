/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { safeJson } from "../utils/json";

export type UnspscCodeRow = {
  id: number;
  code: string;
  title?: string | null;
  title_zh?: string | null;
  parent_id?: number | null;
  level: number;
};

export function normalizeUnspscCodes(value: any) {
  const source = safeJson(value);
  const found = new Map<string, { code: string; name: string }>();

  const visit = (item: any) => {
    if (!item || found.size >= 20) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item === "object") {
      const codeText = String(item.code || "");
      const matches = codeText.match(/\b\d{2}(?:\d{2}){0,3}\b/g) || [];
      for (const code of matches) {
        if (!found.has(code)) found.set(code, { code, name: String(item.name || item.description || "") });
      }
      if (matches.length === 0) Object.values(item).forEach(visit);
      return;
    }
    const matches = String(item).match(/\b\d{2}(?:\d{2}){0,3}\b/g) || [];
    for (const code of matches) {
      if (!found.has(code)) found.set(code, { code, name: "" });
    }
  };

  visit(source);
  return Array.from(found.values());
}

export function unspscPrefixFromCode(code: string) {
  const digits = String(code || "").replace(/\D/g, "").slice(0, 8);
  if (!digits) return "";
  for (let len = 8; len > 2; len -= 2) {
    if (digits.slice(len - 2, len) !== "00") return digits.slice(0, len);
  }
  return digits.slice(0, 2);
}

export async function buildNoticeUnspscFilter(dbPool: any, codeId: number) {
  if (!codeId) return { sql: "", params: [] as unknown[] };

  const [codeRows] = await dbPool.query(
    "SELECT id, code, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
    [codeId]
  );
  const code = (codeRows as UnspscCodeRow[])[0];
  if (!code) return { sql: "", params: [] as unknown[] };

  // 勘误（与 /api/notices/recommended 口径一致）：crm_bid_notice_unspsc_codes 的
  // level1_id~level5_id 存的是 crm_unspsc_codes.id（varchar），不是码串前缀。
  // 因此按类目自身 level 定位对应列做等值匹配；一告多码由 DISTINCT 去重，
  // 跨大类公告在其挂到的每个类目下均可命中（OR 语义）。
  // 注意：桥接表 notice_id 存储的是主表 crm_bid_notices.notice_id（外部编号），
  // 而非 id（自增主键），JOIN 口径必须用 n.notice_id。
  // 实测验证：n.notice_id JOIN 命中 60,492 条公告，n.id JOIN 仅命中 5,907 条（丢失 90%）。
  const level = Number(code.level) || 0;
  if (level >= 1 && level <= 5) {
    return {
      sql: `INNER JOIN (
        SELECT DISTINCT notice_id
        FROM crm_bid_notice_unspsc_codes
        WHERE level${level}_id = ?
      ) filtered_notices ON filtered_notices.notice_id = n.notice_id`,
      params: [String(code.id)],
    };
  }

  // level 6/7 的异常深层节点（全树仅数条）：无对应 levelN_id 列，用 code_id 兜底
  return {
    sql: `INNER JOIN (
      SELECT DISTINCT notice_id
      FROM crm_bid_notice_unspsc_codes
      WHERE code_id = ?
    ) filtered_notices ON filtered_notices.notice_id = n.notice_id`,
    params: [code.id],
  };
}

export function expandUnspscInterestPrefixes(code: string) {
  const significant = unspscPrefixFromCode(code);
  if (!significant) return [];
  const prefixes: string[] = [];
  for (let len = 2; len <= significant.length; len += 2) {
    prefixes.push(significant.slice(0, len));
  }
  return Array.from(new Set(prefixes));
}

export function padUnspscPrefix(prefix: string) {
  return String(prefix || "").padEnd(8, "0").slice(0, 8);
}

// 本地差异 #11：T-E3 source 枚举白名单（固化写入端合法来源，未知来源拒写防脏数据）
const INTEREST_SOURCE_WHITELIST = new Set([
  "unlock_order",      // 解锁订单（+2.5）
  "subscribe_notice",  // 订阅公告（+2.0）
  "express_interest",  // 表达兴趣（+1.0）
  "feedback_click",    // T-B6 反馈：点击（+0.3）
  "feedback_favorite", // T-B6 反馈：收藏（+0.8）
  // T-C7 隐式信号（本地差异 #16：C.3.6）——正向三档；quick_exit 走 decay 不占来源
  "feedback_dwell",      // 详情停留 >30s（+0.2）
  "feedback_scroll_end", // 详情滚动到底（+0.1）
  "feedback_revisit",    // 会话内回看（+0.5）
]);
// 本地差异 #11：T-E3 单码 weight 软上限——写入端 LEAST 封顶，现有超上限存量不回改（只封新增）
const INTEREST_WEIGHT_CAP = 500;

export async function persistUserInterestCodes(dbPool: any, userKey: string, snapshot: any[], source: string, weight: number) {
  if (!INTEREST_SOURCE_WHITELIST.has(source)) return; // T-E3：白名单外来源拒写
  const prefixes = new Set<string>();
  for (const item of snapshot) {
    const rawCode = String(item?.code || "").replace(/\D/g, "").slice(0, 8);
    expandUnspscInterestPrefixes(rawCode).forEach((prefix) => prefixes.add(prefix));
  }

  for (const prefix of prefixes) {
    const [codeRows] = await dbPool.query(
      "SELECT id, level FROM crm_unspsc_codes WHERE code IN (?, ?) ORDER BY CHAR_LENGTH(code) DESC LIMIT 1",
      [prefix, padUnspscPrefix(prefix)]
    );
    const codeRow = (codeRows as UnspscCodeRow[])[0];
    await dbPool.execute(
      `INSERT INTO crm_user_interest_codes (user_id, user_key, code_id, code, level, source, weight)
       VALUES ((SELECT id FROM crm_users WHERE user_key = ? LIMIT 1), ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE weight = LEAST(${INTEREST_WEIGHT_CAP}, weight + VALUES(weight)), updated_at = NOW()`,
      [userKey, userKey, codeRow?.id || null, prefix, Math.max(1, prefix.length / 2), source, weight]
    );
  }
}

export async function getUnspscPath(dbPool: any, codeId: number) {
  const path: Record<string, number | null> = {
    level1_id: null,
    level2_id: null,
    level3_id: null,
    level4_id: null,
    level5_id: null,
  };

  let currentId: number | null = codeId;
  for (let i = 0; i < 6 && currentId; i += 1) {
    const [rows] = await dbPool.query(
      "SELECT id, parent_id, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1",
      [currentId]
    );
    const row = (rows as UnspscCodeRow[])[0];
    if (!row) break;
    if (row.level >= 1 && row.level <= 5) {
      path[`level${row.level}_id`] = row.id;
    }
    currentId = row.parent_id || null;
  }

  return path;
}

// ── 公告按需翻译（本地差异 #4：缓存表 + 翻译接口）──
// 本地差异 #18：新增 en 目标语言——库内存在中文原文公告（country 为英语国家但内容为中文），
// 英文环境下需反向翻译成英文；原"选英文=看原文"的假设不再成立
