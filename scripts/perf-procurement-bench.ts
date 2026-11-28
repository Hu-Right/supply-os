/**
 * 全球商机页（/procurement）P50 / P90 基准
 *
 * - HTML：无参数（默认列表）与带 q（热词落地）两种入口
 * - API：/api/notices/unified-search 首页、带 q、以及「冷缓存」的随机词
 * - 线上与本地 dev 各跑一遍对照
 */
const N = 12;
const pct = (arr: number[], p: number): number => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return Math.round(s[idx]);
};
const stat = (label: string, arr: number[]) => {
  if (!arr.length) return void console.log(`${label} 无数据`);
  const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  console.log(`${label.padEnd(34)} n=${String(arr.length).padStart(2)}  P50=${String(pct(arr, 50)).padStart(5)}ms  P90=${String(pct(arr, 90)).padStart(5)}ms  avg=${String(avg).padStart(5)}ms  max=${Math.max(...arr)}ms`);
};

async function probe(url: string, n = N): Promise<{ ttfb: number[]; total: number[]; status: Set<number> }> {
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

const q = encodeURIComponent("光伏");
const rand = () => encodeURIComponent(`zz${Math.random().toString(36).slice(2, 8)}`);

const targets: Array<[string, string, number]> = [
  ["线上 HTML /procurement", "https://osneosmart.com/procurement", N],
  ["线上 HTML ?q=光伏", `https://osneosmart.com/procurement?q=${q}`, N],
  ["线上 API 首页", "https://osneosmart.com/api/notices/unified-search?mode=default&page=1&page_size=10&locale=zh", N],
  ["线上 API ?q=光伏", `https://osneosmart.com/api/notices/unified-search?mode=default&page=1&page_size=10&locale=zh&q=${q}`, N],
  ["本机 HTML /procurement", "http://localhost:3000/procurement", N],
  ["本机 HTML ?q=光伏", `http://localhost:3000/procurement?q=${q}`, N],
  ["本机 API 首页", "http://localhost:3000/api/notices/unified-search?mode=default&page=1&page_size=10&locale=zh", N],
  ["本机 API ?q=光伏", `http://localhost:3000/api/notices/unified-search?mode=default&page=1&page_size=10&locale=zh&q=${q}`, N],
];

for (const [label, url, n] of targets) {
  const { ttfb, total, status } = await probe(url, n);
  console.log(`\n[${label}] status=${[...status].join("/") || "ERR"}`);
  stat("  TTFB", ttfb);
  stat("  总耗时", total);
}

// 冷缓存：随机词几乎不可能命中 5 分钟结果缓存
const cold: number[] = [];
for (let i = 0; i < 6; i += 1) {
  const url = `https://osneosmart.com/api/notices/unified-search?mode=default&page=1&page_size=10&locale=zh&q=${rand()}`;
  const s = performance.now();
  const res = await fetch(url, { headers: { "user-agent": "perf-probe-cold/1.0" } });
  await res.arrayBuffer();
  cold.push(performance.now() - s);
}
console.log("\n[线上 API 冷缓存（随机词，未命中结果缓存）]");
stat("  总耗时", cold);
