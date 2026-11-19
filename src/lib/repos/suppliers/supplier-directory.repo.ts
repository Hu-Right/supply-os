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
import { attachCertificationText } from "../certification-text";

/** 供应商目录行（supplier 表） */
export interface SupplierDirectoryRow {
  id: number;
  company: string | null;
  country: string | null;
  country_code: string | null;
  province: string | null;
  city: string | null;
  contact: string | null;
  /** 联系人职务（企业主页展示，公开面已脱敏） */
  position?: string | null;
  phone: string | null;
  email: string | null;
  /** 注册/办公地址（企业主页展示） */
  address?: string | null;
  /** 企业官网（企业主页外链，http(s) 原样展示） */
  website?: string | null;
  products: string | null;
  /** 遗留展示字段（supplier.industry 列已于 2026-10-15 退役）：仅供认领建议占位为 ''，目录/详情不再读 */
  industry?: string | null;
  /** 主行业码（industry_nodes.code，UGT-I- 前缀）；行业面标准口径（industry 自由文本列已退役） */
  industry_code?: string | null;
  certification: string | null;
  /** 注册标识原文（按 credit_code_type 释义：uscc / hk_br / hk_cr / overseas_reg / tax_id / other） */
  credit_code?: string | null;
  /** 注册标识类型（默认 uscc） */
  credit_code_type?: string | null;
  /** 注册标识归一号码（去分隔符转大写，仅查重索引使用，不对外下发） */
  credit_code_norm?: string | null;
  /** 法定代表人（企业主页展示，公开面按需脱敏） */
  legal_rep?: string | null;
  /** 成立时间（DATE，可能为字符串） */
  established_at?: string | Date | null;
  /** 注册资本（DECIMAL 字符串） */
  registered_capital?: number | string | null;
  /** 注册资本币种 */
  currency?: string | null;
  /** 营业执照图片地址（仅用于「已上传」标志，不对公开面下发原 URL） */
  license_url?: string | null;
  /** 认证状态：unverified=未认证 / done=已认证（2026-11 起两态；认证只由认领通过写入） */
  verify_status?: string | null;
  /** 信息完整度/真实性人工审核：unreviewed / reviewed（门户展示门槛） */
  info_review_status?: string | null;
  /** 资料完整度（0-100 加权分：可搜索 45 + 可触达 25 + 可信 20 + 地域 10，后台服务层计算落库） */
  data_quality_score?: number | string | null;
}

/**
 * 供应商品目兴趣（supplier_backbone_interests）展示行
 *
 * 与 supplier.products 自由文本互补：这里给的是带 UGT 码的「平台归类」，
 * 用于画像页辅助展示、筛选与撮合，不替代供应商原文产品明细。
 */
export interface SupplierBackboneInterestRow {
  code: string;
  /** 品目名（原文 `中文 (English)` 形态） */
  name: string;
  level: number;
  level2_id: number | null;
  /** L2 大类（用于画像页分组；节点缺失时为空） */
  l2_code: string | null;
  l2_name_zh: string | null;
  l2_name_en: string | null;
  /** 完整路径原文（`A > B > C`，每段 `中文 (English)`） */
  path_text: string | null;
  confidence: number | string | null;
  weight: number | string | null;
  is_primary: number;
}

/**
 * 诊断入口「是不是这家公司」弹窗的候选行。
 * 字段集是安全红线（规范 N9）：只允许识别性字段，**绝不能包含**
 * contact / phone / email / address / license_url，否则一个尚未
 * 验证身份的地推现场用户就能把别人企业的联系方式看走。
 */
export interface CompanyCandidateRow extends RowDataPacket {
  id: number;
  company: string | null;
  province: string | null;
  city: string | null;
  established_at: string | null;
  legal_rep: string | null;
  credit_code: string | null;
  verify_status: string | null;
  info_review_status: string | null;
  /** 该主体是否有 status='pending' 的认领（**关系派生**，supplier_claims 的 EXISTS 片段；
   *  供应商行上的 claim_status 列已退役，ADR-0017） */
  claim_pending: number;
  /** 是否已被**其他**用户/账户绑定（users.supplier_id 命中且非当前用户）；0/1 */
  bound: number;
  /** 是否绑定在**当前用户**名下（自己的主体，诊断写权闸口放行的那类）；0/1 */
  mine: number;
}

/** 认领归属细查结果（getClaimOwnership 的返回结构） */
export interface ClaimOwnership {
  /** 当前用户自己已绑定该主体（即归属人） */
  selfBound: boolean;
  /** 其他账户已绑定该主体（已归属，无法再认领） */
  boundByOther: boolean;
  /** 该主体处于认领处理中（supplier_claims 存在 status='pending'，排他期内；
   *  claim_status 列已退役，改为关系派生，ADR-0017） */
  claimPending: boolean;
}

/** 账号绑定主体行（findBoundSubjectByUserId 的返回结构；排他判定与服务端文案共用）。
 *  只取排他判定所需列：认领待核已改为关系派生（supplier_claims），不再读 supplier.claim_status。 */
export interface BoundSubjectRow extends RowDataPacket {
  id: number;
  company: string | null;
  verify_status: string | null;
}

/**
 * 排序白名单：只收录能真正兑现的项，排序表达式不得来自用户输入。
 * ★ 必须是 Map 而不是对象字面量：下标取值的对象会把原型链上的键（constructor /
 *   __proto__ / toString / valueOf）一并「命中」，那些值是函数，直接拼进 ORDER BY
 *   就是语法错误，而路由的 try/catch 会把它吐成空列表——白名单形同被绕过。
 */
const SORT_ORDERS = new Map<string, string>([
  ["newest", "s.id DESC"],
  ["completeness", "s.data_quality_score DESC, s.id DESC"],
]);
const DEFAULT_SORT = "newest";

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
    sql: `EXISTS (SELECT 1 FROM supplier_industry_rel ir
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
              contact, phone, email, products, industry_code, certification,
              data_quality_score
       FROM supplier
       WHERE company <> '测试'
         AND info_review_status = 'reviewed'
       ORDER BY id DESC
       LIMIT 500`,
    );
    return rows as SupplierDirectoryRow[];
  }

  /**
   * 相似供应商（企业主页底部推荐）：同行业子树优先，不足再按同国家补齐。
   *
   * 只查公开口径（info_review_status='reviewed'）且排除自身；行业码来自树内白名单，
   * 这里按前缀做子树匹配（I4 不变量），不做 LIKE 元字符转义（码集只含 [A-Z0-9-]）。
   */
  async findSimilarReviewed(params: {
    excludeId: number;
    industryCode?: string | null;
    countryCode?: string | null;
    limit: number;
  }): Promise<SupplierDirectoryRow[]> {
    const { excludeId, industryCode, countryCode } = params;
    const limit = Math.max(1, Math.min(Math.floor(params.limit), 12));
    const baseCols = `s.id, s.company, s.country, s.country_code, s.province, s.city,
              s.products, s.industry_code, s.data_quality_score, s.certification`;
    const baseWhere = `s.info_review_status = 'reviewed' AND s.company <> '测试' AND s.id <> ?`;
    if (industryCode) {
      const [rows] = await this.pool.query(
        `SELECT ${baseCols}
           FROM supplier s
          WHERE ${baseWhere} AND s.industry_code LIKE ?
          ORDER BY s.data_quality_score DESC, s.id DESC
          LIMIT ?`,
        [excludeId, `${industryCode}%`, limit],
      );
      return rows as SupplierDirectoryRow[];
    }
    if (countryCode) {
      const [rows] = await this.pool.query(
        `SELECT ${baseCols}
           FROM supplier s
          WHERE ${baseWhere} AND s.country_code = ?
          ORDER BY s.data_quality_score DESC, s.id DESC
          LIMIT ?`,
        [excludeId, countryCode, limit],
      );
      return rows as SupplierDirectoryRow[];
    }
    return [];
  }

  /**
   * 供应商品目兴趣（平台归类）：只读 supplier_backbone_interests，
   * 主品目优先、weight/confidence 次之；L2 大类随行返回用于前端分组。
   */
  async findBackboneInterests(supplierId: number, limit = 20): Promise<SupplierBackboneInterestRow[]> {
    const [rows] = await this.pool.query(
      `SELECT bi.code, bi.name, bi.level, bi.level2_id, bi.path_text, bi.confidence, bi.weight, bi.is_primary,
              cb.code AS l2_code, cb.name_zh AS l2_name_zh, cb.name_en AS l2_name_en
         FROM supplier_backbone_interests bi
         LEFT JOIN commodity_backbone cb ON cb.id = bi.level2_id
        WHERE bi.supplier_id = ? AND bi.supplier_table = 'supplier'
        ORDER BY bi.is_primary DESC, bi.weight DESC, bi.confidence DESC, bi.id
        LIMIT ?`,
      [supplierId, Math.max(1, Math.min(Math.floor(limit), 50))],
    );
    return rows as SupplierBackboneInterestRow[];
  }

  /**
   * 相似供应商召回 A：共享品目码的企业（倒排命中数降序，质量分次之）。
   * 只返回候选，不在这里算最终相似度（打分在 services/supplier-similarity）。
   */
  async findReviewedByBackboneCodes(
    codes: readonly string[],
    excludeId: number,
    limit = 60,
  ): Promise<SupplierDirectoryRow[]> {
    if (codes.length === 0) return [];
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 200));
    const [rows] = await this.pool.query(
      `SELECT s.id, s.company, s.country, s.country_code, s.province, s.city,
              s.products, s.industry_code, s.data_quality_score, s.certification
         FROM supplier s
         JOIN supplier_backbone_interests bi ON bi.supplier_id = s.id AND bi.supplier_table = 'supplier'
        WHERE bi.code IN (?) AND s.info_review_status = 'reviewed'
          AND s.company <> '测试' AND s.id <> ?
        GROUP BY s.id
        ORDER BY COUNT(DISTINCT bi.code) DESC, s.data_quality_score DESC, s.id DESC
        LIMIT ?`,
      [[...codes], excludeId, safeLimit],
    );
    return rows as SupplierDirectoryRow[];
  }

  /** 相似供应商召回 B：同行业 L2 前缀子树（全码前缀会因主码层级过深而 0 命中） */
  async findReviewedByIndustryPrefix(
    prefix: string,
    excludeId: number,
    limit = 60,
  ): Promise<SupplierDirectoryRow[]> {
    const p = String(prefix ?? "").trim();
    if (!p) return [];
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 200));
    const [rows] = await this.pool.query(
      `SELECT s.id, s.company, s.country, s.country_code, s.province, s.city,
              s.products, s.industry_code, s.data_quality_score, s.certification
         FROM supplier s
        WHERE s.info_review_status = 'reviewed' AND s.company <> '测试' AND s.id <> ?
          AND s.industry_code LIKE ?
        ORDER BY s.data_quality_score DESC, s.id DESC
        LIMIT ?`,
      [excludeId, `${p}%`, safeLimit],
    );
    return rows as SupplierDirectoryRow[];
  }

  /** 批量取候选企业的品目码（相似度打分用；避免逐家查） */
  async findBackboneInterestsBySupplierIds(
    supplierIds: readonly number[],
  ): Promise<Array<{ supplier_id: number; code: string; confidence: number | string | null; is_primary: number }>> {
    const ids = [...new Set(supplierIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (ids.length === 0) return [];
    const [rows] = await this.pool.query(
      `SELECT supplier_id, code, confidence, is_primary
         FROM supplier_backbone_interests
        WHERE supplier_table = 'supplier' AND supplier_id IN (?)`,
      [ids],
    );
    return rows as Array<{ supplier_id: number; code: string; confidence: number | string | null; is_primary: number }>;
  }

  /** 供应商目录分页查询（行业为轴 + 产品/公司关键词；排序走白名单） */
  async listDirectoryPaginated(params: {
    limit: number;
    offset: number;
    search?: string;
    /** 行业主轴：门类码（也支持任一层级码），命中该节点**子树**内的挂靠 */
    industryCode?: string;
    /**
     * 行业关键词的解析结果（由 lib/services/industry-facets.resolveIndustryKeywordCodes 给出）。
     * 三态语义，不得合并成「非空才传」：
     *   undefined = 用户没提行业词 → 不加条件；
     *   []        = 提了但树上解不到 → 1 = 0（无结果），绝不退回 supplier.industry 自由文本 LIKE；
     *   非空      = 按子树前缀筛，与 industryCode / 关键词是 AND 交集。
     */
    industryCodes?: readonly string[];
    /** 排序键（白名单外回落默认） */
    sort?: string;
  }): Promise<{ items: SupplierDirectoryRow[]; total: number }> {
    const { limit, offset, search, industryCode, industryCodes, sort } = params;

    // ── WHERE 条件构建 ──
    // 展示口径只认 info_review_status='reviewed'：旧逻辑额外把 NULL 视同已认证（为外部同步的空值
    // 行预留），2026-10-08 实库取证 NULL 行数=0，该兼容分支已无命中，按不保留兼容直接删除。
    const conditions: string[] = [
      "company <> '测试'",
      "info_review_status = 'reviewed'",
    ];
    const values: string[] = [];

    if (search) {
      // 一个关键词同时搜「公司名 + 产品/关键词」：FULLTEXT 命中产品、LIKE 命中公司名，OR 取并集。
      // ★ MATCH 与 LIKE 用 OR 组合后 MySQL 不再走全文索引快路径（退化为对已过滤行逐行判定），
      //   但公司名 LIKE '%x%' 本就是前导通配全扫、可见供应商量级小，代价可忽略；排序走
      //   最新/完整度白名单、不依赖相关度，故合并搜索不丢排序。用户输入只进占位符，无注入面。
      conditions.push("(MATCH(s.products) AGAINST(? IN BOOLEAN MODE) OR s.company LIKE ?)");
      // L-BIZ-1：转义用户输入中的 LIKE 通配符（% _），避免被当成「匹配全部」
      values.push(search, `%${escapeLikeWildcard(search)}%`);
    }

    // 行业关键词：三态语义见参数注释。空集给 1 = 0 而不是「当没填」——用户提了词而树上解不到，
    // 就是没有这个行业的供应商；退回 supplier.industry 自由文本会把脏数据重新引回检索路径。
    if (industryCodes !== undefined) {
      const codes = industryCodes.filter(isIndustryCode);
      if (codes.length === 0) {
        conditions.push("1 = 0");
      } else {
        const sub = subtreeExists(codes);
        conditions.push(sub.sql);
        values.push(...sub.values);
      }
    }

    if (industryCode) {
      // 行业面口径：码形先验（非法码直接丢弃筛选条件，不拼进 SQL），
      // 子树 = 码前缀（不变量 I4「父码 = 自身码去掉末两位」由 check:taxonomy 钉住），
      // 因此选中「门类」能连带其下全部大类/中类/小类的挂靠，且走 idx_code 前缀范围扫描。
      const code = sanitizeIndustryCode(industryCode);
      if (code) {
        const sub = subtreeExists([code]);
        conditions.push(sub.sql);
        values.push(...sub.values);
      }
    }

    const whereSql = conditions.join(" AND ");
    // 排序表达式只从白名单常量里取（Map 取不到就是默认），用户输的东西永不会进到 ORDER BY
    const orderSql = SORT_ORDERS.get(String(sort ?? "")) ?? SORT_ORDERS.get(DEFAULT_SORT)!;

    // ★ 两处 FROM 必须带别名 s：多个检索分支的条件引用了 s.products / s.id（FULLTEXT 与
    //   EXISTS 相关子查询），无别名时 MySQL 直接报 ER_BAD_FIELD_ERROR，而路由的 try/catch
    //   会把它吐成空列表——产品与旧品类码两个入口曾因此长期「搜什么都无结果」而不报错。
    // 总数与分页数据并行：两条语句的入参完全独立，串行只会把云库 RTT 叠加两次
    // （实测每条 34ms，其中计算仅 1–2ms，其余全是往返）。
    const [countResult, pageResult] = await Promise.all([
      this.pool.query(
        `SELECT COUNT(*) as total FROM supplier s WHERE ${whereSql}`,
        values,
      ),
      this.pool.query(
        `SELECT s.id, s.company, s.country, s.country_code, s.province, s.city, s.contact, s.phone, s.email, s.products, s.industry_code,
                s.data_quality_score
         FROM supplier s
         WHERE ${whereSql}
         ORDER BY ${orderSql}
         LIMIT ? OFFSET ?`,
        [...values, limit, offset],
      ),
    ]);
    const total = (countResult[0] as RowDataPacket[])[0]?.total ?? 0;
    const rows = pageResult[0] as RowDataPacket[];

    // 证书文本由能力档案批量装配（旧列 supplier.certification 已停写，不参与读取）
    await attachCertificationText(this.pool, rows as SupplierDirectoryRow[]);
    return { items: rows as SupplierDirectoryRow[], total };
  }

  /** 按 ID 查询单条供应商（仅审批通过或历史无审核状态的数据） */
  async findById(id: number): Promise<SupplierDirectoryRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city,
              contact, position, phone, email, address, website, products,
              industry_code, legal_rep, established_at, registered_capital, currency,
              credit_code, credit_code_type, verify_status, info_review_status, license_url,
              data_quality_score
       FROM supplier
       WHERE id = ? AND info_review_status = 'reviewed'
       LIMIT 1`,
      [id],
    );
    const row = (rows as SupplierDirectoryRow[])[0] ?? null;
    if (row) await attachCertificationText(this.pool, [row]);
    return row;
  }

  /**
   * 按 ID 查询任意审核状态的供应商（仅供「本人绑定主体」自助查看）。
   * 门户公开面仍走 findById 的 info_review_status='reviewed' 口径；本人绑定主体可能处于
   * pending（诊断/认领中），详情页需要能看自己的档案，否则会 404。
   */
  async findByIdAnyStatus(id: number): Promise<SupplierDirectoryRow | null> {
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city,
              contact, position, phone, email, address, website, products,
              industry_code, legal_rep, established_at, registered_capital, currency,
              credit_code, credit_code_type, verify_status, info_review_status, license_url,
              data_quality_score
       FROM supplier
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    const row = (rows as SupplierDirectoryRow[])[0] ?? null;
    if (row) await attachCertificationText(this.pool, [row]);
    return row;
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

  /** 强类型可空列：空串必须转 NULL 写入，避免 STRICT 模式 ''→DATE/DECIMAL 报错（列型变更见影子表迁移） */
  static readonly TYPED_NULLABLE_COLS = new Set<string>(["established_at", "registered_capital"]);

  /** 企业信息可编辑列白名单（与 supplier 最终表结构一致；type/name_confirmed 已退役）
   *  certification 已于 2026-11-19 移出：证书唯一事实源是能力档案，本列停写。 */
  static readonly EDITABLE_COLUMNS = [
    "company", "country", "country_code", "province", "city",
    "address", "contact", "position", "phone", "email",
    "website", "legal_rep",
    "established_at", "registered_capital", "credit_code", "credit_code_type",
    "products",
  ] as const;

  /** 仅服务端派生写入、不对外下发（PORTAL_COLUMNS 不含）：注册标识归一号码 */
  static readonly INTERNAL_WRITE_COLUMNS = ["credit_code_norm"] as const;

  /**
   * 门户读列白名单 = EDITABLE_COLUMNS（表单可编辑列，编辑回填必需）
   *                 + 6 个门户另外要用的状态/展示列。
   *
   * 追加理由逐个可查：
   *   id / verify_status / info_review_status / data_quality_score / addtime
   *     —— EnterpriseInfoCard 的状态徽章、完整度与录入时间；
   *   license_url —— 企业详情展示执照 + 保存时协调旧文件；
   * claim_status 已于 2026-11-11 退役（ADR-0017）：认领状态由 supplier_claims 派生，
   *   不再作为 supplier 列下发（企业 GET 的 hasPendingClaim 由认领仓储单独派生）。
   * coop_status / info_checked / business_scope / source_url 已于 2026-11 影子表迁移
   *   物理删除（全无写入方），本白名单同步移除，避免引用已删列。
   * 2026-09 影子表重建时本表删 6 列（merged_id / english_name / webcheck_status /
   *   webcheck_at / last_match_at / 旧匹配时间），重复档案物理清除，
   *   历史上的 `merged_id IS NULL` 假门禁随之全部摘除；english_name 全库恒空已退役。
   *   完整台账见 docs/数据库设计/supplier-供应商目录主表.md。
   */
  static readonly PORTAL_COLUMNS = [
    ...SupplierDirectoryRepo.EDITABLE_COLUMNS,
    "id", "verify_status", "info_review_status",
    "data_quality_score", "addtime", "license_url",
  ] as const;

  /** 过滤输入到白名单列（忽略未知键；未提供/显式 null→null，空串保留 ''）。
   *  ★ 空串不得塌成 null：supplier.email / website 是 NOT NULL DEFAULT ''，而表单里是选填；
   *    STRICT_TRANS_TABLES 下向 NOT NULL 列绑定 NULL 会直接 1048（企业信息新建/编辑失败）。
   *    data_quality_score 由后台按「非空且 TRIM(col) <> ''」重新计算落库，'' 与 null 同样计为空，保留 '' 不影响评分。 */
  private pickEditable(input: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const col of [...SupplierDirectoryRepo.EDITABLE_COLUMNS, ...SupplierDirectoryRepo.INTERNAL_WRITE_COLUMNS]) {
      if (!(col in input)) continue;
      const v = input[col];
      if (v === undefined || v === null) {
        out[col] = null;
        continue;
      }
      const s = String(v);
      // established_at(DATE)/registered_capital(DECIMAL) 为强类型可空列：空串落 NULL，
      // 否则 STRICT 模式把 '' 绑进 DATE/DECIMAL 直接报错；其余可空文本列维持 '' 语义不变。
      out[col] = s === "" && SupplierDirectoryRepo.TYPED_NULLABLE_COLS.has(col) ? null : s;
    }
    return out;
  }

  /** 新建企业行（企业信息填写），返回自增 id；addtime 记当前 epoch 秒。
   *  meta 可携带非用户编辑列 verify_status 供注册审核流程使用。 */
  async insertEnterprise(
    input: Record<string, unknown>,
    meta: { verify_status?: string; info_review_status?: string } = {},
  ): Promise<number> {
    const data = this.pickEditable(input);
    const cols = Object.keys(data);
    const extraCols: string[] = [];
    const extraVals: unknown[] = [];
    if (meta.verify_status) { extraCols.push("verify_status"); extraVals.push(meta.verify_status); }
    if (meta.info_review_status) { extraCols.push("info_review_status"); extraVals.push(meta.info_review_status); }
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

  /**
   * 按注册标识查企业（注册防重优先键）。2026-11-18 起改为「类型 + 归一号码」组合键：
   * 香港 8 位数字与别国 8 位数字不再互相撞号；原文里的分隔符/大小写差异也不再漏判。
   * verify_status 供防重分支区分「已认证→转认领 / 未认证→直接绑定」。
   */
  async findByCreditCode(normalizedCode: string, type: string): Promise<SupplierDirectoryRow | null> {
    if (!normalizedCode) return null;
    const [rows] = await this.pool.query(
      `SELECT id, company, country, country_code, province, city,
              contact, phone, email, products, certification, verify_status, info_review_status
       FROM supplier WHERE credit_code_type = ? AND credit_code_norm = ? LIMIT 1`,
      [type, normalizedCode],
    );
    return ((rows as SupplierDirectoryRow[])[0]) ?? null;
  }

  /** 更新企业行可编辑列（企业信息编辑） */
  async updateEnterprise(id: number, input: Record<string, unknown>): Promise<void> {
    const data = this.pickEditable(input);
    const cols = Object.keys(data);
    if (cols.length === 0) return;
    const sets = cols.map((c) => `${c} = ?`).join(", ");
    // 资料一变，信息审核结论即失效：回退 unreviewed；认证状态不在这里改写（只由认领通过写入）。
    await this.pool.query(
      `UPDATE supplier SET ${sets}, info_review_status = 'unreviewed' WHERE id = ?`,
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
              contact, phone, email, products, certification, verify_status, info_review_status
       FROM supplier
       WHERE company = ?
       ORDER BY (
         CASE WHEN products IS NOT NULL AND products <> '' THEN 1 ELSE 0 END +
         CASE WHEN industry_code IS NOT NULL AND industry_code <> '' THEN 1 ELSE 0 END +
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
   * `bound`：附带「是否已被其他用户/账户绑定」标记（users.supplier_id 命中且非 excludeUserId），
   * 供「检测并确认主体」弹窗提示「该公司已被绑定」，避免用户对已归属企业重复认领。
   * `claim_pending`：是否有 status='pending' 的认领（supplier_claims 派生；claim_status 已退役，
   * ADR-0017），供弹窗提示「已有认领申请处理中」。
   * `mine`：是否绑定在当前用户名下（自己的主体，诊断写权闸口放行的那类，2026-11-11 一司一份）。
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
      `SELECT id, company, province, city,
              established_at, legal_rep, credit_code, verify_status, info_review_status,
              EXISTS(
                SELECT 1 FROM supplier_claims pc
                 WHERE pc.supplier_id = supplier.id
                   AND pc.status = 'pending'
              ) AS claim_pending,
              EXISTS(
                SELECT 1 FROM users cu
                 WHERE cu.supplier_id = supplier.id
                   AND cu.id <> ?
              ) AS bound,
              EXISTS(
                SELECT 1 FROM users mu
                 WHERE mu.supplier_id = supplier.id
                   AND mu.id = ?
              ) AS mine
         FROM supplier
        WHERE company LIKE ?
        ORDER BY (credit_code IS NOT NULL AND credit_code <> '') DESC,
                 data_quality_score DESC, id DESC
        LIMIT ?`,
      // 占位符按出现顺序：bound 的 excludeUserId → mine 的 excludeUserId → LIKE → LIMIT
      [uid, uid, `${escaped}%`, safeLimit],
    );
    return rows as CompanyCandidateRow[];
  }

  /**
   * 取诊断评分 D1 所需的主数据片段 + 主体正名。
   * `data_quality_score` 是 0-100 加权分（2026-11-18 改版，后台服务层计算），D1 直接按它分档；
   * 2026-11 起 `info_checked` 列已随影子表迁移物理删除，不再有人工核对封顶。
   * `company` 供诊断落库快照走 SSOT（payload 名只做检索，不入库，2026-11-12 防污染口径）；
   * 本方法不走 verify_status 过滤，因为刚建档的行依然是 D1 的正当评价对象。
   */
  async findProfileBits(
    supplierId: number,
  ): Promise<{ dataQualityScore: number | null; company: string | null } | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT company, data_quality_score FROM supplier WHERE id = ? LIMIT 1`,
      [supplierId],
    );
    const row = rows[0];
    if (!row) return null;
    const q = row.data_quality_score;
    return {
      company: row.company ?? null,
      dataQualityScore: q === null || q === undefined ? null : Number(q),
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
      `SELECT id, company, country, '' AS industry
       FROM supplier
       WHERE info_review_status = 'reviewed'
         AND (company LIKE ? OR company LIKE ?)
       ORDER BY (company LIKE ?) DESC,
                (
         CASE WHEN products IS NOT NULL AND products <> '' THEN 1 ELSE 0 END
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
    /** 库内供应商总数（全部审核状态，排除测试记录） */
    total: number;
    searchable: number;
    verified: number;
    withCertification: number;
    international: number;
    commodityMatched: number;
    /** 已审通过总数（原 countApproved，随本查询一并返回，避免路由再发一次 COUNT） */
    registered: number;
  }> {
    // 6 个计数合并为 1 条条件聚合：每个 SUM(cond) 相当于原来的一个 COUNT(*)…WHERE cond。
    // commodityMatched 是跨表 DISTINCT，写成**非相关**标量子查询（只求值一次），
    // 这样仍然只占一次往返；不能再 JOIN 进主查询——会按挂靠行数放大主表计数。
    // 注：SUM(bool) 在 MySQL 里是 DECIMAL，mysql2 返回字符串，必须 Number()。
    const [rows] = await this.pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(s.info_review_status = 'reviewed') AS searchable,
         SUM(s.info_review_status = 'reviewed') AS verified,
         SUM(s.info_review_status = 'reviewed'
             AND s.certification IS NOT NULL AND s.certification <> '') AS withCertification,
         SUM(s.info_review_status = 'reviewed'
             AND s.country_code IS NOT NULL AND s.country_code <> ''
             AND s.country_code <> 'CN') AS international,
         (SELECT COUNT(DISTINCT u.supplier_id)
            FROM supplier_backbone_interests u
            JOIN supplier s2 ON s2.id = u.supplier_id
           WHERE s2.info_review_status = 'reviewed' AND s2.company <> '测试') AS commodityMatched
       FROM supplier s
       WHERE s.company <> '测试'`,
    );
    const r = (rows as RowDataPacket[])[0] ?? {};
    const n = (v: unknown): number => {
      const parsed = Number(v ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return {
      total: n(r.total),
      searchable: n(r.searchable),
      verified: n(r.verified),
      withCertification: n(r.withCertification),
      international: n(r.international),
      commodityMatched: n(r.commodityMatched),
      registered: n(r.searchable),
    };
  }

  /** 库内供应商总数（全部审核状态，排除测试记录）：首页数字墙「供应商总数」口径 */
  async countAll(): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT COUNT(*) as total FROM supplier WHERE company <> '测试'",
    );
    return Number((rows as RowDataPacket[])[0]?.total ?? 0);
  }

  /** 已通过后台审核的供应商总数（registered 统计口径：info_review_status='reviewed'，排除测试记录） */
  async countApproved(): Promise<number> {
    const [rows] = await this.pool.query(
      "SELECT COUNT(*) as total FROM supplier WHERE info_review_status = 'reviewed' AND company <> '测试'",
    );
    return Number((rows as RowDataPacket[])[0]?.total ?? 0);
  }

  /** 按 id 查供应商行业（auth 响应组装用，不受审核状态过滤；industry 列已退役，改取 products） */
  async findAuthInfoById(id: number): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query(
      "SELECT id, products FROM supplier WHERE id = ? LIMIT 1",
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
         FROM users WHERE supplier_id = ?`,
      [userId, userId, supplierId],
    );
    const bound = boundRows[0] as { others: number | null; mine: number | null } | undefined;

    // 认领处理中改为关系派生（claim_status 列已退役，ADR-0017）：
    // 只要 supplier_claims 里存在该主体的 pending 申请，就算处于排他期。
    const [supRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT EXISTS(
         SELECT 1 FROM supplier_claims c
          WHERE c.supplier_id = ? AND c.status = 'pending'
       ) AS claim_pending`,
      [supplierId],
    );

    return {
      selfBound: Number(bound?.mine ?? 0) > 0,
      boundByOther: Number(bound?.others ?? 0) > 0,
      claimPending: Number((supRows as RowDataPacket[])[0]?.claim_pending ?? 0) === 1,
    };
  }

  /**
   * 账号当前绑定的企业主体（「一账号一主体」的账号侧读取口），无绑定返回 null。
   *
   * 与 getClaimOwnership 的分工：那边回答「**这家主体**归谁」，这边回答
   * 「**这个账号**已经绑了谁」。认领排他此前只有前者，于是已绑 A 的账号认领无人
   * 认领的 B 会一路放行，createClaimWithBinding 再把 users.supplier_id 覆盖成 B
   * ——审核中的 A 被抛下、已认证的 A 被顶掉，且没有任何入口能换回来。
   * 只取排他判定所需的识别列，不复用 findFullById（整行含联系方式与执照 URL）。
   */
  async findBoundSubjectByUserId(userId: number): Promise<BoundSubjectRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.id, s.company, s.verify_status
         FROM users u
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
      const industryCode = String(row.industry_code ?? "").trim();
      if (products === "" && industryCode === "") {
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
