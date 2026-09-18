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
}

export class SupplierDirectoryRepo {
  constructor(private pool: Pool) {}

  /** 供应商目录（排除测试数据与已合并记录，仅展示审批通过，最新 500 家） */
  async listDirectory(): Promise<SupplierDirectoryRow[]> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code,
              province, city,
              contact, phone, email, products, industry, certification, type
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
    const values: any[] = [];

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
    const total = (countRows as any[])[0]?.total ?? 0;

    // 分页数据查询
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city, contact, phone, email, products, industry, certification, type
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
              contact, phone, email, products, industry, certification, type
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

  /** 按统一社会信用代码查企业（注册防重优先键） */
  async findByCreditCode(creditCode: string): Promise<SupplierDirectoryRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city,
              contact, phone, email, products, industry, certification, type
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
      `UPDATE supplier SET ${sets}, verify_status = 'processing' WHERE id = ?`,
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
              contact, phone, email, products, industry, certification, type
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
    return {
      searchable: (allRows as any[])[0]?.total ?? 0,
      verified: (verifiedRows as any[])[0]?.total ?? 0,
      withCertification: (certRows as any[])[0]?.total ?? 0,
      international: (intlRows as any[])[0]?.total ?? 0,
    };
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
    const userBound = Number((userRows as any[])[0]?.cnt || 0) > 0;

    const [supRows] = await this.pool.query(
      `SELECT claim_status FROM supplier WHERE id = ?`,
      [supplierId],
    );
    const claimPending = String((supRows as any[])[0]?.claim_status || "") === "pending";

    return userBound || claimPending;
  }

  /**
   * 更新供应商的营业执照 URL，返回旧的 license_url（用于清理旧文件）
   */
  async updateLicenseUrl(supplierId: number, licenseUrl: string): Promise<string | null> {
    const [rows] = await this.pool.query(
      `SELECT license_url FROM supplier WHERE id = ?`,
      [supplierId],
    );
    const oldUrl = (rows as any[])[0]?.license_url || null;

    await this.pool.execute(
      `UPDATE supplier SET license_url = ? WHERE id = ?`,
      [licenseUrl, supplierId],
    );
    return oldUrl;
  }
}
