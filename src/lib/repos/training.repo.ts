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

export interface ParticipantRow extends RowDataPacket {
  id: number;
  order_id: number;
  participant_no: number;
  full_name: string;
  gender: string | null;
  phone: string | null;
  company_name: string | null;
  position: string | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface CreateTrainingOrderData {
  orderNo: string;
  courseId: number;
  scheduleId: number | null;
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
  /** 内部用户 ID */
  userId?: number | null;
}

export class TrainingRepo {
  constructor(private pool: Pool) {}

  /** 研修班报名，返回自增 id */
  async insertRegistration(data: {
    companyName: string;
    industryId: number | null;
    industry: string;
    mainProduct: string;
    exportExperience: string;
    certification: string;
    contactName: string;
    position: string;
    telephone: string;
    email: string;
    remark: string;
    ip: string;
  }): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO crm_training_registrations
        (company_name, industry_id, industry, main_product, export_experience, certification, contact_name, position, telephone, email, remark, created_at, ip, audit_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, 'pending')`,
      [
        data.companyName, data.industryId, data.industry,
        data.mainProduct, data.exportExperience, data.certification,
        data.contactName, data.position, data.telephone,
        data.email, data.remark, data.ip,
      ],
    );
    return Number((result as RowDataPacket).insertId);
  }

  // 下载计数单一权威源：crm_learning_materials.downloads_count（由 /api/training/downloads/track 直接递增）。
  // 旧 crm_training_download_stats 并行计数（incrementDownloadCount / listDownloadStats）及其 stats 端点无消费方，已移除。
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

  /** 创建培训支付订单，返回自增 id */
  async createOrder(data: CreateTrainingOrderData): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO training_orders
        (order_no, course_id, schedule_id, registration_id, participant_count, unit_price, total_amount,
         currency, provider, status, qr_code, pay_url, expires_at, contact_name, telephone, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, NOW())`,
      [
        data.orderNo, data.courseId, data.scheduleId, data.registrationId,
        data.participantCount, data.unitPrice, data.totalAmount, data.currency,
        data.provider, data.qrCode, data.payUrl, data.expiresAt,
        data.contactName, data.telephone, data.userId ?? null,
      ],
    );
    return Number((result as RowDataPacket).insertId);
  }

  /** 按订单号查询培训订单 */
  async findOrderByNo(orderNo: string): Promise<TrainingOrderRow | null> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_orders WHERE order_no = ? LIMIT 1",
      [orderNo],
    );
    return (rows as TrainingOrderRow[])[0] || null;
  }

  /** 更新培训订单状态（支付成功时记录 trade_no 与 paid_at） */
  async updateOrderStatus(orderNo: string, status: string, providerTradeNo?: string | null): Promise<void> {
    if (status === "paid") {
      await this.pool.execute(
        "UPDATE training_orders SET status = 'paid', provider_trade_no = ?, paid_at = NOW() WHERE order_no = ?",
        [providerTradeNo || null, orderNo],
      );
    } else {
      await this.pool.execute(
        "UPDATE training_orders SET status = ? WHERE order_no = ?",
        [status, orderNo],
      );
    }
  }

  /** 更新报名记录的支付状态与关联订单 */
  async updateRegistrationPayment(registrationId: number, orderId: number, paymentStatus: string): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_training_registrations SET payment_status = ?, order_id = ? WHERE id = ?",
      [paymentStatus, orderId, registrationId],
    );
  }

  // ── 事务感知方法（供履约等需要悲观锁的场景使用） ──

  /** 获取数据库连接（供调用方自行管理事务） */
  async getConnection(): Promise<PoolConnection> {
    return this.pool.getConnection();
  }

  /** 悲观锁查询订单（SELECT ... FOR UPDATE） */
  async findOrderByNoForUpdate(conn: PoolConnection, orderNo: string): Promise<TrainingOrderRow | null> {
    const [rows] = await conn.execute(
      "SELECT * FROM training_orders WHERE order_no = ? LIMIT 1 FOR UPDATE",
      [orderNo],
    );
    return (rows as TrainingOrderRow[])[0] || null;
  }

  /** 事务内更新订单状态 */
  async updateOrderStatusInTransaction(conn: PoolConnection, orderNo: string, status: string, providerTradeNo?: string | null): Promise<void> {
    if (status === "paid") {
      await conn.execute(
        "UPDATE training_orders SET status = 'paid', provider_trade_no = ?, paid_at = NOW() WHERE order_no = ?",
        [providerTradeNo || null, orderNo],
      );
    } else {
      await conn.execute(
        "UPDATE training_orders SET status = ? WHERE order_no = ?",
        [status, orderNo],
      );
    }
  }

  /** 事务内更新报名记录支付状态 */
  async updateRegistrationPaymentInTransaction(conn: PoolConnection, registrationId: number, orderId: number, paymentStatus: string): Promise<void> {
    await conn.execute(
      "UPDATE crm_training_registrations SET payment_status = ?, order_id = ? WHERE id = ?",
      [paymentStatus, orderId, registrationId],
    );
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

  /** 保存学员信息（批量插入/更新） */
  async saveParticipants(orderId: number, participants: Array<{
    participant_no: number;
    full_name: string;
    gender?: string | null;
    phone?: string | null;
    company_name?: string | null;
    position?: string | null;
  }>): Promise<void> {
    // 先删除该订单的旧学员记录（支持重新提交）
    await this.pool.execute("DELETE FROM training_participants WHERE order_id = ?", [orderId]);
    
    // 批量插入新学员记录
    if (participants.length === 0) return;
    
    const values = participants.map(p => [
      orderId,
      p.participant_no,
      p.full_name,
      p.gender || null,
      p.phone || null,
      p.company_name || null,
      p.position || null,
    ]);
    
    const placeholders = values.map(() => 
      "(?, ?, ?, ?, ?, ?, ?)"
    ).join(", ");
    
    const flatValues = values.flat();
    
    await this.pool.execute(
      `INSERT INTO training_participants (
        order_id, participant_no, full_name, gender, phone, company_name, position
      ) VALUES ${placeholders}`,
      flatValues
    );
  }

  /** 查询订单的学员信息 */
  async getParticipantsByOrderId(orderId: number): Promise<ParticipantRow[]> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_participants WHERE order_id = ? ORDER BY participant_no ASC",
      [orderId]
    );
    return rows as ParticipantRow[];
  }

  /** 按用户查询培训订单（可选状态过滤） */
  async findOrdersByUserId(userId: number, status: string): Promise<TrainingOrderRow[]> {
    const params: unknown[] = [userId];
    let where = "WHERE user_id = ?";
    if (status) {
      where += " AND status = ?";
      params.push(status);
    }
    const [rows] = await this.pool.query(
      `SELECT * FROM training_orders ${where} ORDER BY id DESC`,
      params,
    );
    return rows as TrainingOrderRow[];
  }

  /** 按用户统计培训订单数 */
  async countOrdersByUserId(userId: number, status: string): Promise<number> {
    const params: unknown[] = [userId];
    let where = "WHERE user_id = ?";
    if (status) {
      where += " AND status = ?";
      params.push(status);
    }
    const [rows] = await this.pool.query(
      `SELECT COUNT(*) AS total FROM training_orders ${where}`,
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
