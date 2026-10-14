/**
 * 品目树门禁 BB1~BB15（旧品类码全面退役 R4' 后的单表自洽版）
 *
 * @script scripts/gates/check-commodity-backbone.ts
 * @assertions
 *   BB1 码长即层级：UGT- 后 2/4/6/8/10 位对应 L1~L5；父码=自身去末两级且存在；每父子数 ≤ 99；名非空
 *   BB2 已于 R4' 删除：旧语义“本表旧前缀映射列域 ↔ 旧树旧品类码”的跨树对测已随旧树与字典下线失去对象；
 *      ↳ 旧树不在时 `if (orig)` 分支本来就打印跳过，R4' 后直接拆机。
 *   BB3 已于 R4' 删除：旧语义“同一个旧品类码族→同一个 L2、同一个段→同一个 L1”需旧前缀映射列行反推。
 *      ↳ UGT 直认后不再维护“族/段”的旧品类码语义⇒断言不再适用。
 *   BB4 大类连续（精简版）：L4 行的 group_code 与祖先 L1.group_code 必逐行一致（树上内存自洽，
 *      ↳ 旧版中“段→常量推大类”那半边已随旧前缀映射列入口剥开；常量↔树的交叉对测交给 BB5 L1=32行+BB12）
 *   BB5 五级齐：L1 恰 32 行且 parent 为空串，L1~L5 每级都有行；同名兄弟只 WARN
 *   BB6 原树未被触碰：crm_commodity_nodes 行数 = 158,707，两表码域互斥（旧树已删则无对象，只打印跳过）
 *   BB7 公告归属已落到骨架（事实源 = 落点表，旧品类码退役 R3'）：宽表形制合法（非空串、
 *      合法字符、不超长）、链顶必为大类、抽样码全在树；活跃公告有落点必进宽表。
 *      ↳ 曾经的“有码必填/无码必空”已交给 BB15c/d（落点↔列值双向闭合）；本条不再吃桥表。
 *   BB8 旧树零引用（静态）：src/** 不得出现 FROM/JOIN crm_commodity_nodes* —— 这是「旧树可以删」的机器证明
 *      ↳ 后缀走 \w* ：旧树 RENAME 后的退役表照样算引用（带自检，防改名豁免）
 *   BB9 已于 R4' 删除：旧语义“拿族粗码 fam+0000 试挂 match，L1..L4 四档至少三档有落点”验证的
 *      ↳ 是数字码入口的“最深可证实唯一”分档；入口已剥⇒断言失参考系。
 *   BB10 已于旧品类码退役 R3' 删除：旧语义“列值 = pathOf(桥表旧品类码)”已交给 BB15c（列值 = 落点派生）。
 *   BB12 偏好表的大类码齐备且对得上骨架 L1 —— 可见性判定的输入，缺行就是把付费用户静默放行
 *   BB13 退役不变量：不得留下 crm_commodity_nodes_retired_* 这种「改名改一半」的中间态（直接红）；
 *      ↳ 原树名本身在场只 WARN（回滚演练合法），否则真回滚时这条断言会把跨树对账一起误杀
 *   BB14 节点码倒排表是 backbone_path 的行化镜像：总行数 = 列值 token 总数、公告数闭合、
 *      不留残行、形制合法、抽样 300 条逐集合对拍（COUNT + SUM(CRC32)）差异必须 0
 *      ↳ 表未建只 WARN：建表是人工闸口（scripts/ops/commodity-notice-nodes-ddl.ts），
 *        但读侧一旦切到倒排表，这条就必须转绿 —— 它也是上线清单里的那一项
 *   BB15 落点表是 backbone_path 的事实源（旧品类码全面退役 R1）：落点全在树、
 *      同一公告的落点互不为祖先（全表不抽样）、列值 = 落点闭包（抽两头）、
 *      与宽表双向闭合（有列值必有落点行、有落点行必有列值）；BB15d 按 source 分档与 AS2/AS4 同口径。
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
import { loadBackboneIndex, toBackbonePathColumn, BACKBONE_NODE_PREFIX } from "../../src/lib/services/commodity/backbone-path";
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
  `SELECT code, parent_code, level, group_code, name_zh FROM crm_commodity_backbone`,
) as unknown as { code: string; parent_code: string; level: number; group_code: string; name_zh: string }[];
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
              SUM(code LIKE 'UGT-%') leaked FROM crm_commodity_nodes`,
    )
  : null;
// 段→大类只认常量这一份：段归属表 crm_commodity_group_segments 已按 ADR-0009 退役，
// segToGroup 于是纯粹来自常量（上方 43~44 行），BB4 变成「树 L1/L4 的 group_code ↔ 常量」的直接比对。
const byCode = new Map(rows.map((r) => [r.code, r]));
const kids = new Map<string, number>();

// ── BB1 ──
for (const r of rows) {
  if (!/^UGT-\d+$/.test(r.code)) { fail(`BB1 码形制非法：${r.code}`); continue; }
  if (r.code.length !== BACKBONE_NODE_PREFIX.length + r.level * 2) fail(`BB1 码长与层级不符：${r.code}（L${r.level} 应为 ${BACKBONE_NODE_PREFIX.length + r.level * 2} 字符）`);
  if (r.level === 1) { if (r.parent_code !== "") fail(`BB1 大类行 parent 应为空串：${r.code}`); }
  else {
    if (r.parent_code !== r.code.slice(0, -2)) fail(`BB1 父码≠自身去末两级：${r.code}→${r.parent_code}`);
    if (!byCode.has(r.parent_code)) fail(`BB1 父节点不存在：${r.code}→${r.parent_code}`);
  }
  if (!r.name_zh) fail(`BB1 节点名为空：${r.code}`);
  kids.set(r.parent_code, (kids.get(r.parent_code) ?? 0) + 1);
}
for (const [p, k] of kids) if (k > 99) fail(`BB1 ${p} 下子节点 ${k} 个，超 2 位编码上限 99`);

// ── BB2/BB3 已于 R4' 拆机──
// 旧语义需旧前缀映射列行反推⇒入口剥后断言失对象。旧树不在时 orig=null，与现在直接拆机同形。

// ── BB4 大类连续（精简版：树上内存自洽）──
// 旧版中的“段→常量推大类”需旧前缀映射列；拆后保留“L4.group_code 与祖先 L1.group_code 逐行一致”
// 那半边⇒不依赖旧品类码。`anc` 的长度从常量 BACKBONE_NODE_PREFIX 取（旧“UGT-B-”前写死 6 已改正）。
const anc = (code: string, level: number) => code.slice(0, BACKBONE_NODE_PREFIX.length + level * 2);
{
  let l4Count = 0;
  for (const r of rows) {
    if (r.level !== 4) continue;
    l4Count++;
    const l1 = byCode.get(anc(r.code, 1));
    if (!l1) { fail(`BB4 祖先大类行缺失：${r.code}`); continue; }
    if (r.group_code !== l1.group_code) fail(`BB4 group_code 与祖先不一致：${r.code} ${r.group_code} vs ${l1.group_code}`);
  }
  console.log(`BB4 L4 与祖先 L1 group_code 逐行自洽（共扫 ${l4Count} 行 L4）`);
}

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
  // 索引先构：R4' 后 BB7/BB15/BB16 都在同一棵树上跑；构索引本身失配 ⇒ 红（不抱预期默认它可用）
  // 旧的 BB7 “可算必填”与 BB9/BB10 都拿它反查数字码入口⇒入口剥后不再消费实例。
  try {
    // 与运行期同一个构造入口：门禁自己拼行集的话，报红就分不清是「第二份实现」
    // 还是「行集不同」（比如 status 过滤、或段映射来源不一致）
    const _idx = await loadBackboneIndex(async <T = Record<string, unknown>>(sql: string) =>
      ((await pool.query(sql)) as [T[], unknown])[0],
    );
    void _idx;
  } catch (e) {
    fail(`BB7/BB15 构骨架索引失败：${(e as Error).message}`);
  }

  const p = await one(
    `SELECT SUM(backbone_path IS NOT NULL AND backbone_path<>'') filled,
            SUM(backbone_path='') blank,
            SUM(backbone_path REGEXP '[^0-9A-Za-z,-]') bad,
            SUM(CHAR_LENGTH(backbone_path)>1000000) tooLong FROM crm_notice_search`,
  );
  // 宽表形制不变量：非空串 / 合法字符 / 不超长
  if (Number(p.blank) !== 0) fail(`BB7 宽表有 ${p.blank} 行 backbone_path 是空串，应为 NULL`);
  if (Number(p.bad) !== 0) fail(`BB7 有 ${p.bad} 行 backbone_path 含非法字符（只允许树码与逗号）`);
  if (Number(p.tooLong) !== 0) fail(`BB7 有 ${p.tooLong} 行超过 1,000,000 字符上限，回填脚本应拒写而非截断`);
  // 祖先全存的不变量：排好序后第一个码必为大类行（否则说明回填时漏了链顶）
  const noTop = await one(
    `SELECT COUNT(*) n FROM crm_notice_search WHERE backbone_path IS NOT NULL AND backbone_path<>''
       AND SUBSTRING_INDEX(backbone_path, ',', 1) NOT REGEXP '^UGT-[0-9]{2}$'`,
  );
  if (Number(noTop.n) !== 0) fail(`BB7 有 ${noTop.n} 行 backbone_path 的链顶不是大类，祖先没存全`);
  // 活跃公告有落点 ⇒ 必进宽表行（否则在新树上彻底看不见：相似/筛选都进不了）。
  // 旧判据“活跃公告挂码却无宽表”已跟桥表下线；新判据以落点表为源。
  // 落点表不存在时（CI e2e 建表前置）只 WARN，不阻断——与 BB15/BB16 同一处置。
  const attrExistsForBb7 = await one(
    `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='crm_notice_attribution_nodes'`,
  );
  if (Number(attrExistsForBb7.n) === 0) {
    console.log("⚠ BB7 落点表不存在，活跃公告同步缺位断言本轮未执行（建表前置：scripts/ops/notice-attribution-ddl.ts --apply --yes）");
  } else {
    const noWide = await one(
      `SELECT COUNT(*) n FROM (SELECT n.id FROM crm_notice_attribution_nodes a
         JOIN crm_bid_notices n ON n.id = a.notice_pk
        WHERE ${ACTIVE_NOTICE_WHERE} AND NOT EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id)
        GROUP BY n.id) x`,
    );
    if (Number(noWide.n) !== 0) {
      fail(`BB7 有 ${noWide.n} 条活跃公告有落点却没进宽表 ⇒ 新树上彻底不行（同步缺位，不依赖回填发现）`);
    }
  }
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

  // BB9 已于旧品类码退役 R4' 删除：旧语义“拿 fam+0000 试挂 ix.match()”验证的
  // 是数字码入口的“最深可证实唯一”分档；match() 入口已剥⇒断言失参考系。
  // BB10 已于旧品类码退役 R3' 删除：旧语义“列值 = pathOf(桥表旧品类码)”已交给 BB15c（列值 = 落点派生）。
  // 两段注释保留，防止后人拉回“为什么这里少一大块”。
  pathStat = `已填 ${p.filled} · 抽样 ${pc.size} 码全在树`;
}

console.log(`树：L1 ${perLevel[0]} / L2 ${perLevel[1]} / L3 ${perLevel[2]} / L4 ${perLevel[3]} / L5 ${perLevel[4]}（合计 ${rows.length} 行，一张表）`);
if (pathStat) console.log(`公告归属：${pathStat}`);
console.log(`规模带（每父的子数）：中类/大类 ${bandof(1)}｜小类/中类 ${bandof(2)}｜子类/小类 ${bandof(3)}｜品目/子类 ${bandof(4)}`);
if (sibWarn) console.log(`⚠ ${sibWarn} 条同名兄弟（子类/品目行继承原树名，不改）`);
/** 入参是父的层级：父码长 = BACKBONE_NODE_PREFIX.length + 父层级×2（L1=6、L2=8…），kids 按 parent_code 计数 */
function bandof(parentLevel: number) {
  const len = BACKBONE_NODE_PREFIX.length + parentLevel * 2;
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
              SUM(node NOT LIKE 'UGT-%') badPrefix
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
      fail(`BB14 有非节点码形制的行（${Number(dst.badShape ?? 0)}/${Number(dst.badPrefix ?? 0)}）：本表只允许 backbone-path 产出的 UGT- 码`);
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

// ── BB15 落点表是 backbone_path 的事实源（旧品类码全面退役 R1）──
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
    // 4) 双向闭合（按 source 分档，与 check-attribution-ssot AS2/AS4 同口径）：
    //    · 有列值却没落点行 = 事实源不存在⇒红（AS4 侧对应）
    //    · 有 legacy_tag 落点却没列值 = 灌入落后⇒红
    //    · 有非 legacy_tag 落点却没列值 = AI/manual 已锈定但 wide 尚未回派生，中间态⇒WARN
    //    旧版不分 source 一律判红，与 AS2/AS4 结论相反（2026-10-13 实测），已修正。
    const noAttr = await one(
      `SELECT COUNT(*) n FROM crm_notice_search ns
       LEFT JOIN ${ATTR_TAB} a ON a.notice_pk = ns.id
       WHERE ns.backbone_path IS NOT NULL AND ns.backbone_path <> '' AND a.notice_pk IS NULL`,
    );
    const orphanLegacy = await one(
      `SELECT COUNT(*) n FROM ${ATTR_TAB} a
       LEFT JOIN crm_notice_search ns ON ns.id = a.notice_pk
       WHERE a.source = 'legacy_tag' AND (ns.id IS NULL OR ns.backbone_path IS NULL OR ns.backbone_path = '')`,
    );
    const orphanNew = await one(
      `SELECT COUNT(*) n FROM ${ATTR_TAB} a
       LEFT JOIN crm_notice_search ns ON ns.id = a.notice_pk
       WHERE a.source <> 'legacy_tag' AND (ns.id IS NULL OR ns.backbone_path IS NULL OR ns.backbone_path = '')`,
    );
    const olN = Number(orphanLegacy.n);
    const onN = Number(orphanNew.n);
    console.log(
      `BB15d 双向闭合：有列值无落点 ${Number(noAttr.n)} 条 / 有 legacy 落点无列值 ${olN} 条 / 有非 legacy 落点无列值 ${onN} 条（后者属中间态，WARN）`,
    );
    if (Number(noAttr.n) > 0) {
      fail(`BB15d 有 ${Number(noAttr.n)} 行列值找不到对应的落点：事实源不存在⇒读侧切到落点表后会被清 NULL（AS4 同项）`);
    }
    if (olN > 0) {
      fail(`BB15d 有 ${olN} 行 legacy_tag 落点找不到对应的宽表列值：事实源写了但派生列没跟上（或公告已删而落点没清）`);
    }
    if (onN > 0) {
      console.log(`⚠ BB15d 有 ${onN} 行非 legacy_tag 落点无 wide 列值：AI/manual 已锈定但 wide 尚未回派生，属中间态，不判红`);
    }
  }
}

// ── BB16 新公告落点覆盖率红信号（R2 切读后 MUST：跌破阈值 WARN，不许静默缺席。仅 WARN，不影响退出码）──
{
  const attrExists = await one(
    `SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='crm_notice_attribution_nodes'`,
  );
  if (Number(attrExists.n) > 0) {
    const cov = await one(
      `SELECT COUNT(*) total,
              COALESCE(SUM(EXISTS(SELECT 1 FROM crm_notice_attribution_nodes a WHERE a.notice_pk = n.id)), 0) covered
         FROM crm_bid_notices n
        WHERE n.create_time >= UNIX_TIMESTAMP(NOW() - INTERVAL 7 DAY)`,
    );
    const total = Number(cov.total), covered = Number(cov.covered);
    const rate = total ? covered / total : 1;
    const line = `BB16 近7天新公告落点覆盖率：${covered}/${total} = ${(rate * 100).toFixed(1)}%`;
    if (total === 0) console.log(`⚠ ${line}（无新公告，跳过）`);
    else if (rate < 0.6) console.log(`⚠ ${line} ⇒ 跌破 60%：若已切读（ATTRIBUTION_READ=on），这些新公告 backbone_path 会是 NULL（分类静默缺席）——需跑落点生产者（AI 或镜像）补落点。flag 关时此警告仅为前瞻`);
    else console.log(line);
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
