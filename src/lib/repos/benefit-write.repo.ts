/**
 * 权益体系写层（阶段二·订阅事实与额度账本）
 * Benefit System Write Repository
 *
 * @module repos/benefit-write.repo
 * @description 只写迁移 092 建的 4 张事实/账本表：
 *              crm_plan_subscriptions / crm_benefit_quotas / crm_subscription_seats。
 *              目录侧（套餐、权益、矩阵）一律经 BenefitSystemRepo 读，不在本模块复制口径。
 *
 *              纪律（勿加回来）：
 *              - 不写旧三表（crm_user_subscriptions / crm_user_entitlements / crm_membership_plans），
 *                也不做"旧行 + 新行"双写：双写会让两本账各自漂移且无人能裁决；
 *              - source_order_no 必须是真实成交订单号。旧体系用 `SUB-${userId}-${plan_code}`
 *                这类伪订单号懒补建权益行，而本表该列 NOT NULL 的语义就是"无订单来源的订阅
 *                禁止存在"，延用伪号等于自毁约束；
 *              - 普通用户池用 subscription_id = NULL 表达，不得用 0 伪装（0 会撞出无意义的外键）。
 *
 *              额度模型要点：
 *              - `quota_total = -1` 表示不限，**永不写消耗**（库内 chk_usage 约束
 *                `quota_used BETWEEN 0 AND GREATEST(quota_total,0)` 在 -1 时要求 used 恒为 0）；
 *              - `quota_total = 0` 是"该档明确无额度"的显式账，照常建行，扣减必失败；
 *              - 同周期重复发放只抬额度不重置已用量（要清零必须开新一周期行），
 *                避免续费/重放回调把已花掉的额度洗回满格。
 */
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { BenefitSystemRepo } from "./benefit-system.repo";

/** 事务内外通用执行器：定时任务传 pool，履约链路传事务连接 */
export type Db = Pool | PoolConnection;

/** 被行锁锁定的当前周期额度池行 */
export interface LockedPoolRow {
  id: number;
  subscription_id: number | null;
  seat_user_id: number;
  benefit_code: string;
  quota_total: number;
  quota_used: number;
  status: "active" | "exhausted" | "frozen" | "expired";
}

export interface LockedSubscriptionRow {
  id: number;
  owner_user_id: number;
  plan_code: string;
  source_order_no: string;
  currency: string;
  status: string;
  is_current: number;
  started_at: Date;
  expires_at: Date | null;
  replaced_by_id: number | null;
}

/** 扣减结果：三态显式返回，由调用方翻译成业务错误码 */
export type ConsumeResult = "unlimited" | "consumed" | "denied";

/** 发放结果：anomalies 非空说明矩阵配置不完整，调用方须报警而非静默跳过 */
export interface GrantResult {
  granted: string[];
  anomalies: string[];
}

/** 订阅写入参数 */
export interface NewSubscriptionParams {
  ownerUserId: number;
  planCode: string;
  sourceOrderNo: string;
  /** 实付金额（升级补差时不等于目录标价），财务口径快照 */
  pricePaid: number;
  currency?: string;
  /** 席位上限快照，取自目录（-1=合同自定义） */
  seatLimit: number;
  /** 到期时间；null=永久。必须由调用方按目录 billing_period_days 算好后传入 */
  expiresAt: Date | string | null;
  startedAt?: Date | string;
}

/**
 * 订阅与额度池写入。所有方法都接受 Db：需要在履约事务内持锁时传 PoolConnection。
 */
export class BenefitWriteRepo {
  /** 所有订阅写操作先锁订阅，再锁额度池，统一并发顺序。 */
  async findSubscriptionForUpdate(conn: PoolConnection, id: number): Promise<LockedSubscriptionRow | null> {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, owner_user_id, plan_code, source_order_no, currency, status, started_at, expires_at, replaced_by_id,
              (status = 'active' AND (expires_at IS NULL OR expires_at > NOW())) AS is_current
         FROM crm_plan_subscriptions WHERE id = ? FOR UPDATE`, [id],
    );
    return (rows[0] as LockedSubscriptionRow | undefined) ?? null;
  }

  /**
   * 多语句写入的事务包装：传入 PoolConnection 则视为调用方已有事务（不自开 BEGIN/COMMIT），
   * 传入 Pool 则自取连接并包一个事务——否则多条语句各自autocommit，
   * 中途失败会留下"池已冻结、订阅仍 active"这类互相矛盾的半状态。
   */
  private async inTx<T>(db: Db, fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
    if (!("getConnection" in db)) return fn(db as PoolConnection);

    const conn = await (db as Pool).getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      // 回滚失败不得掩盖原始异常
      try {
        await conn.rollback();
      } catch {
        /* rollback 自身失败时仍向上抛原始错误 */
      }
      throw err;
    } finally {
      conn.release();
    }
  }

  // ── 订阅事实 ──────────────────────────────────────────────────────────────

  /**
   * 写入一条订阅事实（一次购买 = 一行）。
   * @throws Error 订单号缺失、金额为负、或试图为 free 档建订阅
   */
  async insertSubscription(db: Db, p: NewSubscriptionParams): Promise<number> {
    const orderNo = (p.sourceOrderNo ?? "").trim();
    if (!orderNo) {
      throw new Error("insertSubscription 拒绝：source_order_no 为空——无订单来源的订阅禁止存在");
    }
    if (!Number.isFinite(p.pricePaid) || p.pricePaid < 0) {
      throw new Error(`insertSubscription 拒绝：price_paid 非法（${String(p.pricePaid)}）`);
    }
    if (p.planCode === "free") {
      throw new Error("insertSubscription 拒绝：free 档不售卖，不得建订阅");
    }
    // 空套餐码会一路撞到 fk_sub_plan 才报错（表现为一记 500），在入口就拒并给出可读原因
    if (!(p.planCode ?? "").trim()) {
      throw new Error("insertSubscription 拒绝：plan_code 为空，订阅必须指向在售套餐");
    }
    const [res] = await db.execute<ResultSetHeader>(
      `INSERT INTO crm_plan_subscriptions
        (owner_user_id, plan_code, source_order_no, price_paid, currency, seat_limit, status, started_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', COALESCE(?, NOW()), ?)`,
      [p.ownerUserId, p.planCode, orderNo, p.pricePaid, p.currency ?? "CNY", p.seatLimit, p.startedAt ?? null, p.expiresAt],
    );
    return res.insertId;
  }

  /**
   * 保证"每条订阅恰有一行主账号席位"，使不变式 席位数 = 行数 恒成立。
   * 撞 uk_sub_member 时只复活状态，不新增行。
   */
  async ensureOwnerSeat(db: Db, params: { subscriptionId: number; ownerUserId: number }): Promise<void> {
    await db.execute(
      `INSERT INTO crm_subscription_seats (subscription_id, member_user_id, is_owner, status, joined_at)
       VALUES (?, ?, 1, 'active', NOW())
       ON DUPLICATE KEY UPDATE status = 'active', removed_at = NULL`,
      [params.subscriptionId, params.ownerUserId],
    );
  }

  /**
   * 升级承接：把旧订阅指向新订阅并作废（保留行与 replaced_by_id 供追溯）。
   * 旧池的冻结由调用方在同一事务内 freezePoolsOfSubscription 完成。
   */
  async linkReplacedSubscription(
    db: Db,
    params: { oldSubscriptionId: number; newSubscriptionId: number },
  ): Promise<void> {
    await db.execute(
      `UPDATE crm_plan_subscriptions
          SET replaced_by_id = ?, status = 'cancelled', updated_at = NOW()
        WHERE id = ?`,
      [params.newSubscriptionId, params.oldSubscriptionId],
    );
  }

  /**
   * 逆向/对账锚点：按成交订单号定位订阅（FOR UPDATE 配合调用方事务）。
   * source_order_no 是普通索引——"一单一订"由订单状态机的履约幂等保证，
   * 取最新一行并持行锁，防退款与重放的履约回调各自读到"未落账"。
   * @returns null = 该单不是新表组履约（旧套餐单，走旧三表逆向链）
   */
  async findSubscriptionIdBySourceOrder(db: Db, sourceOrderNo: string): Promise<number | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id FROM crm_plan_subscriptions WHERE source_order_no = ? ORDER BY id FOR UPDATE`,
      [sourceOrderNo],
    );
    if (rows.length > 1) throw new Error("DUPLICATE_ORDER_SUBSCRIPTION");
    const r = (rows as Array<{ id: number | string }>)[0];
    return r ? Number(r.id) : null;
  }

  /**
   * 退款：订阅置 refunded 并同事务冻结其额度池。
   * 两步必须原子：只改订阅状态会留下"单子已退、池子还能扣"的窗口，
   * 把冻结动作指望调用方记得做就是埋错误；传 Pool 时自开事务，传 PoolConnection 则并入调用方事务。
   */
  async refundSubscription(db: Db, subscriptionId: number): Promise<{ frozenPools: number }> {
    return this.inTx(db, async (conn) => {
      const [res] = await conn.execute<ResultSetHeader>(
        `UPDATE crm_benefit_quotas SET status = 'frozen', updated_at = NOW()
          WHERE subscription_id = ? AND status IN ('active', 'exhausted')`,
        [subscriptionId],
      );
      // 先冻池再改状态：万一下一步失败，至少不会退完款还能接着消耗
      await conn.execute(
        `UPDATE crm_plan_subscriptions SET status = 'refunded', updated_at = NOW() WHERE id = ?`,
        [subscriptionId],
      );
      return { frozenPools: res.affectedRows };
    });
  }

  /**
   * 到期扫描：active 且 expires_at 已过的订阅整批改 expired，并冻结其额度池。
   * 三步必须在同一事务内（见 inTx），且先查 id 再按这批 id 更新——两步各自 WHERE
   * 会因并发新行入池而冻结不到同一批。
   * @returns 本次到期的订阅 id 列表
   */
  async expireOverdueSubscriptions(db: Db): Promise<number[]> {
    return this.inTx(db, async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM crm_plan_subscriptions
          WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()
                    ORDER BY id FOR UPDATE`,
      );
      const ids = (rows as Array<{ id: number }>).map((r) => Number(r.id));
      if (ids.length === 0) return [];

      const ph = ids.map(() => "?").join(",");
      await conn.execute(
        `UPDATE crm_benefit_quotas SET status = 'frozen', updated_at = NOW()
          WHERE subscription_id IN (${ph}) AND status IN ('active', 'exhausted')`,
        ids,
      );
      await conn.execute(
        `UPDATE crm_plan_subscriptions SET status = 'expired', updated_at = NOW() WHERE id IN (${ph})`,
        ids,
      );
      return ids;
    });
  }

  // ── 额度池 ────────────────────────────────────────────────────────────────

  /**
   * 开/抬一个额度池（幂等：撞 uk_pool 时只抬额度、绝不修改 quota_used）。
   *
   * 抬额表达式必须特判 -1：`GREATEST(100, -1)` 等于 100，若只写 GREATEST，
   * 同周期重发时"不限"会被旧的正数额度顶掉，用户付了不限量却只拿到小池。
   *
   * 【幂等成立的前提：周期起点必须是确定值】uk_pool 包含 period_starts_at，
   * 而该列默认 CURRENT_TIMESTAMP 是**逐行求值**的。若此处写 NOW()，同一池隔一秒
   * 重发就不撞唯一键 → 另开一行满额池（本库实测：同池两次开池 quota_total 由 3 变 6）。
   * 放到支付链路上就是：回调重试一次用户额度翻倍；已耗尽的用户重试一次直接白送一份新池。
   * 因此周期起点改由 period 推导：
   *   - monthly/yearly → 本月月首 / 本年年初（本身就是确定值）；
   *   - none（终身或订阅生命周期）→ 订阅的 started_at（该订阅内恒定），
   *     普通用户池（subscription_id 为 NULL）→ 哨兵 1970-01-01 表示终身。
   * @param subscriptionId null = 普通用户池（免费档计量权益）
   */
  async openQuotaPool(
    db: Db,
    p: {
      subscriptionId: number | null;
      seatUserId: number;
      scope?: "subscription" | "seat";
      benefitCode: string;
      quotaTotal: number;
      period?: "none" | "monthly" | "yearly";
      /** 显式指定周期起点（周期重置时由调用方推进行号）；缺省按 period 推导确定值 */
      periodStartsAt?: Date | null;
    },
  ): Promise<void> {
    const period = p.period ?? "none";
    await db.execute(
      `INSERT INTO crm_benefit_quotas
        (subscription_id, seat_user_id, scope, benefit_code, quota_total, quota_used, period, period_starts_at, status)
       VALUES (?, ?, ?, ?, ?, 0, ?,
               COALESCE(?,
                 CASE ?
                   WHEN 'monthly' THEN DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
                   WHEN 'yearly'  THEN DATE_FORMAT(NOW(), '%Y-01-01 00:00:00')
                   ELSE IFNULL((SELECT s.started_at FROM crm_plan_subscriptions s WHERE s.id = ?),
                               '1970-01-01 00:00:00')
                 END),
               'active')
       ON DUPLICATE KEY UPDATE
         quota_total = IF(? = -1 OR quota_total = -1, -1, GREATEST(quota_total, ?)),
         status = IF(status = 'exhausted' AND (quota_total = -1 OR quota_total > quota_used), 'active', status)`,
      [
        p.subscriptionId,
        p.seatUserId,
        p.scope ?? "subscription",
        p.benefitCode,
        p.quotaTotal,
        period,
        p.periodStartsAt ?? null,
        period,
        p.subscriptionId,
        p.quotaTotal,
        p.quotaTotal,
      ],
    );
  }

  /**
   * 按矩阵为某套餐发放全部可消耗额度池。
   * 只认 `is_consumable = 1` 且 `value_kind = 'quota'` 的行——可消耗但不是 quota 属配置异常，
   * 记入 anomalies 交调用方报警，不静默跳过（静默跳过会让"发了额度"与"矩阵写的额度"两本账不一致）。
   */
  async grantQuotaPoolsForPlan(
    db: Db,
    catalog: BenefitSystemRepo,
    p: { planCode: string; subscriptionId: number | null; seatUserId: number },
  ): Promise<GrantResult> {
    const [defs, cells] = await Promise.all([catalog.listBenefits(), catalog.loadCells([p.planCode])]);
    const granted: string[] = [];
    const anomalies: string[] = [];

    for (const def of defs.filter((d) => Number(d.is_consumable) === 1)) {
      if (def.value_kind !== "quota") {
        anomalies.push(`${def.benefit_code}：is_consumable=1 但 value_kind=${def.value_kind}，无法计量`);
        continue;
      }
      const cell = cells.find((c) => c.benefit_code === def.benefit_code);
      if (!cell) {
        anomalies.push(`${def.benefit_code}：矩阵缺格（套餐 ${p.planCode} 未声明额度），不发池`);
        continue;
      }
      const total = Number(cell.value_num);
      // 必须显式判 null/undefined：Number(null) === 0 且 0 是有限值，
      // 只靠 isFinite 会把「额度未配置」静默当成「发 0 额度」记成已发放。
      if (cell.value_num === null || cell.value_num === undefined || !Number.isInteger(total) || total < -1) {
        anomalies.push(`${def.benefit_code}：value_num 非数值（${String(cell.value_num)}），不发池`);
        continue;
      }
      await this.openQuotaPool(db, {
        subscriptionId: p.subscriptionId,
        seatUserId: p.seatUserId,
        scope: "subscription",
        benefitCode: def.benefit_code,
        quotaTotal: total,
      });
      granted.push(def.benefit_code);
    }
    return { granted, anomalies };
  }

  /**
   * 取该用户该权益"当前周期"的池行并持行锁；不过滤状态，由调用方判 active/exhausted/frozen。
   * 若只捞 active，则额度耗尽的行会"消失"，调用方会误开新池 → 等于凭空发额度。
   * @param subscriptionId null = 普通用户池；NULL 安全比较 <=>
   */
  async findAndLockCurrentPool(
    conn: PoolConnection,
    p: { seatUserId: number; benefitCode: string; subscriptionId: number | null },
  ): Promise<LockedPoolRow | null> {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, subscription_id, seat_user_id, benefit_code, quota_total, quota_used, status
         FROM crm_benefit_quotas
        WHERE seat_user_id = ? AND subscription_id <=> ? AND benefit_code = ?
          AND scope = 'subscription' AND period_starts_at <= NOW()
        ORDER BY period_starts_at DESC, id DESC
        LIMIT 1
        FOR UPDATE`,
      [p.seatUserId, p.subscriptionId, p.benefitCode],
    );
    const r = (rows as Array<Record<string, unknown>>)[0];
    if (!r) return null;
    return {
      id: Number(r.id),
      subscription_id: r.subscription_id === null ? null : Number(r.subscription_id),
      seat_user_id: Number(r.seat_user_id),
      benefit_code: String(r.benefit_code),
      quota_total: Number(r.quota_total),
      quota_used: Number(r.quota_used),
      status: r.status as LockedPoolRow["status"],
    };
  }

  /**
   * 扣一份额度。入参必须是 findAndLockCurrentPool 刚锁到的行（锁语义由调用方事务保证）。
   * - 不限池（-1）不写任何行，直接返回 unlimited：写它会撞库内 chk_usage；
   * - 非 active 或已用满返回 denied，由调用方抛业务错误码。
   */
  async consumeLockedPool(db: Db, pool: LockedPoolRow): Promise<ConsumeResult> {
    if (pool.status !== "active") return "denied";
    if (pool.quota_total === -1) return "unlimited";

    // 注意 MySQL 单表 UPDATE 的 SET 从左到右求值：后面的表达式看到的是前面列的**新值**
    // （与标准 SQL 的"同时赋值"不同）。故此处判耗尽用 quota_used（已是 +1 后的值），
    // 若写成 quota_used + 1 会提前一格把池标成 exhausted。
    const [res] = await db.execute<ResultSetHeader>(
      `UPDATE crm_benefit_quotas
          SET quota_used = quota_used + 1,
              status = IF(quota_used >= quota_total, 'exhausted', status),
              updated_at = NOW()
        WHERE id = ? AND status = 'active' AND quota_total > 0 AND quota_used < quota_total`,
      [pool.id],
    );
    return res.affectedRows === 1 ? "consumed" : "denied";
  }

  /**
   * 冻结某订阅名下的全部额度池（升级承接时用）；已 expired 的行不动，保留历史。
   * 退款路径请用 refundSubscription，它会把"冻池 + 置 refunded"包在同一事务里。
   */
  async freezePoolsOfSubscription(db: Db, subscriptionId: number): Promise<number> {
    const [res] = await db.execute<ResultSetHeader>(
      `UPDATE crm_benefit_quotas SET status = 'frozen', updated_at = NOW()
        WHERE subscription_id = ? AND status IN ('active', 'exhausted')`,
      [subscriptionId],
    );
    return res.affectedRows;
  }
}
