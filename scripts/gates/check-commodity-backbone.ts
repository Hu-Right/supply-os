/**
 * 品目树门禁 BB1~BB14（单表结构版）
 *
 * @script scripts/gates/check-commodity-backbone.ts
 * @assertions
 *   BB1 码长即层级：UGT-B- 后 2/4/6/8/10 位对应 L1~L5；父码=自身去末两级且存在；每父子数 ≤ 99；名非空
 *   BB2 码全覆盖：本表带 6 位前缀的行数 = 原树类数、带 8 位 = 原树品目数，且逐码在原树里存在（一个不多一个不少）
 *      ↳ 与旧树互比的部分只在旧树还在库里时执行；旧树下线后靠树内自洽断言 + BB7 逐码对树
 *   BB3 归属可推导且唯一：同一个族的所有类行必须落在同一个中类下；同一个段的所有族必须落在同一个大类下
 *   BB4 大类连续：节点 group_code = 祖先 group_code = 常量按段推出的所属大类（段归属表退役后直接对常量）
 *   BB5 五级齐：L1 恰 32 行且 parent 为空串，L1~L5 每级都有行；同名兄弟只 WARN
 *   BB6 原树未被触碰：crm_commodity_nodes 行数 = 158,707，两表码域互斥（旧树已删则无对象，只打印跳过）
 *   BB7 公告已在新树找到家：宽表 backbone_path 与桥表闭合（可算必填、无码必空）、
 *      列内码全部存在于树、排序后首码必为大类行（祖先全存的不变量）
 *      ↳ 「可算」= 拿同一份纯函数对当前树重算能出节点；全码都换不出的公告列为 NULL 是预期（以树为准），只报数不计红
 *   BB8 旧树零引用（静态）：src/** 不得出现 FROM/JOIN crm_commodity_nodes* —— 这是「旧树可以删」的机器证明
 *      ↳ 后缀走 \w* ：旧树 RENAME 后的退役表照样算引用（带自检，防改名豁免）
 *   BB9 族级落点分档：拿纯函数逐族试挂粗码，L2/L3/L4 三档必须都有落点 —— 防「最深可证实唯一」被改回一刀切
 *      ↳ 覆盖率类断言抓不到退化（一刀切也是 100%），只有落点层数能叫出来
 *   BB10 列值可由纯函数重算：抽样公告从桥表码重算节点码集，与宽表 backbone_path 逐条比对，差异必须 0
 *   BB11 precise_backbone_path 同口径可重算：同一份纯函数、另一张码表（商机 approved 候选码），全量对拍
 *   BB12 偏好表的大类码齐备且对得上骨架 L1 —— 可见性判定的输入，缺行就是把付费用户静默放行
 *   BB13 退役不变量：不得留下 crm_commodity_nodes_retired_* 这种「改名改一半」的中间态（直接红）；
 *      ↳ 原树名本身在场只 WARN（回滚演练合法），否则真回滚时这条断言会把跨树对账一起误杀
 *   BB14 节点码倒排表是 backbone_path 的行化镜像：总行数 = 列值 token 总数、公告数闭合、
 *      不留残行、形制合法、抽样 300 条逐集合对拍（COUNT + SUM(CRC32)）差异必须 0
 *      ↳ 表未建只 WARN：建表是人工闸口（scripts/ops/commodity-notice-nodes-ddl.ts），
 *        但读侧一旦切到倒排表，这条就必须转绿 —— 它也是上线清单里的那一项
 *   BB15 落点表是 backbone_path 的事实源（UNSPSC 全面退役 R1）：落点全在树、
 *      同一公告的落点互不为祖先（全表不抽样）、列值 = 落点闭包（抽两头）、
 *      与宽表双向闭合（有列值必有落点行、有落点行必有列值）
 *      ↳ 表未建只 WARN（建表是人工闸口 scripts/ops/notice-attribution-ddl.ts）；
 *        R2 把读侧切到落点表后，WARN 转绿是上线清单的一项
 * @limits 静态部分必须能在无 MySQL 的 CI 里跑；--db 是本地/发布前闸口。
 * @usage  npm run check:backbone     或     npx tsx scripts/gates/check-commodity-backbone.ts --db
 * @see    docs/superpowers/specs/2026-10-11-commodity-backbone-5level-design.md
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMODITY_GROUPS } from "../../src/lib/services/commodity/groups";
import { ACTIVE_NOTICE_WHERE } from "../../src/lib/utils/notice-expired";
import { loadBackboneIndex, toBackbonePathColumn, type BackboneIndex } from "../../src/lib/services/commodity/backbone-path";
import { pathOfLandingNodes } from "../../src/lib/services/commodity/attribution";

const DB = process.argv.includes("--db");
const EXPECT_ORIG_ROWS = 158707; // 原树：本次边界是「一行不动」

const fails: string[] = [];
const warns: string[] = [];
const fail = (m: string) => fails.push(m);

if (COMMODITY_GROUPS.length !== 32) fail(`BB0 大类常量数=${COMMODITY_GROUPS.length}，应为 32`);
const segToGroup = new Map<string, string>();
for (const g of COMMODITY_GROUPS) for (const p of g.prefixes) segToGroup.set(p, g.code);

// ── BB8 旧树零引用（静态，无库也能跑；CI 与本地同一道闸）──
// 只抓 SQL 语境（FROM / JOIN + 表名），不把注释里的历史提及算违规；
// 一旦出现，说明消费侧又回退到旧树，旧树就不能删了 —— 这条断言就是删除前置条。
// 表名后缀用 \w* 而不是 \b：旧树已 RENAME 为 crm_commodity_nodes_retired_20261011，
// 而 `_` 在正则里是单词字符 —— 拿 \b 收尾会让改名等于豁免，读退役表照样绿（静默失效）。
// 库名限定（FROM crm.crm_commodity_nodes…）同样要拓住，否则换个写法就躲过扫描。
const LEGACY_RE = /\b(?:FROM|JOIN)\s+`?(?:\w+`?\.)?`?crm_commodity_nodes\w*\b/i;
// 断言自身不许哑火：三条自检分别钉住「改名不豁免」「库名限定不豁免」「不误伤新树」
if (!LEGACY_RE.test("SELECT 1 FROM crm_commodity_nodes_retired_20261011")) {
  fail("BB8 自检失败：正则匹配不到改名后的旧树表，这条断言已哑火");
}
if (!LEGACY_RE.test("SELECT 1 FROM crm.crm_commodity_nodes_retired_20261011")) {
  fail("BB8 自检失败：带库名限定的旧树表名没被抓到");
}
// 反例样本换成仍在场的表：大类维表族（crm_commodity_groups / crm_commodity_group_segments）已按 ADR-0008/0009 先后退役
if (LEGACY_RE.test("SELECT 1 FROM crm_commodity_backbone") || LEGACY_RE.test("SELECT 1 FROM crm_notice_search")) {
  fail("BB8 自检失败：正则把新树/宽表误判成旧树");
}
const srcFiles: string[] = [];
const walkSrc = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkSrc(p);
    else if (/\.(ts|tsx)$/.test(name)) srcFiles.push(p);
  }
};
try {
  walkSrc(fileURLToPath(new URL("../../src", import.meta.url)));
  const hits = srcFiles.filter((f) => LEGACY_RE.test(readFileSync(f, "utf8")));
  if (hits.length) fail(`BB8 src 里还有 ${hits.length} 个文件用 SQL 读旧树 crm_commodity_nodes（含改名后的退役表）：${hits.map((h) => h.split(/[\\/]/).slice(-2).join("/")).join("、")} ⇒ 旧树不可删`);
} catch {
  // src 目录读不到（奇异检出环境）：不阻断，但必须叫出来，不能让断言静默失效
  console.log("⚠ BB8 未能扫描 src（目录不可读），旧树引用断言本次未执行");
}

if (!DB) {
  console.log(`静态：大类 32 / 五级码长 2-4-6-8-10 位 / 期望原树行数 ${EXPECT_ORIG_ROWS} / src 旧树引用已扫 ${srcFiles.length} 个文件`);
  if (fails.length) { console.error(`✗ ${fails.join("；")}`); process.exit(1); }
  console.log("✓ 静态部分通过（库内断言请加 --db）");
  process.exit(0);
}

const mysql = (await import("mysql2/promise")).default;
for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? "crm", charset: "utf8mb4", dateStrings: true,
});
type R = Record<string, string | number | null>;
const q = async (sql: string, a?: unknown[]) => ((await pool.query(sql, a)) as [R[], unknown])[0];
const one = async (sql: string) => (await q(sql))[0] as R;

const claimsTable = await one(
  `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='crm_commodity_backbone_claims'`,
);
if (Number(claimsTable.n) !== 0) fail(`BB0 认领表 ${claimsTable.n} 张仍在库里——树应当只有一张表`);

/**
 * BB13 退役不变量（旧树于 2026-10-11 走「RENAME → 导出留底 → DROP」下线）。
 * 为什么需要这条：退役是动作，不是事实 —— 没人拦住「改名改一半」或「事后静静把表恢复回来」。
 *  - 退役名 `crm_commodity_nodes_retired_*` 是中间态，长期在场就是两头不到岸 ⇒ 直接红；
 *  - 原树名在场只 WARN：那是回滚演练或观察期的合法状态（此时 BB2/BB3/BB6 会重新跑跨树对账而不是打印跳过）。 */
const retiredLeft = (await q(
  `SELECT table_name t FROM information_schema.tables
     WHERE table_schema=DATABASE() AND table_name LIKE 'crm\\_commodity\\_nodes\\_retired\\_%'`,
)) as { t: string }[];
if (retiredLeft.length)
  fail(`BB13 退役表仍在库里（${retiredLeft.map((r) => r.t).join("、")}）：要么 DROP、要么改回原名让跨树断言重跑，不能停在中间态`);
const legacyHere = await one(
  `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='crm_commodity_nodes'`,
);
if (Number(legacyHere.n) !== 0)
  console.log("⚠ BB13 原树 crm_commodity_nodes 又出现在库里：按回滚/观察期处理，BB2/BB3/BB6 正在对它重跑对账（退役尚未完成）");

const rows = await q(
  `SELECT code, parent_code, level, group_code, unspsc_prefix, name_zh FROM crm_commodity_backbone`,
) as unknown as { code: string; parent_code: string; level: number; group_code: string; unspsc_prefix: string | null; name_zh: string }[];
/**
 * 跨树对账的对照物。旧树 crm_commodity_nodes 一旦下线，BB2 的码域比对、BB3 的族数比对、
 * BB6 的「原树未动」就失去对象：这些断言按「旧树在场才执行」跑，缺席时明确打印跳过。
 * 缺席不等于通过 —— 所以必须留一行字，绝不让断言静默失效。
 */
const legacyTab = await one(
  `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='crm_commodity_nodes'`,
);
const hasLegacy = Number(legacyTab.n) > 0;
const orig = hasLegacy
  ? await one(
      `SELECT SUM(level='family') fam, SUM(level='class') cls, SUM(level='commodity') cmd, COUNT(*) total,
              SUM(code LIKE 'UGT-B-%') leaked FROM crm_commodity_nodes`,
    )
  : null;
// 段→大类只认常量这一份：段归属表 crm_commodity_group_segments 已按 ADR-0009 退役，
// segToGroup 于是纯粹来自常量（上方 43~44 行），BB4 变成「树 L1/L4 的 group_code ↔ 常量」的直接比对。
const byCode = new Map(rows.map((r) => [r.code, r]));
const kids = new Map<string, number>();

// ── BB1 ──
for (const r of rows) {
  if (!/^UGT-B-\d+$/.test(r.code)) { fail(`BB1 码形制非法：${r.code}`); continue; }
  if (r.code.length !== 6 + r.level * 2) fail(`BB1 码长与层级不符：${r.code}（L${r.level} 应为 ${6 + r.level * 2} 字符）`);
  if (r.level === 1) { if (r.parent_code !== "") fail(`BB1 大类行 parent 应为空串：${r.code}`); }
  else {
    if (r.parent_code !== r.code.slice(0, -2)) fail(`BB1 父码≠自身去末两级：${r.code}→${r.parent_code}`);
    if (!byCode.has(r.parent_code)) fail(`BB1 父节点不存在：${r.code}→${r.parent_code}`);
  }
  if (!r.name_zh) fail(`BB1 节点名为空：${r.code}`);
  kids.set(r.parent_code, (kids.get(r.parent_code) ?? 0) + 1);
}
for (const [p, k] of kids) if (k > 99) fail(`BB1 ${p} 下子节点 ${k} 个，超 2 位编码上限 99`);

// ── BB2 码全覆盖 ──
const p6 = rows.filter((r) => r.unspsc_prefix && r.unspsc_prefix.length === 6);
const p8 = rows.filter((r) => r.unspsc_prefix && r.unspsc_prefix.length === 8);
const pOther = rows.filter((r) => r.unspsc_prefix && r.unspsc_prefix.length !== 6 && r.unspsc_prefix.length !== 8);
if (pOther.length) fail(`BB2 出现非 6/8 位的码行 ${pOther.length} 条（段与族不建行，归属由祖先推导）`);
if (orig) {
  if (p6.length !== Number(orig.cls)) fail(`BB2 子类行数=${p6.length}，原树类数=${orig.cls}`);
  if (p8.length !== Number(orig.cmd)) fail(`BB2 品目行数=${p8.length}，原树品目数=${orig.cmd}`);
}
const seenPrefix = new Set<string>();
for (const r of [...p6, ...p8]) {
  const p = String(r.unspsc_prefix);
  if (seenPrefix.has(p)) fail(`BB2 同一码在本表出现两行（一个码两个爹）：${p}`);
  seenPrefix.add(p);
}
// 原树类行存的是 8 位粗码（如 10101500），树里存的是 6 位类前缀⇒ 取键时同样截齐，不拿两种长度硬比
if (orig) {
  const srcCodes = await q(
    `SELECT CASE WHEN level='class' THEN LEFT(unspsc_code,6) ELSE unspsc_code END c
       FROM crm_commodity_nodes WHERE level IN ('class','commodity')`,
  );
  for (const r of srcCodes) {
    const c = String((r as Record<string, unknown>).c);
    if (!seenPrefix.has(c)) fail(`BB2 原树码 ${c} 在树里没有对应行 ⇒ 该码公告永远筛不到`);
  }
  // 树里的码必须都在原树里（不许凭空造码）
  const srcSet = new Set(srcCodes.map((r) => String((r as Record<string, unknown>).c)));
  for (const p of seenPrefix) if (!srcSet.has(p)) fail(`BB2 树里出现原树没有的码：${p}`);
}

// ── BB3 归属可推导且唯一 + BB4 大类连续 ──
const anc = (code: string, level: number) => code.slice(0, 6 + level * 2);
const famToL2 = new Map<string, string>();
for (const r of p6) {
  const fam = String(r.unspsc_prefix).slice(0, 4);
  const l2 = anc(r.code, 2);
  const prev = famToL2.get(fam);
  if (prev && prev !== l2) fail(`BB3 族 ${fam} 的类行跨了两个中类：${prev} 与 ${l2}`);
  famToL2.set(fam, l2);
  // BB4：类行的段 → 大类，必须等于自身与祖先的 group_code
  const seg = fam.slice(0, 2);
  const wantGroup = segToGroup.get(seg);
  const l1 = byCode.get(anc(r.code, 1))!;
  if (!l1) { fail(`BB4 祖先大类行缺失：${r.code}`); continue; }
  if (r.group_code !== l1.group_code) fail(`BB4 group_code 与祖先不一致：${r.code} ${r.group_code} vs ${l1.group_code}`);
  if (wantGroup && wantGroup !== r.group_code) fail(`BB4 段 ${seg} 应属 ${wantGroup}，但 ${r.code} 记的是 ${r.group_code}`);
}
if (orig && famToL2.size !== Number(orig.fam)) fail(`BB3 可由类行反推出的族数=${famToL2.size}，原树族数=${orig.fam}`);
const segToL1 = new Map<string, string>();
for (const [fam, l2] of famToL2) {
  const seg = fam.slice(0, 2);
  const l1 = anc(l2, 1);
  const prev = segToL1.get(seg);
  if (prev && prev !== l1) fail(`BB3 段 ${seg} 跨了两个大类：${prev} 与 ${l1}`);
  segToL1.set(seg, l1);
}
if (segToL1.size !== 58) fail(`BB3 可反推的段数=${segToL1.size}，应为 58`);

// ── BB5 五级齐 + 命名质量 ──
const perLevel = [1, 2, 3, 4, 5].map((lv) => rows.filter((r) => r.level === lv).length);
for (const lv of [1, 2, 3, 4, 5]) if (!perLevel[lv - 1]) fail(`BB5 第 ${lv} 级没有任何行，五级不齐`);
if (perLevel[0] !== 32) fail(`BB5 大类行数=${perLevel[0]}，应为 32`);
// 正名后的红线：中类/小类不得用「等」这种含糊名，不得同父重名（子类/品目行名继承自原树，重名只 WARN）
const vague = rows.filter((r) => (r.level === 2 || r.level === 3) && r.name_zh.includes("等"));
if (vague.length) fail(`BB5 中类/小类还有 ${vague.length} 个带「等」的含糊名，如 ${vague[0]!.code} ${vague[0]!.name_zh}`);
const sibHard = new Set<string>();
const dupHard: string[] = [];
for (const r of rows) {
  if (r.level !== 2 && r.level !== 3) continue;
  const k = `${r.parent_code}|${r.name_zh}`;
  if (sibHard.has(k)) dupHard.push(k);
  sibHard.add(k);
}
if (dupHard.length) fail(`BB5 中类/小类同父重名 ${dupHard.length} 处，如 ${dupHard[0]}`);
// 正名收尾：不许再挂建树时的「待人工正名」标记（名字已是止于正名的成品，否则说明正名没做完）
const stale = await one(`SELECT COUNT(*) n FROM crm_commodity_backbone WHERE level IN (2,3) AND note LIKE '%待人工正名%'`);
if (Number(stale.n) !== 0) fail(`BB5 还有 ${stale.n} 个中类/小类挂着「待人工正名」标记，正名未收尾`);
const sib = new Set<string>();
let sibWarn = 0;
for (const r of rows) {
  if (r.level < 4) continue;
  const k = `${r.parent_code}|${r.name_zh}`;
  if (sib.has(k)) sibWarn++;
  sib.add(k);
}
// 名字里还带拉丁词的 中类/小类：来自事实层缺译名的族/类（不是命名错误，但要盯）
for (const r of rows) if ((r.level === 2 || r.level === 3) && /[A-Za-z]{3,}/.test(r.name_zh)) warns.push(r.code);
if (warns.length) console.log(`⚠ ${warns.length} 个中类/小类名含拉丁词（事实层本身缺中文译名）：${warns.slice(0, 3).join("、")}${warns.length > 3 ? " …" : ""}`);

// ── BB6 原树未动（旧树不在库里时这条没有对象，见末尾的跳过提示）──
if (orig) {
  if (Number(orig.total) !== EXPECT_ORIG_ROWS) fail(`BB6 原树行数=${orig.total}，应为 ${EXPECT_ORIG_ROWS}`);
  if (Number(orig.leaked) !== 0) fail(`BB6 原树里出现树码 ${orig.leaked} 行，码域被污染`);
}

// ── BB7 公告归属已落到骨架（不硬编码条数，只锁闭合关系：新公告进来照样成立）──
let pathStat = "";
const pathCol = await one(
  `SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='crm_notice_search' AND column_name='backbone_path'`,
);
if (Number(pathCol.n) === 0) {
  fail("BB7 宽表没有 backbone_path 列：先 npx tsx scripts/ops/commodity-backbone-path-ddl.ts --apply --yes 加列，再跑回填");
} else {
  // 索引先构：BB7 「可算必填」要靠它区分「回填漏跑」与「树上根本没这个码」，BB9/BB10 也用的是同一个实例
  let idx: BackboneIndex | null = null;
  try {
    // 与运行期同一个构造入口：门禁自己拼行集的话，BB10 报红就分不清是「第二份实现」
    // 还是「行集不同」（比如 status 过滤、或段映射来源不一致）
    idx = await loadBackboneIndex(async <T = Record<string, unknown>>(sql: string) =>
      ((await pool.query(sql)) as [T[], unknown])[0],
    );
  } catch (e) {
    fail(`BB7/BB9 构骨架索引失败：${(e as Error).message}`);
  }

  const p = await one(
    `SELECT SUM(backbone_path IS NOT NULL AND backbone_path<>'') filled,
            SUM(backbone_path='') blank,
            SUM(backbone_path REGEXP '[^0-9A-Za-z,-]') bad,
            SUM(CHAR_LENGTH(backbone_path)>1000000) tooLong FROM crm_notice_search`,
  );
  // 有码必须填 —— 但「填不了」要跟「没跑」分开判（2026-10-12 树重建后按「以树为准」的口径）：
  // 桥表有 165 个族/类/品目级深码在当前树上换不出任何节点，涉及公告的列值就该是 NULL
  // （旧列值指的是树上已不存在的节点，等值筛能命中一个无名节点，比空着更坏）。
  // 所以这条从「有码必填」收紧成「可算必填」：拿同一份纯函数重算，算得出却没填的才是回填缺位。
  const homeless = await q(
    `SELECT w.notice_id nid, nc.code code FROM crm_notice_search w
       JOIN crm_bid_notice_unspsc_codes nc ON nc.notice_id = w.notice_id
      WHERE (w.backbone_path IS NULL OR w.backbone_path = '') AND nc.code <> ''`,
  );
  const homelessByNotice = new Map<string, string[]>();
  for (const r of homeless) {
    const list = homelessByNotice.get(String(r.nid));
    if (list) list.push(String(r.code));
    else homelessByNotice.set(String(r.nid), [String(r.code)]);
  }
  let computableBlank = 0;
  if (idx) for (const codes of homelessByNotice.values()) if (idx.pathOf(codes).codes.length > 0) computableBlank++;
  const unmapableBlank = homelessByNotice.size - computableBlank;
  const extra = await one(
    `SELECT COUNT(*) n FROM crm_notice_search w WHERE w.backbone_path IS NOT NULL AND w.backbone_path<>''
       AND NOT EXISTS (SELECT 1 FROM crm_bid_notice_unspsc_codes nc WHERE nc.notice_id=w.notice_id)`,
  );
  // 第三个方向：挂了码、按搜索口径仍活跃，却压根没进宽表。上面两条都从宽表出发，
  // 这种行对它们不可见，而后果是「公告在新树上彻底看不见」（相似/筛选都进不了）。
  // 实测当前活跃口径下 0 条（历史上那 3 条全已过期）⇒ 所以这条可以零容忍。
  const noWide = await one(
    `SELECT COUNT(*) n FROM (SELECT n.id FROM crm_bid_notice_unspsc_codes nc
       JOIN crm_bid_notices n ON n.notice_id = nc.notice_id
      WHERE ${ACTIVE_NOTICE_WHERE} AND NOT EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id)
      GROUP BY n.id) x`,
  );
  // 祖先全存的不变量：排好序后第一个码必为大类行（否则说明回填时漏了链顶）
  const noTop = await one(
    `SELECT COUNT(*) n FROM crm_notice_search WHERE backbone_path IS NOT NULL AND backbone_path<>''
       AND SUBSTRING_INDEX(backbone_path, ',', 1) NOT REGEXP '^UGT-B-[0-9]{2}$'`,
  );
  if (Number(p.blank) !== 0) fail(`BB7 宽表有 ${p.blank} 行 backbone_path 是空串，应为 NULL`);
  if (Number(p.bad) !== 0) fail(`BB7 有 ${p.bad} 行 backbone_path 含非法字符（只允许树码与逗号）`);
  if (Number(p.tooLong) !== 0) fail(`BB7 有 ${p.tooLong} 行超过 1,000,000 字符上限，回填脚本应拒写而非截断`);
  console.log(`BB7 归属空缺 ${homelessByNotice.size} 条：可算却未填 ${computableBlank} / 全码换不出 ${unmapableBlank}（后者是 AI 补码的候选集）`);
  if (idx && computableBlank !== 0) {
    fail(`BB7 有 ${computableBlank} 条公告按当前树能算出归属却列值为空 ⇒ 回填没跑/漏跑（另 ${unmapableBlank} 条是全码换不出，属「以树为准」的预期，不计红）`);
  }
  if (Number(extra.n) !== 0) fail(`BB7 有 ${extra.n} 行 backbone_path 有值但桥表无码 ⇒ 归属来路不明`);
  if (Number(noWide.n) !== 0) fail(`BB7 有 ${noWide.n} 条活跃公告挂了码却没进宽表 ⇒ 新树上彻底不行（同步缺位，不依赖回填发现）`);
  if (Number(noTop.n) !== 0) fail(`BB7 有 ${noTop.n} 行 backbone_path 的链顶不是大类，祖先没存全`);
  // 抽样验真：最长的 100 行 + 最早的 200 行（不用 RAND，保证可复现），拆开后逐个对树
  const sample = await q(
    `SELECT p FROM (SELECT id, backbone_path p FROM crm_notice_search
       WHERE backbone_path IS NOT NULL ORDER BY CHAR_LENGTH(backbone_path) DESC LIMIT 100) a
     UNION ALL
     SELECT p FROM (SELECT id, backbone_path p FROM crm_notice_search
       WHERE backbone_path IS NOT NULL ORDER BY id LIMIT 200) b`,
  );
  const pc = new Set<string>();
  for (const r of sample) for (const x of String(r.p).split(",")) if (x) pc.add(x);
  const hit = pc.size
    ? await one(`SELECT COUNT(DISTINCT code) n FROM crm_commodity_backbone WHERE code IN ('${[...pc].join("','")}')`)
    : { n: 0 };
  if (Number(hit.n) !== pc.size) fail(`BB7 抽样里 ${pc.size - Number(hit.n)} 个 backbone_path 码在树里不存在`);

  // ── BB12 偏好表的大类码必须齐（可见性判定的输入）──
  // 判定层（industry-scope）从 backbone_path 判可见集合，输入是 crm_user_industry_prefs.group_code → L1 节点码。
  // 这一列历史上没有任何运行期代码在写（upsertIndustryPrefs 只写五级 id），现存值是一次性迁移灌的；
  // 2026-10-11 写入链路已改为同批带上它（temp/probe77：11 行五级 id 的换算值与现值逐行一致）。
  // 缺它不是「少一个筛选条件」而是把那个付费用户当成没绑行业⇒静默放行全部，所以零容忍。
  const prefNoGroup = await one(
    `SELECT COUNT(*) n FROM crm_user_industry_prefs
      WHERE (IFNULL(level2_id,0) > 0 OR IFNULL(level3_id,0) > 0 OR IFNULL(level4_id,0) > 0 OR IFNULL(level5_id,0) > 0)
        AND (group_code IS NULL OR group_code = '')`,
  );
  const prefBadGroup = await one(
    `SELECT COUNT(*) n FROM crm_user_industry_prefs p
       LEFT JOIN crm_commodity_backbone b ON b.level = 1 AND b.group_code = p.group_code
      WHERE p.group_code IS NOT NULL AND p.group_code <> '' AND b.code IS NULL`,
  );
  console.log(`BB12 偏好大类码：缺 ${prefNoGroup.n} 行 / 对不上骨架 L1 ${prefBadGroup.n} 行`);
  if (Number(prefNoGroup.n) !== 0) {
    fail(`BB12 有 ${prefNoGroup.n} 行偏好填了二级以下类目却没有大类码 ⇒ 可见性判定会静默放行该用户；补跑 scripts/ops/user-prefs-group-code-backfill.ts`);
  }
  if (Number(prefBadGroup.n) !== 0) {
    fail(`BB12 有 ${prefBadGroup.n} 行偏好的 group_code 在骨架 L1 里找不到对应行 ⇒ 可见性谓词永远不命中（常量与库分叉）`);
  }

  // ── BB9 族级落点分档（纯函数侧，不扫宽表）──
  // 口径不在门禁里重写：直接拿 backbone-path 的 match() 逐族试挂，模块改了它跟着变。
  // 粗码用「族前缀 + 0000」喂进去，走的就是公告实际会走的那条分支。
  // idx 已在 BB7 那段前面构好（同一个实例，不开第二份行集）
  if (idx) {
    const ix = idx;
    const famHist = new Map<number, number>();
    const famMiss: string[] = [];
    for (const fam of famToL2.keys()) {
      const hit = ix.match(`${fam}0000`);
      if (!hit) { famMiss.push(fam); continue; }
      famHist.set(hit.row.level, (famHist.get(hit.row.level) ?? 0) + 1);
    }
    const at = (lv: number) => famHist.get(lv) ?? 0;
    console.log(`BB9 族级落点 ${famToL2.size} 族：L4 ${at(4)} / L3 ${at(3)} / L2 ${at(2)}（2026-10-11 实测基线 33/256/270）`);
    if (famMiss.length) fail(`BB9 有 ${famMiss.length} 个族的粗码换不出落点，样本 ${famMiss.slice(0, 3).join("、")}`);
    // 三档计数必须恰好吃完全部族：漏掉的那部分会既不进三档也不进 famMiss，
    // 比如树里出现形如 XXXX0000 的 8 位品目键时，match() 的「等值优先」会让该族粗码直接落 L5
    const famAccounted = at(2) + at(3) + at(4) + famMiss.length;
    if (famAccounted !== famToL2.size) {
      fail(`BB9 族级落点只算了 ${famAccounted}/${famToL2.size} 个族 ⇒ 有族的粗码落到了 L2/L3/L4/miss 之外（键形制被污染）`);
    }
    // 三档都要非零：只有一档就是被改回一刀切（L2）或只会落 L4（无唯一性判定）
    for (const lv of [2, 3, 4]) {
      if (at(lv) === 0) fail(`BB9 族级没有一族落 L${lv} ⇒ 落点规则疑似退化（三层都该有非零落点）`);
    }
    const segBad = [...segToL1.keys()].filter((seg) => ix.match(`${seg}000000`)?.row.level !== 1);
    if (segBad.length) fail(`BB9 有 ${segBad.length} 个段的粗码没落到大类，样本 ${segBad.slice(0, 3).join("、")}`);

    // ── BB10 列值可由纯函数重算：抽样逐条比对，差异必须 0 ──
    // 抓两类问题：列值过期（规则改了但没重跑回填 / 运行期链路漏了写入）、有人写了第二份实现。
    // 运行期写入方（commodity/backbone-cache）与回填脚本用的就是下面这个 pathOf，所以这条变红就是真分叉。
    // 抽两头而不是只抽尾部：回填是「按 id 升序 + 水位续跑」的，中途停手或水位推过头时，
    // 陈旧的就是 id 低的那整段历史存量；只抽最新尾巴的话 BB10 必然假绿（它声称抓的就是「列值过期」）
    const batchA = await q(
      `SELECT notice_id nid FROM crm_notice_search WHERE backbone_path IS NOT NULL AND backbone_path<>'' ORDER BY id DESC LIMIT 200`,
    );
    const batchC = await q(
      `SELECT notice_id nid FROM crm_notice_search WHERE backbone_path IS NOT NULL AND backbone_path<>'' ORDER BY id ASC LIMIT 200`,
    );
    // 专门抽带族级粗码的公告（后四位 00、但族前缀末两位非 00，排除段级）：本次升级改的就是这一档
    const famWhere = `code REGEXP '^[0-9]{4}0000$' AND RIGHT(LEFT(code,4),2) <> '00'`;
    const batchB = await q(
      `SELECT notice_id nid FROM crm_bid_notice_unspsc_codes WHERE ${famWhere} ORDER BY id DESC LIMIT 600`,
    );
    const batchD = await q(
      `SELECT notice_id nid FROM crm_bid_notice_unspsc_codes WHERE ${famWhere} ORDER BY id ASC LIMIT 600`,
    );
    const ids = [...new Set(
      [...batchA, ...batchB, ...batchC, ...batchD].map((r) => String(r.nid)).filter((x) => x),
    )];
    if (ids.length === 0) {
      fail("BB10 抽样一条公告都抽不到：宽表 backbone_path 与桥表族级码同时为空？");
    } else {
      const ph = ids.map(() => "?").join(",");
      const stored = await q(`SELECT notice_id, backbone_path p FROM crm_notice_search WHERE notice_id IN (${ph})`, ids);
      const codeRows = await q(`SELECT DISTINCT notice_id, code FROM crm_bid_notice_unspsc_codes WHERE notice_id IN (${ph})`, ids);
      const codesBy = new Map<string, string[]>();
      for (const r of codeRows) {
        const nid = String(r.notice_id);
        const list = codesBy.get(nid);
        if (list) list.push(String(r.code));
        else codesBy.set(nid, [String(r.code)]);
      }
      let diff = 0;
      const worst: string[] = [];
      for (const r of stored) {
        const again = toBackbonePathColumn(ix.pathOf(codesBy.get(String(r.notice_id)) ?? []).codes);
        if (again !== String(r.p)) {
          diff++;
          if (worst.length < 3) {
            worst.push(`${r.notice_id}：重算 ${again.split(",").length} 个节点 / 列内 ${String(r.p).split(",").length} 个`);
          }
        }
      }
      console.log(`BB10 纯函数重算对拍 ${stored.length} 条公告，差异 ${diff}`);
      if (diff) fail(`BB10 有 ${diff}/${stored.length} 条 backbone_path 与纯函数重算不等 ⇒ 列值过期或存在第二份实现：${worst.join("；")}`);
    }

    // ── BB11 precise_backbone_path 同口径可重算（源＝商机 approved 候选码）──
    // 与 BB10 同一个 pathOf、另一张码表：抓「precise 列由第二套规则灌出」与
    // 「审核改了 approved 码但列值没跟上」。当前全列只有千级行（实测 1,049），所以直接全量对拍，
    // 不抽样 —— 抽样是为了控成本，这一列没那个成本。
    const pv = await q(
      `SELECT notice_id, precise_backbone_path p FROM crm_notice_search
        WHERE precise_backbone_path IS NOT NULL AND precise_backbone_path<>'' ORDER BY id LIMIT 20000`,
    );
    let pdiff = 0;
    const pworst: string[] = [];
    for (let i = 0; i < pv.length; i += 500) {
      const chunk = pv.slice(i, i + 500);
      const pids = [...new Set(chunk.map((r) => String(r.notice_id)))];
      const rows = await q(
        `SELECT DISTINCT o.source_notice_id nid, ca.candidate_code code
           FROM crm_bid_opportunity_unspsc_candidates ca
           JOIN crm_bid_opportunities o ON o.id = ca.opportunity_id
          WHERE ca.status = 'approved' AND o.source_notice_id IN (${pids.map(() => "?").join(",")})`,
        pids,
      );
      const byNid = new Map<string, string[]>();
      for (const r of rows) {
        const nid = String(r.nid);
        const list = byNid.get(nid);
        if (list) list.push(String(r.code));
        else byNid.set(nid, [String(r.code)]);
      }
      for (const r of chunk) {
        const again = toBackbonePathColumn(ix.pathOf(byNid.get(String(r.notice_id)) ?? []).codes);
        if (again !== String(r.p)) {
          pdiff++;
          if (pworst.length < 3) pworst.push(`${r.notice_id}：重算 ${again.split(",").length} 个节点 / 列内 ${String(r.p).split(",").length} 个`);
        }
      }
    }
    console.log(`BB11 precise 重算对拍 ${pv.length} 条公告（全量），差异 ${pdiff}`);
    if (pdiff) fail(`BB11 有 ${pdiff}/${pv.length} 条 precise_backbone_path 与纯函数重算不等 ⇒ 存在第二份实现或 approved 码改了没重跑：${pworst.join("；")}`);
  }
  pathStat = `已填 ${p.filled} · 抽样 ${pc.size} 码全在树`;
}

console.log(`树：L1 ${perLevel[0]} / L2 ${perLevel[1]} / L3 ${perLevel[2]} / L4 ${perLevel[3]} / L5 ${perLevel[4]}（合计 ${rows.length} 行，一张表）`);
console.log(`码行：6 位 ${p6.length} / 8 位 ${p8.length}；可反推 族 ${famToL2.size} / 段 ${segToL1.size}`);
if (pathStat) console.log(`公告归属：${pathStat}`);
console.log(`规模带（每父的子数）：中类/大类 ${bandof(1)}｜小类/中类 ${bandof(2)}｜子类/小类 ${bandof(3)}｜品目/子类 ${bandof(4)}`);
if (sibWarn) console.log(`⚠ ${sibWarn} 条同名兄弟（子类/品目行继承原树名，不改）`);
/** 入参是父的层级：父码长 = 6 + 父层级×2（L1=8、L2=10…），kids 是按 parent_code 计数的 */
function bandof(parentLevel: number) {
  const len = 6 + parentLevel * 2;
  const s = [...kids.entries()].filter(([p]) => p.length === len).map(([, k]) => k).sort((a, b) => a - b);
  return s.length ? `min ${s[0]} / 中位 ${s[Math.floor(s.length / 2)]} / max ${s[s.length - 1]}` : "无";
}
// ── BB14 节点码倒排表是 backbone_path 的行化镜像 ──
{
  const NODES_TAB = "crm_notice_backbone_nodes";
  const hasNodes = await one(
    `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='${NODES_TAB}'`,
  );
  if (Number(hasNodes.n) === 0) {
    console.log(`⚠ BB14 表 ${NODES_TAB} 不存在：本轮只 WARN（建表是人工闸口：scripts/ops/commodity-notice-nodes-ddl.ts --apply --yes）；`);
    console.log("  读侧一旦改成按倒排表 JOIN，这条必须转绿：没建表就切读侧 = 推荐/热门全部返回空");
  } else {
    // 1) 总行数 = 列值 token 总数（2026-10-11 实测基线 1,508,793 行 / 353,875 公告）
    const src = await one(
      `SELECT COUNT(*) notices,
              SUM(CHAR_LENGTH(backbone_path) - CHAR_LENGTH(REPLACE(backbone_path, ',', '')) + 1) tokens
       FROM crm_notice_search WHERE backbone_path IS NOT NULL AND backbone_path <> ''`,
    );
    const dst = await one(
      `SELECT COUNT(*) rows_, COUNT(DISTINCT notice_id) notices,
              SUM(node REGEXP '[^A-Za-z0-9-]') badShape,
              SUM(node NOT LIKE 'UGT-B-%') badPrefix
       FROM ${NODES_TAB}`,
    );
    const srcTokens = Number(src.tokens ?? 0);
    const dstRows = Number(dst.rows_ ?? 0);
    console.log(
      `BB14 倒排表：${dstRows} 行 / ${Number(dst.notices)} 公告 ↔ 源 ${srcTokens} token / ${Number(src.notices)} 公告`
      + `（形制非法 ${Number(dst.badShape ?? 0)}，前缀不对 ${Number(dst.badPrefix ?? 0)}）`,
    );
    if (dstRows !== srcTokens) {
      fail(`BB14 行数与列值 token 总数不等（差 ${Math.abs(dstRows - srcTokens)}）⇒ 回填漏灌或残行：重跑 scripts/ops/commodity-notice-nodes-backfill.ts --apply --yes`);
    }
    if (Number(dst.notices) !== Number(src.notices)) {
      fail(`BB14 公告数不闭合（桥表 ${Number(dst.notices)} vs 源 ${Number(src.notices)}）：多=该公告已去码/已删但桥表留行，少=回填没覆盖到`);
    }
    if (Number(dst.badShape ?? 0) > 0 || Number(dst.badPrefix ?? 0) > 0) {
      fail(`BB14 有非节点码形制的行（${Number(dst.badShape ?? 0)}/${Number(dst.badPrefix ?? 0)}）：本表只允许 backbone-path 产出的 UGT-B- 码`);
    }
    // 2) 不留残行：桥表每一行必须能回到一条有列值的宽表行
    const orphan = await one(
      `SELECT COUNT(*) n FROM ${NODES_TAB} bn
       LEFT JOIN crm_notice_search ns ON ns.id = bn.notice_id
       WHERE ns.id IS NULL OR ns.backbone_path IS NULL OR ns.backbone_path = ''`,
    );
    if (Number(orphan.n) > 0) {
      fail(`BB14 有 ${Number(orphan.n)} 行挂在「宽表无行或无码」的公告上：读侧从倒排方向会查出宽表里根本不该出现的公告`);
    }
    // 3) 逐集合对拍：拿头部/腰部/尾部各 100 条，SQL 侧用 JSON_TABLE 拆列算 COUNT+SUM(CRC32)，
    //    与桥表侧同一口径。CRC32 两侧同值、且拿 300 条真数据对拍过（2026-10-11 探针116）。
    const sample = await q(
      `(SELECT id FROM crm_notice_search WHERE backbone_path IS NOT NULL AND backbone_path <> '' ORDER BY id ASC LIMIT 100)
       UNION ALL
       (SELECT id FROM crm_notice_search WHERE backbone_path IS NOT NULL AND backbone_path <> ''
          AND id >= (SELECT FLOOR(MAX(id) / 2) FROM crm_notice_search) ORDER BY id ASC LIMIT 100)
       UNION ALL
       (SELECT id FROM crm_notice_search WHERE backbone_path IS NOT NULL AND backbone_path <> '' ORDER BY id DESC LIMIT 100)`,
    );
    const sids = sample.map((r) => Number(r.id));
    if (sids.length === 0) {
      console.log("⚠ BB14 抽样集合对拍本轮无样本（宽表无列值行）：只跑了总量与残行两项");
    } else {
      const sph = sids.map(() => "?").join(",");
      const fromCol = await q(
        `SELECT ns.id, COUNT(*) c, IFNULL(SUM(CRC32(jt.node)), 0) s
         FROM crm_notice_search ns,
              JSON_TABLE(CONCAT('["', REPLACE(ns.backbone_path, ',', '","'), '"]'),
                         '$[*]' COLUMNS (node VARCHAR(16) PATH '$')) jt
         WHERE ns.id IN (${sph}) GROUP BY ns.id`,
        sids,
      );
      const fromTab = await q(
        `SELECT notice_id id, COUNT(*) c, IFNULL(SUM(CRC32(node)), 0) s
         FROM ${NODES_TAB} WHERE notice_id IN (${sph}) GROUP BY notice_id`,
        sids,
      );
      const aMap = new Map(fromCol.map((r) => [Number(r.id), `${Number(r.c)}:${String(r.s)}`]));
      const bMap = new Map(fromTab.map((r) => [Number(r.id), `${Number(r.c)}:${String(r.s)}`]));
      const diff: string[] = [];
      for (const id of sids) {
        const a = aMap.get(id) ?? "0:0";
        const b = bMap.get(id) ?? "0:0";
        if (a !== b) diff.push(`${id} 列侧 ${a} / 表侧 ${b}`);
      }
      console.log(`BB14 逐集合对拍 ${sids.length} 条公告（头部/腰部/尾部各 100），差异 ${diff.length}`);
      if (diff.length > 0) {
        fail(`BB14 有 ${diff.length}/${sids.length} 条公告的节点码集合与列值不一致：${diff.slice(0, 3).join("；")}`);
      }
    }
  }
}

// ── BB15 落点表是 backbone_path 的事实源（UNSPSC 全面退役 R1）──
{
  const ATTR_TAB = "crm_notice_attribution_nodes";
  const hasAttr = await one(
    `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='${ATTR_TAB}'`,
  );
  if (Number(hasAttr.n) === 0) {
    console.log(`⚠ BB15 表 ${ATTR_TAB} 不存在：本轮只 WARN（建表是人工闸口：scripts/ops/notice-attribution-ddl.ts --apply --yes）；`);
    console.log("  读侧（宽表构建器）一旦改吃落点表，这条必须转绿：没落点数据就切读侧 = 公告分类全空");
  } else {
    // 1) 无幻觉：每个落点都必须是启用中的树节点。灌入脚本已在写入前挡过一道，
    //    这里防的是「绕过脚本直接写表」（人工补数、AI worker 自行 INSERT）把脏码灌成事实
    const phantom = await one(
      `SELECT COUNT(*) n FROM ${ATTR_TAB} a
       LEFT JOIN crm_commodity_backbone b ON b.code = a.node_code AND b.status = 1
       WHERE b.code IS NULL`,
    );
    console.log(`BB15a 树外落点：${Number(phantom.n)} 行`);
    if (Number(phantom.n) > 0) {
      const sample = await q(
        `SELECT CONCAT(a.notice_pk, '/', a.node_code) pk FROM ${ATTR_TAB} a
         LEFT JOIN crm_commodity_backbone b ON b.code = a.node_code AND b.status = 1
         WHERE b.code IS NULL LIMIT 3`,
      );
      fail(`BB15a 有 ${Number(phantom.n)} 行落点不在启用树里：公告挂在不存在的节点上，品目下拉永远筛不到它：${sample.map((r) => String(r.pk)).join("；")}`);
    }
    // 2) 落点集必须已压到最深：同一公告的两个落点不得互为祖先（互为祖先 = 灌进了非最深形态，
    //    同一个节点会被当两个落点计，倒排表与 BB14 镜像都会多行）。全表比：每公告平均 1.7 行，
    //    走 uk_notice_node 的 notice_pk 前缀，不必抽样
    const nested = await one(
      `SELECT COUNT(*) n FROM ${ATTR_TAB} a
       JOIN ${ATTR_TAB} b ON b.notice_pk = a.notice_pk
        AND CHAR_LENGTH(a.node_code) > CHAR_LENGTH(b.node_code)
        AND LEFT(a.node_code, CHAR_LENGTH(b.node_code)) = b.node_code`,
    );
    console.log(`BB15b 落点互为祖先：${Number(nested.n)} 对`);
    if (Number(nested.n) > 0) {
      fail(`BB15b 有 ${Number(nested.n)} 对落点互为祖先：落点集没压到最深，列值与倒排表都会按重复祖先胀行`);
    }
    // 3) 列值 = 落点闭包（抽两头）：落点表能无损还原出宽表列值，是「换源不改归属」的唯一机器证明
    const head = await q(
      `SELECT a.notice_pk id FROM ${ATTR_TAB} a JOIN crm_notice_search ns ON ns.id = a.notice_pk
        WHERE ns.backbone_path IS NOT NULL AND ns.backbone_path <> '' GROUP BY a.notice_pk, ns.backbone_path ORDER BY a.notice_pk ASC LIMIT 200`,
    );
    const tail = await q(
      `SELECT a.notice_pk id FROM ${ATTR_TAB} a JOIN crm_notice_search ns ON ns.id = a.notice_pk
        WHERE ns.backbone_path IS NOT NULL AND ns.backbone_path <> '' GROUP BY a.notice_pk, ns.backbone_path ORDER BY a.notice_pk DESC LIMIT 200`,
    );
    const pks = [...new Set([...head, ...tail].map((r) => Number(r.id)))];
    if (pks.length === 0) {
      console.log("⚠ BB15c 闭包对拍本轮无样本（落点表与宽表的交集为空）：灌入没跑还是读侧已切？");
    } else {
      const ph = pks.map(() => "?").join(",");
      const attrRows = await q(`SELECT notice_pk pk, node_code code FROM ${ATTR_TAB} WHERE notice_pk IN (${ph})`, pks);
      const colRows = await q(`SELECT id pk, backbone_path p FROM crm_notice_search WHERE id IN (${ph})`, pks);
      const byNotice = new Map<number, string[]>();
      for (const r of attrRows) {
        const list = byNotice.get(Number(r.pk));
        if (list) list.push(String(r.code));
        else byNotice.set(Number(r.pk), [String(r.code)]);
      }
      let cdiff = 0;
      const worst: string[] = [];
      for (const r of colRows) {
        // 落点侧现算派生（与灌入脚本、宽表构建器同一份 pathOfLandingNodes），再与列里现值比
        const fromAttr = toBackbonePathColumn(pathOfLandingNodes(byNotice.get(Number(r.pk)) ?? []));
        if (fromAttr !== String(r.p)) {
          cdiff++;
          // 报长度而不是截串：两列共享很长的同名前缀，截 60 字看上去一模一样，排障时等于没说
          if (worst.length < 3) {
            worst.push(`${r.pk}：落点侧 ${fromAttr ? fromAttr.split(",").length : 0} 个节点 / 列内 ${String(r.p).split(",").length} 个`);
          }
        }
      }
      console.log(`BB15c 闭包对拍 ${colRows.length} 条公告（落点表 ${attrRows.length} 行 / ${byNotice.size} 公告），差异 ${cdiff}`);
      if (cdiff) fail(`BB15c 有 ${cdiff}/${colRows.length} 条公告的列值不等于落点派生值：${worst.join("；")}`);
    }
    // 4) 双向闭合：有列值却没落点行 = 该公告在新事实上源不存在；有落点行却没列值 = 半写状态
    const noAttr = await one(
      `SELECT COUNT(*) n FROM crm_notice_search ns
       LEFT JOIN ${ATTR_TAB} a ON a.notice_pk = ns.id
       WHERE ns.backbone_path IS NOT NULL AND ns.backbone_path <> '' AND a.notice_pk IS NULL`,
    );
    const orphan = await one(
      `SELECT COUNT(*) n FROM ${ATTR_TAB} a
       LEFT JOIN crm_notice_search ns ON ns.id = a.notice_pk
       WHERE ns.id IS NULL OR ns.backbone_path IS NULL OR ns.backbone_path = ''`,
    );
    console.log(`BB15d 双向闭合：有列值无落点 ${Number(noAttr.n)} 条 / 有落点无列值 ${Number(orphan.n)} 条`);
    if (Number(orphan.n) > 0) {
      fail(`BB15d 有 ${Number(orphan.n)} 行落点找不到对应的宽表列值：事实源写了但派生列没跟上（或公告已删而落点没清）`);
    }
  }
}

/** 跳过的断言必须每次都说出来：放在失败出口之前，否则门禁一红就看不出跨树项到底跑没跑 */
if (!hasLegacy) {
  console.log("⚠ 旧树 crm_commodity_nodes 已不在库里：BB2 码域对账 / BB3 族数对账 / BB6 原树未动 三条跨树断言本次未执行（树内自洽断言 BB1/BB4/BB5/BB7/BB8/BB9/BB10/BB11/BB12/BB13/BB14/BB15 照常）");
}
if (fails.length) {
  console.error(`✗ 品目树门禁未通过（${fails.length} 条）：\n  - ${[...new Set(fails)].slice(0, 25).join("\n  - ")}`);
  await pool.end();
  process.exit(1);
}
console.log(`✅ BB1~BB15 通过：${rows.length} 行一张表${orig ? `，原树 ${orig.total} 行未动` : "（旧树已下线）"}，src 不读旧树`);
await pool.end();
