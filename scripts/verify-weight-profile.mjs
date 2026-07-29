// T-B7 只读探针：与 server.ts recomputeRecoWeightProfile / 推荐端点权重读取同构，实测：
// ① 缺档案时默认权重与第四批硬编码恒等 ② EMA 合成序列边界（全正/全负/空）
// ③ 生产库真实反馈用户的同构权重计算（只读，不写档案表）④ 反馈查询耗时
// 规则若在 server.ts 侧变更，本脚本须同步修改
import mysql from "mysql2/promise";

const pool = mysql.createPool({ host: "192.168.1.2", user: "root", password: "123456", database: "crm" });

let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  → ${detail}`); ok ? pass++ : fail++; };

// ── 同构：server.ts pickWeight / EMA / delta 计算 ──
const pickWeight = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : fallback;
};
const computeWeights = (actions) => {
  if (actions.length === 0) return null; // 无显式反馈：不建档案（全局默认恒等）
  let ema = 0.5;
  for (const action of actions) {
    const signal = action === "favorite" || action === "unlock" ? 1 : action === "click" ? 0.75 : 0;
    ema += 0.05 * (signal - ema);
  }
  const delta = Math.max(-0.1, Math.min(0.1, (ema - 0.5) * 0.2));
  return {
    w_unspsc: Number((0.5 + delta).toFixed(3)),
    w_agency: 0.15,
    w_amount: Number((0.1 - delta * 0.4).toFixed(3)),
    w_geo: 0.1,
    w_urgency: Number((0.15 - delta * 0.6).toFixed(3)),
  };
};
const weightSum = (w) => Number((w.w_unspsc + w.w_agency + w.w_amount + w.w_geo + w.w_urgency).toFixed(3));

// ① 缺档案 → 默认权重（0.5/0.15/0.10/0.10/0.15）与第四批硬编码表达式恒等
const wUnspsc = pickWeight(undefined, 0.5);
const wUrgency = pickWeight(undefined, 0.15);
const wAmount = pickWeight(undefined, 0.1);
const wNeutral = (pickWeight(undefined, 0.15) + pickWeight(undefined, 0.1)) * 0.5;
check("缺档案默认权重与旧硬编码恒等",
  wUnspsc === 0.5 && wUrgency === 0.15 && wAmount === 0.1 && wNeutral === 0.125,
  `w=(${wUnspsc}, ${wUrgency}, ${wAmount}) 常数=${wNeutral}`);

// ② EMA 合成序列边界：全正 → delta 上限方向；全负 → 下限方向；空 → 不建档；权重和恒 1
const allPos = computeWeights(Array(60).fill("favorite"));
const allNeg = computeWeights(Array(60).fill("dismiss"));
const empty = computeWeights([]);
check("全正反馈：w_unspsc 上调且五权重和=1",
  allPos.w_unspsc > 0.5 && allPos.w_unspsc <= 0.6 && weightSum(allPos) === 1,
  `w_unspsc=${allPos.w_unspsc} sum=${weightSum(allPos)}`);
check("全负反馈：w_unspsc 下调且五权重和=1",
  allNeg.w_unspsc < 0.5 && allNeg.w_unspsc >= 0.4 && weightSum(allNeg) === 1,
  `w_unspsc=${allNeg.w_unspsc} sum=${weightSum(allNeg)}`);
check("零反馈：不建档案（返回 null 走全局默认）", empty === null, "null");

// ③ 生产库真实反馈用户：同构只读计算（不写档案表）
let t0 = Date.now();
const [userRows] = await pool.query(
  `SELECT user_key, COUNT(*) AS cnt FROM crm_user_reco_feedback
   WHERE action IN ('click','favorite','unlock','dismiss','quick_exit')
   GROUP BY user_key ORDER BY cnt DESC LIMIT 1`
);
const topUser = userRows[0];
if (topUser) {
  const [feedbackRows] = await pool.query(
    `SELECT action FROM crm_user_reco_feedback
     WHERE user_key = ? AND action IN ('click','favorite','unlock','dismiss','quick_exit')
     ORDER BY created_at DESC, id DESC LIMIT 200`,
    [topUser.user_key]
  );
  const elapsed = Date.now() - t0;
  const actions = feedbackRows.map((r) => String(r.action)).reverse();
  const w = computeWeights(actions);
  console.log(`  [真实用户] ${actions.length} 条显式反馈 → w_unspsc=${w.w_unspsc} w_urgency=${w.w_urgency} w_amount=${w.w_amount}（${elapsed}ms）`);
  check("真实用户同构权重和=1 且各档在界内",
    weightSum(w) === 1 && w.w_unspsc >= 0.4 && w.w_unspsc <= 0.6 && w.w_urgency > 0 && w.w_amount > 0,
    `sum=${weightSum(w)}`);
  check("反馈近 200 条查询耗时 < 1s", elapsed < 1000, `${elapsed}ms`);
} else {
  console.log("  [真实用户] 反馈表暂无显式反馈数据（前端埋点刚上线），跳过 ③ 两项断言");
}

// ④ 档案表现有行（如有）五权重之和 ≈ 1（0.998~1.002 容差：DECIMAL(5,3) 舍入）
const [profileRows] = await pool.query(
  `SELECT user_key, w_unspsc + w_agency + w_amount + w_geo + w_urgency AS s FROM crm_reco_weight_profile LIMIT 50`
);
const badRows = profileRows.filter((r) => Math.abs(Number(r.s) - 1) > 0.002);
check("档案表现有行权重和均 ≈ 1", badRows.length === 0, `${profileRows.length} 行检查，异常 ${badRows.length}`);

console.log(`\nT-B7 权重微调验证：${pass} PASS / ${fail} FAIL`);
await pool.end();
process.exit(fail ? 1 : 0);
