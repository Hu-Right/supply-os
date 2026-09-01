/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 会员数据访问层
 * Membership Repository
 *
 * @module repos/membership.repo
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { MembershipPlanRow, SubscriptionRow, EntitlementRow, CountRow } from "./types";

/**
 * 用户当前最优周期性套餐（升级判断依据）
 * 来源优先级：未升级的活跃权益（entitlement）> 活跃订阅（subscription）
 */
export interface CurrentBestPlanRow {
  /** 权益 ID（subscription-only 场景为 null） */
  entitlement_id: number | null;
  /** 订阅 ID（无关联订阅时为 null） */
  subscription_id: number | null;
  /** 权益来源订单号（升级订单 original_order_no 审计依据） */
  source_order_no: string | null;
  plan_code: string;
  plan_name: string;
  price: number;
  unlock_quota: number;
  /** 该权益已使用次数（subscription-only 场景为 0，由调用方按解锁流水补算） */
  quota_used: number;
  quota_total: number | null;
  started_at: Date | null;
  expires_at: Date | null;
}

export class MembershipRepo {
  constructor(private pool: Pool) {}

  /** 查询全部激活的会员套餐 */
  async findActivePlans(): Promise<MembershipPlanRow[]> {
    const [rows] = await this.pool.query(
      `SELECT plan_code, name, description, price, currency, duration_days, unlock_quota, free_quota, plan_type
       FROM crm_membership_plans
       WHERE is_active = 1
       ORDER BY sort_order, id`,
    );
    return rows as MembershipPlanRow[];
  }

  /** 查询指定套餐 */
  async findPlanByCode(planCode: string): Promise<MembershipPlanRow | null> {
    const [rows] = await this.pool.query(
      `SELECT plan_code, name, price, currency, unlock_quota, duration_days, plan_type
       FROM crm_membership_plans
       WHERE plan_code = ? AND is_active = 1
       LIMIT 1`,
      [planCode],
    );
    return (rows as MembershipPlanRow[])[0] ?? null;
  }

  /** 履约时查套餐（含已下架），与真实支付回调 activatePaidOrder 及历史 mock-paid 口径一致 */
  async findPlanByCodeForFulfillment(planCode: string): Promise<MembershipPlanRow | null> {
    const [rows] = await this.pool.query(
      `SELECT plan_code, name, price, currency, unlock_quota, duration_days, plan_type
       FROM crm_membership_plans
       WHERE plan_code = ?
       LIMIT 1`,
      [planCode],
    );
    return (rows as MembershipPlanRow[])[0] ?? null;
  }

  /**
   * 获取免费套餐的 free_quota
   * 兜底语义（免费试用移除，2026-08-30）：缺配置 = 没有免费额度（|| 0）。
   * 此前的 || 3 会在套餐表异常时静默放大免费额度（审查 F14 同源教训）。
   */
  async getFreeQuota(): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT free_quota FROM crm_membership_plans WHERE plan_code = 'free' LIMIT 1",
    );
    return Number((rows as MembershipPlanRow[])[0]?.free_quota || 0);
  }

  /** 查询用户的有效订阅（含套餐名称和解锁配额） */
  async findActiveSubscriptions(userKey: string): Promise<SubscriptionRow[]> {
    const [rows] = await this.pool.query(
      `SELECT s.id, s.user_id, s.user_key, s.plan_code, p.name AS plan_name, p.unlock_quota, s.status, s.started_at, s.expires_at, s.created_at
       FROM crm_user_subscriptions s
       LEFT JOIN crm_membership_plans p ON s.plan_code = p.plan_code
       WHERE s.user_key = ? AND s.status = 'active' AND (s.expires_at IS NULL OR s.expires_at > NOW())
       ORDER BY s.id DESC`,
      [userKey],
    );
    return rows as SubscriptionRow[];
  }

  /** 统计用户免费解锁次数 */
  async countFreeUnlocks(userKey: string): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type = 'free'",
      [userKey],
    );
    return Number((rows as CountRow[])[0]?.total || 0);
  }

  /** 统计用户付费解锁次数 */
  async countPaidUnlocks(userKey: string): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT COUNT(*) AS total FROM crm_opportunity_unlocks WHERE user_key = ? AND unlock_type IN ('single','subscription')",
      [userKey],
    );
    return Number((rows as CountRow[])[0]?.total || 0);
  }

  // N1 收敛（2026-08-20）：原 hasActiveSubscription（仅看订阅的 VIP 判定）已删除。
  // VIP/会员状态派生一律经 services/membership-status.ts 的 resolveMembershipState 单一端口，
  // 避免"仅订阅"口径再次复活导致状态分叉。

  /** 查询用户有效权益（有剩余配额且未过期，排除已被升级替代的权益） */
  async findActiveEntitlements(userKey: string): Promise<EntitlementRow[]> {
    const [rows] = await this.pool.query(
      `SELECT id, plan_code, quota_total, quota_used, (quota_total - quota_used) AS quota_remaining, expires_at
       FROM crm_user_entitlements
       WHERE user_key = ?
         AND status = 'active'
         AND is_upgraded = 0
         AND quota_total > quota_used
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY expires_at IS NULL DESC, expires_at ASC, id ASC`,
      [userKey],
    );
    return rows as EntitlementRow[];
  }

  /**
   * 查询用户当前最优周期性套餐（升级场景）
   * 仅统计有配额、非单次卡的活跃权益；无权益时回退至活跃订阅。
   * 按套餐价格倒序取最高者，价格相同取最新。
   */
  async findCurrentBestPlan(userKey: string): Promise<CurrentBestPlanRow | null> {
    // 优先：未升级的活跃权益（配额型套餐）
    const [entRows] = await this.pool.query(
      `SELECT e.id AS entitlement_id, e.source_order_no, e.plan_code, e.quota_total, e.quota_used, e.started_at, e.expires_at,
              p.name AS plan_name, p.price, p.unlock_quota,
              (SELECT s.id FROM crm_user_subscriptions s
                WHERE s.user_key = ? AND s.status = 'active' AND s.plan_code = e.plan_code
                  AND (s.expires_at IS NULL OR s.expires_at > NOW())
                ORDER BY s.id DESC LIMIT 1) AS subscription_id
       FROM crm_user_entitlements e
       INNER JOIN crm_membership_plans p ON p.plan_code = e.plan_code
       WHERE e.user_key = ?
         AND e.status = 'active'
         AND e.is_upgraded = 0
         AND e.quota_total > 0
         AND (e.expires_at IS NULL OR e.expires_at > NOW())
         AND p.price > 0
         AND p.plan_type <> 'single'
       ORDER BY p.price DESC, e.id DESC
       LIMIT 1`,
      [userKey, userKey],
    );
    const ent = (entRows as any[])[0];
    if (ent) {
      return {
        entitlement_id: Number(ent.entitlement_id),
        subscription_id: ent.subscription_id ? Number(ent.subscription_id) : null,
        source_order_no: ent.source_order_no ?? null,
        plan_code: String(ent.plan_code),
        plan_name: String(ent.plan_name),
        price: Number(ent.price || 0),
        unlock_quota: Number(ent.unlock_quota || 0),
        quota_used: Number(ent.quota_used || 0),
        quota_total: ent.quota_total != null ? Number(ent.quota_total) : null,
        started_at: ent.started_at ?? null,
        expires_at: ent.expires_at ?? null,
      };
    }

    // 回退：活跃订阅（如 billing/subscribe 仅写订阅不发权益）
    const [subRows] = await this.pool.query(
      `SELECT s.id AS subscription_id, s.plan_code, s.started_at, s.expires_at,
              p.name AS plan_name, p.price, p.unlock_quota
       FROM crm_user_subscriptions s
       INNER JOIN crm_membership_plans p ON p.plan_code = s.plan_code
       WHERE s.user_key = ?
         AND s.status = 'active'
         AND (s.expires_at IS NULL OR s.expires_at > NOW())
         AND p.price > 0
         AND p.plan_type <> 'single'
       ORDER BY p.price DESC, s.id DESC
       LIMIT 1`,
      [userKey],
    );
    const sub = (subRows as any[])[0];
    if (sub) {
      return {
        entitlement_id: null,
        subscription_id: Number(sub.subscription_id),
        source_order_no: null,
        plan_code: String(sub.plan_code),
        plan_name: String(sub.plan_name),
        price: Number(sub.price || 0),
        unlock_quota: Number(sub.unlock_quota || 0),
        quota_used: 0,
        quota_total: null,
        started_at: sub.started_at ?? null,
        expires_at: sub.expires_at ?? null,
      };
    }
    return null;
  }

  // ── 事务感知方法（供 executeUnlock 服务层编排使用）──

  /** 事务内悲观锁查询用户有效权益（SELECT ... FOR UPDATE 防并发配额超卖） */
  async findAndLockEntitlement(
    conn: PoolConnection, userKey: string,
  ): Promise<EntitlementRow | null> {
    const [rows] = await conn.query(
      `SELECT id, plan_code, quota_total, quota_used, (quota_total - quota_used) AS quota_remaining, expires_at
       FROM crm_user_entitlements
       WHERE user_key = ? AND status = 'active' AND is_upgraded = 0 AND quota_total > quota_used
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY expires_at IS NULL DESC, expires_at ASC, id ASC LIMIT 1
       FOR UPDATE`,
      [userKey],
    );
    return (rows as EntitlementRow[])[0] ?? null;
  }

  /** 事务内检查用户是否有活跃订阅 */
  async hasActiveSubscriptionInTransaction(
    conn: PoolConnection, userKey: string,
  ): Promise<boolean> {
    const [rows] = await conn.query(
      `SELECT id FROM crm_user_subscriptions
       WHERE user_key = ? AND status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [userKey],
    );
    return (rows as RowDataPacket[]).length > 0;
  }
}
