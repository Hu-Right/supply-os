/**
 * 首页数据 P50 / P90 基准（HTTP 口径 + DB 基线）
 *
 * - HTML /：线上首页直出（ISR 缓存命中态）
 * - /api/notices/stats、/api/notices/home-columns、/api/notices/hot-topics：首页三块数据的端点
 * - 同时跑本机 dev（127.0.0.1:3000）对照，剥离公网链路影响
 */
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}

const pct = (arr: number[], p: number): number => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return Math.round(s[idx]);
};
const stat = (label: string, arr: number[]) => {
  if (!arr.length) return void console.log(`${label} —— 无数据`);
  const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  console.log(`${label.padEnd(30)} n=${String(arr.length).padStart(2)}  P50=${String(pct(arr, 50)).padStart(5)}ms  P90=${String(pct(arr, 90)).padStart(5)}ms  avg=${String(avg).padStart(5)}ms  max=${Math.max(...arr)}ms`);
};

// ── DB 基线 ──
const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  connectionLimit: 2, enableKeepAlive: true,
});
{
  const t: number[] = [];
  for (let i = 0; i < 20; i += 1) {
    const s = performance.now();
    await pool.query("SELECT 1");
    t.push(performance.now() - s);
  }
  stat("DB SELECT 1", t);
}

// ── HTTP 探针 ──
async function probe(url: string, n: number): Promise<{ ttfb: number[]; total: number[]; status: Set<number> }> {
  const ttfb: number[] = [];
  const total: number[] = [];
  const status = new Set<number>();
  for (let i = 0; i < n; i += 1) {
    try {
      const s = performance.now();
      const res = await fetch(url, { headers: { "user-agent": "perf-probe/1.0" } });
      ttfb.push(performance.now() - s);
      status.add(res.status);
      await res.arrayBuffer();
      total.push(performance.now() - s);
    } catch (e) {
      console.log(`  ${url} 失败: ${(e as Error).message}`);
      break;
    }
  }
  return { ttfb, total, status };
}

const targets = [
  ["线上 HTML /", "https://osneosmart.com/"],
  ["线上 API stats", "https://osneosmart.com/api/notices/stats"],
  ["线上 API home-columns", "https://osneosmart.com/api/notices/home-columns?type=opportunity"],
  ["线上 API hot-topics", "https://osneosmart.com/api/notices/hot-topics"],
  ["本机 HTML /", "http://127.0.0.1:3000/"],
  ["本机 API stats", "http://127.0.0.1:3000/api/notices/stats"],
  ["本机 API home-columns", "http://127.0.0.1:3000/api/notices/home-columns?type=opportunity"],
] as const;

for (const [label, url] of targets) {
  const { ttfb, total, status } = await probe(url, 12);
  console.log(`\n[${label}] status=${[...status].join("/") || "ERR"}`);
  stat(`  TTFB`, ttfb);
  stat(`  总耗时`, total);
}

await pool.end();
