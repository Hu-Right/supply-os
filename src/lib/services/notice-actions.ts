/**
 * 公告用户动作业务编排
 * Notice user action business orchestration
 *
 * @module server/services/notice-actions
 * @description 解锁（含事务 + 配额检查 +  entitlement 消耗 + 兴趣码联动）、
 *              反馈（含兴趣码持久化/衰减）、兴趣提交等动作的服务层编排。
 *              路由层仅做参数解析与响应构造，业务逻辑集中于此。
 */
import type { Pool } from "mysql2/promise";
import type { NoticeDetailRepo } from "../repos/notices/notice-detail.repo";
import type { NoticeUnlockRepo } from "../repos/notices/notice-unlock.repo";
import type { NoticeInteractionRepo } from "../repos/notices/notice-interaction.repo";
import type { NoticeFeedbackRepo, RecoFeedbackItem } from "../repos/notices/notice-feedback.repo";
import type { MembershipRepo } from "../repos/membership.repo";
import { normalizeUnspscCodes, persistUserInterestCodes } from "./unspsc/index";
import { decayUserInterestCodes } from "./recommend/index";

// ── 解锁 ──────────────────────────────────────────────────────────────────────

export interface UnlockParams {
  userKey: string;
  /** 内部用户 ID（user_id 迁移 Phase 2 新增） */
  userId?: number;
  noticeId: number;
  unlockType: "free" | "single" | "subscription";
  price: number;
}

export interface UnlockResult {
  alreadyUnlocked: boolean;
  unlockType: string;
}

/**
 * 解锁公告（事务封装：快速路径 → 悲观锁 → 配额检查 → 插入 → 消耗 → 兴趣码）
 * 从 routes/notices/actions.routes.ts 下沉，路由层不再管理事务。
 */
export async function executeUnlock(
  ctx: { detailRepo: NoticeDetailRepo; unlockRepo: NoticeUnlockRepo; dbPool: Pool; membershipRepo: MembershipRepo },
  params: UnlockParams,
): Promise<UnlockResult> {
  const { detailRepo, unlockRepo, dbPool, membershipRepo } = ctx;
  const { userKey, userId, noticeId, unlockType, price } = params;

  // 快速路径：先检查是否已解锁（无锁，减少事务冲突）
  if (await unlockRepo.findExistingUnlock(userId!, noticeId)) {
    return { alreadyUnlocked: true, unlockType };
  }

  // 获取公告信息（事务外，只读）
  const notice = await detailRepo.findById(noticeId);
  if (!notice) throw new NoticeNotFoundError();
  const snapshot = normalizeUnspscCodes(notice.unspsc_codes);

  // 使用事务保证配额检查 + 插入的原子性
  const conn = await dbPool.getConnection();
  let consumedEntitlementId: number | null = null;
  try {
    await conn.beginTransaction();

    // 事务内再次检查（可能并发请求已通过快速路径）
    if (await unlockRepo.findExistingUnlockInTransaction(conn, userId!, noticeId)) {
      await conn.commit();
      return { alreadyUnlocked: true, unlockType };
    }

    // 配额检查（事务内）
    if (unlockType === "free") {
      // 免费试用已移除（2026-08-30 产品决策）：free 配置归零是数据层手段，
      // 此处为服务端硬闸——无论配置如何，free 解锁一律 402，杜绝配置回滚
      // 或手工改库重新放出免费额度。历史 free 解锁记录保留可审计。
      await conn.rollback();
      throw new QuotaExceededError("FREE_LIMIT_REACHED");
    }

    if (unlockType === "subscription" || unlockType === "single") {
      // P1-7 安全修复：SELECT FOR UPDATE 防止并发配额超卖
      const ent = await membershipRepo.findAndLockEntitlement(conn, userId!);
      if (ent) {
        consumedEntitlementId = Number(ent.id);
      } else if (unlockType === "subscription") {
        // P1-6 安全修复：subscription 类型兼容活跃订阅——有有效订阅即放行，不强制要求 entitlement
        if (!await membershipRepo.hasActiveSubscriptionInTransaction(conn, userId!)) {
          await conn.rollback();
          throw new QuotaExceededError("PAID_QUOTA_REQUIRED");
        }
        // 有活跃订阅，无需消耗 entitlement
      } else {
        await conn.rollback();
        throw new QuotaExceededError("PAID_QUOTA_REQUIRED");
      }
    }

    // 插入解锁记录（唯一约束 uk_user_notice 保证原子性）
    await unlockRepo.insertUnlockInTransaction(conn, {
      userId: userId!, userKey, noticeId, unlockType, price, unspscSnapshot: JSON.stringify(snapshot),
    });

    // 消耗配额
    if (consumedEntitlementId) {
      // P1-7 安全修复：检查 affectedRows，若为 0 说明配额已被并发消耗
      const affected = await unlockRepo.consumeEntitlementInTransaction(conn, consumedEntitlementId);
      if (affected === 0) {
        await conn.rollback();
        throw new QuotaExceededError("PAID_QUOTA_REQUIRED");
      }
    }

    await conn.commit();

    // 事务外：更新兴趣码（非关键路径，失败不影响解锁）
    if (userKey !== "guest") {
      await persistUserInterestCodes(dbPool, userId!, userKey, snapshot, "unlock_order", 2.50).catch(() => {});
    }
    return { alreadyUnlocked: false, unlockType };
  } catch (err: unknown) {
    await conn.rollback();
    // 唯一约束冲突 = 并发请求已解锁
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "ER_DUP_ENTRY") {
      return { alreadyUnlocked: true, unlockType };
    }
    throw err;
  } finally {
    conn.release();
  }
}

// ── 反馈 ──────────────────────────────────────────────────────────────────────

export interface FeedbackResult {
  received: number;
  inserted: number;
  deduped: number;
}

/**
 * 处理推荐反馈（批量插入 + 兴趣码联动）
 * 从 routes/notices/actions.routes.ts 下沉。
 */
export async function processFeedback(
  ctx: { detailRepo: NoticeDetailRepo; feedbackRepo: NoticeFeedbackRepo; dbPool: Pool },
  params: { userId: number; userKey: string; sessionId: string; items: RecoFeedbackItem[] },
): Promise<FeedbackResult> {
  const { detailRepo, feedbackRepo, dbPool } = ctx;
  const { userId, userKey, sessionId, items } = params;

  const inserted = await feedbackRepo.insertRecoFeedback(userId, userKey, sessionId, items);

  const linkedActions = items.filter((item) =>
    ["click", "favorite", "dismiss", "dwell", "scroll_end", "quick_exit", "revisit"].includes(item.action)
  );
  if (linkedActions.length) {
    const noticeIds = Array.from(new Set(linkedActions.map((item) => item.noticeId)));
    const noticeRows = await detailRepo.findUnspscSnapshots(noticeIds);
    const snapshotById = new Map<number, any[]>();
    for (const row of noticeRows) snapshotById.set(Number(row.id), normalizeUnspscCodes(row.unspsc_codes));
    for (const item of linkedActions) {
      const snapshot = snapshotById.get(item.noticeId);
      if (!snapshot || snapshot.length === 0) continue;
      if (item.action === "click") await persistUserInterestCodes(dbPool, userId, userKey, snapshot, "feedback_click", 0.3);
      else if (item.action === "favorite") await persistUserInterestCodes(dbPool, userId, userKey, snapshot, "feedback_favorite", 0.8);
      else if (item.action === "dismiss") await decayUserInterestCodes(dbPool, userId, userKey, snapshot, 0.5);
      else if (item.action === "dwell" && (item.dwellMs || 0) >= 30000)
        await persistUserInterestCodes(dbPool, userId, userKey, snapshot, "feedback_dwell", 0.2);
      else if (item.action === "scroll_end") await persistUserInterestCodes(dbPool, userId, userKey, snapshot, "feedback_scroll_end", 0.1);
      else if (item.action === "revisit") await persistUserInterestCodes(dbPool, userId, userKey, snapshot, "feedback_revisit", 0.5);
      else if (item.action === "quick_exit") await decayUserInterestCodes(dbPool, userId, userKey, snapshot, 0.95);
    }
  }

  return { received: items.length, inserted, deduped: items.length - inserted };
}

// ── 兴趣 ──────────────────────────────────────────────────────────────────────

export interface InterestParams {
  userId: number;
  userKey: string;
  noticeId: number;
  interestType: "interested" | "subscribed";
  note: string;
}

/**
 * 提交公告兴趣（插入兴趣记录 + 联动兴趣码）
 * 从 routes/notices/actions.routes.ts 下沉。
 */
export async function submitInterest(
  ctx: { detailRepo: NoticeDetailRepo; interactionRepo: NoticeInteractionRepo; dbPool: Pool },
  params: InterestParams,
): Promise<void> {
  const { detailRepo, interactionRepo, dbPool } = ctx;
  const { userId, userKey, noticeId, interestType, note } = params;

  const notice = await detailRepo.findById(noticeId);
  if (!notice) throw new NoticeNotFoundError();

  await interactionRepo.upsertInterest({ userId, userKey, noticeId, interestType, note });
  const snapshot = normalizeUnspscCodes(notice.unspsc_codes);
  await persistUserInterestCodes(
    dbPool, userId, userKey, snapshot,
    interestType === "subscribed" ? "subscribe_notice" : "express_interest",
    interestType === "subscribed" ? 2.0 : 1.0
  );
}

// ── 自定义错误类型 ────────────────────────────────────────────────────────────

export class NoticeNotFoundError extends Error {
  constructor() {
    super("Notice not found");
    this.name = "NoticeNotFoundError";
  }
}

export class QuotaExceededError extends Error {
  public readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "QuotaExceededError";
    this.code = code;
  }
}
