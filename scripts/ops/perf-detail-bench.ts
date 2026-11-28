/**
 * 公告详情页 P50 / P90（线上 + 本地 dev）
 *
 * 覆盖：SEO 公开页 /procurement/notice/[id]、应用详情页 .../detail、
 *       以及匿名可访问的 /api/notices/[id]/preview、/[id]/detail、/[id]/content
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
  console.log(`${label.padEnd(32)} n=${String(arr.length).padStart(2)}  P50=${String(pct(arr, 50)).padStart(5)}ms  P90=${String(pct(arr, 90)).padStart(5)}ms  avg=${String(avg).padStart(5)}ms  max=${Math.max(...arr)}ms`);
};
async function probe(url: string, n = N): Promise<{ ttfb: number[]; total: number[]; status: Set<number>; len: number }> {
  const ttfb: number[] = []; const total: number[] = []; const status = new Set<number>(); let len = 0;
  for (let i = 0; i < n; i += 1) {
    try {
      const s = performance.now();
      const res = await fetch(url, { headers: { "user-agent": "perf-probe/1.0" } });
      ttfb.push(performance.now() - s);
      status.add(res.status);
      const buf = await res.arrayBuffer();
      len = buf.byteLength;
      total.push(performance.now() - s);
    } catch (e) {
      console.log(`  ${url} 失败: ${(e as Error).message}`); break;
    }
  }
  return { ttfb, total, status, len };
}

const live = "https://osneosmart.com";
const localBase = "http://localhost:3000";

const list = await (await fetch(`${live}/api/notices/unified-search?mode=default&page=1&page_size=5&locale=zh`)).json();
const ids = (list.items ?? []).map((it: { noticePk?: number }) => Number(it.noticePk)).filter(Boolean);
console.log("取样公告 id:", ids.join(", "));
const id = ids[0];

const targets: Array<[string, string]> = [
  ["线上 SEO 页 /notice/id", `${live}/procurement/notice/${id}`],
  ["线上 详情页 /notice/id/detail", `${live}/procurement/notice/${id}/detail`],
  ["线上 API preview", `${live}/api/notices/${id}/preview`],
  ["线上 API detail（匿名）", `${live}/api/notices/${id}/detail`],
  ["线上 API content（匿名）", `${live}/api/notices/${id}/content`],
  ["本地 SEO 页 /notice/id", `${localBase}/procurement/notice/${id}`],
  ["本地 详情页 /notice/id/detail", `${localBase}/procurement/notice/${id}/detail`],
  ["本地 API preview", `${localBase}/api/notices/${id}/preview`],
];

for (const [label, url] of targets) {
  const { ttfb, total, status, len } = await probe(url);
  console.log(`\n[${label}] status=${[...status].join("/") || "ERR"} 大小=${Math.round(len / 1024)}KB`);
  stat("  TTFB", ttfb);
  stat("  总耗时", total);
}

// 冷态：取一个较老的公告（距最新约 5 万条），首次访问
const coldId = ids.length > 1 ? ids[ids.length - 1] : id;
for (const url of [`${live}/procurement/notice/${coldId}`, `${live}/api/notices/${coldId}/preview`]) {
  const s = performance.now();
  const res = await fetch(url, { headers: { "user-agent": "perf-probe-cold/1.0" } });
  await res.arrayBuffer();
  console.log(`\n[冷态首访] ${url} status=${res.status} 总=${Math.round(performance.now() - s)}ms`);
}
