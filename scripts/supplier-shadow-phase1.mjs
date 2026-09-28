/**
 * 影子表阶段一：按 supplier 建一张干净的新表 supplier__new（原表结构不动，仅吸收动作写回保留行）
 *
 * 方案（2026-09 影子表重建，经用户批准）：
 *   · 删 7 列：merged_id / english_name / webcheck_status / webcheck_at / last_match_at /
 *     unspsc_matched_at / tenant_id（多租户空架子：全库只有 0×67,745 与 1×2）
 *   · 行级清理：已合并行（merged_id 非空）与 DeepSeek 裁决 duplicate 行物理排除、company='测试' 排除、
 *     verify_status NULL→'pending'、province='CN' 污染置 NULL、type 值域洗净（越域值搬 business_type
 *     + 按 country_code 归一 foreign/domestic + business_type_code 重派生）
 *   · id 按旧 id 升序重排 1..N（supplier__idmap 存 old→new，阶段二级联改写下游引用）
 *
 * 产物：
 *   supplier__new   —— 终态结构（源表列数 − 7），干净行全量回填，id 1..N 连续
 *   supplier__idmap —— old_id → new_id 映射（仅含入选行）
 *   scripts/out/supplier-shadow-backup-<ts>.json —— 吸收动作写回前的全量行快照（回滚依据）
 *
 * 安全边界：
 *   - 结构 DDL 只作用于 supplier__new / supplier__idmap 两张新表；
 *   - 对 supplier 本体仅有两类写：①吸收 duplicate 时的保留行补齐/引用迁移/merged_id 打标
 *     （与 2026-09 dedup/sweep 脚本同款，先备份后写）；②无；
 *   - 默认 dry-run 只读；--apply 才写库；--delta 在已建 idmap 的基础上补新增行（幂等可重跑）；
 *   - 回填后逐列 NULL-safe 全等校验（变换列按变换后的期望值比对）+ id 连续性 + 分值守恒抽查，
 *     任一不符即非零退出。
 *
 * 用法：
 *   node scripts/supplier-shadow-phase1.mjs            # dry-run：只打印计划与预检结果
 *   node scripts/supplier-shadow-phase1.mjs --apply    # 写库：吸收 + 建表 + 回填 + 校验
 *   node scripts/supplier-shadow-phase1.mjs --apply --delta  # 补增量（窗口内二次执行）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "out");
const APPLY = process.argv.includes("--apply");
const DELTA = process.argv.includes("--delta");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^DB_[A-Z]+=/ && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/["']/g, "").trim()]),
);

const pool = await mysql.createPool({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME, charset: "utf8mb4", connectionLimit: 2,
  dateStrings: true,
});

const NEW_TABLE = "supplier__new";
const MAP_TABLE = "supplier__idmap";
const REVIEW_TABLE = "crm_supplier_dedup_review";

/** 本次退役的 7 列（影子表不含） */
const DROPPED_COLUMNS = ["merged_id", "english_name", "webcheck_status", "webcheck_at", "last_match_at", "unspsc_matched_at", "tenant_id"];
/** 保留行允许被被吸收行非空值补齐的列（与 dedup-suppliers-2026-09.ts 的 FILLABLE 一致；公司名/枚举类不动） */
const FILLABLE = [
  "credit_code", "province", "city", "address", "registered_address",
  "registered_phone", "registered_email", "contact", "position", "phone",
  "email", "website", "industry", "products", "business_type",
  "certification", "intro", "legal_rep", "established_at",
  "registered_capital", "unspsc_codes_snapshot",
];
/** 下游引用表.列（吸收时迁往保留行；阶段二按 idmap 全量重映射） */
const REF_COLUMNS = [
  { table: "crm_supplier_claims", column: "supplier_id", where: "" },
  { table: "crm_user_supplier_pool", column: "supplier_id", where: "" },
  { table: "crm_users", column: "supplier_id", where: "" },
  { table: "crm_bid_supplier_recommendations", column: "supplier_id", where: " AND supplier_table='supplier'" },
  { table: "crm_training_registrations", column: "converted_supplier_id", where: "" },
  { table: "crm_training_registrations", column: "portal_supplier_id", where: "" },
  { table: "crm_supplier_diagnosis", column: "supplier_id", where: "" },
  { table: "crm_supplier_translations", column: "supplier_id", where: "" },
  { table: "crm_supplier_unspsc_interests", column: "supplier_id", where: " AND supplier_table='supplier'" },
];

/** business_type 文本 → 枚举（与 intelligence-daily dimensions.ts 同一套规则，按优先级排列） */
const BUSINESS_TYPE_RULES = [
  [/制造商|生产商|制造|生产厂家|工厂|生产型|自产|OEM|ODM/i, "manufacturer"],
  [/贸易|商贸|进出口|外贸|经销|分销|批发|代理商|供应链/i, "trader"],
  [/服务|咨询|科技|软件|信息技术|传媒|传播|金融|租赁|物流|检测|认证机构/i, "service_provider"],
];
function normalizeBusinessType(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  for (const [re, code] of BUSINESS_TYPE_RULES) if (re.test(v)) return code;
  return "other";
}

function fail(msg) {
  console.error(`\n[FATAL] ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}
const q = (s) => `\`${s}\``;
async function tableExists(table) {
  const [[e]] = await pool.query(
    `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [env.DB_NAME, table],
  );
  return Number(e.n) > 0;
}

// ── 0. 源表预检 ──
const [[srcStat]] = await pool.query(
  `SELECT COUNT(*) AS total, COALESCE(MIN(id),0) AS min_id, COALESCE(MAX(id),0) AS max_id FROM supplier`,
);
console.log(`[0] 源表 supplier 行数=${Number(srcStat.total)} id范围=${Number(srcStat.min_id)}..${Number(srcStat.max_id)}`);
if (Number(srcStat.total) === 0) fail("supplier 为空表，中止");

const [srcCols] = await pool.query(
  `SELECT COLUMN_NAME, GENERATION_EXPRESSION FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'supplier' ORDER BY ORDINAL_POSITION`,
  [env.DB_NAME],
);
const colNames = srcCols.map((r) => r.COLUMN_NAME);
if (!colNames.includes("merged_id")) {
  console.log("[0] 源表已无 merged_id —— 疑似已完成重建，退出（如需强制重建先手工还原旧表）");
  await pool.end();
  process.exit(0);
}
for (const c of DROPPED_COLUMNS) {
  if (!colNames.includes(c)) fail(`源表缺少预期存在的列 ${c}，表结构与方案不符，中止`);
}
// 生成列不得引用被删列（删列后表达式失效），且生成列必须从回填清单剔除（对 STORED 生成列 INSERT 会报错）
const genCols = srcCols
  .filter((r) => r.GENERATION_EXPRESSION && r.GENERATION_EXPRESSION.trim() !== "")
  .map((r) => r.COLUMN_NAME);
for (const gc of genCols) {
  const expr = srcCols.find((r) => r.COLUMN_NAME === gc).GENERATION_EXPRESSION;
  const hit = DROPPED_COLUMNS.filter((c) => expr.includes(c));
  if (hit.length > 0) fail(`生成列 ${gc} 的表达式引用了待删列 [${hit.join(", ")}]，需先改方案`);
}
console.log(`[0] 生成列：${genCols.length > 0 ? genCols.join(", ") : "无"}（回填时自动计算，不显式插入）`);
const nonGenCols = colNames.filter((c) => c !== "id" && !DROPPED_COLUMNS.includes(c) && !genCols.includes(c));

// 排除行统计
const [[mergedStat]] = await pool.query(`SELECT COUNT(*) n FROM supplier WHERE merged_id IS NOT NULL`);
const [[testStat]] = await pool.query(`SELECT COUNT(*) n FROM supplier WHERE company = '测试'`);
console.log(`[0] 待排除行：已合并=${Number(mergedStat.n)}  测试行=${Number(testStat.n)}`);

// 残留引用预检：任何引用仍指向已合并行 → 先跑 sweep（fail-closed）；缺表记录并跳过
const missingRefTables = [];
const residualParts = [];
for (const rc of REF_COLUMNS) {
  if (!(await tableExists(rc.table))) {
    missingRefTables.push(rc.table);
    continue;
  }
  const [r] = await pool.query(
    `SELECT COUNT(*) n FROM \`${rc.table}\` t JOIN supplier s ON s.id = t.\`${rc.column}\`
      WHERE s.merged_id IS NOT NULL${rc.where}`,
  );
  if (Number(r[0].n) > 0) residualParts.push(`${rc.table}.${rc.column}=${Number(r[0].n)}`);
}
if (missingRefTables.length > 0) {
  console.log(`[0] 引用表在本库不存在（跳过相关迁移/重映射）：${[...new Set(missingRefTables)].join(", ")}`);
}
if (residualParts.length > 0) {
  fail(`仍有引用指向已合并行：${residualParts.join(", ")}。先执行 sweep-merged-refs-2026-09.mjs 再重跑本脚本`);
}
console.log("[0] 残留引用预检通过：现有引用均不指向已合并行");
/** 本库真实存在的引用表.列（吸收动作与备份只作用于这些） */
const ACTIVE_REFS = REF_COLUMNS.filter((rc) => !missingRefTables.includes(rc.table));

// 裁决表统计
let dupRows = [];
{
  const [exists] = await pool.query(
    `SELECT COUNT(*) n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
    [env.DB_NAME, REVIEW_TABLE],
  );
  if (Number(exists[0].n) > 0) {
    const [verdicts] = await pool.query(
      `SELECT verdict, COUNT(*) n FROM \`${REVIEW_TABLE}\` GROUP BY verdict`,
    );
    console.log(`[0] ${REVIEW_TABLE} 裁决分布：${verdicts.map((r) => `${r.verdict}×${Number(r.n)}`).join("  ")}`);
    [dupRows] = await pool.query(
      `SELECT supplier_id, survivor_id FROM \`${REVIEW_TABLE}\` WHERE verdict = 'duplicate'`,
    );
  } else {
    console.log(`[0] ${REVIEW_TABLE} 不存在（未跑过裁决管线），跳过 duplicate 吸收`);
  }
}
// 冲突组（信用代码/电话/邮箱/域名冲突而未裁决的）不在本脚本处理范围，行保留不动
const dupIds = dupRows.map((r) => Number(r.supplier_id));
if (dupIds.length > 0) {
  const [[pendingDup]] = await pool.query(
    `SELECT COUNT(*) n FROM supplier WHERE id IN (${dupIds.map(() => "?").join(",")}) AND (merged_id IS NULL OR merged_id = 0)`,
    dupIds,
  );
  console.log(`[0] 裁决 duplicate 待吸收=${Number(pendingDup.n)}/${dupIds.length}（其余已在此前吸收）`);
}

if (!APPLY) {
  console.log("\n[DRY-RUN] 仅预检，未写库。执行计划：");
  console.log(`  1) 吸收 ${REVIEW_TABLE} verdict='duplicate' 行（补齐保留行 + 迁移引用 + 打 merged_id）`);
  console.log(`  2) 建 ${MAP_TABLE}：merged_id IS NULL AND company <> '测试' 的行按旧 id 升序编号 1..N`);
  console.log(`  3) 建 ${NEW_TABLE}（CREATE LIKE + DROP 7 列；idx_tenant/idx_supplier_merged_id 随列自动消失）`);
  console.log("  4) 回填变换：verify_status NULL→'pending'；province='CN'→NULL；type 越域值搬 business_type；type 按 country_code 归一 foreign/domestic；business_type_code 重派生");
  console.log("  5) 校验：id 连续、逐列 NULL-safe 全等（变换列按期望值）、分值差异仅允许 province='CN' 行");
  await pool.end();
  process.exit(0);
}

// ── 1. 吸收 duplicate 行（先备份后写；幂等：已打标行自动跳过）──
fs.mkdirSync(OUT_DIR, { recursive: true });
const backup = { generatedAt: new Date().toISOString(), reviewTable: REVIEW_TABLE, absorbed: [], survivorPatches: [], refMoves: [], droppedConflicts: [] };

//  survivor 链解析：survivor 自己也被判 duplicate 时追到根
function resolveSurvivor(id) {
  const seen = new Set();
  let cur = id;
  while (true) {
    if (seen.has(cur)) fail(`duplicate 链成环：${[...seen, cur].join(" -> ")}`);
    seen.add(cur);
    const row = dupRows.find((r) => Number(r.supplier_id) === cur);
    if (!row) return cur;
    cur = Number(row.survivor_id);
    if (seen.size > 50) fail(`duplicate 链过深（>${seen.size}），人工核查 ${REVIEW_TABLE}`);
  }
}

async function snapshotRows(table, column, ids) {
  if (ids.length === 0) return [];
  const [rows] = await pool.query(`SELECT * FROM \`${table}\` WHERE \`${column}\` IN (${ids.map(() => "?").join(",")})`, ids);
  return rows;
}

let absorbedNow = 0;
for (const row of dupRows) {
  const dup = Number(row.supplier_id);
  const surv = resolveSurvivor(dup);
  if (dup === surv) continue;

  const [[dupLive]] = await pool.query(`SELECT * FROM supplier WHERE id = ?`, [dup]);
  if (!dupLive || (dupLive.merged_id !== null && Number(dupLive.merged_id) !== 0)) continue; // 已吸收
  const [[survLive]] = await pool.query(`SELECT * FROM supplier WHERE id = ?`, [surv]);
  if (!survLive) fail(`duplicate 行 #${dup} 的 survivor #${surv} 不存在，人工核查`);

  // 备份写前快照（缺表跳过）
  const dupRefs = {};
  for (const rc of ACTIVE_REFS) {
    dupRefs[`${rc.table}.${rc.column}`] = await snapshotRows(rc.table, rc.column, [dup]);
  }
  backup.absorbed.push({ dup, survivor: surv, supplierRow: dupLive, refs: dupRefs });
  backup.survivorPatches.push({ id: surv, before: survLive });

  // ① FILLABLE 空字段补齐（公司名/枚举类不动）
  for (const f of FILLABLE) {
    const blank = survLive[f] === null || survLive[f] === undefined || String(survLive[f]).trim() === "";
    const donorVal = dupLive[f];
    const hasDonor = donorVal !== null && donorVal !== undefined && String(donorVal).trim() !== "";
    if (blank && hasDonor) {
      await pool.query(`UPDATE supplier SET \`${f}\` = ? WHERE id = ?`, [donorVal, surv]);
      survLive[f] = donorVal;
    }
  }
  // ② verify_status 升级：任一方 done 且保留行非 done/rejected → done
  if ((dupLive.verify_status === "done" || survLive.verify_status === "done") &&
      survLive.verify_status !== "done" && survLive.verify_status !== "rejected") {
    await pool.query(`UPDATE supplier SET verify_status = 'done' WHERE id = ?`, [surv]);
    survLive.verify_status = "done";
  }
  // ③ 引用迁移（sweep-merged-refs 同款，仅作用于本库存在的表；diagnosis/translations 有
  //    唯一键冲突时归档后删除冲突行，保留行侧为准）
  for (const rc of ACTIVE_REFS) {
    if (rc.table === "crm_supplier_unspsc_interests") {
      // 画像表：复制到保留行（撞唯一键则弃置）后删原行
      const [intRows] = await pool.query(
        `SELECT * FROM crm_supplier_unspsc_interests WHERE supplier_table='supplier' AND supplier_id = ?`, [dup],
      );
      for (const r of intRows) {
        const cols = Object.keys(r).filter((k) => k !== "id");
        await pool.query(
          `INSERT INTO crm_supplier_unspsc_interests (${cols.map(q).join(",")})
           VALUES (${cols.map(() => "?").join(",")})
           ON DUPLICATE KEY UPDATE \`code\` = \`code\``,
          cols.map((c) => r[c]),
        );
      }
      if (intRows.length > 0) {
        await pool.query(`DELETE FROM crm_supplier_unspsc_interests WHERE supplier_table='supplier' AND supplier_id = ?`, [dup]);
      }
      backup.refMoves.push({ dup, table: rc.table, rows: intRows.length });
      continue;
    }
    if (rc.table === "crm_user_supplier_pool" && rc.column === "supplier_id") {
      // 资源库：先删同用户对保留行的重复收藏，再改指向
      await pool.query(
        `DELETE p1 FROM crm_user_supplier_pool p1
          JOIN crm_user_supplier_pool p2 ON p2.user_id = p1.user_id AND p2.supplier_id = ?
         WHERE p1.supplier_id = ?`, [surv, dup],
      );
    }
    try {
      await pool.query(
        `UPDATE \`${rc.table}\` SET \`${rc.column}\` = ? WHERE \`${rc.column}\` = ?${rc.where}`,
        [surv, dup],
      );
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        // 唯一键冲突（crm_supplier_diagnosis: uk_user_supplier / crm_supplier_translations: uk_supplier_lang）
        // 保留行已有同键记录 → 被吸收行的这条归档后删除
        const [rows2] = await pool.query(`SELECT * FROM \`${rc.table}\` WHERE \`${rc.column}\` = ?`, [dup]);
        backup.droppedConflicts.push({ table: rc.table, column: rc.column, dup, survivor: surv, rows: rows2 });
        await pool.query(`DELETE FROM \`${rc.table}\` WHERE \`${rc.column}\` = ?`, [dup]);
      } else throw err;
    }
  }
  // ④ 打合并标记（排除口径与历史机制一致：merged_id IS NOT NULL）
  await pool.query(`UPDATE supplier SET merged_id = ? WHERE id = ?`, [surv, dup]);
  absorbedNow += 1;
  console.log(`[1] 吸收 #${dup} → 保留行 #${surv}`);
}

if (dupIds.length === 0) console.log("[1] 无 duplicate 裁决需要吸收");
else console.log(`[1] 本轮吸收 ${absorbedNow}/${dupIds.length} 行`);

// ── 2. 映射表（入选行 = 未合并 且 非测试）──
const eligibleWhere = `merged_id IS NULL AND company <> '测试'`;
const [[eligibleStat]] = await pool.query(`SELECT COUNT(*) n FROM supplier WHERE ${eligibleWhere}`);
console.log(`[2] 入选行（干净行）=${Number(eligibleStat.n)}（排除已合并与测试行后）`);
if (Number(eligibleStat.n) === 0) fail("入选行为 0，中止");

if (DELTA) {
  const [[mapped]] = await pool.query(`SELECT COUNT(*) n FROM \`${MAP_TABLE}\``);
  console.log(`[2] DELTA 模式：idmap 已有 ${Number(mapped.n)} 行，追加未映射的入选行`);
  const [[nextId]] = await pool.query(`SELECT COALESCE(MAX(new_id),0) m FROM \`${MAP_TABLE}\``);
  await pool.query(
    `INSERT INTO \`${MAP_TABLE}\` (old_id, new_id, company)
     SELECT id, (? + ROW_NUMBER() OVER (ORDER BY id)), company
       FROM supplier s
      WHERE ${eligibleWhere}
        AND NOT EXISTS (SELECT 1 FROM \`${MAP_TABLE}\` m WHERE m.old_id = s.id)`,
    [Number(nextId[0].m)],
  );
} else {
  await pool.query(`DROP TABLE IF EXISTS \`${MAP_TABLE}\``);
  await pool.query(`
    CREATE TABLE \`${MAP_TABLE}\` (
      old_id  INT UNSIGNED NOT NULL COMMENT '原 supplier.id',
      new_id  INT UNSIGNED NOT NULL COMMENT '影子表 id（1..N 连续）',
      company VARCHAR(200)  NULL COMMENT '冗余公司名，人工核对用',
      PRIMARY KEY (old_id),
      UNIQUE KEY uk_new_id (new_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      COMMENT='supplier id 重排映射表（阶段一产物）：阶段二据此级联改写所有指向 supplier.id 的列'
  `);
  await pool.query(
    `INSERT INTO \`${MAP_TABLE}\` (old_id, new_id, company)
     SELECT id, ROW_NUMBER() OVER (ORDER BY id), company FROM supplier WHERE ${eligibleWhere}`,
  );
}
const [[mapStat]] = await pool.query(`SELECT COUNT(*) n, MIN(new_id) mn, MAX(new_id) mx FROM \`${MAP_TABLE}\``);
console.log(`[2] 映射表：${Number(mapStat.n)} 行，new_id ${Number(mapStat.mn)}..${Number(mapStat.mx)}`);
if (Number(mapStat.n) !== Number(mapStat.mx)) fail("new_id 不连续");

// ── 3. 影子表（CREATE LIKE 保真 + 删 6 列 + 收敛索引）──
if (!DELTA) {
  await pool.query(`DROP TABLE IF EXISTS \`${NEW_TABLE}\``);
  await pool.query(`CREATE TABLE \`${NEW_TABLE}\` LIKE supplier`);
  // 逐列 DROP（列名来自白名单常量，无注入面）；idx_tenant / idx_supplier_merged_id 随列自动消失
  for (const c of DROPPED_COLUMNS) {
    await pool.query(`ALTER TABLE \`${NEW_TABLE}\` DROP COLUMN \`${c}\``);
  }
}
console.log(`[3] 影子表 ${NEW_TABLE} 就绪（${DELTA ? "DELTA 复用" : "CREATE LIKE 后删 6 列"}）`);

// ── 4. 回填（含行级变换；DELTA 只补未拷贝行）──
const transformExpr = {
  verify_status: "COALESCE(s.`verify_status`, 'pending')",
  province: "NULLIF(s.`province`, 'CN')",
  type: "CASE WHEN COALESCE(s.`country_code`,'') IN ('','CN') THEN 'domestic' ELSE 'foreign' END",
  business_type:
    "CASE WHEN (s.`business_type` IS NULL OR s.`business_type` = '') AND s.`type` IS NOT NULL AND s.`type` NOT IN ('foreign','domestic') THEN s.`type` ELSE s.`business_type` END",
};
const colList = nonGenCols.map(q).join(", ");
const colSelect = nonGenCols.map((c) => transformExpr[c] ?? `s.\`${c}\``).join(", ");
{
  const copiedClause = DELTA
    ? ` AND NOT EXISTS (SELECT 1 FROM ${NEW_TABLE} n WHERE n.id = m.new_id)`
    : "";
  // 幂等：非 DELTA 时新表刚建为空；DELTA 时只补缺失行（idmap 保证 id 唯一，无需 IGNORE，
  // 也不能用 IGNORE——严格模式下它会把非法枚举/超长值静默降级为空值）
  const [ret] = await pool.query(
    `INSERT INTO \`${NEW_TABLE}\` (id, ${colList})
     SELECT m.new_id, ${colSelect}
       FROM supplier s JOIN \`${MAP_TABLE}\` m ON m.old_id = s.id
      WHERE 1=1${copiedClause}
      ORDER BY s.id`,
  );
  console.log(`[4] 回填影响行数=${ret.affectedRows}`);
}
// business_type_code 重派生（仅 business_type 非空而枚举缺失的行；与 dimensions.ts 同规则）
{
  const [needDerive] = await pool.query(
    `SELECT id, business_type FROM \`${NEW_TABLE}\`
      WHERE business_type_code IS NULL AND business_type IS NOT NULL AND business_type <> ''`,
  );
  let derived = 0;
  for (const r of needDerive) {
    const code = normalizeBusinessType(r.business_type);
    if (!code) continue;
    await pool.query(`UPDATE \`${NEW_TABLE}\` SET business_type_code = ? WHERE id = ?`, [code, r.id]);
    derived += 1;
  }
  console.log(`[4] business_type_code 派生 ${derived} 行`);
}

// ── 5. 校验 ──
const [[newStat]] = await pool.query(
  `SELECT COUNT(*) total, MIN(id) min_id, MAX(id) max_id, COUNT(DISTINCT id) dis FROM \`${NEW_TABLE}\``,
);
console.log(`[5] 影子表行数=${Number(newStat.total)} id=${Number(newStat.min_id)}..${Number(newStat.max_id)}`);
if (Number(newStat.total) !== Number(mapStat.n)) fail(`影子表行数 ${newStat.total} ≠ idmap 行数 ${mapStat.n}`);
if (Number(newStat.min_id) !== 1) fail(`id 未从 1 起始（min=${newStat.min_id}）`);
if (Number(newStat.max_id) !== Number(newStat.total)) fail(`id 不连续（max=${newStat.max_id}）`);
if (Number(newStat.dis) !== Number(newStat.total)) fail("id 重复");

// 逐列 NULL-safe 全等：变换列按"变换后的期望值"比，其余列原值比
const cmpConds = nonGenCols.map((c) => {
  const expect = transformExpr[c] ? transformExpr[c].replaceAll("s.", "u.") : `u.\`${c}\``;
  return `NOT (n.\`${c}\` <=> (${expect}))`;
});
const [[mismatch]] = await pool.query(
  `SELECT COUNT(*) bad
     FROM supplier u
     JOIN \`${MAP_TABLE}\` m ON m.old_id = u.id
     JOIN \`${NEW_TABLE}\` n ON n.id = m.new_id
    WHERE ${cmpConds.join(" OR ")}`,
);
if (Number(mismatch.bad) !== 0) fail(`${mismatch.bad} 行逐列比对不一致，影子表数据不可信`);
console.log(`[5] 逐列比对 0 差异（${nonGenCols.length} 列，含 4 个变换列按期望值）`);

// 分值守恒：唯一允许的分差是 province='CN' 被置 NULL 的行（原值虚高 5 分档）
const [[scoreBad]] = await pool.query(
  `SELECT COUNT(*) bad
     FROM supplier u
     JOIN \`${MAP_TABLE}\` m ON m.old_id = u.id
     JOIN \`${NEW_TABLE}\` n ON n.id = m.new_id
    WHERE NOT (n.data_quality_score <=> u.data_quality_score)
      AND NOT (u.province <=> 'CN')`,
);
if (Number(scoreBad.bad) !== 0) fail(`${scoreBad.bad} 行资料完整度分值在预期之外变化`);
{
  const [[provRows]] = await pool.query(
    `SELECT COUNT(*) n FROM supplier u
       JOIN \`${MAP_TABLE}\` m ON m.old_id = u.id
      WHERE u.province <=> 'CN'`,
  );
  console.log(`[5] 分值守恒通过（province='CN' 修复行 ${Number(provRows.n)} 行分值下降属预期）`);
}

// AUTO_INCREMENT 收口
{
  const [[aiRow]] = await pool.query(`SELECT AUTO_INCREMENT ai FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`, [env.DB_NAME, NEW_TABLE]);
  const expected = Number(newStat.total) + 1;
  if (Number(aiRow.ai) !== expected) {
    await pool.query(`ALTER TABLE \`${NEW_TABLE}\` AUTO_INCREMENT = ${expected}`);
    console.log(`[5] AUTO_INCREMENT 由 ${Number(aiRow.ai)} 修正为 ${expected}`);
  } else {
    console.log(`[5] AUTO_INCREMENT=${expected}（正确）`);
  }
}

// 备份落盘
const backupPath = path.join(OUT_DIR, `supplier-shadow-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`[5] 吸收动作备份 → ${backupPath}（吸收 ${backup.absorbed.length} 行 / 冲突归档 ${backup.droppedConflicts.length} 条）`);

console.log(`\n✅ 阶段一完成：${NEW_TABLE}（${nonGenCols.length + genCols.length + 1} 列、id 1..${Number(newStat.total)}）与 ${MAP_TABLE} 就绪，supplier 本体仅发生 duplicate 吸收写。`);
console.log("   下一步：阶段二 supplier-shadow-phase2-align.mjs 级联改写下游引用 → 阶段三 phase3 原子 RENAME。");
await pool.end();
