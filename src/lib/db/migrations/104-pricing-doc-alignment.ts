/**
 * 104: 价格文档对齐 · 档位改名 + 抵扣窗口落地 + 服务目录按文档重构 + 1299 推送下发
 * pricing-doc-alignment
 *
 * @description 落地 docs/云境产品服务权益报价表_260928.xlsx（2026-09-28 版）与线上目录/矩阵/服务
 *              的差异裁决（差异清单见会话记录；本迁移只做已裁决的四类改动）：
 *
 *              1) 档位改名（7 档全改，含 name_en）：文档 C 列是对外正式商品名，官网卡头读
 *                 name_zh、非中文展示与服务名同策略读 name_en。旧名「专业版/无限版」与文档
 *                 「个人标准版(999)/个人专业版(1299)」同名不同档，属最高优先级对客冲突，故以
 *                 文档为准。⚠️ free 档在文档里没有对应行（260928 版删除了「免费注册体验」行），
 *                 它是 2026-09-22 裁决的「普通用户基线」而非商品，保留 FREE/普通用户 不 invent 名字。
 *
 *              2) 新增 crm_plan_catalog.upgrade_credit_days：把文档「7天内升级版本，可全额抵扣」
 *                 从销售话术变成可执行的商品属性——NULL=文档未承诺抵扣（沿用既有补差价，不收紧，
 *                 避免 1299→8800 这类既有能力倒退）；非 NULL=有抵扣窗口，窗口内补差价（=全额抵扣
 *                 已付款），窗口外不给抵扣路径，按目标档原价新购（见 lib/services/membership-upgrade）。
 *                 「仅限 1 次」无需额外状态位：升级履约要求来源订阅 replaced_by_id IS NULL，
 *                 一次抵扣升级即把旧订阅置为被替代，同一次 129 付款不可能再抵扣第二次。
 *
 *              3) crm_plan_benefits：unlimited × alert_service 由 0→2，兑现文档 1299 行
 *                 「按注册行业精准推送」（098 曾把它收回到仅 8800）。
 *
 *              4) crm_service_catalog 重构为文档 12 行服务（订阅 4 行走 crm_plan_catalog）：
 *                 - 改名/改口径 8 行：品名取 C 列原文、交付口径取 F 列原文，D/E 列的价格与期限
 *                   只在字段无法承载时原样附加；**G 列「销售话术」一律不入表**（它是推销用语，不是
 *                   交付承诺）。初版曾把 G 列话术与 docx 内容混进 F 位（含一句两份文档都没有的
 *                   「成功费另订合同」），改完常量后用下方 applyServiceCopy 重刷数据修正（纯文案不占迁移号）；
 *                   注：交付口径与价格/期限补充用「｜」分段（前者取 F 列、后者取 D/E 列原文），
 *                   为的是可被逐字包含校验判定；唯一一处非逐字：F 列「条款谈判支持条；」中的
 *                   「条」为文档录入笔误，落地时删去。
 *                 - 补 4 行文档有、系统无：拆解报告(¥500 起–3,000/单)、KA 定制、企业合规常年指导、
 *                   API 数据接口服务（文档只写「定制报价」，故 4 档明码 API 合并为一行 contact）；
 *                 - 删 8 行文档没有：199 AI单标解析、500/次投标技术支持、3000/年技术支持包、
 *                   专业人工标书、API STARTER/PRO/BUSINESS/ENTERPRISE；
 *                 - 16800 属「专家顾问」产品板块，E 列「不限额度（顾问咨询）」是人工顾问服务的
 *                   交付描述，不在系统里记次数额度；实测该行在本迁移前就没有 grant 绑定（改前
 *                   唯一带绑定的是被删的 svc_tech_support_pack → tech_support）；
 *                 - 新增 credit_to_annual_plan：承载文档「199 升级年包可全额抵扣」，成交单在
 *                   购买年付档时由支付服务端核销（不建第二张表，避免多写者）。
 *                 - 起点价行（拆解报告「500元~3,000元/单」、定制调研「1,280 元起/1 个方向」）
 *                   成交方式定为 lead：价格要按标的额与方向数谈定，按底价自助收款属于错卖；
 *                   前端 resolveServiceBranch 与服务端 service-payment 均以 price_from=1 为不变量，
 *                   防止日后有人把 sale_mode 改回 self 又把底价直接收走；
 *                 - member_discount 全部归 'none'：文档没有任何折扣承诺，而系统本就未实现折后价，
 *                   留着「会员专享」标签是对客虚假提示。
 *
 *              ⚠️ 物理删除的前置保护：仅当该 service_code 在 crm_service_orders 无任何历史订单时
 *              才 DELETE；一旦被引用过就降级为 is_active=0 下架并显式告警（外键与历史订单不许悬空）。
 *              降级发生时目录总行数会 > 12，须同步 scripts/verify-benefit-constraints.ts 的
 *              EXPECTED_STATIC.services（本轮 16→12）。
 *
 *              幂等：ALTER 先探 INFORMATION_SCHEMA 再执行并钉 ALGORITHM=INSTANT（不支持则退
 *              INPLACE, LOCK=NONE，绝不放任默认锁级别）；目录用 INSERT ... ON DUPLICATE KEY UPDATE，
 *              改名用 UPDATE，删除用带前置条件的 DELETE，可安全重跑。末尾回读逐字校验，防"半套"变更。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

/** [plan_code, name_en, name_zh] —— 与文档 C 列逐字一致；free 刻意不改（文档无该行）。 */
const PLAN_RENAMES: Array<[string, string, string]> = [
  ["starter", "PERSONAL TRIAL", "个人体验版"],
  ["pro", "PERSONAL STANDARD", "个人标准版"],
  ["unlimited", "PERSONAL PRO", "个人专业版"],
  ["business", "ENTERPRISE ANNUAL", "企业年度会员"],
  ["advisor", "STRATEGIC ADVISOR", "1对1战略顾问服务"],
  ["enterprise", "API DATA LICENSE", "API数据接口服务"],
];

/** [plan_code, 抵扣窗口天数] —— 文档只在 129/999 两行写了「7天内升级版本，可全额抵扣」。 */
const CREDIT_WINDOW_DAYS: Array<[string, number]> = [
  ["starter", 7],
  ["pro", 7],
];

/** 文档 1299 行「按注册行业精准推送」：enum 层级 2=✓（与 8800 同层，含义查 level_dict）。 */
const PUSH_CELL: [string, string, number] = ["unlimited", "alert_service", 2];

/**
 * 目标服务目录（12 行 = 文档第 4、6~16 行）。
 * 字段顺序：code, category, name_zh, name_en, price_mode, standard_price(null=不标价),
 * price_from, sale_mode(self/lead/contract), credit_to_annual_plan, grant_benefit_code,
 * grant_quota, grant_period, validity_days, deliverable_note_zh, sort_order
 */
type ServiceRow = [
  string,
  string,
  string,
  string,
  string,
  number | null,
  number,
  string,
  number,
  string | null,
  number | null,
  string,
  number | null,
  string,
  number,
];

const SERVICES: ServiceRow[] = [
  [
    "svc_manual_bid_match",
    "pro_service",
    "单条1对1匹配",
    "Manual Opportunity Matching",
    "per_time",
    199.0,
    0,
    "self",
    1,
    null,
    null,
    "none",
    null,
    "① 1对1人工匹配订单 ② 升级年包可全额抵扣",
    20,
  ],
  [
    "svc_bid_doc_analysis",
    "pro_service",
    "投标辅助，标讯深度拆解报告",
    "Bid Document Breakdown Report",
    "per_unit",
    500.0,
    1,
    "lead",
    0,
    null,
    null,
    "none",
    null,
    "① 原始标讯文档拆解报告 ② 投标解析报告+投标指南 ③ 类似案例分析+业主分析｜500元~3,000元/单",
    30,
  ],
  [
    "svc_intel_report",
    "pro_service",
    "定制服务市场调研",
    "Custom Market Research",
    "per_unit",
    1280.0,
    1,
    "lead",
    0,
    null,
    null,
    "none",
    null,
    "① 按选择方向定制服务，出具市场调研分析报告 ② 可选方向：国别、区域、竞争对手、发标方业主调研、成功案例分析、废标分析诊断、报价评测等（可多选）",
    40,
  ],
  [
    "svc_ai_bid_writing",
    "pro_service",
    "AI辅助写标书",
    "AI Bid Drafting",
    "token",
    null,
    0,
    "self",
    0,
    null,
    null,
    "none",
    null,
    "① 自主选择大模型（Kimi/DeepSeek/ChatGPT/Gemini） ② 根据消耗token自主付费，用多少付多少",
    50,
  ],
  [
    "svc_business_support",
    "pro_service",
    "辅助商务谈判",
    "Business Negotiation Support",
    "quote",
    null,
    0,
    "contract",
    0,
    null,
    null,
    "none",
    null,
    "① 专业顾问辅助商务谈判 ② 报价策略、条款谈判支持；从业主采购方（平台规则）视角辅助商务谈判｜按需报价（差旅费另计）",
    60,
  ],
  [
    "svc_compliance_guidance",
    "pro_service",
    "按单合规指导",
    "Per-Bid Compliance Guidance",
    "per_time",
    880.0,
    0,
    "self",
    0,
    null,
    null,
    "none",
    null,
    "① 辅导准备合规材料 ② 合规路径推荐 ③ 帮助企业缩短时间，高效完成合规、快速进入投标",
    70,
  ],
  [
    "svc_compliance_retainer",
    "pro_service",
    "企业合规常年指导",
    "Annual Compliance Retainer",
    "quote",
    null,
    0,
    "contract",
    0,
    null,
    null,
    "none",
    null,
    "① 企业参与国际采购的全流程合规指导｜按公司",
    80,
  ],
  [
    "svc_procurement_advisory",
    "advisory",
    "1对1专家咨询年包",
    "Expert Advisory Annual Pack",
    "per_year",
    16800.0,
    0,
    "contract",
    0,
    null,
    null,
    "none",
    365,
    "① 1对1专家咨询服务 ② 采购方平台规则咨询 ③ 订单判断、资质合规、投标避坑等顾问服务｜不限额度（顾问咨询）",
    90,
  ],
  [
    "svc_annual_advisor",
    "advisory",
    "1对1战略顾问服务",
    "Strategic Advisor Service",
    "per_year",
    36800.0,
    0,
    "contract",
    0,
    null,
    null,
    "none",
    365,
    "① 1对1战略顾问服务 ② 企业国别市场采购机会诊断 ③ 按国别（2 个国家）行业市场分析 ④ 出具解决方案报告，辅助战略决策",
    100,
  ],
  [
    "svc_bid_companion",
    "advisory",
    "单项目投标陪跑",
    "Bid Companion Service",
    "project",
    26800.0,
    1,
    "contract",
    0,
    null,
    null,
    "none",
    null,
    "① 1对1专家全程陪跑 ② 辅助投标全流程：选单、标书、合规、报价、谈判全程带",
    110,
  ],
  [
    "svc_ka_service",
    "advisory",
    "KA大客户定制服务",
    "KA Custom Engagement",
    "contact",
    null,
    0,
    "contract",
    0,
    null,
    null,
    "none",
    null,
    "① 合规服务+国际合规顾问，缩短合规时间 ② 投标全链路服务（一站式）｜前置服务费：标的额0.3%–1%，中标后提成3%–10%",
    120,
  ],
  [
    "svc_api_data_license",
    "api_license",
    "API数据接口服务",
    "API Data License",
    "contact",
    null,
    0,
    "contract",
    0,
    null,
    null,
    "none",
    null,
    "① 按照国家、行业、海关数据接口打包提供 ② 根据企业需求内容报价｜按接口包",
    130,
  ],
];

/** 文档没有的系统多余行：无历史订单则物理删除，有则降级下架并告警。 */
const REMOVED_SERVICE_CODES = [
  "svc_ai_tender_analysis",
  "svc_tender_tech_support",
  "svc_tech_support_pack",
  "svc_pro_bid_writing",
  "svc_api_starter",
  "svc_api_pro",
  "svc_api_business",
  "svc_api_enterprise",
];

/** 本轮目标目录行数（门禁 EXPECTED_STATIC.services 同值）。 */
const TARGET_SERVICE_COUNT = SERVICES.length;

const inPh = (n: number) => Array.from({ length: n }, () => "?").join(",");

/** 列存在性探测：ADD COLUMN 前置，保证重跑不报 1060。 */
async function columnExists(db: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number((rows as Array<{ n: number }>)[0].n) > 0;
}

/**
 * 加可空/带默认值的尾列：钉 ALGORITHM=INSTANT（毫秒级、不持写锁）。
 * 逗号必须在 ALGORITHM 之前（漏逗号 = 语法错 = 服务起不来）；
 * 若 MySQL 版本不支持 INSTANT，退 INPLACE + LOCK=NONE，绝不回落到默认锁级别。
 */
async function addColumn(db: Pool, table: string, ddl: string, comment: string): Promise<void> {
  // 与 runner.ensureColumn 同一卫生标准：模板拼接的 DDL 片段不许含语句分隔符/注释符
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) || /[;`]|--|\/\*/.test(ddl)) {
    throw new Error(`[migration-104] 不安全的 DDL 片段：${table} / ${ddl.slice(0, 60)}`);
  }
  try {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}, ALGORITHM=INSTANT`);
    console.log(`[migration-104] ${table} 已加列（INSTANT）：${comment}`);
  } catch (e) {
    const msg = (e as Error).message;
    if (!/ALGORITHM|LOCK|not supported/i.test(msg)) throw e;
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}, ALGORITHM=INPLACE, LOCK=NONE`);
    console.log(`[migration-104] ${table} 已加列（INPLACE,LOCK=NONE 降级）：${comment}`);
  }
}

/**
 * 结构段（DDL）：只加两个可空/带默认值的尾列，对线上读写零影响。
 *
 * 单独导出的理由：生产上线分两步——先把列加上、让带新字段的应用代码能读到位（新代码的
 * SELECT 已经引用这两列，缺列会直接报错），确认无误后再执行数据段改名/删行。两步共用本函数，
 * DDL 文案只有一份，不会漂移；本函数幂等，故 up() 仍会调它（第二次是空转）。
 * ⚠️ 执行本段后不要给 104 记账，否则数据段会被 runner 当作已完成而永久跳过。
 */
export async function applySchema(dbPool: Pool): Promise<void> {
  // ── 1. 结构：抵扣窗口列 + 年包抵扣标记列（先建列，后灌数据） ──
  if (!(await columnExists(dbPool, "crm_plan_catalog", "upgrade_credit_days"))) {
    await addColumn(
      dbPool,
      "crm_plan_catalog",
      "upgrade_credit_days SMALLINT NULL COMMENT '升级全额抵扣窗口天数：自订阅生效起 N 天内升级按补差价（=已付款全额抵扣），超窗口不给抵扣改按目标档原价新购；NULL=本档不承诺抵扣（沿用补差价）；来源：docs/云境产品服务权益报价表_260928.xlsx 个人体验版/个人标准版行'",
      "升级抵扣窗口"
    );
  }
  if (!(await columnExists(dbPool, "crm_service_catalog", "credit_to_annual_plan"))) {
    await addColumn(
      dbPool,
      "crm_service_catalog",
      "credit_to_annual_plan TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=该服务成交单可在购买年付套餐时全额抵扣本单金额（文档「升级年包可全额抵扣」）；核销锚点=crm_payment_orders.original_order_no 记本服务单号，一张服务单只核销一次'",
      "年包抵扣标记"
    );
  }
}

/** 数据段：改名、挂窗口、下发推送格、按文档重建服务目录，末尾回读逐字校验。 */
export async function applyData(dbPool: Pool): Promise<void> {
  // ── 2. 档位改名（文档 C 列逐字） ──
  for (const [planCode, nameEn, nameZh] of PLAN_RENAMES) {
    await dbPool.execute(
      `UPDATE crm_plan_catalog SET name_en = ?, name_zh = ? WHERE plan_code = ?`,
      [nameEn, nameZh, planCode]
    );
  }

  // ── 3. 抵扣窗口取值（仅文档承诺抵扣的两档） ──
  for (const [planCode, days] of CREDIT_WINDOW_DAYS) {
    await dbPool.execute(
      `UPDATE crm_plan_catalog SET upgrade_credit_days = ? WHERE plan_code = ?`,
      [days, planCode]
    );
  }
  // 其余档显式置 NULL：防止历史脏值让文档未承诺的档也进窗口（NULL=沿用补差价）
  await dbPool.execute(
    `UPDATE crm_plan_catalog SET upgrade_credit_days = NULL
        WHERE plan_code NOT IN (${inPh(CREDIT_WINDOW_DAYS.length)})`,
    CREDIT_WINDOW_DAYS.map(([code]) => code)
  );

  // ── 4. 1299 推送权益下发（格已存在，ODKU 只改取值） ──
  const [pushPlan, pushBenefit, pushLevel] = PUSH_CELL;
  await dbPool.execute(
    `INSERT INTO crm_plan_benefits (plan_code, benefit_code, value_level)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value_level = VALUES(value_level), value_num = NULL, value_amount = NULL,
         note_zh = 'docs/云境产品服务权益报价表_260928.xlsx 个人专业版(1299) 行③「按注册行业精准推送」；层级 2=✓，与 8800 同层'`,
    [pushPlan, pushBenefit, pushLevel]
  );

  // ── 5. 多余服务行：无历史订单则物理删除，有则降级下架（外键与历史不许悬空） ──
  const [refs] = await dbPool.query(
    `SELECT DISTINCT service_code FROM crm_service_orders WHERE service_code IN (${inPh(REMOVED_SERVICE_CODES.length)})`,
    REMOVED_SERVICE_CODES
  );
  const referenced = (refs as Array<{ service_code: string }>).map((r) => r.service_code);
  const deletable = REMOVED_SERVICE_CODES.filter((c) => !referenced.includes(c));
  if (deletable.length > 0) {
    const [del] = await dbPool.execute(
      `DELETE FROM crm_service_catalog WHERE service_code IN (${inPh(deletable.length)})`,
      deletable
    );
    console.log(
      `[migration-104] 物理删除文档外服务行 ${deletable.length} 条（affectedRows=${(del as { affectedRows: number }).affectedRows}）：${deletable.join(", ")}`
    );
  }
  if (referenced.length > 0) {
    await dbPool.execute(
      `UPDATE crm_service_catalog SET is_active = 0 WHERE service_code IN (${inPh(referenced.length)})`,
      referenced
    );
    console.warn(
      `[migration-104] ⚠️ 这些服务行已有历史订单，不能物理删除，已降级为 is_active=0 下架：${referenced.join(", ")}；` +
        `crm_service_catalog 总行数将高于 ${TARGET_SERVICE_COUNT}，需按实调 scripts/verify-benefit-constraints.ts 的 EXPECTED_STATIC.services`
    );
  }

  // ── 6. 目标 12 行：INSERT ... ON DUPLICATE KEY UPDATE 全列覆盖（重跑得到同一形状） ──
  for (const r of SERVICES) {
    const [
      code,
      category,
      nameZh,
      nameEn,
      priceMode,
      stdPrice,
      priceFrom,
      saleMode,
      credit,
      grantCode,
      grantQuota,
      grantPeriod,
      validityDays,
      noteZh,
      sortOrder,
    ] = r;
    await dbPool.execute(
      `INSERT INTO crm_service_catalog
           (service_code, category, name_zh, name_en, price_mode, standard_price, price_from, currency,
            grant_benefit_code, grant_quota, grant_period, validity_days, sale_mode, member_discount,
            credit_to_annual_plan, deliverable_note_zh, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'CNY', ?, ?, ?, ?, ?, 'none', ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE
           category = VALUES(category), name_zh = VALUES(name_zh), name_en = VALUES(name_en),
           price_mode = VALUES(price_mode), standard_price = VALUES(standard_price),
           price_from = VALUES(price_from), currency = VALUES(currency),
           grant_benefit_code = VALUES(grant_benefit_code), grant_quota = VALUES(grant_quota),
           grant_period = VALUES(grant_period), validity_days = VALUES(validity_days),
           sale_mode = VALUES(sale_mode), member_discount = VALUES(member_discount),
           credit_to_annual_plan = VALUES(credit_to_annual_plan),
           deliverable_note_zh = VALUES(deliverable_note_zh),
           is_active = VALUES(is_active), sort_order = VALUES(sort_order)`,
      [
        code,
        category,
        nameZh,
        nameEn,
        priceMode,
        stdPrice,
        priceFrom,
        grantCode,
        grantQuota,
        grantPeriod,
        validityDays,
        saleMode,
        credit,
        noteZh,
        sortOrder,
      ]
    );
  }

  // ── 7. 回读校验：半套变更必须当场炸出来，不能留到官网渲染才被发现 ──
  const problems: string[] = [];

  const [nameRows] = await dbPool.query(
    `SELECT plan_code, name_en, name_zh, upgrade_credit_days FROM crm_plan_catalog`
  );
  const planMap = new Map(
    (nameRows as Array<Record<string, unknown>>).map((r) => [String(r.plan_code), r])
  );
  for (const [code, en, zh] of PLAN_RENAMES) {
    const row = planMap.get(code);
    if (!row || row.name_en !== en || row.name_zh !== zh) problems.push(`档位改名未落：${code}`);
  }
  for (const [code, days] of CREDIT_WINDOW_DAYS) {
    const row = planMap.get(code);
    if (!row || Number(row.upgrade_credit_days) !== days) problems.push(`抵扣窗口未落：${code}`);
  }
  if (planMap.get("free")?.upgrade_credit_days != null) problems.push("free 档不应有抵扣窗口");

  const [cellRows] = await dbPool.query(
    `SELECT value_level FROM crm_plan_benefits WHERE plan_code = ? AND benefit_code = ?`,
    [pushPlan, pushBenefit]
  );
  if (Number((cellRows as Array<{ value_level: number }>)[0]?.value_level) !== pushLevel) {
    problems.push("1299 推送权益未下发（unlimited × alert_service 应=2）");
  }

  const [svcRows] = await dbPool.query(
    `SELECT service_code, name_zh, price_mode, standard_price, price_from, sale_mode,
              credit_to_annual_plan, grant_benefit_code, member_discount, is_active
         FROM crm_service_catalog ORDER BY category, sort_order`
  );
  const svcMap = new Map(
    (svcRows as Array<Record<string, unknown>>).map((r) => [String(r.service_code), r])
  );
  for (const [
    code,
    ,
    nameZh,
    ,
    priceMode,
    stdPrice,
    priceFrom,
    saleMode,
    credit,
    grantCode,
  ] of SERVICES) {
    const row = svcMap.get(code);
    if (!row) {
      problems.push(`服务行缺失：${code}`);
      continue;
    }
    const bad =
      row.name_zh !== nameZh ||
      row.price_mode !== priceMode ||
      Number(row.standard_price ?? -1) !== Number(stdPrice ?? -1) ||
      Number(row.price_from) !== priceFrom ||
      row.sale_mode !== saleMode ||
      Number(row.credit_to_annual_plan) !== credit ||
      (row.grant_benefit_code ?? null) !== grantCode ||
      row.member_discount !== "none" ||
      Number(row.is_active) !== 1;
    if (bad) problems.push(`服务行取值未落：${code}`);
  }
  for (const code of REMOVED_SERVICE_CODES) {
    if (!referenced.includes(code) && svcMap.has(code))
      problems.push(`文档外服务行未删除：${code}`);
  }
  const activeCount = (svcRows as Array<{ is_active: number }>).filter(
    (r) => Number(r.is_active) === 1
  ).length;
  if (activeCount !== TARGET_SERVICE_COUNT)
    problems.push(`在售服务行数 ${activeCount} ≠ 文档 ${TARGET_SERVICE_COUNT}`);

  if (problems.length > 0) {
    throw new Error(`[migration-104] 价格文档对齐校验未通过：\n  - ${problems.join("\n  - ")}`);
  }

  console.log(
    `[migration-104] 已对齐 260928 报价表：${PLAN_RENAMES.length} 档改名、${CREDIT_WINDOW_DAYS.length} 档挂抵扣窗口、` +
      `1299 推送下发、服务目录 ${TARGET_SERVICE_COUNT} 行在售（删除 ${deletable.length}、降级 ${referenced.length}）、199 年包抵扣已启用`
  );
}

/**
 * 服务目录的「品名 + 交付口径」权威文本（直接取自上方 SERVICES，不另写一份文案，避免漂移）。
 * 字段序：0=service_code、2=name_zh、13=deliverable_note_zh。
 */
export const SERVICE_COPY: Array<{ code: string; nameZh: string; noteZh: string }> = SERVICES.map((r) => ({
  code: r[0],
  nameZh: r[2],
  noteZh: r[13],
}));

/**
 * 只重刷品名与交付口径两列（供一次性数据修正脚本复用，不为纯文案新开迁移号）。
 *
 * 为什么需要单独一个函数：104 已在 schema_migrations 记账、runner 永不再跑它，所以改完常量的
 * 文案要靠本函数把已跑过旧版 104 的库重刷一遍（纯文案不占迁移号）。文案只有一份——钉在 SERVICES
 * 里，104 全量重建与只刷文案两条路径共用。本函数幂等：文本已正确的库跑上它是空转。
 * 末尾逐字回读（只忽略空白，标点计入），不相等就 throw，不允许“改了但没改对”。
 */
export async function applyServiceCopy(db: Pool): Promise<void> {
  for (const { code, nameZh, noteZh } of SERVICE_COPY) {
    await db.execute(`UPDATE crm_service_catalog SET name_zh = ?, deliverable_note_zh = ? WHERE service_code = ?`, [nameZh, noteZh, code]);
  }
  const rows = (await db.query(`SELECT service_code, name_zh, deliverable_note_zh FROM crm_service_catalog`)) as unknown as [
    Array<{ service_code: string; name_zh: string; deliverable_note_zh: string | null }>,
  ];
  const byCode = new Map(rows[0].map((r) => [r.service_code, r]));
  const squeeze = (s: string) => s.replace(/\s+/g, "");
  const bad: string[] = [];
  for (const { code, nameZh, noteZh } of SERVICE_COPY) {
    const row = byCode.get(code);
    if (!row) {
      bad.push(`${code} 行不存在`);
      continue;
    }
    if (squeeze(row.name_zh) !== squeeze(nameZh)) bad.push(`${code} 品名未逐字落位`);
    if (squeeze(row.deliverable_note_zh ?? "") !== squeeze(noteZh)) bad.push(`${code} 交付口径未逐字落位`);
  }
  if (bad.length > 0) throw new Error(`[migration-104] 服务文案逐字校验未通过：\n  - ${bad.join("\n  - ")}`);
}

export const migration: Migration = {
  version: 104,
  name: "pricing-doc-alignment",
  async up(dbPool: Pool) {
    await applySchema(dbPool);
    await applyData(dbPool);
  },
};
