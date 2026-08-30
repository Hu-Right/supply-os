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
  user_key: string | null;
}

export interface InstructorRow extends RowDataPacket {
  id: number;
  name_zh: string;
  name_en: string | null;
  roles: string;
  title_zh: string;
  title_en: string | null;
  bio_zh: string;
  bio_en: string | null;
  avatar_path: string;
  is_featured: number;
  sort_order: number;
}

export interface TeamMemberRow extends RowDataPacket {
  id: number;
  name_zh: string;
  name_en: string | null;
  title_zh: string | null;
  title_en: string | null;
  roles: string | null;
  avatar_path: string;
  sort_order: number;
}

export interface GalleryCategoryRow extends RowDataPacket {
  id: number;
  name_zh: string;
  name_en: string | null;
  description_zh: string | null;
  description_en: string | null;
  cover_image: string | null;
  sort_order: number;
}

export interface GalleryImageRow extends RowDataPacket {
  id: number;
  category_id: number;
  image_path: string;
  sort_order: number;
}

export interface TestimonialRow extends RowDataPacket {
  id: number;
  quote_zh: string;
  quote_en: string | null;
  author_name: string;
  author_title: string | null;
  sort_order: number;
}

export interface FaqRow extends RowDataPacket {
  id: number;
  question_zh: string;
  question_en: string | null;
  answer_zh: string;
  answer_en: string | null;
  sort_order: number;
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
  userKey: string | null;
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

  // ── P3-11 安全修复：下载计数持久化到 crm_training_download_stats ──

  /** 原子递增下载计数（INSERT ON DUPLICATE KEY UPDATE） */
  async incrementDownloadCount(materialId: string, fileName: string): Promise<number> {
    await this.pool.execute(
      `INSERT INTO crm_training_download_stats (material_id, file_name, download_count)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE download_count = download_count + 1, file_name = VALUES(file_name)`,
      [materialId, fileName],
    );
    const [rows] = await this.pool.execute(
      "SELECT download_count FROM crm_training_download_stats WHERE material_id = ? LIMIT 1",
      [materialId],
    );
    return Number((rows as RowDataPacket[])?.[0]?.download_count || 0);
  }

  /** 查询所有下载统计 */
  async listDownloadStats(): Promise<Record<string, number>> {
    const [rows] = await this.pool.query(
      "SELECT material_id, download_count FROM crm_training_download_stats ORDER BY download_count DESC",
    );
    const result: Record<string, number> = {};
    for (const row of rows as RowDataPacket[]) {
      result[row.material_id] = Number(row.download_count || 0);
    }
    return result;
  }

  // ── 落地页内容（034 迁移，全部 DB 驱动，无种子数据） ──

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

  /** 支付成功后递增期次报名人数 */
  async incrementEnrolledCount(scheduleId: number, delta = 1): Promise<void> {
    await this.pool.execute(
      "UPDATE training_schedules SET enrolled_count = enrolled_count + ? WHERE id = ?",
      [delta, scheduleId],
    );
  }

  /** 创建培训支付订单，返回自增 id */
  async createOrder(data: CreateTrainingOrderData): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO training_orders
        (order_no, course_id, schedule_id, registration_id, participant_count, unit_price, total_amount,
         currency, provider, status, qr_code, pay_url, expires_at, contact_name, telephone, user_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, NOW())`,
      [
        data.orderNo, data.courseId, data.scheduleId, data.registrationId,
        data.participantCount, data.unitPrice, data.totalAmount, data.currency,
        data.provider, data.qrCode, data.payUrl, data.expiresAt,
        data.contactName, data.telephone, data.userKey,
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

  /** 查询核心讲师（featured 大卡片） */
  async listFeaturedInstructors(): Promise<InstructorRow[]> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_instructors WHERE status = 'active' AND is_featured = 1 ORDER BY sort_order ASC, id ASC",
    );
    return rows as InstructorRow[];
  }

  /** 查询团队成员（小头像网格） */
  async listTeamMembers(): Promise<TeamMemberRow[]> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_team_members WHERE status = 'active' ORDER BY sort_order ASC, id ASC",
    );
    return rows as TeamMemberRow[];
  }

  /** 查询课堂照片分类 */
  async listGalleryCategories(): Promise<GalleryCategoryRow[]> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_gallery_categories WHERE status = 'active' ORDER BY sort_order ASC, id ASC",
    );
    return rows as GalleryCategoryRow[];
  }

  /** 查询某分类下的课堂照片 */
  async listGalleryImagesByCategory(categoryId: number): Promise<GalleryImageRow[]> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_gallery_images WHERE category_id = ? ORDER BY sort_order ASC, id ASC",
      [categoryId],
    );
    return rows as GalleryImageRow[];
  }

  /** 查询学员反馈 */
  async listTestimonials(): Promise<TestimonialRow[]> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_testimonials WHERE status = 'active' ORDER BY sort_order ASC, id ASC",
    );
    return rows as TestimonialRow[];
  }

  /** 查询常见问题 */
  async listFaqs(): Promise<FaqRow[]> {
    const [rows] = await this.pool.execute(
      "SELECT * FROM training_faqs WHERE status = 'active' ORDER BY sort_order ASC, id ASC",
    );
    return rows as FaqRow[];
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
