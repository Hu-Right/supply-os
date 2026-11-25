#!/usr/bin/env node
/**
 * IndexNow 批量提交（手动运行）
 *
 * 用法：
 *   node scripts/tools/indexnow-submit.mjs
 *   INDEXNOW_KEY=xxx SITE_URL=https://osneosmart.com node scripts/tools/indexnow-submit.mjs
 *
 * 说明：读取 /sitemap-index.xml 下的所有分片，把 URL 按 10,000 条一批提交给
 *      api.indexnow.org；key 文件必须已发布在 https://<host>/<key>.txt。
 */
const SITE = (process.env.SITE_URL ?? "https://osneosmart.com").replace(/\/$/, "");
const KEY = process.env.INDEXNOW_KEY ?? "ef66632986ef4b3f937ca56330b837ff";
const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const BATCH = 10_000;

async function text(url) {
  const res = await fetch(url, { headers: { "user-agent": "supply-os-indexnow/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const index = await text(`${SITE}/sitemap-index.xml`);
const shards = [...index.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
if (shards.length === 0) throw new Error("sitemap-index 中没有分片");

const urls = [];
for (const shard of shards) {
  const xml = await text(shard);
  for (const m of xml.matchAll(/<loc>(.*?)<\/loc>/g)) {
    if (m[1].startsWith(SITE)) urls.push(m[1]);
  }
  console.log(`[indexnow] ${shard} -> ${urls.length} URLs`);
}

for (let i = 0; i < urls.length; i += BATCH) {
  const urlList = urls.slice(i, i + BATCH);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });
  console.log(`[indexnow] batch ${i / BATCH + 1}: ${res.status} (${urlList.length} URLs)`);
}
