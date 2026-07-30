// scripts/golden-baseline.mjs
// 用法：先 npm run dev（连 192.168.1.2），另开终端：
//   录制迁移前基线： node scripts/golden-baseline.mjs record
//   迁移后比对：     node scripts/golden-baseline.mjs verify
import fs from "fs";
import path from "path";

const BASE = process.env.GOLDEN_BASE || "http://localhost:3039";
const OUT_DIR = "docs/superpowers/reports/golden";
const SNAP = path.join(OUT_DIR, "responses.json");
const PERF = path.join(OUT_DIR, "perf-baseline.json");
const mode = process.argv[2] || "record";

// 仅选取确定性只读端点（不含时间戳/随机 id 波动字段的端点；波动字段在 normalize 中剔除）
const endpoints = [
  "/api/certifications",
  "/api/unspsc/industries?lang=zh",
  "/api/unspsc/industries?lang=en",
  "/api/notices/countries",
  "/api/membership/plans",
  "/api/payment/config-status",
  "/api/payments/config-status",
  "/api/procurement/schema-status",
  "/api/training/downloads/stats",
  "/api/notices?page=1&pageSize=5",
  "/api/opportunities",
  "/api/suppliers?lang=zh",
  "/api/leads",
];

// 剔除天然波动字段，避免误报（如 leads 的 created_at、动态生成 id）
function normalize(obj) {
  return JSON.stringify(obj, (key, val) => {
    if (["created_at", "createdAt", "updated_at", "expires", "timestamp", "date"].includes(key)) return "<VOLATILE>";
    if (key === "id" && typeof val === "string" && /^lead-user-\d+$/.test(val)) return "<VOLATILE_ID>";
    return val;
  });
}

async function collect() {
  const out = {};
  const perf = {};
  for (const ep of endpoints) {
    const samples = [];
    let body = null, status = 0;
    // 采样 5 次取中位耗时，降低抖动
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const res = await fetch(BASE + ep);
      const text = await res.text();
      samples.push(performance.now() - t0);
      status = res.status;
      if (i === 0) { try { body = JSON.parse(text); } catch { body = text; } }
    }
    samples.sort((a, b) => a - b);
    out[ep] = { status, body: normalize(body) };
    perf[ep] = { medianMs: Math.round(samples[2]), status };
  }
  return { out, perf };
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

if (mode === "record") {
  const { out, perf } = await collect();
  fs.writeFileSync(SNAP, JSON.stringify(out, null, 2));
  fs.writeFileSync(PERF, JSON.stringify(perf, null, 2));
  console.log(`GOLDEN RECORDED: ${endpoints.length} endpoints -> ${SNAP}, ${PERF}`);
} else {
  if (!fs.existsSync(SNAP)) { console.error("No baseline. Run `record` first."); process.exit(2); }
  const golden = JSON.parse(fs.readFileSync(SNAP, "utf8"));
  const goldenPerf = JSON.parse(fs.readFileSync(PERF, "utf8"));
  const { out, perf } = await collect();
  let bodyFail = 0, perfWarn = 0;
  for (const ep of endpoints) {
    const g = golden[ep], n = out[ep];
    if (!g) { console.log(`NEW  ${ep} (无基线)`); continue; }
    const same = g.status === n.status && g.body === n.body;
    console.log(`${same ? "MATCH" : "DIFF "} ${ep}`);
    if (!same) bodyFail++;
    // 性能：允许 +50% 容差（本地抖动较大，仅作退化预警而非硬失败）
    const gm = goldenPerf[ep]?.medianMs ?? 0, nm = perf[ep].medianMs;
    if (gm > 0 && nm > gm * 1.5) { console.log(`  PERF-WARN ${ep}: ${gm}ms -> ${nm}ms`); perfWarn++; }
  }
  console.log(bodyFail === 0 ? "GOLDEN OK (响应逐字节一致)" : `GOLDEN FAILED: ${bodyFail} 端点响应不一致`);
  if (perfWarn > 0) console.log(`PERF: ${perfWarn} 端点响应耗时超基线 1.5 倍，需人工确认`);
  process.exit(bodyFail === 0 ? 0 : 1);
}
