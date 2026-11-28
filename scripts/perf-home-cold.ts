/**
 * 首页「冷态」补充测量
 * 1) ISR 60s 过期后的首次渲染（SSR 重新生成快照）
 * 2) 带随机参数的端点请求（探缓存键是否含 query）
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const timeOne = async (url: string) => {
  const s = performance.now();
  const res = await fetch(url, { headers: { "user-agent": "perf-probe-cold/1.0" } });
  const ttfb = performance.now() - s;
  const len = (await res.arrayBuffer()).byteLength;
  return { status: res.status, ttfb: Math.round(ttfb), total: Math.round(performance.now() - s), len };
};

console.log("等待 ISR 过期（65s）…");
await sleep(65_000);
for (let i = 1; i <= 2; i += 1) {
  const r = await timeOne("https://osneosmart.com/");
  console.log(`冷 HTML 第 ${i} 次（过期后首请求）: status=${r.status} TTFB=${r.ttfb}ms 总=${r.total}ms 大小=${Math.round(r.len / 1024)}KB`);
  await sleep(65_000);
}

console.log("\n带随机参数探缓存键：");
for (let i = 0; i < 4; i += 1) {
  const r = await timeOne(`https://osneosmart.com/api/notices/stats?bust=${Date.now()}${i}`);
  console.log(`  stats?bust 第 ${i + 1} 次: ${r.status} ${r.total}ms`);
}
