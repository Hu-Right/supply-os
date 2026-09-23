/**
 * 092: 权益体系 · 正式表组建表（阶段一·旁路）
 * benefit-system-tables
 *
 * @description 按 docs/OS_NEO_SMART_2026官网正式价格体系_V1.0.docx 落新表组（8 张），
 *              设计文档见 docs/数据库设计/ 下「权益体系-数据库设计总览」与各表文档。
 *
 *              阶段一性质：本表组是**旁路新建**，旧三表（crm_membership_plans /
 *              crm_user_subscriptions / crm_user_entitlements）继续承载生产读写，
 *              本迁移**不触碰旧表一个字节**；新表名即终态名，故无需 ADR 0003 的 RENAME 换名，
 *              切换发生在阶段二的服务层读路径（benefit-matrix / unlock-quota 改指本表组）。
 *
 *              结构要点（"1 就是 1"原则）：
 *              - 矩阵一行一格，三值列互斥 CHECK（chk_one_value），不限 = -1 显式表达；
 *              - 权益目录声明 value_kind + level_dict（枚举型必须带层级字典 CHECK）；
 *              - 订阅 source_order_no NOT NULL、price_paid/seat_limit 快照、replaced_by_id 升级链；
 *              - 额度账本按 benefit_code 分池，subscription_id NULL=普通用户池
 *                （免费档=普通用户权益，2026-09-22 裁决），周期重置开新行留账；
 *              - 席位 owner 占行；服务目录承载 7 种计价形态；服务订单状态机含留资/合同。
 *
 *              两个已实测确认的 MySQL 语义坑（约束活性验证发现并已在 DDL 修正）：
 *              1) CHECK 中引用可空列的比较式（如 `col > 0`）在 NULL 时为 UNKNOWN，MySQL 视为通过
 *                 → 必须写 `col IS NOT NULL AND col > 0`（见 chk_price_by_mode）；
 *              2) `NOT NULL ENUM` 且不写 DEFAULT 时，隐式默认值 = 首个枚举成员，漏传不报错而静默成脏值
 *                 → 对"必须显式传入"的状态/快照列改用 VARCHAR + CHECK 取值域（见 crm_service_orders）。
 *
 *              外键依赖建表顺序：benefit_catalog → plan_catalog → plan_benefits
 *              → plan_subscriptions → benefit_quotas → subscription_seats
 *              → service_catalog → service_orders。
 *
 *              幂等：全部 CREATE TABLE IF NOT EXISTS，可安全重跑；末尾结构自检防"半套"表组。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

/** 本迁移负责创建的表（顺序 = 外键依赖顺序） */
export const BENEFIT_SYSTEM_TABLES = [
  "crm_benefit_catalog",
  "crm_plan_catalog",
  "crm_plan_benefits",
  "crm_plan_subscriptions",
  "crm_benefit_quotas",
  "crm_subscription_seats",
  "crm_service_catalog",
  "crm_service_orders",
] as const;

const DDL: Record<(typeof BENEFIT_SYSTEM_TABLES)[number], string> = {
  // 1. 权益目录：声明"系统里有几种权益、每种的值是什么类型、各层级数字是什么意思"
  crm_benefit_catalog: `
    CREATE TABLE IF NOT EXISTS crm_benefit_catalog (
      benefit_code        VARCHAR(64)  NOT NULL COMMENT '权益稳定机器码，上线后不可改语义（如 notice_view）',
      name_zh             VARCHAR(120) NOT NULL COMMENT '权益中文名，与官网对比表行名一致',
      group_code          ENUM('notice','search','ai','enterprise','service','delivery') NOT NULL COMMENT '权益分组：标讯/搜索/AI/企业/服务/交付，决定矩阵行分区',
      value_kind          ENUM('bool','enum','quota','amount') NOT NULL COMMENT '取值类型：布尔(有/无)、枚举(层级数字)、额度(可消耗数量)、金额(价格)',
      level_dict          JSON NULL COMMENT '枚举行各层级的业务含义，如 {"0":"无","1":"基础","3":"企业级"}；让矩阵里的整数可自解释',
      is_consumable       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=计量型权益，可在 crm_benefit_quotas 开立额度池并按次扣减',
      requires_subscription TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=需有效订阅才享有；0=普通用户（无订阅）即享有，即免费档权益',
      gate_key            VARCHAR(64)  NULL COMMENT '服务层门控读取键（代码中以常量引用）；纯展示行为 NULL',
      sort_order          INT          NOT NULL DEFAULT 0 COMMENT '矩阵行展示顺序，与价格体系文档 02 章一致',
      is_active           TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=启用；下架只置 0 不删行，保证矩阵历史格引用完整',
      created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (benefit_code),
      KEY idx_group_sort (group_code, sort_order),
      CONSTRAINT chk_enum_dict CHECK (value_kind <> 'enum' OR level_dict IS NOT NULL)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='权益目录表：定义系统内每一种权益的名称、取值类型与层级含义，是套餐权益矩阵和额度账本的前置字典'`,

  // 2. 套餐目录：六档商品行（价格/周期/席位/层级/角标），权益内容一律不在这张表
  //    注意：本文件是已执行迁移的历史记录，不回头改它的 SQL 字符串；
  //    其中 price_incl_tax 的列注释「未定前禁止开单」与总览 §5.2 决策互斥，
  //    已由迁移 093 修订。新环境按 092 → 093 顺序执行即得到终态口径。
  crm_plan_catalog: `
    CREATE TABLE IF NOT EXISTS crm_plan_catalog (
      plan_code           VARCHAR(64)   NOT NULL COMMENT '套餐稳定机器码，下架不复用',
      name_en             VARCHAR(40)   NOT NULL COMMENT '官网档位英文名：STARTER/PRO/UNLIMITED/BUSINESS/ADVISOR/ENTERPRISE',
      name_zh             VARCHAR(80)   NOT NULL COMMENT '官网档位中文名',
      positioning_zh      VARCHAR(255)  NOT NULL COMMENT '核心定位一句话，用于套餐卡副标题',
      price               DECIMAL(10,2) NOT NULL COMMENT '官网标价；price_mode=free 时必为 0.00，price_mode=contact 时亦 0.00 且不得用于展示或计费',
      price_mode          ENUM('fixed','contact','free') NOT NULL DEFAULT 'fixed' COMMENT 'fixed=明码标价可自助支付；contact=商务报价、必须转销售不得开单；free=普通用户档（不售卖、不得建订阅）',
      price_incl_tax      TINYINT(1)    NULL COMMENT '含税口径 1=含税/0=未税/NULL=未定；未定前禁止开单',
      currency            VARCHAR(10)   NOT NULL DEFAULT 'CNY',
      billing_period_days INT           NULL COMMENT '计费周期天数，365=年付；NULL=一次性交付或按合同约定',
      seat_limit          INT           NOT NULL DEFAULT 1 COMMENT '可占席位的账号数硬上限；-1=按合同自定义，实际以席位表为准',
      commercial_tier     ENUM('L1','L2','L3','L4','L5','L6') NOT NULL COMMENT '商业层级（数据体验/个人专业/企业智能/企业顾问/项目服务/数据授权），仅用于商品归组与报表，不作门控依据',
      cta_i18n_key        VARCHAR(64)   NOT NULL COMMENT '官网按钮的 i18n 键',
      badge               ENUM('none','most_popular','best_value','custom') NOT NULL DEFAULT 'none' COMMENT '官网角标：无/最受欢迎/企业推荐/定制方案',
      sort_order          INT           NOT NULL DEFAULT 0 COMMENT '官网六卡横向顺序',
      is_active           TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '1=在售；调价必须新版本行+旧行下架，禁止原地改已成交价',
      created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME      NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (plan_code),
      KEY idx_active_sort (is_active, sort_order),
      KEY idx_tier (commercial_tier),
      CONSTRAINT chk_price_mode CHECK (price_mode <> 'fixed' OR price > 0),
      CONSTRAINT chk_seat_limit CHECK (seat_limit = -1 OR seat_limit > 0)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='套餐目录表：官网在售各档套餐的商品属性（价格、计费周期、席位上限、销售层级、角标与按钮），不承载权益内容'`,

  // 3. 套餐权益矩阵：一行一格精确值，门控/官网/报表三方同源
  crm_plan_benefits: `
    CREATE TABLE IF NOT EXISTS crm_plan_benefits (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      plan_code    VARCHAR(64)  NOT NULL COMMENT 'FK crm_plan_catalog：这一格属于哪档套餐',
      benefit_code VARCHAR(64)  NOT NULL COMMENT 'FK crm_benefit_catalog：这一格是哪个权益',
      value_level  INT          NULL COMMENT '层级值：布尔行只允许 0/1；枚举行 0..4，含义查权益目录 level_dict',
      value_num    INT          NULL COMMENT '额度值：正整数=数量；-1=不限（全库唯一的不限表达，禁止用大数字冒充）；0=该档明确无额度（如普通用户免费额度 0 条）',
      value_amount DECIMAL(10,2) NULL COMMENT '金额值：0.00=该档包含/免费；正数=该档会员价',
      note_zh      VARCHAR(255) NULL COMMENT '格级边界说明，如"批量下载按增值服务计费"，前端锁定态提示直接渲染',
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_plan_benefit (plan_code, benefit_code),
      KEY idx_benefit (benefit_code, plan_code),
      CONSTRAINT fk_pb_plan    FOREIGN KEY (plan_code)    REFERENCES crm_plan_catalog (plan_code),
      CONSTRAINT fk_pb_benefit FOREIGN KEY (benefit_code) REFERENCES crm_benefit_catalog (benefit_code),
      CONSTRAINT chk_one_value CHECK (
        (value_level IS NOT NULL) + (value_num IS NOT NULL) + (value_amount IS NOT NULL) = 1
      )
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='套餐权益矩阵表：按（套餐 × 权益）逐格存储精确取值，一行一格、无权益也显式存 0，是功能门控与官网对比表的唯一事实源'`,

  // 4. 套餐订阅：一次购买事实 + 快照；free 行禁止建订阅（服务层）
  crm_plan_subscriptions: `
    CREATE TABLE IF NOT EXISTS crm_plan_subscriptions (
      id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      owner_user_id   BIGINT UNSIGNED NOT NULL COMMENT '订阅归属人（企业档为主账号）；单轨非空',
      plan_code       VARCHAR(64)   NOT NULL COMMENT 'FK crm_plan_catalog：买了哪档',
      source_order_no VARCHAR(80)   NOT NULL COMMENT '成交订单号，非空硬约束——无订单来源的订阅禁止存在，退款与对账唯一锚点',
      price_paid      DECIMAL(10,2) NOT NULL COMMENT '实付金额快照（升级补差时不等于套餐标价），财务口径',
      currency        VARCHAR(10)   NOT NULL DEFAULT 'CNY',
      seat_limit      INT           NOT NULL DEFAULT 1 COMMENT '购买时的席位上限快照；-1=合同自定义；套餐后续调席位不追溯本单',
      status          ENUM('active','expired','cancelled','refunded') NOT NULL DEFAULT 'active' COMMENT '仅 active 享有权益门控',
      started_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at      DATETIME      NULL COMMENT '到期时间；NULL=永久（结构预留，当前各档均年付）',
      replaced_by_id  BIGINT UNSIGNED NULL COMMENT '升级链指针：本单被哪一单替代，可 JOIN 追溯承接关系',
      created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME      NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_owner_status (owner_user_id, status, expires_at),
      KEY idx_plan (plan_code),
      KEY idx_source_order (source_order_no),
      CONSTRAINT fk_sub_plan     FOREIGN KEY (plan_code) REFERENCES crm_plan_catalog (plan_code),
      CONSTRAINT fk_sub_replaced FOREIGN KEY (replaced_by_id) REFERENCES crm_plan_subscriptions (id),
      CONSTRAINT chk_validity CHECK (expires_at IS NULL OR expires_at > started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='套餐订阅表：记录用户对套餐的每一次购买事实（归属人、成交订单号、实付与席位快照、有效期与状态、升级链）'`,

  // 5. 权益额度账本：一切可消耗量的唯一记账落点
  crm_benefit_quotas: `
    CREATE TABLE IF NOT EXISTS crm_benefit_quotas (
      id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      subscription_id       BIGINT UNSIGNED NULL COMMENT 'FK crm_plan_subscriptions：额度随订阅生灭；NULL=普通用户池（免费档计量权益）',
      subscription_pool_key BIGINT GENERATED ALWAYS AS (IFNULL(subscription_id, 0)) STORED COMMENT '生成列：把普通用户池的 NULL 归一为 0，使其可参与唯一约束',
      seat_user_id          BIGINT UNSIGNED NOT NULL COMMENT '额度持有用户：订阅共享池记主账号，席位独立池记席位成员',
      scope                 ENUM('subscription','seat') NOT NULL DEFAULT 'subscription' COMMENT '额度池层级：整订阅共享 / 单席位独立',
      benefit_code          VARCHAR(64)  NOT NULL COMMENT 'FK crm_benefit_catalog：本池计量哪种权益（须 is_consumable=1）',
      quota_total           INT          NOT NULL COMMENT '总额度；-1=不限（不限行不记消耗）',
      quota_used            INT          NOT NULL DEFAULT 0 COMMENT '已用量；quota_total=-1 时恒为 0',
      period                ENUM('none','monthly','yearly') NOT NULL DEFAULT 'none' COMMENT '周期口径：一次性 / 每月重置 / 每年重置（如"每月1次顾问咨询"）',
      period_starts_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '当前周期起点；周期重置=推进本值开新行，旧行留账可对账',
      status                ENUM('active','exhausted','frozen','expired') NOT NULL DEFAULT 'active' COMMENT '仅 active 可扣减',
      created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_pool (subscription_pool_key, seat_user_id, benefit_code, period_starts_at),
      KEY idx_consume (seat_user_id, benefit_code, status, period_starts_at),
      KEY idx_subscription (subscription_id, status),
      CONSTRAINT fk_quota_sub     FOREIGN KEY (subscription_id) REFERENCES crm_plan_subscriptions (id),
      CONSTRAINT fk_quota_benefit FOREIGN KEY (benefit_code)    REFERENCES crm_benefit_catalog (benefit_code),
      CONSTRAINT chk_usage CHECK (quota_used BETWEEN 0 AND GREATEST(quota_total, 0))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='权益额度账本表：按（订阅 × 用户 × 权益 × 周期）记录可消耗额度的总量与已用量，是全库唯一的额度扣减落点'`,

  // 6. 订阅席位：多账号团队的成员归属
  crm_subscription_seats: `
    CREATE TABLE IF NOT EXISTS crm_subscription_seats (
      id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      subscription_id BIGINT UNSIGNED NOT NULL COMMENT 'FK crm_plan_subscriptions：席位挂在哪条订阅下',
      member_user_id  BIGINT UNSIGNED NOT NULL COMMENT '席位实际使用人的账号',
      is_owner        TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1=订阅主账号所占席位行；每条订阅恰一行，使"席位数=行数"恒成立',
      status          ENUM('active','removed') NOT NULL DEFAULT 'active' COMMENT '移出只置状态不删行，保证历史额度消耗归属可追溯',
      joined_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      removed_at      DATETIME        NULL,
      created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME        NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_sub_member (subscription_id, member_user_id),
      KEY idx_member (member_user_id, status),
      KEY idx_sub_status (subscription_id, status),
      CONSTRAINT fk_seat_sub FOREIGN KEY (subscription_id) REFERENCES crm_plan_subscriptions (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='订阅席位表：记录一条订阅下各席位的使用人，用于多账号团队的成员归属与席位上限校验（成员与主账号走同一门控链）'`,

  // 7. 增值服务目录：非订阅制 SKU 的品名与计价形态
  crm_service_catalog: `
    CREATE TABLE IF NOT EXISTS crm_service_catalog (
      service_code        VARCHAR(64)  NOT NULL COMMENT '服务稳定机器码',
      category            ENUM('pro_service','advisory','api_license') NOT NULL COMMENT '服务类别：专业增值 / 顾问服务 / API 数据授权',
      name_zh             VARCHAR(120) NOT NULL,
      name_en             VARCHAR(120) NOT NULL COMMENT '官网英文名',
      price_mode          ENUM('per_unit','per_time','per_year','token','project','quote','contact') NOT NULL COMMENT '计价形态：按单件/按次/按年包/按算力/按项目/单独报价/联系销售，驱动订单定价与展示后缀',
      standard_price      DECIMAL(10,2) NULL COMMENT '标准价；token/project/quote/contact 形态为 NULL（算力计费与另议不冒充价格）',
      price_from          TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1=标准价是"起"价，前端展示必须带"起"字，防一口价误读',
      currency            VARCHAR(10)  NOT NULL DEFAULT 'CNY',
      grant_benefit_code  VARCHAR(64)  NULL COMMENT '成交后向额度账本充值的权益码（FK crm_benefit_catalog，须 is_consumable=1）；纯交付型为 NULL',
      grant_quota         INT          NULL COMMENT '单次成交充值的额度数量，与 grant_benefit_code 成对出现',
      grant_period        ENUM('none','monthly','yearly') NOT NULL DEFAULT 'none' COMMENT '所充额度的周期口径（年度包 12 次按年）',
      validity_days       INT          NULL COMMENT '服务有效期/交付窗口天数；NULL=按合同约定',
      sale_mode           ENUM('self','lead','contract') NOT NULL DEFAULT 'self' COMMENT '成交方式：自助下单 / 留资转化 / 合同成交（后两者不进自助支付）',
      member_discount     ENUM('none','any_plan','unlimited_plus') NOT NULL DEFAULT 'none' COMMENT '会员优惠资格；具体折后价由定价服务层按档计算，本表不存折扣率',
      deliverable_note_zh VARCHAR(500) NULL COMMENT '标准交付口径说明',
      is_active           TINYINT(1)   NOT NULL DEFAULT 1,
      sort_order          INT          NOT NULL DEFAULT 0,
      created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (service_code),
      KEY idx_cat_sort (category, is_active, sort_order),
      CONSTRAINT fk_svc_grant_benefit FOREIGN KEY (grant_benefit_code) REFERENCES crm_benefit_catalog (benefit_code),
      CONSTRAINT chk_price_by_mode CHECK (price_mode IN ('token','project','quote','contact') OR (standard_price IS NOT NULL AND standard_price > 0)),
      CONSTRAINT chk_grant_pair    CHECK ((grant_benefit_code IS NULL) = (grant_quota IS NULL)),
      CONSTRAINT chk_price_from    CHECK (price_from = 0 OR standard_price IS NOT NULL),
      CONSTRAINT chk_grant_period  CHECK (grant_benefit_code IS NULL OR grant_period <> 'none')
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='增值服务目录表：非订阅制服务（按次/按项目/按合同购买）的品名、计价形态、标准价与成交后额度充值规则'`,

  // 8. 服务订购订单：目录项的下单与成交事实
  crm_service_orders: `
    CREATE TABLE IF NOT EXISTS crm_service_orders (
      id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_no                VARCHAR(80)  NOT NULL COMMENT '对外业务订单号，与支付域对账的唯一锚点',
      user_id                 BIGINT UNSIGNED NOT NULL COMMENT '下单账号',
      service_code            VARCHAR(64)  NOT NULL COMMENT 'FK crm_service_catalog：买了哪个服务',
      quantity                INT          NOT NULL DEFAULT 1 COMMENT '购买数量（按件/按次；按年包恒 1）',
      unit_price_snapshot     DECIMAL(10,2) NULL COMMENT '成交单价快照；quote/contact 形态成交前为 NULL（表达流程阶段而非语义含糊）',
      amount_total            DECIMAL(10,2) NOT NULL COMMENT '订单总额 = 单价 × 数量，由服务层计算写入',
      currency                VARCHAR(10)  NOT NULL DEFAULT 'CNY',
      status                  VARCHAR(20)  NOT NULL COMMENT '订单状态；故意用 VARCHAR+CHECK 而非 ENUM：NOT NULL ENUM 无 DEFAULT 时 MySQL 隐式取首个枚举值，会静默把漏传当成合法状态',
      sale_mode_snapshot      VARCHAR(20)  NOT NULL COMMENT '下单时目录销售形态快照（同上，不用 ENUM，强制显式传入）',
      granted_subscription_id BIGINT UNSIGNED NULL COMMENT '额度充值落点订阅（软链不建外键，跨写入域解耦）；仅 paid 状态可挂',
      contract_ref            VARCHAR(120) NULL COMMENT '合同编号：价格文档"以合同为准"（成功费、专项报价、授权范围）的回查锚点',
      paid_at                 DATETIME     NULL COMMENT '支付或成交时间',
      created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_order_no (order_no),
      KEY idx_user_status (user_id, status, created_at),
      KEY idx_service (service_code, status),
      CONSTRAINT fk_ord_service FOREIGN KEY (service_code) REFERENCES crm_service_catalog (service_code),
      CONSTRAINT chk_status_domain CHECK (status IN ('lead','pending','paid','cancelled','refunded')),
      CONSTRAINT chk_sale_mode_domain CHECK (sale_mode_snapshot IN ('self','lead','contract')),
      CONSTRAINT chk_quantity    CHECK (quantity > 0),
      CONSTRAINT chk_grant_link  CHECK (granted_subscription_id IS NULL OR status = 'paid')
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='服务订购订单表：增值服务的下单与成交事实（数量、单价快照、状态机、合同编号、额度充值落点）；订阅类购买不走本表'`,
};

export const migration: Migration = {
  version: 92,
  name: "benefit-system-tables",
  async up(dbPool: Pool) {
    // 按外键依赖顺序建表（IF NOT EXISTS 幂等，可安全重跑）
    for (const table of BENEFIT_SYSTEM_TABLES) {
      await dbPool.query(DDL[table]);
    }

    // 结构自检：8 表齐备才算完成——防中途失败留下"半套"表组（阶段二切读前的最低保障）
    const [rows] = await dbPool.query(
      `SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${BENEFIT_SYSTEM_TABLES.map(() => "?").join(",")})`,
      BENEFIT_SYSTEM_TABLES.map((t) => String(t)),
    );
    const got = new Set((rows as Array<{ t: string }>).map((r) => r.t));
    const missing = BENEFIT_SYSTEM_TABLES.filter((t) => !got.has(t));
    if (missing.length > 0) {
      throw new Error(`[migration-092] 权益表组不完整，缺失：${missing.join(", ")}`);
    }

    console.log(
      "[migration-092] 权益体系 8 表已就绪（旁路新建；旧三表未触碰，生产读写仍走旧链路，等待阶段二服务层切读）",
    );
  },
};
