/**
 * 权益体系表组 · 约束活性验证（可重复运行）
 *
 * @description 向 8 张权益表发起预期成功/预期被拒的写入，验证 CHECK/唯一键/非空约束
 *              **真的在数据库层生效**（静态 DDL 断言只能防文案漂移，防不了三值逻辑这类语义坑）。
 *              全程单事务，结束固定 ROLLBACK——不向表里留任何数据，可安全反复跑。
 *
 *              使用时机：改动 092 迁移的 DDL 后（需先重建空表）、以及阶段二切读前的回归门禁。
 * 用法：node --env-file=.env scripts/verify-benefit-constraints.ts
 *        失败时 exit code=1，可直接接入 CI（需可用数据库）。
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
});

/** 回滚后校验用的计数查询：事务开始前先取基线，结束后逐列比对 */
const COUNT_SQL = `SELECT (SELECT COUNT(*) FROM crm_benefit_catalog) a, (SELECT COUNT(*) FROM crm_plan_catalog) b,
  (SELECT COUNT(*) FROM crm_plan_benefits) c, (SELECT COUNT(*) FROM crm_plan_subscriptions) d,
  (SELECT COUNT(*) FROM crm_benefit_quotas) e, (SELECT COUNT(*) FROM crm_subscription_seats) f,
  (SELECT COUNT(*) FROM crm_service_catalog) g, (SELECT COUNT(*) FROM crm_service_orders) h`;

/** 静态目录表（已写入 docx 数据）与事实表（必须永远空）分开断言 */
const STATIC_KEYS = ["a", "b", "c", "g"] as const;
const FACT_KEYS = ["d", "e", "f", "h"] as const;

/**
 * 期望的目录形状（2026-09-23 实测值）。
 * 下面只自比“本轮探针数据未泄漏”，并不能挡住目录被增删；这里钉住绝对值，
 * 改动 docx 抄录结果时必须同步改这里并说明原因。
 */
const EXPECTED_STATIC = { benefits: 20, plans: 7, cells: 140, services: 15 };
const [baseRows] = await conn.query(COUNT_SQL);
const baseline = (baseRows as Record<string, number>[])[0];
console.log("[baseline] 当前库内行数（静态目录已录入，事实表应为 0）:", baseline);

let shapeOk = true;
for (const [key, want] of [["a", EXPECTED_STATIC.benefits], ["b", EXPECTED_STATIC.plans], ["c", EXPECTED_STATIC.cells], ["g", EXPECTED_STATIC.services]] as const) {
  if (Number(baseline[key]) !== want) {
    console.log(`  ✗ 目录数量漂移 ${key}: 库内 ${baseline[key]} / 预期 ${want}`);
    shapeOk = false;
  }
}
// 矩阵闭合：每个在售套餐 × 每条启用权益恰有一格（缺格=上线后该档该权益渲染不出来）
const [holeRows] = await conn.query(
  `SELECT COUNT(*) n FROM crm_plan_catalog pc CROSS JOIN crm_benefit_catalog bc
     LEFT JOIN crm_plan_benefits mb ON mb.plan_code = pc.plan_code AND mb.benefit_code = bc.benefit_code
    WHERE mb.id IS NULL`,
);
const holes = Number((holeRows as { n: number }[])[0].n);
if (holes !== 0) {
  console.log(`  ✗ 矩阵缺格 ${holes} 处`);
  shapeOk = false;
}
if (shapeOk) {
  console.log(`  ✓ 目录形状与预期一致：${EXPECTED_STATIC.benefits} 权益 × ${EXPECTED_STATIC.plans} 套餐 = ${EXPECTED_STATIC.cells} 格、缺格 0、服务 ${EXPECTED_STATIC.services}`);
}

let pass = 0;
let fail = 0;

/** 期望 stmt 抛错且错误含指定特征 */
async function expectReject(label: string, stmt: () => Promise<unknown>, like: RegExp) {
  try {
    await stmt();
    console.log(`  ✗ ${label}: 预期被拒绝，却成功了`);
    fail++;
  } catch (e) {
    const msg = (e as Error).message;
    if (like.test(msg)) {
      console.log(`  ✓ ${label}: 已拒绝 (${msg.split("\n")[0].slice(0, 70)})`);
      pass++;
    } else {
      console.log(`  ? ${label}: 报错但非预期约束: ${msg.split("\n")[0].slice(0, 90)}`);
      fail++;
    }
  }
}

/** 期望 stmt 成功 */
async function expectOk(label: string, stmt: () => Promise<unknown>) {
  try {
    await stmt();
    console.log(`  ✓ ${label}: 通过`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${label}: 意外失败 ${(e as Error).message.split("\n")[0].slice(0, 90)}`);
    fail++;
  }
}

await conn.beginTransaction();

// 前置：几行权益 + 一行套餐（事务内，回滚后消失）
await conn.execute(
  `INSERT INTO crm_benefit_catalog (benefit_code,name_zh,group_code,value_kind,is_consumable,level_dict)
   VALUES ('__t_notice','标讯额度','notice','quota',1,NULL),
          ('__t_api','API接口','delivery','bool',0,NULL),
          ('__t_match','AI智能匹配','ai','enum',0,JSON_OBJECT('0','无','1','基础','3','企业级','4','API'))`,
);
await conn.execute(
  `INSERT INTO crm_plan_catalog (plan_code,name_en,name_zh,positioning_zh,price,commercial_tier,cta_i18n_key)
   VALUES ('__t_pro','PRO','专业版','t',999,'L1','x')`,
);

console.log("[1] 矩阵 chk_one_value：三值列恰好一个非空");
await expectReject(
  "双值（level+num）被拒",
  () => conn.execute(`INSERT INTO crm_plan_benefits (plan_code,benefit_code,value_level,value_num) VALUES ('__t_pro','__t_api',1,5)`),
  /chk_one_value|Check constraint/i,
);
await expectReject(
  "空格（三列全 NULL）被拒",
  () => conn.execute(`INSERT INTO crm_plan_benefits (plan_code,benefit_code) VALUES ('__t_pro','__t_api')`),
  /chk_one_value|Check constraint/i,
);
await expectOk("额度格只填 value_num=100", () =>
  conn.execute(`INSERT INTO crm_plan_benefits (plan_code,benefit_code,value_num) VALUES ('__t_pro','__t_notice',100)`),
);
await expectOk("不限格显式 -1", () =>
  conn.execute(`INSERT INTO crm_plan_benefits (plan_code,benefit_code,value_num) VALUES ('__t_pro','__t_api',-1)`),
);

console.log("[2] 权益目录 chk_enum_dict：enum 型必须带 level_dict");
await expectReject(
  "enum 型无 level_dict 被拒",
  () => conn.execute(`INSERT INTO crm_benefit_catalog (benefit_code,name_zh,group_code,value_kind) VALUES ('__t_bad','坏行','ai','enum')`),
  /chk_enum_dict|Check constraint/i,
);
await expectOk("补上 level_dict 后可插入", () =>
  conn.execute(`INSERT INTO crm_benefit_catalog (benefit_code,name_zh,group_code,value_kind,level_dict) VALUES ('__t_bad2','好行','ai','enum',JSON_OBJECT('0','无','1','基础'))`),
);

console.log("[3] 额度账本：普通用户池（subscription_id NULL）+ 生成列唯一键");
// 探针必须显式钉死 period_starts_at：该列 DEFAULT CURRENT_TIMESTAMP 是**语句级**取值，
// 两条 INSERT 靠默认值会相差秒级，uk_pool（含周期起点）视其为两个周期而不冲突——
// 2026-09-23 教训：本项误报"约束失效"正是没钉周期起点，约束本身经诊断实为活性正常。
await expectOk("subscription_id NULL 可插入", () =>
  conn.execute(
    `INSERT INTO crm_benefit_quotas (subscription_id,seat_user_id,benefit_code,quota_total,period_starts_at)
     VALUES (NULL,900001,'__t_notice',3,'2026-01-01 00:00:00')`,
  ),
);
await expectReject(
  "同池同周期重复插入被 uk_pool 拒绝（证明 NULL 也参与唯一约束）",
  () =>
    conn.execute(
      `INSERT INTO crm_benefit_quotas (subscription_id,seat_user_id,benefit_code,quota_total,period_starts_at)
       VALUES (NULL,900001,'__t_notice',3,'2026-01-01 00:00:00')`,
    ),
  /uk_pool|Duplicate entry/i,
);
const [gen] = await conn.query(
  `SELECT subscription_pool_key k FROM crm_benefit_quotas WHERE subscription_id IS NULL AND seat_user_id=900001 LIMIT 1`,
);
console.log(`  · 生成列取值: ${(gen as { k: number }[])[0]?.k}（NULL→0）`);
await expectReject(
  "quota_used 超过 quota_total 被 chk_usage 拒绝",
  () => conn.execute(`UPDATE crm_benefit_quotas SET quota_used=99 WHERE subscription_id IS NULL AND seat_user_id=900001`),
  /chk_usage|Check constraint/i,
);
await expectOk("不限行（total=-1, used=0）通过 chk_usage", () =>
  conn.execute(`INSERT INTO crm_benefit_quotas (subscription_id,seat_user_id,benefit_code,quota_total,quota_used) VALUES (NULL,900002,'__t_notice',-1,0)`),
);

console.log("[4] 套餐 chk：明码档必须正价、席位无 0");
await expectReject(
  "fixed 模式 price=0 被拒",
  () => conn.execute(`INSERT INTO crm_plan_catalog (plan_code,name_en,name_zh,positioning_zh,price,commercial_tier,cta_i18n_key) VALUES ('__t_bad','X','x','t',0,'L1','x')`),
  /chk_price_mode|Check constraint/i,
);
await expectOk("contact 模式 price=0 允许（联系销售档）", () =>
  conn.execute(`INSERT INTO crm_plan_catalog (plan_code,name_en,name_zh,positioning_zh,price,price_mode,commercial_tier,cta_i18n_key) VALUES ('__t_ent','ENTERPRISE','机构版','t',0,'contact','L6','x')`),
);
await expectReject(
  "seat_limit=0 被拒",
  () => conn.execute(`INSERT INTO crm_plan_catalog (plan_code,name_en,name_zh,positioning_zh,price,commercial_tier,cta_i18n_key,seat_limit) VALUES ('__t_s0','S0','s','t',1,'L1','x',0)`),
  /chk_seat_limit|Check constraint/i,
);

console.log("[5] 订阅：source_order_no 非空硬约束");
await expectReject(
  "缺 source_order_no 被拒",
  () => conn.execute(`INSERT INTO crm_plan_subscriptions (owner_user_id,plan_code,price_paid) VALUES (900001,'__t_pro',999)`),
  /doesn't have a default value|source_order_no/i,
);

console.log("[6] 服务目录：计价形态与充值配对约束");
await expectReject(
  "只给 grant_benefit_code 不给 grant_quota 被拒",
  () => conn.execute(`INSERT INTO crm_service_catalog (service_code,category,name_zh,name_en,price_mode,standard_price,grant_benefit_code) VALUES ('__t_sv','pro_service','s','s','per_time',500,'__t_notice')`),
  /chk_grant_pair|Check constraint/i,
);
await expectOk("per_time 带正价可插入", () =>
  conn.execute(`INSERT INTO crm_service_catalog (service_code,category,name_zh,name_en,price_mode,standard_price) VALUES ('__t_sv2','pro_service','s','s','per_time',500)`),
);
await expectReject(
  "per_time 但价格 NULL 被拒（非 project/quote/contact 形态必须有价）",
  () => conn.execute(`INSERT INTO crm_service_catalog (service_code,category,name_zh,name_en,price_mode) VALUES ('__t_sv3','pro_service','s','s','per_time')`),
  /chk_price_by_mode|Check constraint/i,
);
await expectReject(
  "per_time 但价格 0 被拒（零价不等于无价）",
  () => conn.execute(`INSERT INTO crm_service_catalog (service_code,category,name_zh,name_en,price_mode,standard_price) VALUES ('__t_sv5','pro_service','s','s','per_time',0)`),
  /chk_price_by_mode|Check constraint/i,
);
await expectOk("quote 形态无价允许（单独报价）", () =>
  conn.execute(`INSERT INTO crm_service_catalog (service_code,category,name_zh,name_en,price_mode) VALUES ('__t_sv4','pro_service','s','s','quote')`),
);

console.log("[7] 服务订单：status 必须显式传入 + 取值域 + 未成交不许挂额度");
await expectReject(
  "缺 status 被拒（VARCHAR NOT NULL 无默认）",
  () => conn.execute(`INSERT INTO crm_service_orders (order_no,user_id,service_code,amount_total,sale_mode_snapshot) VALUES ('__o1',900001,'__t_sv2',500,'self')`),
  /doesn't have a default value|status/i,
);
await expectReject(
  "非法状态值被 chk_status_domain 拒",
  () => conn.execute(`INSERT INTO crm_service_orders (order_no,user_id,service_code,amount_total,sale_mode_snapshot,status) VALUES ('__o3',900001,'__t_sv2',500,'self','paid_pending')`),
  /chk_status_domain|Check constraint/i,
);
await expectReject(
  "非法 sale_mode_snapshot 被拒",
  () => conn.execute(`INSERT INTO crm_service_orders (order_no,user_id,service_code,amount_total,sale_mode_snapshot,status) VALUES ('__o4',900001,'__t_sv2',500,'phone','lead')`),
  /chk_sale_mode_domain|Check constraint/i,
);
await expectReject(
  "pending 态挂 granted_subscription_id 被拒",
  () => conn.execute(`INSERT INTO crm_service_orders (order_no,user_id,service_code,amount_total,sale_mode_snapshot,status,granted_subscription_id) VALUES ('__o2',900001,'__t_sv2',500,'self','pending',1)`),
  /chk_grant_link|Check constraint/i,
);

await conn.rollback();
const [left] = await conn.query(COUNT_SQL);
const after = (left as Record<string, number>[])[0];
const staticDrift = STATIC_KEYS.filter((k) => after[k] !== baseline[k]);
const factDirty = FACT_KEYS.filter((k) => after[k] !== 0);
console.log("\n[rollback] 回滚后行数:", after);
if (staticDrift.length === 0) {
  console.log(`  ✓ 静态目录 4 表行数与基线一致（测试数据未泄漏）: ${STATIC_KEYS.map((k) => `${k}=${baseline[k]}`).join(" ")}`);
  pass++;
} else {
  console.log(`  ✗ 静态目录行数发生漂移: ${staticDrift.map((k) => `${k}: ${baseline[k]}→${after[k]}`).join(", ")}`);
  fail++;
}
if (factDirty.length === 0) {
  console.log("  ✓ 事实表 4 表仍全为空（未回填、未双写）");
  pass++;
} else {
  console.log(`  ✗ 事实表残留数据: ${factDirty.map((k) => `${k}=${after[k]}`).join(", ")}`);
  fail++;
}
console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项`);
await conn.end();
if (fail > 0) process.exit(1);
