/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 培训报名 + 系统配置数据访问层
 * Training & System Repository
 *
 * @module repos/training.repo
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

// ── 落地页行类型（034 迁移） ────────────────────────────────────────────────

export interface CourseRow extends RowDataPacket {
  id: number;
  name_zh: string;
  name_en: string | null;
  description_zh: string | null;
  description_en: string | null;
  unit_price: number | string;
  currency: string;
  includes: string | null;
  status: string;
  sort_order: number;
}

export interface ScheduleRow extends RowDataPacket {
  id: number;
  course_id: number;
  period_number: number;
  start_date: string | Date;
  city: string;
  format: string;
  status: string;
  capacity: number | null;
  enrolled_count: number;
}

export interface TrainingOrderRow extends RowDataPacket {
  id: number;
  order_no: string;
  course_id: number;
  schedule_id: number | null;
  registration_id: number | null;
  participant_count: number;
  unit_price: number | string;
  total_amount: number | string;
  currency: string;
  provider: string;
  status: string;
  qr_code: string | null;
  pay_url: string | null;
  provider_trade_no: string | null;
  paid_at: Date | null;
  expires_at: Date;
  /** 下单用户（内部标识） */
  user_id: number | null;
}

/**
 * 列投影：统一表 `orders` → TrainingOrderRow。
 * 课程 id 在 product_code、人数在 quantity、期次在 items_snapshot、
 * 报名行在 granted_registration_id —— 在这里还原成旧列名，上层读取无需改动。
 */
const TRAINING_ORDER_COLUMNS = `id, order_no,
  CAST(product_code AS UNSIGNED) AS course_id,
  CAST(JSON_UNQUOTE(JSON_EXTRACT(items_snapshot, '$.scheduleId')) AS UNSIGNED) AS schedule_id,
  granted_registration_id AS registration_id,
  quantity AS participant_count,
  unit_price, amount AS total_amount, currency, provider, status,
  qr_code_url AS qr_code, pay_url, provider_trade_no, paid_at, expires_at, user_id`;

/**
 * 报名行 = 一位参训学员（2026-11-13 收敛后口径）。
 * 企业信息与期次是同一批报名的快照，逐行冗余：任一行都能独立还原一次完整报名，
 * 导出/证书/CRM 不需要再 join 企业表。
 */
export interface EnrollmentRow extends RowDataPacket {
  id: number;
  user_id: number;
  order_id: number | null;
  schedule_id: number | null;
  participant_no: number;
  full_name: string;
  gender: string | null;
  phone: string;
  position: string | null;
  email: string | null;
  invoice_email: string | null;
  company_name: string;
  main_product: string | null;
  export_experience: string | null;
  certification: string | null;
  remark: string | null;
  ip: string | null;
  created_at: Date;
  updated_at: Date | null;
}

/** 一位学员的录入体（请求侧仍用列名，红线②只约束响应实体字段） */
export interface EnrollmentParticipantInput {
  participant_no: number;
  full_name: string;
  gender?: string | null;
  phone?: string | null;
  position?: string | null;
  email?: string | null;
}

/** 一次报名（可含 1-N 位学员）：企业信息与期次在同一批内共享 */
export interface CreateEnrollmentsData {
  userId: number;
  scheduleId: number | null;
  companyName: string;
  mainProduct: string;
  exportExperience: string;
  certification: string;
  remark: string;
  /** 发票/开课通知邮箱（企业区填写）：与学员个人 email 是两条信息，各留一个载体 */
  invoiceEmail: string;
  ip: string;
  participants: EnrollmentParticipantInput[];
}

export interface CreateTrainingOrderData {
  orderNo: string;
  courseId: number;
  /** 课程名快照（orders.product_name）：目录改名不影响历史单的可读性 */
  productName: string;
  scheduleId: number | null;
  /** 主报名行（本单首位学员）；多学员明细靠 order_id 反查，不在 orders 上存数组 */
  registrationId: number | null;
  participantCount: number;
  unitPrice: number;
  totalAmount: number;
  currency: string;
  provider: string;
  qrCode: string | null;
  payUrl: string | null;
  expiresAt: Date;
  contactName: string | null;
  telephone: string | null;
  /** 下单人（orders.user_id 已收 NOT NULL） */
  userId: number;
}

export class TrainingRepo {
  constructor(private pool: Pool) {}

  /**
   * 创建一次报名（1-N 位学员），返回逐行自增 id。
   *
   * 2026-11-13 收敛后：报名即学员，一行一人；企业信息与期次作为快照写到每一行。
   * 逐条插而非多值 INSERT，是为了拿到**确定的 id 列表**——下单时要把这批行绑到订单上，
   * 而多值 INSERT 在 innodb_autoinc_lock_mode=2 下不保证 id 连续。
   * 人数上限由下单层护栏（MAX_PARTICIPANTS_PER_ORDER）约束，循环规模可控。
   */
  async createEnrollments(data: CreateEnrollmentsData): Promise<number[]> {
    const conn = await this.pool.getConnection();
    const ids: number[] = [];
    try {
      await conn.beginTransaction();
      for (const p of data.participants) {
        const [result] = await conn.execute(
          `INSERT INTO training_enrollments
            (user_id, schedule_id, participant_no, full_name, gender, phone, position, email,
             invoice_email, company_name, main_product, export_experience, certification, remark, ip, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            data.userId, data.scheduleId, p.participant_no,
            p.full_name, p.gender || null, p.phone || null, p.position || null, p.email || null,
            data.invoiceEmail || null, data.companyName, data.mainProduct, data.exportExperience,
            data.certification, data.remark, data.ip,
          ],
        );
        ids.push(Number((result as RowDataPacket).insertId));
      }
      await conn.commit();
      return ids;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** 按 id 取报名行（限本人）：下单前校验归属、期次一致性与是否已被别的订单占用 */
  async findEnrollmentsByIds(ids: number[], userId: number): Promise<EnrollmentRow[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const [rows] = await this.pool.query(
      `SELECT * FROM training_enrollments WHERE id IN (${placeholders}) AND user_id = ?`,
      [...ids, userId],
    );
    return rows as EnrollmentRow[];
  }

  /**
   * 把这批报名行绑到订单上。只绑尚未成单的行（order_id IS NULL），
   * 返回受影响行数——调用方须比对 ids.length，不等即说明有行已被别的订单占用，应回滚。
   */
  async bindEnrollmentsToOrder(orderId: number, ids: number[], userId: number): Promise<number> {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => "?").join(", ");
    const [result] = await this.pool.execute(
      `UPDATE training_enrollments SET order_id = ?
       WHERE id IN (${placeholders}) AND user_id = ? AND order_id IS NULL`,
      [orderId, ...ids, userId],
    );
    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  }

  /** 订单下的学员名单（支付后回显、证书与名单导出共用此口径） */
  async listEnrollmentsByOrderId(orderId: number): Promise<EnrollmentRow[]> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_enrollments WHERE order_id = ? ORDER BY participant_no ASC, id ASC",
      [orderId],
    );
    return rows as EnrollmentRow[];
  }

  // 下载计数单一权威源：learning_materials.downloads_count（由 /api/training/downloads/track 直接递增）。
  // 旧 training_download_stats 并行计数（incrementDownloadCount / listDownloadStats）及其 stats 端点无消费方，已移除。
  // 表本身保留（历史数据），如需清理另走迁移。

  // ── 落地页动态内容：课程 + 期次（报名支付依据）；讲师/团队/照片/反馈/FAQ 已前端静态化 ──

  /** 查询当前激活课程（按 sort_order 取第一条） */
  async getActiveCourse(): Promise<CourseRow | null> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_courses WHERE status = 'active' ORDER BY sort_order ASC, id ASC LIMIT 1",
    );
    return (rows as CourseRow[])[0] || null;
  }

  /** 查询课程期次列表 */
  async listSchedules(courseId: number): Promise<ScheduleRow[]> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_schedules WHERE course_id = ? ORDER BY start_date ASC, period_number ASC",
      [courseId],
    );
    return rows as ScheduleRow[];
  }

  /** 查询单个期次（下单容量校验用，审查 F25） */
  async findScheduleById(scheduleId: number): Promise<ScheduleRow | null> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_schedules WHERE id = ? LIMIT 1",
      [scheduleId],
    );
    return (rows as ScheduleRow[])[0] ?? null;
  }

  /**
   * 创建培训支付订单，返回自增 id。
   * 2026-11-12 起物理存储为统一表 `orders`（product_kind='course'）：
   * 课程 id 落 product_code，人数落 quantity，期次与联系人落 items_snapshot
   * （联系人两列在旧表里只写不读，从无消费方，故不必回读别名）。
   */
  async createOrder(data: CreateTrainingOrderData): Promise<number> {
    const snapshot: Record<string, unknown> = { courseId: data.courseId };
    if (data.scheduleId != null) snapshot.scheduleId = data.scheduleId;
    if (data.contactName) snapshot.contactName = data.contactName;
    if (data.telephone) snapshot.telephone = data.telephone;

    const [result] = await this.pool.execute(
      `INSERT INTO orders
        (order_no, user_id, product_kind, product_code, product_name, unit_price, quantity, amount,
         currency, provider, status, qr_code_url, pay_url, expires_at, granted_registration_id,
         items_snapshot, created_at)
       VALUES (?, ?, 'course', ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NOW())`,
      [
        data.orderNo, data.userId, String(data.courseId), data.productName,
        data.unitPrice, data.participantCount, data.totalAmount, data.currency,
        data.provider, data.qrCode, data.payUrl, data.expiresAt,
        data.registrationId ?? null, JSON.stringify(snapshot),
      ],
    );
    return Number((result as RowDataPacket).insertId);
  }

  /** 按订单号查询培训订单（列别名还原 TrainingOrderRow 形状） */
  async findOrderByNo(orderNo: string): Promise<TrainingOrderRow | null> {
    const [rows] = await this.pool.execute(
      `SELECT ${TRAINING_ORDER_COLUMNS} FROM orders WHERE order_no = ? AND product_kind = 'course' LIMIT 1`,
      [orderNo],
    );
    return (rows as TrainingOrderRow[])[0] || null;
  }

  /** 更新培训订单状态（支付成功时记录 trade_no 与 paid_at） */
  async updateOrderStatus(orderNo: string, status: string, providerTradeNo?: string | null): Promise<void> {
    if (status === "paid") {
      await this.pool.execute(
        "UPDATE orders SET status = 'paid', provider_trade_no = ?, paid_at = NOW() WHERE order_no = ? AND product_kind = 'course'",
        [providerTradeNo || null, orderNo],
      );
    } else {
      await this.pool.execute(
        "UPDATE orders SET status = ? WHERE order_no = ? AND product_kind = 'course'",
        [status, orderNo],
      );
    }
  }

  // 2026-11-13 收敛：报名支付状态不再双写。
  // 订单状态唯一权威是 orders.status（付款/退款都只改那一处），报名行只保留 order_id。
  // 旧 updateRegistrationPayment / updateRegistrationPaymentInTransaction 已删除。

  // ── 事务感知方法（供履约等需要悲观锁的场景使用） ──

  /** 获取数据库连接（供调用方自行管理事务） */
  async getConnection(): Promise<PoolConnection> {
    return this.pool.getConnection();
  }

  /** 悲观锁查询订单（SELECT ... FOR UPDATE） */
  async findOrderByNoForUpdate(conn: PoolConnection, orderNo: string): Promise<TrainingOrderRow | null> {
    const [rows] = await conn.execute(
      `SELECT ${TRAINING_ORDER_COLUMNS} FROM orders WHERE order_no = ? AND product_kind = 'course' LIMIT 1 FOR UPDATE`,
      [orderNo],
    );
    return (rows as TrainingOrderRow[])[0] || null;
  }

  /** 事务内更新订单状态 */
  async updateOrderStatusInTransaction(conn: PoolConnection, orderNo: string, status: string, providerTradeNo?: string | null): Promise<void> {
    if (status === "paid") {
      await conn.execute(
        "UPDATE orders SET status = 'paid', provider_trade_no = ?, paid_at = NOW() WHERE order_no = ? AND product_kind = 'course'",
        [providerTradeNo || null, orderNo],
      );
    } else {
      await conn.execute(
        "UPDATE orders SET status = ? WHERE order_no = ? AND product_kind = 'course'",
        [status, orderNo],
      );
    }
  }

  /**
   * 事务内递增期次报名人数（审查 F25）：
   * 带容量护栏（capacity 为 NULL 视为不限），返回受影响行数——
   * 0 表示名额已被并发占满，调用方必须回滚并转人工
   */
  async incrementEnrolledCountInTransaction(conn: PoolConnection, scheduleId: number, delta = 1): Promise<number> {
    const [result] = await conn.execute(
      `UPDATE training_schedules
       SET enrolled_count = enrolled_count + ?
       WHERE id = ? AND (capacity IS NULL OR enrolled_count + ? <= capacity)`,
      [delta, scheduleId, delta],
    );
    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  }

  /** 按用户查询培训订单（可选状态过滤）——2026-11-12 起读统一表 orders（kind='course'） */
  async findOrdersByUserId(userId: number, status: string): Promise<TrainingOrderRow[]> {
    const params: unknown[] = [userId];
    let where = "WHERE user_id = ? AND product_kind = 'course'";
    if (status) {
      where += " AND status = ?";
      params.push(status);
    }
    const [rows] = await this.pool.query(
      `SELECT ${TRAINING_ORDER_COLUMNS} FROM orders ${where} ORDER BY id DESC`,
      params,
    );
    return rows as TrainingOrderRow[];
  }

  /** 按用户统计培训订单数 */
  async countOrdersByUserId(userId: number, status: string): Promise<number> {
    const params: unknown[] = [userId];
    let where = "WHERE user_id = ? AND product_kind = 'course'";
    if (status) {
      where += " AND status = ?";
      params.push(status);
    }
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS total FROM orders ${where}`,
      params,
    );
    return Number((rows as RowDataPacket[])[0]?.total || 0);
  }
}

/** 系统配置（system 表） */
export class SystemRepo {
  constructor(private pool: Pool) {}

  /** 查询 ICP 备案号 */
  async getIcpBah(): Promise<string> {
    const [rows] = await this.pool.query(
      "SELECT bah FROM `system` LIMIT 1",
    );
    return (rows as RowDataPacket[])?.[0]?.bah || "";
  }

  /** N6 收敛（2026-08-20）：查询底部社交媒体链接 */
  async listFooterLinks(): Promise<RowDataPacket[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, name, url, icon FROM crm.link WHERE status = 1 ORDER BY sort_order ASC, id ASC LIMIT 100`,
    );
    return rows;
  }
}
