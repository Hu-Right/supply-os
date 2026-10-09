/**
 * 供应商目录数据访问层
 * Supplier Directory Repository
 *
 * @module server/repos/suppliers/supplier-directory.repo
 * @description 操作 supplier 外部表（只读）：目录列表、分页查询、联系方式。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { escapeLikeWildcard } from "../../utils/normalize";
import { industrySubtreeLike, isIndustryCode, sanitizeIndustryCode } from "../../services/industry-code";

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
  /** 主行业码（crm_industry_nodes.code，UGT-I- 前缀）；行业面标准口径，与 industry 自由文本共存 */
  industry_code?: string | null;
  certification: string | null;
  type: string | null;
  /** 业务身份枚举：manufacturer=工厂 / trader=贸易商（卡片徽章与「工厂/贸易商」维度同源；其余值不展示） */
  business_type_code?: string | null;
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
  type: string | null;
  business_type: string | null;
  province: string | null;
  city: string | null;
  established_at: string | null;
  legal_rep: string | null;
  credit_code: string | null;
  verify_status: string | null;
  claim_status: string | null;
  /** 是否已被**其他**用户/账户绑定（crm_users.supplier_id 命中且非当前用户）；0/1 */
  bound: number;
}

/** 认领归属细查结果（getClaimOwnership 的返回结构） */
export interface ClaimOwnership {
  /** 当前用户自己已绑定该主体（即归属人） */
  selfBound: boolean;
  /** 其他账户已绑定该主体（已归属，无法再认领） */
  boundByOther: boolean;
  /** 该主体处于认领处理中（claim_status='pending'，排他期内） */
  claimPending: boolean;
}

/** 账号绑定主体行（findBoundSubjectByUserId 的返回结构；排他判定与服务端文案共用） */
export interface BoundSubjectRow extends RowDataPacket {
  id: number;
  company: string | null;
  name_confirmed: string | null;
  verify_status: string | null;
  claim_status: string | null;
}

/** 页签检索字段白名单：q 关键词按页签路由到对应列；白名单外的值一律回落公司名 */
const SEARCH_FIELDS = new Set([
  "product",
  "company",
  "country",
  "industry",
  "certification",
  "factory",
  "unspsc",
]);

/** 统一社会信用代码绕码：前 4 + **** + 后 4；短于 8 位只输出全绕码，不回原文 */
export function maskCreditCode(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (v.length <= 8) return "****";
  return `${v.slice(0, 4)}****${v.slice(-4)}`;
}

/**
 * 一组行业码 → 「命中这些节点子树内任一挂靠」的相关子查询（前缀即子树，见不变量 I4）。
 * ★ 入参必须已经过 isIndustryCode / sanitizeIndustryCode：本函数不复核，直接拼占位符。
 */
function subtreeExists(codes: readonly string[]): { sql: string; values: string[] } {
  return {
    sql: `EXISTS (SELECT 1 FROM crm_supplier_industry_rel ir
                   WHERE ir.supplier_id = s.id AND (${codes.map(() => "ir.industry_code LIKE ?").join(" OR ")}))`,
    // 码已过 isIndustryCode 白名单（字集只含 UGT-I- 与数字），不命 LIKE 元字符；
    // 也不能先转义再补通配符——那会把刚补上的 % 一起转掉，条件退化成匹配字面量。
    values: codes.map((c) => industrySubtreeLike(c)),
  };
}

export class SupplierDirectoryRepo {
  constructor(private pool: Pool) {}

  /** 供应商目录（排除测试数据，仅展示审批通过，最新 500 家） */
  async listDirectory(): Promise<SupplierDirectoryRow[]> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code,
              province, city,
              contact, phone, email, products, industry, industry_code, certification, type,
              business_type_code,
              data_quality_score
       FROM supplier
       WHERE company <> '测试'
         AND verify_status = 'done'
       ORDER BY id DESC
       LIMIT 500`,
    );
    return rows as SupplierDirectoryRow[];
  }

  /** 供应商目录分页查询（支持搜索、类型、行业筛选；关键词按页签字段路由） */
  async listDirectoryPaginated(params: {
    limit: number;
    offset: number;
    search?: string;
    /** 页签检索字段：product/company/country/industry/certification/factory/unspsc（缺省=公司名） */
    field?: string;
    type?: string;
    /** 行业面标准口径筛选：任一层级节点码，命中该节点**子树**内的挂靠 */
    industryCode?: string;
    /**
     * 「行业」页签的关键词命中结果：由调用方先把关键词解析成行业节点集
     * （lib/services/industry-facets.resolveIndustryKeywordCodes），本层只按子树筛。
     * 与 industryCode 的区别：传了它就代表用户主动按行业搜，解析空集 = 无结果（1 = 0），
     * 不得退回 supplier.industry 自由文本 LIKE——那是脏数据的主入口。
     */
    industryCodes?: readonly string[];
  }): Promise<{ items: SupplierDirectoryRow[]; total: number }> {
    const { limit, offset, search, field, type, industryCode, industryCodes } = params;

    // ── WHERE 条件构建 ──
    // 已认证口径只认 verify_status='done'：旧逻辑额外把 NULL 视同已认证（为外部同步的空值
    // 行预留），2026-10-08 实库取证 NULL 行数=0，该兼容分支已无命中，按不保留兼容直接删除。
    const conditions: string[] = [
      "company <> '测试'",
      "verify_status = 'done'",
    ];
    const values: string[] = [];

    if (search) {
      // 关键词按页签字段路由（SEARCH_FIELDS 白名单外的值一律回落公司名，与旧行为一致）
      const f = field && SEARCH_FIELDS.has(field) ? field : "company";
      if (f === "product") {
        // 产品走 FULLTEXT ngram（与后台多维检索同一索引）
        conditions.push("MATCH(s.products, s.product_keywords) AGAINST(? IN BOOLEAN MODE)");
        values.push(search);
      } else if (f === "country") {
        conditions.push("(country LIKE ? OR country_code LIKE ?)");
        values.push(`%${escapeLikeWildcard(search)}%`, `${escapeLikeWildcard(search)}%`);
      } else if (f === "certification") {
        conditions.push("certification LIKE ?");
        values.push(`%${escapeLikeWildcard(search)}%`);
      } else if (f === "factory") {
        // 业务身份：采集原文在 business_type，结构化枚举在 business_type_code，两列同搜
        conditions.push("(business_type LIKE ? OR business_type_code = ?)");
        values.push(`%${escapeLikeWildcard(search)}%`, search.trim().toLowerCase());
      } else if (f === "unspsc") {
        // UNSPSC 编码前缀命中画像表（与后台维度检索同表）
        conditions.push(
          "EXISTS (SELECT 1 FROM crm_supplier_unspsc_interests i WHERE i.supplier_id = s.id AND i.supplier_table = 'supplier' AND i.code LIKE ?)",
        );
        values.push(`${escapeLikeWildcard(search)}%`);
      } else if (f === "industry") {
        // 行业页签 = 行业面口径：关键词已在树上解析成节点集，这里只按子树筛。
        // 空集一律「无结果」而不是「退回文本」：树里没这个词，就是没这个词的行业。
        const codes = (industryCodes ?? []).filter(isIndustryCode);
        if (codes.length === 0) {
          conditions.push("1 = 0");
        } else {
          const sub = subtreeExists(codes);
          conditions.push(sub.sql);
          values.push(...sub.values);
        }
      } else {
        conditions.push("company LIKE ?");
        // L-BIZ-1 修复：转义用户输入中的 LIKE 通配符
        values.push(`%${escapeLikeWildcard(search)}%`);
      }
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

    if (industryCode) {
      // 行业面口径：码形先验（非法码直接丢弃筛选条件，不拼进 SQL），
      // 子树 = 码前缀（不变量 I4「父码 = 自身码去掉末两位」由 check:taxonomy 钉住），
      // 因此选中「大类」能连带其下全部中类/小类的挂靠，且走 idx_code 前缀范围扫描。
      const code = sanitizeIndustryCode(industryCode);
      if (code) {
        const sub = subtreeExists([code]);
        conditions.push(sub.sql);
        values.push(...sub.values);
      }
    }

    const whereSql = conditions.join(" AND ");

    // ★ 两处 FROM 必须带别名 s：多个检索分支的条件引用了 s.products / s.id（FULLTEXT 与
    //   EXISTS 相关子查询），无别名时 MySQL 直接报 ER_BAD_FIELD_ERROR，而路由的 try/catch
    //   会把它吐成空列表——产品/UNSPSC 两个页签曾因此长期「搜什么都无结果」而不报错。
    // 总数查询
    const [countRows] = await this.pool.query(
      `SELECT COUNT(*) as total FROM supplier s WHERE ${whereSql}`,
      values,
    );
    const total = (countRows as RowDataPacket[])[0]?.total ?? 0;

    // 分页数据查询
    const [rows] = await this.pool.query(
      `SELECT s.id, s.company, s.country, s.country_code, s.province, s.city, s.contact, s.phone, s.email, s.products, s.industry, s.industry_code, s.certification, s.type,
              s.business_type_code,
              s.data_quality_score
       FROM supplier s
       WHERE ${whereSql}
       ORDER BY s.id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );

    return { items: rows as SupplierDirectoryRow[], total };
  }

  /** 按 ID 查询单条供应商（仅审批通过或历史无审核状态的数据） */
  async findById(id: number): Promise<SupplierDirectoryRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city,
              contact, phone, email, products, industry, industry_code, certification, type,
              business_type_code,
              data_quality_score
       FROM supplier
       WHERE id = ? AND verify_status = 'done'
       LIMIT 1`,
      [id],
    );
    return ((rows as SupplierDirectoryRow[])[0]) ?? null;
  }

  /**
   * 按 ID 查询单条供应商的「门户列白名单」（企业信息表格 / 编辑回填用）。
   *
   * ★ 历史上这里是 `SELECT *`——本表 54 列由 supply-os 与 intelligence-daily 两仓库共享，
   *   整行透传会把「库里现在有什么」直接变成「前端拿到什么」：站外一旦加列/改名/改类型，
   *   故障会以「页面字段突然变 undefined」的形式在用户面前暴露，而不是在变更当场被发现；
   *   反过来我们想退役一列时，也无法判断前端有没有在读。钉成显式白名单后，边界可审计。
   *   新增消费字段必须同时登记到 PORTAL_COLUMNS（否则接口不会返回该键）。
   */
  async findFullById(id: number): Promise<Record<string, unknown> | null> {
    const cols = SupplierDirectoryRepo.PORTAL_COLUMNS.map((c) => `\`${c}\``).join(", ");
    const [rows] = await this.pool.query(
      `SELECT ${cols} FROM supplier WHERE id = ? LIMIT 1`,
      [id],
    );
    return ((rows as Record<string, unknown>[])[0]) ?? null;
  }

  /** 企业信息可编辑列白名单（与 supplier 最终表结构一致） */
  static readonly EDITABLE_COLUMNS = [
    "company", "name_confirmed", "country", "country_code", "province", "city",
    "address", "registered_address", "contact", "position", "phone", "email",
    "registered_phone", "registered_email", "website", "legal_rep",
    "established_at", "registered_capital", "credit_code", "industry",
    "type", "business_type", "certification", "products", "intro", "remark",
  ] as const;

  /**
   * 门户读列白名单 = EDITABLE_COLUMNS（表单可编辑列，编辑回填必需）
   *                 + 8 个门户另外要用的状态/展示列。
   *
   * 追加理由逐个可查：
   *   id / verify_status / claim_status / coop_status / check_note / data_quality_score / addtime
   *     —— EnterpriseInfoCard 的状态徽章、完整度与录入时间、以及以外的展示字段；
   *   license_url —— 企业详情展示执照 + 保存时协调旧文件；
   * 2026-09 影子表重建时本表删 6 列（merged_id / english_name / webcheck_status /
   *   webcheck_at / last_match_at / unspsc_matched_at），重复档案物理清除，
   *   历史上的 `merged_id IS NULL` 假门禁随之全部摘除；english_name 全库恒空已退役。
   *   完整台账见 docs/数据库设计/supplier-供应商目录主表.md。
   */
  static readonly PORTAL_COLUMNS = [
    ...SupplierDirectoryRepo.EDITABLE_COLUMNS,
    "id", "verify_status", "claim_status", "coop_status", "check_note",
    "data_quality_score", "addtime", "license_url",
  ] as const;

  /** 过滤输入到白名单列（忽略未知键；未提供/显式 null→null，空串保留 ''）。
   *  ★ 空串不得塌成 null：supplier.email / website 是 NOT NULL DEFAULT ''，而表单里是选填；
   *    STRICT_TRANS_TABLES 下向 NOT NULL 列绑定 NULL 会直接 1048（企业信息新建/编辑失败）。
   *    data_quality_score 用 `TRIM(col) <> ''` 判定完整性，'' 与 null 同样计为空，保留 '' 不影响评分。 */
  private pickEditable(input: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const col of SupplierDirectoryRepo.EDITABLE_COLUMNS) {
      if (!(col in input)) continue;
      const v = input[col];
      out[col] = v === undefined || v === null ? null : String(v);
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
       FROM supplier WHERE credit_code = ? LIMIT 1`,
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
   */
  async findByCompanyBest(companyName: string): Promise<SupplierDirectoryRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city,
              contact, phone, email, products, industry, certification, type, verify_status
       FROM supplier
       WHERE company = ?
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
   * 口径：前缀命中优先、按信用代码与资料完整度次优，避免把拼凑行推给用户。
   * 不按 verify_status 过滤：库里绝大多数行是爬虫同步的 pending（done 仅个位数），一旦过滤，
   * 整库在诊断入口不可见；pending 行同样是 D1 的正当评价对象（与 findProfileBits /
   * findByCompanyBest 同口径），脱敏由 /api/suppliers/similar 的字段白名单 + 掩码保证。
   * `bound`：附带「是否已被其他用户/账户绑定」标记（crm_users.supplier_id 命中且非 excludeUserId），
   * 供「检测并确认主体」弹窗提示「该公司已被绑定」，避免用户对已归属企业重复认领。
   */
  async findDiagnosisCandidatesByName(
    keyword: string,
    limit = 5,
    excludeUserId = 0,
  ): Promise<CompanyCandidateRow[]> {
    const kw = String(keyword ?? "").trim();
    if (!kw) return [];
    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 10);
    // excludeUserId 归一为非负整数：0 表示不排除任何用户（任意绑定都计为 bound）
    const uid = Number.isFinite(excludeUserId) && excludeUserId > 0 ? Math.trunc(excludeUserId) : 0;
    // 与 findVerifiedByNameSimilar 同口径转义 LIKE 通配符，否则用户输入 % 会退化为全表匹配
    const escaped = kw.replace(/[\\%_]/g, (c) => `\\${c}`);
    const [rows] = await this.pool.query<CompanyCandidateRow[]>(
      `SELECT id, company, type, business_type, province, city,
              established_at, legal_rep, credit_code, verify_status, claim_status,
              EXISTS(
                SELECT 1 FROM crm_users cu
                 WHERE cu.supplier_id = supplier.id
                   AND cu.id <> ?
              ) AS bound
         FROM supplier
        WHERE company LIKE ?
        ORDER BY (credit_code IS NOT NULL AND credit_code <> '') DESC,
                 data_quality_score DESC, id DESC
        LIMIT ?`,
      // 占位符按出现顺序：EXISTS 内的 excludeUserId 先于 LIKE，再于 LIMIT
      [uid, `${escaped}%`, safeLimit],
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
   * 企业名模糊建议（认领引导用）：仅已认证行，前缀命中优先、资料完整度次之。
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
       WHERE verify_status = 'done'
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
      "SELECT COUNT(*) as total FROM supplier WHERE company <> '测试' AND verify_status = 'done'",
    );
    const [certRows] = await this.pool.query(
      "SELECT COUNT(*) as total FROM supplier WHERE certification IS NOT NULL AND certification <> '' AND company <> '测试' AND verify_status = 'done'",
    );
    const [intlRows] = await this.pool.query(
      "SELECT COUNT(*) as total FROM supplier WHERE country_code IS NOT NULL AND country_code <> '' AND country_code <> 'CN' AND company <> '测试' AND verify_status = 'done'",
    );
    // 已认证 且 匹配了 UNSPSC 的供应商数（JOIN 桥接表 crm_supplier_unspsc_interests）
    const [unspscRows] = await this.pool.query(
      `SELECT COUNT(DISTINCT u.supplier_id) as total
       FROM crm_supplier_unspsc_interests u
       JOIN supplier s ON s.id = u.supplier_id
       WHERE s.verify_status = 'done' AND s.company <> '测试'`,
    );
    return {
      searchable: (allRows as RowDataPacket[])[0]?.total ?? 0,
      verified: (verifiedRows as RowDataPacket[])[0]?.total ?? 0,
      withCertification: (certRows as RowDataPacket[])[0]?.total ?? 0,
      international: (intlRows as RowDataPacket[])[0]?.total ?? 0,
      unspscMatched: (unspscRows as RowDataPacket[])[0]?.total ?? 0,
    };
  }

  /** 已通过后台审核的供应商总数（registered 统计口径：verify_status='done'，排除测试记录） */
  async countApproved(): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT COUNT(*) as total FROM supplier WHERE verify_status = 'done' AND company <> '测试'",
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
   * 认领归属细查：区分「自己已绑定 / 他人已绑定 / 认领处理中」三种状态，
   * 供重复认领的精确拒绝文案（旧口径只有一个布尔，文案只能笼统说"正在被认领中"）。
   * userId 传 0 表示不区分自己/他人（mine 恒为 0，任意绑定都计入 boundByOther）。
   */
  async getClaimOwnership(supplierId: number, userId: number): Promise<ClaimOwnership> {
    const [boundRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT SUM(id <> ?) AS others, SUM(id = ?) AS mine
         FROM crm_users WHERE supplier_id = ?`,
      [userId, userId, supplierId],
    );
    const bound = boundRows[0] as { others: number | null; mine: number | null } | undefined;

    const [supRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT claim_status FROM supplier WHERE id = ?`,
      [supplierId],
    );

    return {
      selfBound: Number(bound?.mine ?? 0) > 0,
      boundByOther: Number(bound?.others ?? 0) > 0,
      claimPending: String((supRows as RowDataPacket[])[0]?.claim_status || "") === "pending",
    };
  }

  /**
   * 账号当前绑定的企业主体（「一账号一主体」的账号侧读取口），无绑定返回 null。
   *
   * 与 getClaimOwnership 的分工：那边回答「**这家主体**归谁」，这边回答
   * 「**这个账号**已经绑了谁」。认领排他此前只有前者，于是已绑 A 的账号认领无人
   * 认领的 B 会一路放行，createClaimWithBinding 再把 crm_users.supplier_id 覆盖成 B
   * ——审核中的 A 被抛下、已认证的 A 被顶掉，且没有任何入口能换回来。
   * 只取排他判定所需的识别列，不复用 findFullById（整行含联系方式与执照 URL）。
   */
  async findBoundSubjectByUserId(userId: number): Promise<BoundSubjectRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.id, s.company, s.name_confirmed, s.verify_status, s.claim_status
         FROM crm_users u
         JOIN supplier s ON s.id = u.supplier_id
        WHERE u.id = ? AND u.supplier_id IS NOT NULL AND u.supplier_id > 0
        LIMIT 1`,
      [userId],
    );
    const row = (rows as RowDataPacket[])[0];
    return row ? ({ ...row, id: Number(row.id) } as BoundSubjectRow) : null;
  }

  /**
   * 检查供应商是否已被认领（任一账户绑定或认领处理中）
   * @returns true 表示已被认领，不可再次认领
   */
  async isClaimed(supplierId: number): Promise<boolean> {
    const ownership = await this.getClaimOwnership(supplierId, 0);
    return ownership.selfBound || ownership.boundByOther || ownership.claimPending;
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
