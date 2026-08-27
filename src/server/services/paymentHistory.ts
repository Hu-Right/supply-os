/**
 * 支付历史查询服务
 * Payment History Query Service
 *
 * @module server/services/paymentHistory
 * @description 订单历史 / 解锁历史的分页查询与响应映射（原 payment.routes.ts 内联逻辑下沉）。
 *              解锁历史附带缺译标题的后台补翻（与详情端点共用缓存表）。
 */
import "server-only";
import type { PaymentsRepo, OrderHistoryRow, UnlockHistoryRow } from "../repos/payments.repo";
import { NOTICE_TRANSLATION_LANGS, pendingNoticeTranslations, translateNoticeViaChain } from "./translation/notice";

export interface PagedHistory<T> {
  total: number;
  page: number;
  limit: number;
  list: T[];
}

function mapOrderRow(row: OrderHistoryRow) {
  return {
    order_no: row.order_no,
    user_key: row.user_key,
    provider: row.provider,
    plan_code: row.plan_code,
    notice_id: row.notice_id,
    amount: Number(row.amount || 0),
    currency: row.currency,
    status: row.status,
    provider_trade_no: row.provider_trade_no,
    paid_at: row.paid_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    notice: row.notice_id ? {
      id: row.notice_id,
      notice_id: row.external_notice_id,
      source_channel: row.source_channel,
      reference: row.reference,
      title: row.title,
      notice_type: row.notice_type,
      agency: row.agency || row.agency_full,
      agency_full: row.agency_full,
      country: row.country,
      deadline: row.deadline,
      urgency: row.urgency,
      url: row.url,
      industry: row.industry,
    } : null,
  };
}

function mapUnlockRow(row: UnlockHistoryRow, translatable: boolean) {
  return {
    user_key: row.user_key,
    notice_id: row.notice_id,
    unlock_type: row.unlock_type,
    price: Number(row.price || 0),
    unlocked_at: row.unlocked_at,
    notice: row.notice_id ? {
      id: row.notice_id,
      notice_id: row.external_notice_id,
      source_channel: row.source_channel,
      reference: row.reference,
      title: row.title,
      title_i18n: translatable ? row.title_i18n ?? null : undefined,
      notice_type: row.notice_type,
      agency: row.agency || row.agency_full,
      agency_full: row.agency_full,
      country: row.country,
      deadline: row.deadline,
      // deadline 为自由文本前端无法判过期，服务端按 deadline_ts 算好
      // （秒/毫秒混存，先折算成毫秒再与 Date.now() 比较）
      deadline_expired: row.deadline_ts
        ? (Number(row.deadline_ts) > 100000000000
            ? Number(row.deadline_ts)
            : Number(row.deadline_ts) * 1000) < Date.now()
        : null,
      urgency: row.urgency,
      url: row.url,
      industry: row.industry,
    } : null,
  };
}

/** 订单历史分页（GET /api/payment/orders） */
export async function listOrderHistory(
  repo: PaymentsRepo,
  params: { userKey: string; status: string; page: number; limit: number },
): Promise<PagedHistory<ReturnType<typeof mapOrderRow>>> {
  const offset = (params.page - 1) * params.limit;
  const [total, rows] = await Promise.all([
    repo.countOrders(params.userKey, params.status),
    repo.listOrders(params.userKey, params.status, params.limit, offset),
  ]);
  return { total, page: params.page, limit: params.limit, list: rows.map(mapOrderRow) };
}

/**
 * 解锁历史分页（GET /api/payment/unlocks）。
 * lang 可翻译时附带标题译文，并对缺译行在响应构建后逐条后台补翻
 * （标题+描述整条入库，与详情端点缓存互通；pendingNoticeTranslations 按
 * noticeId:lang 去重，翻译链全不可用时静默跳过）。
 */
export async function listUnlockHistory(
  repo: PaymentsRepo,
  params: { userKey: string; lang: string; page: number; limit: number },
): Promise<PagedHistory<ReturnType<typeof mapUnlockRow>>> {
  const offset = (params.page - 1) * params.limit;
  const lang = params.lang.toLowerCase();
  const translatable = !!NOTICE_TRANSLATION_LANGS[lang];
  const [total, rows] = await Promise.all([
    repo.countUnlocks(params.userKey),
    repo.listUnlocks(params.userKey, params.limit, offset, translatable ? { lang } : null),
  ]);
  if (translatable) void backfillUnlockTranslations(repo, rows, lang);
  return { total, page: params.page, limit: params.limit, list: rows.map((row) => mapUnlockRow(row, translatable)) };
}

async function backfillUnlockTranslations(repo: PaymentsRepo, rows: UnlockHistoryRow[], lang: string): Promise<void> {
  for (const row of rows) {
    if (!row.notice_id || row.title_i18n || !String(row.title || "").trim()) continue;
    const pendingKey = `${row.notice_id}:${lang}`;
    if (pendingNoticeTranslations.has(pendingKey)) continue;
    const pending = translateNoticeViaChain(
      String(row.title || ""),
      String(row.description || ""),
      lang
    );
    pendingNoticeTranslations.set(pendingKey, pending);
    pending.finally(() => pendingNoticeTranslations.delete(pendingKey)).catch(() => undefined);
    try {
      const { translations, provider } = await pending;
      await repo.upsertNoticeTranslation(row.notice_id, lang, translations[0], translations[1], provider);
    } catch {
      // 翻译不可用或失败：保持英文原文，下次请求重试
    }
  }
}
