/**
 * 公告交互服务层
 * Notice Interaction Service
 *
 * @module lib/services/notice-service
 * @description 封装公告浏览/意向/收藏等高频操作，供 API 路由薄壳调用。
 *              消除路由层直接 import NoticeInteractionRepo 的架构违规。
 *              同时为已有 service 函数（submitInterest/processFeedback/
 *              getNoticeTranslation）提供免 DI 的便捷包装。
 *              2026-11-27 解锁列表/解锁动作包装随次数体系下线删除。
 */
import { getPool } from "@/lib/db/pool";
import { NoticeInteractionRepo } from "@/lib/repos/notices/notice-interaction.repo";
import { NoticeDetailRepo } from "@/lib/repos/notices/notice-detail.repo";
import { NoticeTranslationRepo } from "@/lib/repos/notices/notice-translation.repo";
import { syncNoticeTitleCn } from "./notice-public/build";
import { NoticeFeedbackRepo } from "@/lib/repos/notices/notice-feedback.repo";
import { NoticeFavoriteRepo } from "@/lib/repos/notices/notice-favorite.repo";
import { fetchDetailsByIds } from "./search-orchestrator/detail-fetch";
import { formatItems } from "./search-orchestrator/format";
import {
  submitInterest,
  processFeedback,
  NoticeNotFoundError,
  type FeedbackResult,
} from "./notice-actions";
import { getNoticeTranslation, type NoticeTranslationPayload } from "./translation/translation-flow";
import { loadNoticeNodeCodes, persistInterestNodeCodes } from "./commodity/interest";
import type { RecoFeedbackItem } from "@/lib/repos/notices/notice-feedback.repo";
export type { RecoFeedbackItem } from "@/lib/repos/notices/notice-feedback.repo";

// ── 浏览计数 ──

/** 记录公告浏览流水 */
export async function recordNoticeView(params: { userId: number; noticeId: number; ip: string }): Promise<void> {
  const repo = new NoticeInteractionRepo(getPool());
  return repo.insertView(params);
}

// ── 意向提交（包装 submitInterest，消除路由侧 DI 构造） ──

/** 提交公告意向 */
export async function submitNoticeInterest(params: {
  userId: number; noticeId: number; interestType: "interested" | "subscribed"; note: string;
}): Promise<void> {
  const pool = getPool();
  return submitInterest(
    {
      detailRepo: new NoticeDetailRepo(pool),
      interactionRepo: new NoticeInteractionRepo(pool),
      dbPool: pool,
    },
    params,
  );
}

// ── 收藏（用户私有书签，与意向/订阅的销售线索语义分离） ──

/** 收藏/取消收藏（toggle，返回切换后的状态） */
export async function toggleNoticeFavorite(params: {
  userId: number; noticeId: number;
}): Promise<{ favorited: boolean }> {
  const pool = getPool();
  const repo = new NoticeFavoriteRepo(pool);
  if (!(await repo.noticeExists(params.noticeId))) {
    throw new NoticeNotFoundError();
  }
  if (await repo.exists(params.userId, params.noticeId)) {
    await repo.remove(params.userId, params.noticeId);
    return { favorited: false };
  }
  await repo.insert(params.userId, params.noticeId);
  // 收藏写入兴趣节点画像（feedback_favorite +0.8，白名单既有来源）：
  // 仅喂推荐画像，不写 notice_interests（销售线索漏斗保持纯净）；
  // 取消收藏不衰减，与其他来源口径一致；反复 toggle 由单码 500 软上限兜底。
  // 小表剥离后兴趣画像吃 UGT 归属节点（倒排行），不再读主表 旧品类快照列
  try {
    const nodes = (await loadNoticeNodeCodes(pool, [params.noticeId]).catch(() => new Map())).get(params.noticeId) ?? [];
    await persistInterestNodeCodes(pool, params.userId, nodes, "feedback_favorite", 0.8);
  } catch (e) {
    console.warn("[notice-service] favorite interest-code persist failed (non-critical):", e);
  }
  return { favorited: true };
}

/** 用户已收藏的公告 id 集合（列表卡片/详情按钮状态回显） */
export async function listNoticeFavoriteIds(userId: number): Promise<number[]> {
  return new NoticeFavoriteRepo(getPool()).listNoticeIds(userId);
}

/** 我的收藏分页列表：repo 只出有序 notice_pk，字段水合走主列表同一条 SSOT 尾（服务表宽表名 + 多语言）。
 *  items 是列名口径的内部行（formatItems 产出），对外契约由路由侧 toNoticeListView 统一收；
 *  本层不得再返回 unknown[]（被抹平后 tsc 与门禁都看不见键名）。 */
export async function listNoticeFavorites(params: {
  userId: number; limit: number; offset: number; lang?: string | null;
}): Promise<{ total: number; items: Array<Record<string, unknown>> }> {
  const pool = getPool();
  const lang = params.lang || "en";
  const { total, ids } = await new NoticeFavoriteRepo(pool).listFavorites(
    params.userId, params.limit, params.offset,
  );
  const details = await fetchDetailsByIds(pool, ids, lang);
  const items = formatItems(details);
  return { total, items: items as Array<Record<string, unknown>> };
}

// ── 翻译获取（包装 getNoticeTranslation） ──

export { NoticeNotFoundError };

/** 获取公告翻译（含付费墙前置校验由路由负责）；返回类型即 wire 契约，全 camelCase */
export async function fetchNoticeTranslation(noticeId: number, lang: string, userId: number): Promise<NoticeTranslationPayload> {
  const pool = getPool();
  const translationRepo = new NoticeTranslationRepo(pool);
  const result = await getNoticeTranslation(
    { pool, detailRepo: new NoticeDetailRepo(pool), translationRepo },
    noticeId,
    lang,
    userId,
  );
  // 详情很可能命中旧译文缓存（不经过 upsert）；列表只读服务表，必须在这里回写一次。
  if (lang === "zh" && result.title) {
    await syncNoticeTitleCn(pool, noticeId, result.title).catch(() => undefined);
  }
  return result;
}

// ── 推荐反馈（包装 processFeedback） ──

/** 处理推荐反馈（返回计数结果，字段全 camel：received/inserted/deduped） */
export async function submitNoticeFeedback(params: {
  userId: number; sessionId: string; items: RecoFeedbackItem[];
}): Promise<FeedbackResult> {
  const pool = getPool();
  return processFeedback(
    {
      feedbackRepo: new NoticeFeedbackRepo(pool),
      dbPool: pool,
    },
    params,
  );
}
