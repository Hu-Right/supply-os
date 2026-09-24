/**
 * 供应商目录数据访问层
 * Supplier Directory Repository
 *
 * @module server/repos/suppliers/supplier-directory.repo
 * @description 操作 supplier 外部表（只读）：目录列表、分页查询、联系方式。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { escapeLikeWildcard } from "../../utils/normalize";

/** 供应商目录行（supplier 表） */
export interface SupplierDirectoryRow {
  id: number;
  company: string | null;
  country: string | null;
  country_code: string | null;
  province: string | null;
  city: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  products: string | null;
  industry: string | null;
  certification: string | null;
  type: string | null;
  /** 认证状态：done=已认证 / pending=审核中（防重分支据此区分「转认领 / 直接绑定」） */
  verify_status?: string | null;
  /** 资料完整度（DB 生成列，20 字段非空各计 5 分，与后台同口径） */
  data_quality_score?: number | string | null;
}

/**
 * 诊断入口「是不是这家公司」弹窗的候选行。
 * 字段集是安全红线（规范 N9）：只允许识别性字段，**绝不能包含**
 * contact / phone / email / address / registered_* / license_url，否则一个尚未
 * 验证身份的地推现场用户就能把别人企业的联系方式看走。
 */
export interface CompanyCandidateRow extends RowDataPacket {
  id: number;
  company: string | null;
  english_name: string | null;
  type: string | null;
  business_type: string | null;
  province: string | null;
  city: string | null;
  established_at: string | null;
  legal_rep: string | null;
  credit_code: string | null;
  verify_status: string | null;
  claim_status: string | null;
}

/** 统一社会信用代码绕码：前 4 + **** + 后 4；短于 8 位只输出全绕码，不回原文 */
export function maskCreditCode(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (v.length <= 8) return "****";
  return `${v.slice(0, 4)}****${v.slice(-4)}`;
}

export class SupplierDirectoryRepo {
  constructor(private pool: Pool) {}

  /** 供应商目录（排除测试数据与已合并记录，仅展示审批通过，最新 500 家） */
  async listDirectory(): Promise<SupplierDirectoryRow[]> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code,
              province, city,
              contact, phone, email, products, industry, certification, type,
              data_quality_score
       FROM supplier
       WHERE company <> '测试' AND merged_id IS NULL
         AND (verify_status = 'done' OR verify_status IS NULL)
       ORDER BY id DESC
       LIMIT 500`,
    );
    return rows as SupplierDirectoryRow[];
  }

  /** 供应商目录分页查询（支持搜索、类型、行业筛选） */
  async listDirectoryPaginated(params: {
    limit: number;
    offset: number;
    search?: string;
    type?: string;
    industry?: string;
  }): Promise<{ items: SupplierDirectoryRow[]; total: number }> {
    const { limit, offset, search, type, industry } = params;

    // ── WHERE 条件构建 ──
    const conditions: string[] = [
      "company <> '测试'",
      "merged_id IS NULL",
      "(verify_status = 'done' OR verify_status IS NULL)",
    ];
    const values: string[] = [];

    if (search) {
      conditions.push("company LIKE ?");
      // L-BIZ-1 修复：转义用户输入中的 LIKE 通配符
      values.push(`%${escapeLikeWildcard(search)}%`);
    }

    if (type && (type === "domestic" || type === "international")) {
      // supplier 的 type 列存经营类型（如 foreign），无 domestic/international 值，
      // 按国家语义区分：CN 或空（展示层兜底"中国"）= 国内，其余 = 国际
      if (type === "domestic") {
        conditions.push("(country_code = 'CN' OR country_code IS NULL OR country_code = '')");
      } else {
        conditions.push("(country_code IS NOT NULL AND country_code <> '' AND country_code <> 'CN')");
      }
    }

    if (industry) {
      conditions.push("industry = ?");
      values.push(industry);
    }

    const whereSql = conditions.join(" AND ");

    // 总数查询
    const [countRows] = await this.pool.query(
      `SELECT COUNT(*) as total FROM supplier WHERE ${whereSql}`,
      values,
    );
    const total = (countRows as RowDataPacket[])[0]?.total ?? 0;

    // 分页数据查询
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city, contact, phone, email, products, industry, certification, type,
              data_quality_score
       FROM supplier
       WHERE ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );

    return { items: rows as SupplierDirectoryRow[], total };
  }

  /** 按 ID 查询单条供应商（仅审批通过或历史无审核状态的数据） */
  async findById(id: number): Promise<SupplierDirectoryRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city,
              contact, phone, email, products, industry, certification, type,
              data_quality_score
       FROM supplier
       WHERE id = ? AND (verify_status = 'done' OR verify_status IS NULL)
       LIMIT 1`,
      [id],
    );
    return ((rows as SupplierDirectoryRow[])[0]) ?? null;
  }

  /** 按 ID 查询单条供应商全字段（企业信息表格用，含工商/联系/地址等列） */
  async findFullById(id: number): Promise<Record<string, unknown> | null> {
    const [rows] = await this.pool.query(
      "SELECT * FROM supplier WHERE id = ? LIMIT 1",
      [id],
    );
    return ((rows as Record<string, unknown>[])[0]) ?? null;
  }

  /** 企业信息可编辑列白名单（与 supplier 最终表结构一致） */
  static readonly EDITABLE_COLUMNS = [
    "company", "english_name", "name_confirmed", "country", "country_code", "province", "city",
    "address", "registered_address", "contact", "position", "phone", "email",
    "registered_phone", "registered_email", "website", "legal_rep",
    "established_at", "registered_capital", "credit_code", "industry",
    "type", "business_type", "certification", "products", "intro", "remark",
  ] as const;

  /** 过滤输入到白名单列（忽略未知键、统一转字符串/null） */
  private pickEditable(input: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const col of SupplierDirectoryRepo.EDITABLE_COLUMNS) {
      if (!(col in input)) continue;
      const v = input[col];
      out[col] = v === undefined || v === null || v === "" ? null : String(v);
    }
    return out;
  }

  /** 新建企业行（企业信息填写），返回自增 id；addtime 记当前 epoch 秒。
   *  meta 可携带非用户编辑列（verify_status / source_channel）供注册审核流程使用。 */
  async insertEnterprise(
    input: Record<string, unknown>,
    meta: { verify_status?: string; source_channel?: string } = {},
  ): Promise<number> {
    const data = this.pickEditable(input);
    const cols = Object.keys(data);
    const extraCols: string[] = [];
    const extraVals: unknown[] = [];
    if (meta.verify_status) { extraCols.push("verify_status"); extraVals.push(meta.verify_status); }
    if (meta.source_channel) { extraCols.push("source_channel"); extraVals.push(meta.source_channel); }
    const allCols = [...cols, ...extraCols];
    if (allCols.length === 0) return 0;
    const placeholders = allCols.map(() => "?").join(", ");
    const nowSec = Math.floor(Date.now() / 1000);
    const [result] = await this.pool.query(
      `INSERT INTO supplier (${allCols.join(", ")}, addtime) VALUES (${placeholders}, ?)`,
      [...cols.map((c) => data[c]), ...extraVals, nowSec],
    );
    return Number((result as RowDataPacket).insertId);
  }

  /** 按统一社会信用代码查企业（注册防重优先键）；verify_status 供防重分支区分「已认证→转认领 / 未认证→直接绑定」 */
  async findByCreditCode(creditCode: string): Promise<SupplierDirectoryRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city,
              contact, phone, email, products, industry, certification, type, verify_status
       FROM supplier WHERE credit_code = ? AND merged_id IS NULL LIMIT 1`,
      [creditCode],
    );
    return ((rows as SupplierDirectoryRow[])[0]) ?? null;
  }

  /** 更新企业行可编辑列（企业信息编辑） */
  async updateEnterprise(id: number, input: Record<string, unknown>): Promise<void> {
    const data = this.pickEditable(input);
    const cols = Object.keys(data);
    if (cols.length === 0) return;
    const sets = cols.map((c) => `${c} = ?`).join(", ");
    // ★ 用户编辑后一律重置为审核中，需管理员重新确认
    await this.pool.query(
      `UPDATE supplier SET ${sets}, verify_status = 'pending' WHERE id = ?`,
      [...cols.map((c) => data[c]), id],
    );
  }

  /**
   * 按公司名查找数据最完整的记录（防重兜底）
   *
   * 当 supplier 表存在同一公司的多条记录时（外部同步可能产生空字段重复记录），
   * 优先返回关键字段（products/industry/phone/certification）填充最多的那条。
   * 排除已合并记录（merged_id IS NOT NULL）。
   */
  async findByCompanyBest(companyName: string): Promise<SupplierDirectoryRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city,
              contact, phone, email, products, industry, certification, type, verify_status
       FROM supplier
       WHERE company = ? AND merged_id IS NULL
       ORDER BY (
         CASE WHEN products IS NOT NULL AND products <> '' THEN 1 ELSE 0 END +
         CASE WHEN industry IS NOT NULL AND industry <> '' THEN 1 ELSE 0 END +
         CASE WHEN phone IS NOT NULL AND phone <> '' THEN 1 ELSE 0 END +
         CASE WHEN certification IS NOT NULL AND certification <> '' THEN 1 ELSE 0 END
       ) DESC, id DESC
       LIMIT 1`,
      [companyName],
    );
    return ((rows as SupplierDirectoryRow[])[0]) ?? null;
  }

  /**
   * 诊断入口「是不是贵公司」候选（需要比认领自动补全更多的识别字段）。
   *
   * 为何不复用 `findVerifiedByNameSimilar`：它只回 id/company/country/industry 且严格限定
   * `verify_status='done'`，无法区分「XX 科技有限公司」与其分公司/同名主体（要靠省市、
   * 法人、信用代码掩码辨认），也会漏掉存量无审核状态的可认领行。
   * 口径：排除已合并行、前缀命中优先、按信用代码与资料完整度次优，避免把拼凑行推给用户。
   */
  async findDiagnosisCandidatesByName(keyword: string, limit = 5): Promise<CompanyCandidateRow[]> {
    const kw = String(keyword ?? "").trim();
    if (!kw) return [];
    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 10);
    // 与 findVerifiedByNameSimilar 同口径转义 LIKE 通配符，否则用户输入 % 会退化为全表匹配
    const escaped = kw.replace(/[\\%_]/g, (c) => `\\${c}`);
    const [rows] = await this.pool.query<CompanyCandidateRow[]>(
      `SELECT id, company, english_name, type, business_type, province, city,
              established_at, legal_rep, credit_code, verify_status, claim_status
         FROM supplier
        WHERE company LIKE ?
          AND merged_id IS NULL
          AND (verify_status = 'done' OR verify_status IS NULL)
        ORDER BY (credit_code IS NOT NULL AND credit_code <> '') DESC,
                 data_quality_score DESC, id DESC
        LIMIT ?`,
      [`${escaped}%`, safeLimit],
    );
    return rows as CompanyCandidateRow[];
  }

  /**
   * 取诊断评分 D1 所需的主数据片段。
   * `data_quality_score` 是生成列（20 字段非空各计 5 分），`info_checked` 是人工核对标记；
   * 本方法不走 verify_status 过滤，因为刚建档的行依然是 D1 的正当评价对象。
   */
  async findProfileBits(supplierId: number): Promise<{ dataQualityScore: number | null; infoChecked: boolean } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT data_quality_score, info_checked FROM supplier WHERE id = ? LIMIT 1`,
      [supplierId],
    );
    const row = rows[0];
    if (!row) return null;
    const q = row.data_quality_score;
    return {
      dataQualityScore: q === null || q === undefined ? null : Number(q),
      infoChecked: Number(row.info_checked ?? 0) === 1,
    };
  }

  /**
   * 企业名模糊建议（认领引导用）：仅已认证、未合并行，前缀命中优先、资料完整度次之。
   * 只回目录公开字段（无联系人/电话/邮箱），供登录态 autocomplete，不可当目录检索用。
   */
  async findVerifiedByNameSimilar(
    name: string,
    limit = 5,
  ): Promise<Array<Pick<SupplierDirectoryRow, "id" | "company" | "country" | "industry">>> {
    const escaped = name.replace(/[\\%_]/g, (c) => `\\${c}`);
    const [rows] = await this.pool.query(
      `SELECT id, company, country, industry
       FROM supplier
       WHERE verify_status = 'done' AND merged_id IS NULL
         AND (company LIKE ? OR company LIKE ?)
       ORDER BY (company LIKE ?) DESC,
                (
         CASE WHEN products IS NOT NULL AND products <> '' THEN 1 ELSE 0 END +
         CASE WHEN industry IS NOT NULL AND industry <> '' THEN 1 ELSE 0 END
       ) DESC, id DESC
       LIMIT ?`,
      [`${escaped}%`, `%${escaped}%`, `${escaped}%`, limit],
    );
    return rows as Array<Pick<SupplierDirectoryRow, "id" | "company" | "country" | "industry">>;
  }

  /** 供应商明文联系方式（VIP 端点） */
  async findContact(supplierId: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT contact, phone, email FROM supplier WHERE id = ? LIMIT 1",
      [supplierId],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /** 供应商统计（用于统计墙） */
  async getStats(): Promise<{
    searchable: number;
    verified: number;
    withCertification: number;
    international: number;
    unspscMatched: number;
  }> {
    const [allRows] = await this.pool.query(
      "SELECT COUNT(*) as total FROM supplier",
    );
    const [verifiedRows] = await this.pool.query(
      "SELECT COUNT(*) as total FROM supplier WHERE company <> '测试' AND merged_id IS NULL AND (verify_status = 'done' OR verify_status IS NULL)",
    );
    const [certRows] = await this.pool.query(
      "SELECT COUNT(*) as total FROM supplier WHERE certification IS NOT NULL AND certification <> '' AND company <> '测试' AND merged_id IS NULL AND (verify_status = 'done' OR verify_status IS NULL)",
    );
    const [intlRows] = await this.pool.query(
      "SELECT COUNT(*) as total FROM supplier WHERE country_code IS NOT NULL AND country_code <> '' AND country_code <> 'CN' AND company <> '测试' AND merged_id IS NULL AND (verify_status = 'done' OR verify_status IS NULL)",
    );
    // 已认证 且 匹配了 UNSPSC 的供应商数（JOIN 桥接表 crm_supplier_unspsc_interests）
    const [unspscRows] = await this.pool.query(
      `SELECT COUNT(DISTINCT u.supplier_id) as total
       FROM crm_supplier_unspsc_interests u
       JOIN supplier s ON s.id = u.supplier_id
       WHERE s.verify_status = 'done' AND s.company <> '测试' AND s.merged_id IS NULL`,
    );
    return {
      searchable: (allRows as RowDataPacket[])[0]?.total ?? 0,
      verified: (verifiedRows as RowDataPacket[])[0]?.total ?? 0,
      withCertification: (certRows as RowDataPacket[])[0]?.total ?? 0,
      international: (intlRows as RowDataPacket[])[0]?.total ?? 0,
      unspscMatched: (unspscRows as RowDataPacket[])[0]?.total ?? 0,
    };
  }

  /** 已通过后台审核的供应商总数（registered 统计口径：verify_status='done'，排除测试与已合并记录） */
  async countApproved(): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT COUNT(*) as total FROM supplier WHERE verify_status = 'done' AND company <> '测试' AND merged_id IS NULL",
    );
    return Number((rows as RowDataPacket[])[0]?.total ?? 0);
  }

  /** 按 id 查供应商行业（auth 响应组装用，不受审核状态过滤；supplier 无 industry_id 列） */
  async findAuthInfoById(id: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, industry FROM supplier WHERE id = ? LIMIT 1",
      [id],
    );
    return (rows as RowDataPacket[])[0] ?? null;
  }

  /**
   * 检查供应商是否已被认领（永久绑定或临时绑定中）
   * @returns true 表示已被认领，不可再次认领
   */
  async isClaimed(supplierId: number): Promise<boolean> {
    const [userRows] = await this.pool.query(
      `SELECT COUNT(*) AS cnt FROM crm_users WHERE supplier_id = ?`,
      [supplierId],
    );
    const userBound = Number((userRows as RowDataPacket[])[0]?.cnt || 0) > 0;

    const [supRows] = await this.pool.query(
      `SELECT claim_status FROM supplier WHERE id = ?`,
      [supplierId],
    );
    const claimPending = String((supRows as RowDataPacket[])[0]?.claim_status || "") === "pending";

    return userBound || claimPending;
  }

  /**
   * 按 ID 查询供应商，若记录关键字段为空则自动回退到同公司更完整记录
   * （应对外部同步产生空字段重复记录）
   */
  async findByIdWithFallback(supplierId: number): Promise<SupplierDirectoryRow | null> {
    let row = await this.findById(supplierId);
    if (row) {
      const products = String(row.products ?? "").trim();
      const industry = String(row.industry ?? "").trim();
      if (products === "" && industry === "") {
        const companyName = String(row.company ?? "").trim();
        if (companyName) {
          const betterRow = await this.findByCompanyBest(companyName);
          if (betterRow && betterRow.id !== row.id) {
            row = await this.findById(Number(betterRow.id));
          }
        }
      }
    }
    return row;
  }

  /**
   * 更新供应商的营业执照 URL（传 null 表示移除），返回旧的 license_url（用于清理旧文件）
   */
  async updateLicenseUrl(supplierId: number, licenseUrl: string | null): Promise<string | null> {
    const [rows] = await this.pool.query(
      `SELECT license_url FROM supplier WHERE id = ?`,
      [supplierId],
    );
    const oldUrl = (rows as RowDataPacket[])[0]?.license_url || null;

    await this.pool.execute(
      `UPDATE supplier SET license_url = ? WHERE id = ?`,
      [licenseUrl, supplierId],
    );
    return oldUrl;
  }
}
