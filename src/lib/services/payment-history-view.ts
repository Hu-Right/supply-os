/**
 * 解锁历史的对外视图（GET /api/payment/unlocks 的响应体）
 *
 * @module lib/services/payment-history-view
 * @description 命名红线②：响应实体字段用 camelCase，DB 列名留在 repo 行里。
 *
 *              这里同时修三处「契约谎报」——客户端类型声明的是嵌套 notice，
 *              而在线实现把 LEFT JOIN 的公告列**平铺**在条目上，于是：
 *              1) `record.notice.title` / `country` / `reference` / `deadline`
 *                 运行时恒为 undefined（解锁行的标题与国家、编号、截止日期全不显示）；
 *              2) `deadline_expired` 客户端在读、repo 注释也写着「服务端按 deadline_ts
 *                 算好的过期标志」，但实现在根本没算——过期标记从不出现；
 *              3) `n.description` 被整段吐进列表（repo 注释明确「仅供后台补翻用，不返回」）。
 *              本 mapper 按客户端声明的形状出嵌套 camel，并就地算 deadlineExpired，
 *              同时不携带 description——三处谎报一次纠正，不留桥接。
 */
import type { UnlockHistoryRow } from "../repos/payment-history.repo";

/** 解锁行内嵌的公告摘要（只给列表要展示的字段） */
export interface UnlockNoticeBriefView {
  reference: string | null;
  title: string | null;
  /** 当前界面语言的标题译文（仅传 lang 时有值；缺译为 null） */
  titleI18n: string | null;
  noticeType: string | null;
  agency: string | null;
  agencyFull: string | null;
  country: string | null;
  deadline: string | null;
  /** 服务端按 deadline_ts（Unix 秒）判定的过期标志；无时间戳为 null */
  deadlineExpired: boolean | null;
  url: string | null;
  industry: string | null;
}

/** 解锁记录（对外契约） */
export interface UnlockRecordView {
  noticeId: number;
  unlockType: string;
  price: number;
  unlockedAt: string | null;
  notice: UnlockNoticeBriefView | null;
}

/** deadline_ts（Unix 秒）→ 过期标志；无时间戳不判定 */
function expiredFromDeadlineTs(ts: number | null | undefined, nowMs: number): boolean | null {
  if (ts === null || ts === undefined) return null;
  const seconds = Number(ts);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds * 1000 < nowMs;
}

/**
 * 平铺行 → 嵌套视图。
 *
 * @param row payment-history.repo 的解锁行（LEFT JOIN 公告 [+ 译文]）
 * @param nowMs 判定过期用的当前时间戳（默认 Date.now，测试可注入）
 */
export function toUnlockRecordView(
  row: UnlockHistoryRow,
  nowMs: number = Date.now(),
): UnlockRecordView {
  const hasNotice = row.notice_id !== null && row.notice_id !== undefined;
  return {
    noticeId: Number(row.notice_id),
    unlockType: String(row.unlock_type ?? ""),
    price: Number(row.price ?? 0),
    unlockedAt: row.unlocked_at ? new Date(row.unlocked_at).toISOString() : null,
    notice: hasNotice
      ? {
          reference: row.reference ?? null,
          title: row.title ?? null,
          titleI18n: row.title_i18n ?? null,
          noticeType: row.notice_type ?? null,
          agency: row.agency ?? null,
          agencyFull: row.agency_full ?? null,
          country: row.country ?? null,
          deadline: row.deadline ?? null,
          deadlineExpired: expiredFromDeadlineTs(row.deadline_ts, nowMs),
          url: row.url ?? null,
          industry: row.industry ?? null,
        }
      : null,
  };
}

export function toUnlockRecordViews(
  rows: readonly UnlockHistoryRow[],
  nowMs: number = Date.now(),
): UnlockRecordView[] {
  return rows.map((row) => toUnlockRecordView(row, nowMs));
}
