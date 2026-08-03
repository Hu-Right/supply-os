/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 会员数据访问层
 * Membership Repository
 *
 * @module repos/membership.repo
 */
import type { Pool } from "mysql2/promise";
import type { MembershipPlanRow, SubscriptionRow, EntitlementRow, CountRow } from "./types";

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

  /** 获取免费套餐的 free_quota */
  async getFreeQuota(): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT free_quota FROM crm_membership_plans WHERE plan_code = 'free' LIMIT 1",
    );
    return Number((rows as MembershipPlanRow[])[0]?.free_quota || 3);
  }

  /** 查询用户的有效订阅 */
  async findActiveSubscriptions(userKey: string): Promise<SubscriptionRow[]> {
    const [rows] = await this.pool.query(
      `SELECT plan_code, status, started_at, expires_at
       FROM crm_user_subscriptions
       WHERE user_key = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY id DESC`,
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

  /** 查询用户有效权益（有剩余配额且未过期） */
  async findActiveEntitlements(userKey: string): Promise<EntitlementRow[]> {
    const [rows] = await this.pool.query(
      `SELECT id, plan_code, quota_total, quota_used, (quota_total - quota_used) AS quota_remaining, expires_at
       FROM crm_user_entitlements
       WHERE user_key = ?
         AND status = 'active'
         AND quota_total > quota_used
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY expires_at IS NULL DESC, expires_at ASC, id ASC`,
      [userKey],
    );
    return rows as EntitlementRow[];
  }
}
