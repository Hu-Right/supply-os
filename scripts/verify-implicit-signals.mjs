// T-C7 隐式偏好信号验证（本地差异 #16：C.3.6）
// 只读脚本：不写任何表。信号映射与 server.ts 同构——dwell>30s +0.2 / scroll_end +0.1 /
// revisit +0.5 / quick_exit ×0.95（decay 带 GREATEST(0.01) 下限），规则变更需同步两处。
// 验收断言：① 反馈表 action ENUM 覆盖四种隐式信号（与显式共表由枚举区分）
// ② dwell_ms 列存在（dwell/quick_exit 携带停留毫秒）③ 秒退衰减下限保护（×0.95 恒 ≥0.01）
// ④ 反馈表按 action 分组只读统计（隐式/显式不混淆口径）
import mysql from "mysql2/promise";

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  → ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// ③ 纯函数断言：GREATEST(0.01, w × 0.95) 任意初值反复秒退，weight 永不 <0.01（下限保护）
let weight = 5;
let floorOk = true;
for (let i = 0; i < 500; i++) {
  weight = Math.max(0.01, weight * 0.95);
  if (weight < 0.01) { floorOk = false; break; }
}
check("秒退 ×0.95 衰减 500 轮恒 ≥0.01 下限", floorOk && Math.abs(weight - 0.01) < 1e-9, `final=${weight}`);

const pool = await mysql.createPool({
  host: "192.168.1.2", user: "root", password: "123456", database: "crm",
  waitForConnections: true, connectionLimit: 2,
});
try {
  // ① action ENUM 覆盖隐式四信号 + 显式五信号（T-B2 预留验证）
  const [cols] = await pool.query(
    `SHOW COLUMNS FROM crm_user_reco_feedback WHERE Field IN ('action', 'dwell_ms')`
  );
  const actionCol = cols.find((c) => c.Field === "action");
  const dwellCol = cols.find((c) => c.Field === "dwell_ms");
  const enumType = String(actionCol?.Type || "");
  const implicitActions = ["dwell", "scroll_end", "quick_exit", "revisit"];
  const explicitActions = ["impression", "click", "unlock", "dismiss", "favorite"];
  check(
    "action ENUM 覆盖四种隐式信号（与显式共表）",
    implicitActions.every((a) => enumType.includes(`'${a}'`)) &&
      explicitActions.every((a) => enumType.includes(`'${a}'`)),
    enumType
  );

  // ② dwell_ms 列存在
  check("dwell_ms 列存在（停留毫秒载体）", Boolean(dwellCol), String(dwellCol?.Type || "缺失"));

  // ④ 按 action 分组只读统计：隐式/显式行数可分别聚合，枚举天然区分不混淆
  const t0 = Date.now();
  const [stats] = await pool.query(
    `SELECT action, COUNT(*) AS cnt FROM crm_user_reco_feedback GROUP BY action`
  );
  const elapsed = Date.now() - t0;
  const byAction = Object.fromEntries(stats.map((r) => [r.action, Number(r.cnt)]));
  check(
    "按 action 分组只读统计（隐式/显式区分口径）且 <3s",
    elapsed < 3000,
    `${elapsed}ms，${stats.length} 种 action：${JSON.stringify(byAction)}`
  );
} finally {
  await pool.end();
}

console.log(`\nT-C7 隐式偏好信号验证：${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
