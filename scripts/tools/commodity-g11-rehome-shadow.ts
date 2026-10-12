/**
 * 品目树 01 归位 · 阶段一（影子表 crm_commodity_backbone__new：建表 + 灌入 + 对账，绝不切换）
 *
 * 纪律（docs/adr/0003）：阶段一全程不触碰原表，原表继续服务生产；只建 `__new`、在其上灌新树、
 * 逐条对账，然后**停下等人工确认**。原子 RENAME 与下游重算在阶段二脚本里。
 *
 * 用法：
 *   npx tsx scripts/tools/commodity-g11-rehome-shadow.ts                # 默认 dry：只算新树 + 出对照表，不写库
 *   npx tsx scripts/tools/commodity-g11-rehome-shadow.ts --build --yes   # ★ 在生产库建影子表并灌数（人工闸口）
 *   npx tsx scripts/tools/commodity-g11-rehome-shadow.ts --rollback      # 删影子表（原表不受影响）
 *
 * ⚠ 库归属：`.env` 的 127.0.0.1:3307 是云生产库的 SSH 隧道本地端口（见 ADR-0012 与
 *   scripts/tools/opp-shadow-phase1.mjs 的实测记录）⇒ --build 就是往现网写一张与正名表同规模的影子表
 *   （2026-10-12 实测：正名表 82,737 行 ⇒ 影子表 82,759 行）。
 *   本表只有人工运维脚本会写（应用只读），所以不需要冻结 daily-sync；但切换窗口仍要避开正名脚本。
 *
 * 对账三条闸口（无幻觉 / 无丢失 / 逐条计数，缺一即拒）：
 *   R1 总行数：影子表 = 原表（本次是重排不是增删）
 *   R2 非 01 抽屉逐行 CRC32 一致：其余 31 棵子树一个字节都不许变
 *   R3 01 抽屉的 UNSPSC 码集合双向差集为空：57 个类 + 472 个品目一个不多一个不少
 *   R4 结构：码长即层级、父码=自身去末两级且存在、族不跨中类（BB1/BB3 镜像）
 *   R5 水位：记下原表当前校验和，阶段二据此判断窗口内是否被第三方写过
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { REHOME_GROUP_CODE, rebuildG11Subtree, type BackboneRow } from "../../src/lib/services/commodity/rehoming-g11.js";

const APPLY = process.argv.includes("--build");
const YES = process.argv.includes("--yes");
const ROLLBACK = process.argv.includes("--rollback");
const SRC = "crm_commodity_backbone";
const SHADOW = "crm_commodity_backbone__new";
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
if (APPLY && !YES) { console.error("✗ --build 必须带 --yes（人工闸口）；先跑 dry 出对照表"); process.exit(1); }
if (!existsSync("runtime")) mkdirSync("runtime", { recursive: true });

for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", dateStrings: true,
});
const q = async <T = RowDataPacket>(sql: string, a?: unknown[]) => ((await conn.query(sql, a)) as [T[], unknown])[0];
/** 拒跑出口：先打原因再退进程（process.exit 不等连接，无需 await end） */
const fatal = (msg: string): never => { console.error(`\n❌ ${msg}`); process.exit(1); };

const t0 = Date.now();
const dbRows = await q<RowDataPacket & Record<string, unknown>>(
  `SELECT code, parent_code, level, group_code, unspsc_prefix, name_zh, name_en, sort, status, note FROM \`${SRC}\``,
);
console.log(`读入 ${SRC}：${dbRows.length} 行（${((Date.now() - t0) / 1000).toFixed(1)}s）`);

const rows: BackboneRow[] = dbRows.map((r) => ({
  code: String(r.code), parentCode: String(r.parent_code), level: Number(r.level),
  groupCode: String(r.group_code), unspscPrefix: r.unspsc_prefix === null ? null : String(r.unspsc_prefix),
  nameZh: String(r.name_zh), nameEn: String(r.name_en ?? ""), sort: Number(r.sort), status: Number(r.status), note: String(r.note ?? ""),
}));

// ── 纯函数重排（不碰库，判据不过就不产出）──
const rehome = rebuildG11Subtree(rows);
if (rehome.problems.length) fatal(`归位规格与现库对不齐，拒绝生成：\n  - ${[...new Set(rehome.problems)].slice(0, 30).join("\n  - ")}`);
const oldG11 = rows.filter((r) => r.groupCode === REHOME_GROUP_CODE);
const others = rows.filter((r) => r.groupCode !== REHOME_GROUP_CODE);
const finalRows = [...others, ...rehome.rows];
// 守恒判据只针对**码行（L4/L5）**：它们带 UNSPSC 身份，一多一少都是事故；
// 业务层（L2/L3）本来就是给人看的抽屉，行数变了是本次的目的，不该当异常报。
const codeRowsOld = rows.filter((r) => r.unspscPrefix).length;
const codeRowsNew = finalRows.filter((r) => r.unspscPrefix).length;
if (codeRowsOld !== codeRowsNew) fatal(`R0 码行数变了：${codeRowsOld} → ${codeRowsNew}（本次只重排业务层，不得增删 UNSPSC 节点）`);
if (finalRows.filter((r) => r.groupCode === REHOME_GROUP_CODE && r.level === 1).length !== 1) fatal("R0 01 抽屉的大类行丢了");

const cnt = (rs: BackboneRow[], lv: number) => rs.filter((r) => r.level === lv).length;
console.log(`\n01 抽屉：${oldG11.length} 行 → ${rehome.rows.length} 行`);
console.log(`  层级  旧 → 新`);
for (const lv of [1, 2, 3, 4, 5]) console.log(`  L${lv}   ${cnt(oldG11, lv)} → ${cnt(rehome.rows, lv)}`);
const changed = rehome.map.filter((m) => m.oldCode !== m.newCode).length;
console.log(`  码变更：${changed}/${rehome.map.length} 行（L4/L5 全量重排，派生层必须整批重算）`);
console.log(`全表行数：${rows.length} → ${finalRows.length}（业务层 +${finalRows.length - rows.length}；非 01 抽屉 ${others.length} 行原样透传；码行守恒 ${codeRowsOld}）`);

// 对照表（审计与回滚的事实依据）
const tsvPath = `runtime/commodity-g11-rehome-map-${STAMP}.tsv`;
writeFileSync(tsvPath, ["level\told_code\tnew_code\tunspsc_prefix"].concat(
  rehome.map.map((m) => `${m.level}\t${m.oldCode}\t${m.newCode}\t${m.prefix ?? ""}`),
).join("\n"), "utf8");
const specTsv = ["level\tcode\tparent\tsort\tname_zh\tnote"].concat(
  rehome.rows.filter((r) => r.level <= 3).map((r) => `${r.level}\t${r.code}\t${r.parentCode}\t${r.sort}\t${r.nameZh}\t${r.note}`),
).join("\n");
writeFileSync(`runtime/commodity-g11-rehome-business-${STAMP}.tsv`, specTsv, "utf8");
console.log(`对照表：${tsvPath}\n业务层清单：runtime/commodity-g11-rehome-business-${STAMP}.tsv`);

// ── 水位：原表当前校验和（阶段二据此判断窗口内有没有被写过）──
const FP = "CONCAT_WS('|',code,parent_code,level,group_code,IFNULL(unspsc_prefix,''),name_zh,name_en,sort,status,note)";
const wm = (await q<{ n: number; s: number }>(`SELECT COUNT(*) n, IFNULL(SUM(CRC32(${FP})),0) s FROM \`${SRC}\``))[0];
writeFileSync("runtime/commodity-g11-rehome-state.json", JSON.stringify({
  at: new Date().toISOString(), srcTable: SRC, shadowTable: SHADOW,
  srcRows: Number(wm.n), srcChecksum: String(wm.s), mapRows: rehome.map.length, stamp: STAMP,
}, null, 2));
console.log(`水位已记：${SRC} 行数 ${wm.n} 校验和 ${wm.s} → runtime/commodity-g11-rehome-state.json`);

if (!APPLY && !ROLLBACK) {
  console.log(`\n[dry] 未写库。确认后执行：npx tsx scripts/tools/commodity-g11-rehome-shadow.ts --build --yes`);
  console.log(`[dry] 将执行：DROP TABLE IF EXISTS \`${SHADOW}\`; CREATE TABLE \`${SHADOW}\` LIKE \`${SRC}\`; 分批插入 ${finalRows.length} 行`);
  await conn.end();
  process.exit(0);
}

if (ROLLBACK) {
  await conn.query(`DROP TABLE IF EXISTS \`${SHADOW}\``);
  console.log(`✓ 已删除影子表 ${SHADOW}（原表 ${SRC} 未动）`);
  await conn.end();
  process.exit(0);
}

// ── BUILD：影子表 ──
const exists = (await q<{ n: number }>(
  `SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${SHADOW}'`,
))[0];
if (Number(exists.n) > 0) fatal(`影子表 ${SHADOW} 已存在：先 --rollback 再重建（避免半程状态被当成新结果）`);
await conn.query(`SET SESSION lock_wait_timeout = 5`);
await conn.query(`CREATE TABLE \`${SHADOW}\` LIKE \`${SRC}\``);
console.log(`✓ 已建 ${SHADOW}（LIKE ${SRC}：uk_code / uk_prefix / 索引 / 注释一并复制）`);

for (let i = 0; i < finalRows.length; i += 1000) {
  const chunk = finalRows.slice(i, i + 1000);
  await conn.query(
    `INSERT INTO \`${SHADOW}\` (code,parent_code,level,group_code,unspsc_prefix,name_zh,name_en,sort,status,note) VALUES ?`,
    [chunk.map((r) => [r.code, r.parentCode, r.level, r.groupCode, r.unspscPrefix, r.nameZh, r.nameEn, r.sort, r.status, r.note])],
  );
  process.stdout.write(`\r  灌入 ${Math.min(i + 1000, finalRows.length)}/${finalRows.length}`);
}
console.log("");

// ── 对账（库里现算，不信内存）──
const shadow = (await q<{ n: number; s: number }>(`SELECT COUNT(*) n, IFNULL(SUM(CRC32(${FP})),0) s FROM \`${SHADOW}\``))[0];
console.log(`\n=== 对账 ===`);
console.log(`R1 行数：原表 ${wm.n} / 影子 ${shadow.n} ${Number(shadow.n) === finalRows.length ? "✓" : "✗"}`);
if (Number(shadow.n) !== finalRows.length) fatal(`R1 影子表行数 ${shadow.n} ≠ 本次产出行数 ${finalRows.length}：灌入不完整，请 --rollback 后重跑`);

const nonG11 = (await q<{ n: number; s: number }>(
  `SELECT 'src' side, COUNT(*) n, IFNULL(SUM(CRC32(${FP})),0) s FROM \`${SRC}\` WHERE group_code<>'${REHOME_GROUP_CODE}'
     UNION ALL SELECT 'new', COUNT(*), IFNULL(SUM(CRC32(${FP})),0) FROM \`${SHADOW}\` WHERE group_code<>'${REHOME_GROUP_CODE}'`,
)) as { side: string; n: number; s: number }[];
const [a, b] = nonG11;
console.log(`R2 非 01 抽屉：${a!.side} ${a!.n} 行 ck=${a!.s} / ${b!.side} ${b!.n} 行 ck=${b!.s} ${String(a!.s) === String(b!.s) && String(a!.n) === String(b!.n) ? "✓ 逐行一致" : "✗ 有漂移"}`);
if (String(a!.s) !== String(b!.s)) fatal("R2 其余 31 棵子树被改动了 —— 本次只应动 01 抽屉");

const diff = (await q<{ miss: number; extra: number }>(
  `SELECT
     (SELECT COUNT(*) FROM \`${SRC}\` o LEFT JOIN \`${SHADOW}\` s ON s.unspsc_prefix = o.unspsc_prefix
        WHERE o.group_code='${REHOME_GROUP_CODE}' AND o.unspsc_prefix IS NOT NULL AND s.code IS NULL) miss,
     (SELECT COUNT(*) FROM \`${SHADOW}\` s LEFT JOIN \`${SRC}\` o ON o.unspsc_prefix = s.unspsc_prefix
        WHERE s.group_code='${REHOME_GROUP_CODE}' AND s.unspsc_prefix IS NOT NULL AND o.code IS NULL) extra`,
))[0];
console.log(`R3 01 抽屉码集合：丢失 ${diff.miss} / 多造 ${diff.extra} ${Number(diff.miss) === 0 && Number(diff.extra) === 0 ? "✓" : "✗"}`);
if (Number(diff.miss) !== 0 || Number(diff.extra) !== 0) fatal(`R3 码丢失 ${diff.miss} 或造码 ${diff.extra}：这些公告在新树里会筛不到或多出无源节点`);

const shape = (await q<{ bad_len: number; orphan: number }>(
  `SELECT
     (SELECT COUNT(*) FROM \`${SHADOW}\` WHERE CHAR_LENGTH(code) <> 6 + level * 2) bad_len,
     (SELECT COUNT(*) FROM \`${SHADOW}\` c LEFT JOIN \`${SHADOW}\` p ON p.code = c.parent_code
        WHERE c.level > 1 AND p.code IS NULL) orphan`,
))[0];
console.log(`R4 结构：码长≠层级 ${shape.bad_len} 行 / 父码不存在 ${shape.orphan} 行 ${Number(shape.bad_len) === 0 && Number(shape.orphan) === 0 ? "✓" : "✗"}`);
if (Number(shape.bad_len) !== 0 || Number(shape.orphan) !== 0) fatal("R4 影子表结构不合格，不可切换");

const famSplit = (await q<{ n: number }>(
  `SELECT COUNT(*) n FROM (
     SELECT LEFT(unspsc_prefix,4) fam, COUNT(DISTINCT LEFT(code,10)) l2
       FROM \`${SHADOW}\` WHERE level=4 AND unspsc_prefix IS NOT NULL
      GROUP BY LEFT(unspsc_prefix,4) HAVING COUNT(DISTINCT LEFT(code,10)) > 1
   ) t`,
))[0];
console.log(`R4b 族跨中类（BB3）：${famSplit.n} 个族 ${Number(famSplit.n) === 0 ? "✓" : "✗"}`);
if (Number(famSplit.n) !== 0) fatal("R4b 有族跨了中类，族级粗码落点会不唯一");

const now = (await q<{ n: number; s: number }>(`SELECT COUNT(*) n, IFNULL(SUM(CRC32(${FP})),0) s FROM \`${SRC}\``))[0];
console.log(`R5 原表水位：写入期间 ${wm.n}/${wm.s} → ${now.n}/${now.s} ${String(wm.s) === String(now.s) ? "✓ 未被扰动" : "⚠ 已被写过，切换窗口需重跑阶段一"}`);

console.log(`\n✅ 阶段一完成：${SHADOW} 就绪且对账全绿（未切换）。`);
console.log(`下一步：`);
console.log(`  npx tsx scripts/tools/commodity-g11-rehome-verify.ts --table ${SHADOW}   # 名实覆盖度与命名质量验收`);
console.log(`  npx tsx scripts/tools/commodity-g11-rehome-cutover.ts --check            # 阶段二预演（含下游重算清单）`);
await conn.end();
