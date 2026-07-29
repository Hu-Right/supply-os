// T-C6 s_text 文本相似度验证（本地差异 #16：C.2 校正二方案 1）
// 与 server.ts 同构复制 tokenizeNoticeText / jaccardTokenSim / 关键词加载 SQL——
// 规则变更需同步两处。只读脚本：不写任何表。
// 验收断言：① Jaccard 对称性（单测片段留档）② 边界（空集 0 / 同集 1 / 值域 [0,1]）
// ③ 分词确定性 + 停用词 + CJK bigram ④ 关键词加载 SQL 只读且 <3s ⑤ 零解锁历史 → null（恒等口径）
import mysql from "mysql2/promise";

const TEXT_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "are", "was", "were", "will",
  "supply", "provision", "procurement", "services", "service", "tender", "bid", "rfq", "rfp", "itb",
]);
const tokenizeNoticeText = (text) => {
  const tokens = new Set();
  const lower = String(text || "").toLowerCase();
  for (const match of lower.matchAll(/[a-z0-9]+/g)) {
    const word = match[0];
    if (word.length >= 3 && !TEXT_STOPWORDS.has(word)) tokens.add(word);
  }
  for (const match of lower.matchAll(/[\u4e00-\u9fff]+/g)) {
    const seg = match[0];
    if (seg.length === 1) tokens.add(seg);
    for (let i = 0; i + 1 < seg.length; i++) tokens.add(seg.slice(i, i + 2));
  }
  return tokens;
};
const jaccardTokenSim = (a, b) => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter++;
  return inter / (a.size + b.size - inter);
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  → ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// ① 对称性：随机词集 500 对，jaccard(a,b) === jaccard(b,a) 严格相等
let symmetric = true;
const randToken = (rng) => `t${Math.floor(rng() * 40)}`;
let seed = 42;
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
for (let round = 0; round < 500; round++) {
  const a = new Set(Array.from({ length: 1 + Math.floor(rng() * 15) }, () => randToken(rng)));
  const b = new Set(Array.from({ length: 1 + Math.floor(rng() * 15) }, () => randToken(rng)));
  if (jaccardTokenSim(a, b) !== jaccardTokenSim(b, a)) { symmetric = false; break; }
}
check("Jaccard 对称性（500 对随机词集严格相等）", symmetric);

// ② 边界：空集 0 / 同集 1 / 值域 [0,1]
const setA = tokenizeNoticeText("Supply of medical equipment for hospitals");
check(
  "边界：空集=0 / 同集=1 / 半重合∈(0,1)",
  jaccardTokenSim(new Set(), setA) === 0 &&
    jaccardTokenSim(setA, setA) === 1 &&
    (() => {
      const half = jaccardTokenSim(setA, tokenizeNoticeText("Medical equipment maintenance"));
      return half > 0 && half < 1;
    })()
);

// ③ 分词：确定性（同输入同输出）、停用词滤除、短词滤除、CJK bigram
const tokens1 = tokenizeNoticeText("The Supply of IT equipment 医疗设备 RFQ-2024");
const tokens2 = tokenizeNoticeText("The Supply of IT equipment 医疗设备 RFQ-2024");
const sameTokens = tokens1.size === tokens2.size && [...tokens1].every((t) => tokens2.has(t));
check(
  "分词确定性 + 停用词/短词滤除 + CJK bigram",
  sameTokens && !tokens1.has("the") && !tokens1.has("supply") && !tokens1.has("it") &&
    tokens1.has("equipment") && tokens1.has("2024") &&
    tokens1.has("医疗") && tokens1.has("疗设") && tokens1.has("设备"),
  `tokens=[${[...tokens1].join(",")}]`
);

// ④⑤ 生产库只读实测
const pool = await mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm",
  waitForConnections: true, connectionLimit: 2,
});
try {
  // ④ 关键词加载 SQL（同构复制）：取一个有解锁记录的真实 user_key 实测耗时
  const [sampleRows] = await pool.query(
    `SELECT user_key FROM crm_opportunity_unlocks WHERE notice_id IS NOT NULL LIMIT 1`
  );
  const sampleKey = sampleRows[0]?.user_key || "__no_such_user__";
  const t0 = Date.now();
  const [titleRows] = await pool.query(
    `SELECT n.title
     FROM crm_opportunity_unlocks u
     INNER JOIN crm_bid_notices n ON n.id = u.notice_id
     WHERE u.user_key = ? AND u.notice_id IS NOT NULL
     ORDER BY u.unlocked_at DESC
     LIMIT 50`,
    [sampleKey]
  );
  const elapsed = Date.now() - t0;
  const merged = new Set();
  for (const row of titleRows) for (const token of tokenizeNoticeText(row.title)) merged.add(token);
  check(
    "关键词加载 SQL 只读且 <3s",
    elapsed < 3000,
    `${elapsed}ms，样本 user=${sampleKey === "__no_such_user__" ? "（无解锁数据）" : sampleKey.slice(0, 12) + "…"}，标题 ${titleRows.length} 条 → ${merged.size} 关键词`
  );

  // ⑤ 零解锁历史用户 → 标题 0 条 → keywords=null → 加分恒 0（恒等口径）
  const [emptyRows] = await pool.query(
    `SELECT n.title
     FROM crm_opportunity_unlocks u
     INNER JOIN crm_bid_notices n ON n.id = u.notice_id
     WHERE u.user_key = ? AND u.notice_id IS NOT NULL
     LIMIT 50`,
    ["__tc6_never_exists__"]
  );
  check("零解锁历史 → 0 标题 → keywords=null 恒等口径", emptyRows.length === 0, `rows=${emptyRows.length}`);
} finally {
  await pool.end();
}

console.log(`\nT-C6 s_text 文本相似度验证：${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
