/**
 * probe277 · 「不推水位的列改写」的方向与在途性（只读取证）
 *
 * probe276 只证明了 bak 表的 id 集合与差异集合重合。还差三件事，否则结论是半成品：
 *   ① 改写方向：旧值（bak）到底是不是 NULL、新值（现网）是不是真有 JSON 内容
 *      —— 决定这是「补数据」还是「换数据」，前者无害、后者必须去问写入方；
 *   ② 是否还在途：processlist 里有没有正在写这列的会话、bak 表有没有后续行
 *      —— 在途意味着对方在做批次化回填，我方切换只是撞上它的中间态；
 *   ③ 该列充实度的前后对比（现网 vs 上一批旧位），给主表文档的列画像补实测数。
 *
 * 这条取证正是 docs/adr/0003「水位列不能当差异判据」那条的实证来源，长期保留。
 * 用法：node --env-file=.env scripts/forensics/probe277-documents-rewrite-direction.mjs [--col=documents]
 */
import { conn } from "../../scripts/tools/lib/notices-slim-common.mjs";

const arg = (name, dft) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=")[1] ?? dft;
const BAK = "crm_bid_notices_documents_bak_20261015";
const LIVE = "crm_bid_notices";
const OLD_PREV = "crm_bid_notices_retired_b2_20261015";
// 只有 JSON 列才用得上 JSON_LENGTH；换成别的列就退回纯 NULL 判定
const COL = arg("col", "documents");
const filled = (t) => `\`${t}\`.\`${COL}\` IS NOT NULL AND JSON_LENGTH(\`${t}\`.\`${COL}\`) > 0`;
const c = await conn();

const [dir] = await c.query(
  `SELECT
     (SELECT COUNT(*) FROM \`${BAK}\` b WHERE b.\`${COL}\` IS NULL) bak_null,
     (SELECT COUNT(*) FROM \`${BAK}\` b WHERE b.\`${COL}\` IS NOT NULL) bak_filled,
     (SELECT COUNT(*) FROM \`${BAK}\` b JOIN \`${LIVE}\` l ON l.id=b.id WHERE ${filled("l")}) live_filled_of_bak,
     (SELECT COUNT(*) FROM \`${BAK}\` b JOIN \`${OLD_PREV}\` o ON o.id=b.id WHERE ${filled("o")}) prev_filled_of_bak`,
);
console.log(`① 方向：bak 旧值 NULL ${dir[0].bak_null} 行 / 非 NULL ${dir[0].bak_filled} 行`);
console.log(`   同一批 id：现网有内容 ${dir[0].live_filled_of_bak} 行，上一批旧位有内容 ${dir[0].prev_filled_of_bak} 行`);

const [full] = await c.query(
  `SELECT (SELECT COUNT(*) FROM \`${LIVE}\` WHERE ${filled(LIVE)}) live_filled,
          (SELECT COUNT(*) FROM \`${OLD_PREV}\` WHERE ${filled(OLD_PREV)}) prev_filled`,
);
console.log(`③ 全列充实度：现网 ${full[0].live_filled} 行 vs 上一批旧位 ${full[0].prev_filled} 行（差 ${full[0].live_filled - full[0].prev_filled}）`);

// ② 在途性：这里必须排除自己的连接（同 activeWritersOn 的教训，不排除会把自己算进去）
const [writers] = await c.query(
  `SELECT ID, USER, HOST, TIME, STATE, LEFT(INFO,140) info FROM information_schema.PROCESSLIST
     WHERE INFO LIKE ? AND ID <> CONNECTION_ID() ORDER BY TIME DESC LIMIT 10`,
  [`%${COL}%`],
);
console.log(`② 在途性：正在引用 ${COL} 的其他会话 ${writers.length} 条`);
for (const w of writers) console.log(`   id=${w.ID} ${w.USER}@${w.HOST} ${w.TIME}s [${w.STATE}] ${String(w.info).replace(/\s+/g, " ")}`);

const [bakMeta] = await c.query(
  `SELECT CREATE_TIME, UPDATE_TIME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
  [BAK],
);
console.log(`   bak 表 CREATE_TIME=${bakMeta[0]?.CREATE_TIME} UPDATE_TIME=${bakMeta[0]?.UPDATE_TIME}`);

await c.end();
