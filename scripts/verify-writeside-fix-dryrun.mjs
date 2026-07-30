// 只读 dry-run：验证 Step 4 修改后的 syncUnspscBridgeRow 写侧逻辑是否止血。
// 精确复现修改后的计算路径（normalizeUnspscCodes + getUnspscPath 回溯），
// 对真实公告样本算出"将要写入的桥接行"，只打印不 INSERT，全程不改任何数据。
//
// 判定标准（止血指标）：
//   - 新逻辑产出的 level1_id 必须全部 ∈ {100..109}（类目 id），
//   - prefix 形态（level1_id == LEFT(code,2) 且非 100~109）新增计数必须 = 0。
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm", connectionLimit: 2,
});

// —— 复现 server.ts normalizeUnspscCodes 的取码逻辑（数字码 2~8 位）——
function normalizeCodes(value) {
  let source = value;
  if (typeof value === "string") {
    try { source = JSON.parse(value); } catch { source = value; }
  }
  const found = new Map();
  const visit = (item) => {
    if (!item || found.size >= 20) return;
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (typeof item === "object") {
      const codeText = String(item.code || "");
      const matches = codeText.match(/\b\d{2}(?:\d{2}){0,3}\b/g) || [];
      for (const code of matches) if (!found.has(code)) found.set(code, { code });
      if (matches.length === 0) Object.values(item).forEach(visit);
      return;
    }
    const matches = String(item).match(/\b\d{2}(?:\d{2}){0,3}\b/g) || [];
    for (const code of matches) if (!found.has(code)) found.set(code, { code });
  };
  visit(source);
  return Array.from(found.values());
}

// —— 复现 server.ts getUnspscPath（沿 parent_id 回溯，填 levelN_id = row.id）——
async function getUnspscPath(codeId) {
  const path = { level1_id: null, level2_id: null, level3_id: null, level4_id: null, level5_id: null };
  let currentId = codeId;
  for (let i = 0; i < 6 && currentId; i += 1) {
    const [rows] = await pool.query(
      "SELECT id, parent_id, level FROM crm_unspsc_codes WHERE id = ? LIMIT 1", [currentId]
    );
    const row = rows[0];
    if (!row) break;
    if (row.level >= 1 && row.level <= 5) path[`level${row.level}_id`] = row.id;
    currentId = row.parent_id || null;
  }
  return path;
}

const L1SET = new Set(["100","101","102","103","104","105","106","107","108","109"]);

// 取含数字码的真实公告样本（不限是否已有桥接行——只做纯计算，不写库）
const [samples] = await pool.query(
  `SELECT id, unspsc_codes FROM crm_bid_notices
   WHERE unspsc_codes IS NOT NULL AND unspsc_codes REGEXP '[0-9]{6}'
   ORDER BY id DESC LIMIT 40`
);
console.log(`样本公告数: ${samples.length}`);

let planned = 0, skippedNoCode = 0;
let newPrefixDirty = 0, l1InRange = 0, l5Filled = 0;
const oldPrefixDirty = { count: 0 };  // 对照：旧 slice 逻辑会产生多少 prefix 脏行
const showcase = [];

for (const notice of samples) {
  const codes = normalizeCodes(notice.unspsc_codes);
  for (const item of codes) {
    const rawCode = String(item.code || "").replace(/\D/g, "").slice(0, 8);
    if (!rawCode) continue;

    // 旧逻辑对照：level1_id = rawCode.slice(0,2)（码前缀）—— 几乎必是 prefix 脏行
    const oldL1 = rawCode.length >= 2 ? rawCode.slice(0, 2) : null;
    if (oldL1 && !L1SET.has(oldL1)) oldPrefixDirty.count += 1;

    // 新逻辑：查类目 → 无则跳过 → getUnspscPath 回溯
    const [codeRows] = await pool.query(
      "SELECT id, code, level FROM crm_unspsc_codes WHERE code = ? LIMIT 1", [rawCode]
    );
    const codeRow = codeRows[0];
    if (!codeRow) { skippedNoCode += 1; continue; }   // 新增：跳过，不造 code_id=null 脏行
    const path = await getUnspscPath(codeRow.id);
    planned += 1;

    const l1 = path.level1_id == null ? null : String(path.level1_id);
    if (l1 && L1SET.has(l1)) l1InRange += 1;
    if (l1 && !L1SET.has(l1)) newPrefixDirty += 1;    // 止血指标：必须为 0
    if (path.level5_id != null) l5Filled += 1;

    if (showcase.length < 8) {
      showcase.push({ notice: notice.id, rawCode, codeId: codeRow.id, level: codeRow.level,
        oldL1_prefix: oldL1, newL1_catId: l1,
        newPath: [path.level1_id, path.level2_id, path.level3_id, path.level4_id, path.level5_id] });
    }
  }
}

console.log("\n=== 样例（旧 prefix vs 新 类目id）===");
for (const s of showcase) console.log(JSON.stringify(s));

console.log("\n=== 汇总 ===");
console.log(`将写入桥接行(新逻辑): ${planned}`);
console.log(`跳过(类目树查不到码, 新增保护): ${skippedNoCode}`);
console.log(`level1_id ∈ {100..109}: ${l1InRange} / ${planned}`);
console.log(`level5_id 有值(旧逻辑恒空): ${l5Filled}`);
console.log(`>>> 新逻辑 prefix 脏行数(止血指标, 必须=0): ${newPrefixDirty}`);
console.log(`--- 对照: 同样本旧 slice 逻辑会产生 prefix 脏行: ${oldPrefixDirty.count}`);

const pass = newPrefixDirty === 0 && l1InRange === planned && planned > 0;
console.log(`\n结论: ${pass ? "✅ 止血成功（新逻辑零 prefix 脏行，level1_id 全部为类目 id）" : "❌ 仍有 prefix 脏行，需复查"}`);

await pool.end();
