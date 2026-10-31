/**
 * RFQ 需求数据访问层
 * RFQ Repository
 *
 * 职责边界：bid_notices 中 entry_source='platform' AND notice_type='RFQ' 的平台自建需求
 * （rfq 域）的读写——需求广场列表 / 我的需求列表 / 详情 / 创建与编号回填 / 编辑字段 /
 * 状态机动作（submit / withdraw / reopen / invite）所需的前置查询与状态 UPDATE。
 *
 * 来源说明（repo 化改造，纯位置重构）：本文件全部 SQL 逐字搬自 src/app/api/rfq/ 各
 * route.ts 内的裸 SQL（含列名、WHERE、子查询 quote_count / quote_pending），只做位置
 * 移动，不改任何业务语义 / 状态机条件 / 参数顺序。状态机校验与 routeError 错误码仍归
 * 路由层，本层不承载业务规则。
 *
 * @module repos/rfq.repo
 */
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { RFQ_STATUS } from "@/shared/constants/rfq";

/** 需求广场列表行（listRfqs 返回，列名与 SQL SELECT 清单一一对应） */
export interface RfqListItemRow extends RowDataPacket {
  id: number;
  reference: string | null;
  title: string | null;
  country: string | null;
  province_name: string | null;
  delivery_address: string | null;
  category_code: string | null;
  category_name: string | null;
  category_l1_name: string | null;
  estimated_value: number | string | null;
  currency: string | null;
  deadline_sec: number | null;
  is_featured: number | null;
  agency: string | null;
  quote_count: number | string | null;
}

/** 我的需求列表行（getMyRfqs 返回） */
export interface MyRfqRow extends RowDataPacket {
  id: number;
  reference: string | null;
  title: string | null;
  country: string | null;
  estimated_value: number | string | null;
  currency: string | null;
  deadline_sec: number | null;
  rfq_status: string | null;
  published_date: string | Date | null;
  create_time: number | Date | string | null;
  quote_count: number | string | null;
  quote_pending: number | string | null;
}

/** RFQ 详情行（getRfqDetailById 返回，创建者可见联系人列） */
export interface RfqDetailRow extends RowDataPacket {
  id: number;
  reference: string | null;
  title: string | null;
  description: string | null;
  country: string | null;
  province_name: string | null;
  category_code: string | null;
  category_name: string | null;
  category_l1_name: string | null;
  budget_confidential: number | null;
  currency: string | null;
  incoterm: string | null;
  delivery_time: string | null;
  delivery_address: string | null;
  payment_terms: string | null;
  supplier_reqs: string | null;
  visibility: string | null;
  estimated_value: number | string | null;
  deadline_sec: number | null;
  rfq_status: string | null;
  published_date: string | Date | null;
  user_id: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

/** 状态机动作前置查询行（id + 状态 + 属主），submit / withdraw / reopen / PATCH 编辑共用 */
export interface RfqStateRow extends RowDataPacket {
  id: number;
  rfq_status: string | null;
  user_id: number | null;
}

/** invite 前置查询行（多取 visibility 判断 targeted 白名单写入） */
export interface RfqInviteStateRow extends RowDataPacket {
  user_id: number | null;
  rfq_status: string | null;
  visibility: string | null;
}

/** 需求广场排序键 */
export type RfqListSort = "deadline" | "budget" | "newest";

/** listRfqs 入参：q / categoryL1 由路由完成解析与合法性校验后传入（空串=不过滤） */
export interface ListRfqsOptions {
  /** 关键词（路由已截断 200） */
  q: string;
  /** UGT L1 树码（路由已校验 isCommodityNodeKey 且 level === 1） */
  categoryL1: string;
  sort: RfqListSort;
  page: number;
  pageSize: number;
}

/** getMyRfqs 入参：status 为路由按 RFQ_USER_FILTERABLE_STATUSES 白名单校验后的值（空串=不过滤） */
export interface MyRfqsOptions {
  userId: number;
  status: string;
  page: number;
  pageSize: number;
}

/** createRfq 入参：全部取值 / 截断 / 派生已在路由完成，本层只按位绑定 */
export interface CreateRfqInput {
  title: string;
  /** 已按 10000 截断的描述（路由内 slice(0, 10000)） */
  description: string;
  /** UGT 最深节点码，空码为 null */
  categoryCode: string | null;
  /** 展示列 deadline（ISO 日期串） */
  deadline: string;
  /** 基色列 deadline_ts（秒）。STORED 生成列 deadline_sec 不可写，故成对写这两列 */
  deadlineSec: number;
  /** create_time（创建时刻，秒） */
  createTimeSec: number;
  estimatedValue: number;
  currency: string;
  /** 创建恒为 draft（红线 5：发布由库外审核写，路由决定，客户端不可指定） */
  status: string;
  contactEmail: string;
  contactPhone: string;
  userId: number | null;
  contactName: string;
  budgetConfidential: boolean;
  incoterm: string | null;
  deliveryTime: string | null;
  deliveryAddress: string | null;
  paymentTerms: string | null;
  supplierReqs: string | null;
  visibility: string;
}

/**
 * PATCH 编辑的动态字段集：键存在即写入对应列。
 * SET 片段顺序与搬迁前 [id]/route.ts 内 updates[] 的 push 顺序完全一致
 * （title → description → deadline/deadline_ts → budget_confidential/estimated_value →
 *   currency → delivery_address → category_code → contact_email → contact_phone →
 *   contact_name → incoterm → delivery_time → payment_terms → supplier_reqs → visibility），
 * 末尾由 repo 追加 rfq_status 回退。
 * 各字段的取值 / 校验（routeError）仍在路由完成，这里只负责拼装与执行。
 */
export interface RfqPatchFields {
  title?: string;
  description?: string;
  /** deadline 展示列 + deadline_ts 基色列，成对写入（生成列 deadline_sec 不可写） */
  deadline?: { display: string; ts: number };
  /** 预算块：budget_confidential + estimated_value 成对写入（保密时 estimated_value 为 0） */
  budget?: { confidential: boolean; estimatedValue: number };
  currency?: string;
  deliveryAddress?: string;
  /** UGT 最深节点码，空码为 null */
  categoryCode?: string | null;
  contactEmail?: string;
  contactPhone?: string;
  contactName?: string;
  incoterm?: string | null;
  deliveryTime?: string | null;
  paymentTerms?: string | null;
  supplierReqs?: string | null;
  visibility?: string;
}

/** updateRfqFields 入参 */
export interface UpdateRfqFieldsInput {
  rfqId: number;
  userId: number;
  fields: RfqPatchFields;
  /** 编辑后状态回退目标（路由传入，恒为 RFQ_STATUS.DRAFT：编辑后需重新提交审核） */
  statusTo: string;
}

export class RfqRepo {
  constructor(private pool: Pool) {}

  /**
   * 创建 RFQ（INSERT bid_notices，notice_type='RFQ' + entry_source='platform' 固定写死在 SQL 内）。
   * 返回 INSERT 的 ResultSetHeader（insertId 由路由侧取用，与搬迁前
   * `const [result] = await pool.query(...)` + `(result as ResultSetHeader).insertId` 的静态面一致）。
   *
   * TODO(事务，只搬迁不修复)：建单 INSERT、随后的编号回填 backfillReference、
   * rfq_guard 哨兵登记（registerRfqGuard，由路由调用）历史上是三条独立自动提交语句，
   * INSERT 与守护登记不在同一事务（登记失败仅降可观测性，不影响建单）。本次 repo 化
   * 保持该行为不变；后续若引入事务，需把三步同包。
   */
  async createRfq(input: CreateRfqInput): Promise<ResultSetHeader> {
    // deadline_sec 是 bid_notices 的 STORED 生成列（迁移 009：基于 deadline_ts 自动折算），
    // 不可显式写入；改为写入基色列 deadline_ts（秒）与展示列 deadline（ISO 日期串）。
    // 时间语义：create_time = 创建时刻；published_date 不在创建时写（审核通过转
    // published 时才由 submit/后台写入），避免草稿/待审核阶段误显“发布于”。
    const [result] = await this.pool.query(
      `INSERT INTO bid_notices
        (title, description, country, category_code,
         notice_type, deadline, deadline_ts, create_time,
         estimated_value, currency, rfq_status,
         contact_email, contact_phone, user_id, entry_source,
         contact_name, budget_confidential,
         incoterm, delivery_time, delivery_address, payment_terms, supplier_reqs, visibility)
       VALUES (?, ?, ?, ?, 'RFQ', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'platform',
               ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.title,
        input.description,
        "China",
        input.categoryCode,
        input.deadline,
        input.deadlineSec,
        input.createTimeSec,
        input.estimatedValue,
        input.currency,
        input.status,
        input.contactEmail,
        input.contactPhone,
        input.userId,
        input.contactName,
        input.budgetConfidential ? 1 : 0,
        input.incoterm,
        input.deliveryTime,
        input.deliveryAddress,
        input.paymentTerms,
        input.supplierReqs,
        input.visibility,
      ],
    );
    return result as ResultSetHeader;
  }

  /**
   * 公告编号回填：OSRFQ-{id 12位补零}，reference 与 notice_id 同值（id 唯一→两者唯一）。
   * 前缀用 OSRFQ- 而非 RFQ-：爬虫存量里已有 5 条外部编号以 RFQ- 开头（如 RFQ-CPD-26-012），
   * 共命名空间存在唯一键撞号与 daily-sync ODKU 静默覆盖风险；OSRFQ- 为外部编号体系结构上
   * 不可能出现的形态（实测全库 0 条），实现数学级隔离。存量迁移见 085/086。
   */
  async backfillReference(id: number, reference: string): Promise<void> {
    await this.pool.query(
      `UPDATE bid_notices SET reference = ?, notice_id = ? WHERE id = ?`,
      [reference, reference, id],
    );
  }

  /**
   * 需求广场列表（entry_source='platform' AND notice_type='RFQ' AND rfq_status='published'，
   * 且未过期）：返回 total 与数据行。q / categoryL1 过滤、排序键、分页均在本层拼装，
   * WHERE 片段与搬迁前路由逐字一致。
   */
  async listRfqs(opts: ListRfqsOptions): Promise<{ total: number; rows: RfqListItemRow[] }> {
    // ── WHERE ──
    // 状态值必须参数化：裸拼 `rfq_status = published` 会被 MySQL 当作列名（ER_BAD_FIELD_ERROR）
    const conditions: string[] = [
      "n.notice_type = 'RFQ'",
      "n.entry_source = 'platform'",
      "n.rfq_status = ?",
      "(n.deadline_sec = 0 OR n.deadline_sec >= UNIX_TIMESTAMP(NOW()))",
    ];
    const params: unknown[] = [RFQ_STATUS.PUBLISHED];

    if (opts.q) {
      conditions.push("(n.title LIKE ? OR LEFT(n.description, 500) LIKE ?)");
      params.push(`%${opts.q}%`, `%${opts.q}%`);
    }
    if (opts.categoryL1) {
      // 大类筛选走码前缀谓词，不再依赖 JOIN：category_code 存的就是 UGT 节点码，
      // 其 L1 前缀命中 = 该大类下任何深度（与宽表 backbone_path 链顶同口径）
      conditions.push("n.category_code LIKE ?");
      params.push(`${opts.categoryL1}%`);
    }

    const whereSql = conditions.join(" AND ");
    const orderBy =
      opts.sort === "deadline"
        ? "n.deadline_sec ASC"
        : opts.sort === "budget"
          ? "n.estimated_value DESC"
          : "n.id DESC";
    const offset = (opts.page - 1) * opts.pageSize;

    // pool.query 的 Promise 解析为 [rows, fields] 元组；取每个结果的 [0] 才是真实行数组
    const [countResult, dataResult] = await Promise.all([
      this.pool.query(
        // 计数不再 JOIN：大类筛选走 category_code 前缀，条件全部落在主表
        `SELECT COUNT(*) AS total FROM bid_notices n
         WHERE ${whereSql}`,
        params,
      ),
      this.pool.query(
        `SELECT n.id, n.reference, n.title, n.country, n.province_name, n.delivery_address,
                n.category_code, c1.name_zh AS category_name,
                c0.name_zh AS category_l1_name,
                n.estimated_value, n.currency, n.deadline_sec, n.is_featured, n.agency,
                (SELECT COUNT(*) FROM rfq_quotes q WHERE q.rfq_id = n.id AND q.status <> 'withdrawn') AS quote_count
         FROM bid_notices n
         LEFT JOIN commodity_backbone c1 ON c1.code = n.category_code
         LEFT JOIN commodity_backbone c0 ON c0.code = LEFT(n.category_code, 6) AND c0.level = 1
         WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [...params, opts.pageSize, offset],
      ),
    ]);
    const countRows = (countResult as [RowDataPacket[], unknown])[0];
    const rows = (dataResult as [RowDataPacket[], unknown])[0];

    const total = Number(countRows[0]?.total || 0);
    return { total, rows: rows as RfqListItemRow[] };
  }

  /**
   * 当前用户的 RFQ 列表（含 draft/pending_review/published/rejected/closed）：
   * 返回 total 与数据行。status 为空串时不过滤（白名单校验在路由完成）。
   */
  async getMyRfqs(opts: MyRfqsOptions): Promise<{ total: number; rows: MyRfqRow[] }> {
    const conditions: string[] = ["n.user_id = ?", "n.notice_type = 'RFQ'"];
    const params: unknown[] = [opts.userId];

    if (opts.status) {
      conditions.push("n.rfq_status = ?");
      params.push(opts.status);
    }

    const whereSql = conditions.join(" AND ");

    // pool.query 的 Promise 解析为 [rows, fields] 元组；Promise.all 结果是
    // [[rows1,fields1],[rows2,fields2]]，必须取每个结果的 [0] 才是真实行数组。
    const [countRes, dataRes] = await Promise.all([
      this.pool.query(`SELECT COUNT(*) AS total FROM bid_notices n WHERE ${whereSql}`, params),
      this.pool.query(
        `SELECT n.id, n.reference, n.title, n.country, n.estimated_value, n.currency, n.deadline_sec,
                n.rfq_status, n.published_date, n.create_time,
                (SELECT COUNT(*) FROM rfq_quotes q WHERE q.rfq_id = n.id AND q.status <> 'withdrawn') AS quote_count,
                (SELECT COUNT(*) FROM rfq_quotes q2 WHERE q2.rfq_id = n.id AND q2.status = 'submitted') AS quote_pending
         FROM bid_notices n WHERE ${whereSql}
         ORDER BY n.id DESC LIMIT ? OFFSET ?`,
        [...params, opts.pageSize, (opts.page - 1) * opts.pageSize],
      ),
    ]);
    const countRows = countRes[0] as RowDataPacket[];
    const rows = dataRes[0] as RowDataPacket[];

    const total = Number(countRows[0]?.total || 0);
    return { total, rows: rows as MyRfqRow[] };
  }

  /** RFQ 详情（含 commodity_backbone 一/二级名与联系人列；可见性裁决在路由层） */
  async getRfqDetailById(rfqId: number): Promise<RfqDetailRow | null> {
    const [rows] = await this.pool.query(
      `SELECT n.id, n.reference, n.title, n.description, n.country, n.province_name,
              n.category_code, c1.name_zh AS category_name,
              c0.name_zh AS category_l1_name,
              n.budget_confidential, n.currency,
              n.incoterm, n.delivery_time, n.delivery_address,
              n.payment_terms, n.supplier_reqs, n.visibility,
              n.estimated_value, n.deadline_sec, n.rfq_status,
              n.published_date, n.user_id,
              n.contact_name, n.contact_email, n.contact_phone
       FROM bid_notices n
       LEFT JOIN commodity_backbone c1 ON c1.code = n.category_code
       LEFT JOIN commodity_backbone c0 ON c0.code = LEFT(n.category_code, 6) AND c0.level = 1
       WHERE n.id = ? AND n.notice_type = 'RFQ' AND n.entry_source = 'platform'
       LIMIT 1`,
      [rfqId],
    );
    return ((rows as RowDataPacket[])[0] as RfqDetailRow | undefined) ?? null;
  }

  /**
   * 状态机动作前置查询：id + rfq_status + user_id。
   * submit / withdraw / reopen / PATCH 编辑四个路由共用（属主与状态裁决在路由层）。
   */
  async getRfqStateById(rfqId: number): Promise<RfqStateRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, rfq_status, user_id FROM bid_notices
       WHERE id = ? AND notice_type = 'RFQ' LIMIT 1`,
      [rfqId],
    );
    return ((rows as RowDataPacket[])[0] as RfqStateRow | undefined) ?? null;
  }

  /** invite 前置查询：属主 + 状态 + visibility（仅 platform 来源，404/403/409 裁决在路由层） */
  async getRfqInviteStateById(rfqId: number): Promise<RfqInviteStateRow | null> {
    const [rows] = await this.pool.query(
      `SELECT user_id, rfq_status, visibility FROM bid_notices
        WHERE id = ? AND notice_type = 'RFQ' AND entry_source = 'platform' LIMIT 1`,
      [rfqId],
    );
    return ((rows as RowDataPacket[])[0] as RfqInviteStateRow | undefined) ?? null;
  }

  /**
   * PATCH 编辑：按 fields 键存在性拼动态 SET（片段顺序见 RfqPatchFields 注释），
   * 末尾追加 rfq_status 回退（statusTo，恒为 draft）。返回 affectedRows。
   */
  async updateRfqFields(input: UpdateRfqFieldsInput): Promise<number> {
    const updates: string[] = [];
    const updateParams: unknown[] = [];
    const f = input.fields;

    if (f.title !== undefined) {
      updates.push("title = ?");
      updateParams.push(f.title);
    }
    if (f.description !== undefined) {
      updates.push("description = ?");
      updateParams.push(f.description);
    }
    if (f.deadline !== undefined) {
      // deadline_sec 为生成列不可写；写基线 deadline_ts + 展示 deadline
      updates.push("deadline = ?", "deadline_ts = ?");
      updateParams.push(f.deadline.display, f.deadline.ts);
    }
    if (f.budget !== undefined) {
      updates.push("budget_confidential = ?", "estimated_value = ?");
      updateParams.push(f.budget.confidential ? 1 : 0, f.budget.estimatedValue);
    }
    if (f.currency !== undefined) {
      updates.push("currency = ?");
      updateParams.push(f.currency);
    }
    if (f.deliveryAddress !== undefined) {
      updates.push("delivery_address = ?");
      updateParams.push(f.deliveryAddress);
    }
    if (f.categoryCode !== undefined) {
      updates.push("category_code = ?");
      updateParams.push(f.categoryCode);
    }
    if (f.contactEmail !== undefined) {
      updates.push("contact_email = ?");
      updateParams.push(f.contactEmail);
    }
    if (f.contactPhone !== undefined) {
      updates.push("contact_phone = ?");
      updateParams.push(f.contactPhone);
    }
    if (f.contactName !== undefined) {
      updates.push("contact_name = ?");
      updateParams.push(f.contactName);
    }
    if (f.incoterm !== undefined) {
      updates.push("incoterm = ?");
      updateParams.push(f.incoterm);
    }
    if (f.deliveryTime !== undefined) {
      updates.push("delivery_time = ?");
      updateParams.push(f.deliveryTime);
    }
    if (f.paymentTerms !== undefined) {
      updates.push("payment_terms = ?");
      updateParams.push(f.paymentTerms);
    }
    if (f.supplierReqs !== undefined) {
      updates.push("supplier_reqs = ?");
      updateParams.push(f.supplierReqs);
    }
    if (f.visibility !== undefined) {
      updates.push("visibility = ?");
      updateParams.push(f.visibility);
    }

    // 编辑后状态回退为 draft（参数化：裸拼 draft 会被 MySQL 当作列名）
    updates.push("rfq_status = ?");
    updateParams.push(input.statusTo);

    const [result] = await this.pool.query(
      `UPDATE bid_notices SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
      [...updateParams, input.rfqId, input.userId],
    );
    return (result as ResultSetHeader).affectedRows;
  }

  /**
   * 状态机单列状态 UPDATE（SET rfq_status = ? WHERE id = ? AND user_id = ?）。
   * submit（draft/rejected→pending_review）/ withdraw（published/pending_review→closed）/
   * reopen（closed→draft）共用；目标状态由路由按状态机裁决后传入。返回 affectedRows。
   */
  async updateRfqStatus(input: { rfqId: number; userId: number; status: string }): Promise<number> {
    const [result] = await this.pool.query(
      `UPDATE bid_notices SET rfq_status = ? WHERE id = ? AND user_id = ?`,
      [input.status, input.rfqId, input.userId],
    );
    return (result as ResultSetHeader).affectedRows;
  }
}
