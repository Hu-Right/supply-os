/**
 * /sitemap/{id}.xml 与 /sitemap/static.xml
 *
 * @module app/sitemap/[shard]/route
 *
 * @description 2026-11-25 从 Next 的 sitemap metadata 路由改为普通 Route Handler：
 *
 *              - 公告分片读预生成快照（runtime/seo/sitemap/{id}.xml），实测 < 50 ms；
 *                旧实现每请求做深 OFFSET 扫库，单片 20–55 s，爬虫超时即丢片。
 *              - 静态片（/sitemap/static.xml）现场拼装 19 个固定页 + 国别 + 供应商，
 *                数据量小，不需要快照。
 *              - 快照缺失（首次部署/文件丢失）时实时渲染一片兜底；
 *                数据库也不可用则返回 503，让爬虫稍后重试——绝不返回空 sitemap
 *                （空列表可能被解读为「站点已无 URL」）。
 */
import { getPool } from "@/lib/db/pool";
import { readSitemapManifest, readSitemapShard, renderLiveNoticeShard } from "@/lib/services/seo/sitemap-snapshot";
import { renderUrlset } from "@/lib/services/seo/sitemap-xml";
import { buildStaticEntries } from "@/lib/services/seo/sitemap-static";

/** Next 侧响应缓存：10 分钟内同一分片直接复用，nginx 另有一层 */
export const revalidate = 600;

const XML_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
  "cache-control": "public, s-maxage=600, stale-while-revalidate=86400",
} as const;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ shard: string }> },
): Promise<Response> {
  const { shard } = await ctx.params;

  // 静态/国别/供应商
  if (shard === "static.xml") {
    const entries = await buildStaticEntries();
    return new Response(renderUrlset(entries), { headers: XML_HEADERS });
  }

  const matched = /^(\d+)\.xml$/.exec(shard);
  if (!matched) {
    return new Response("Not Found", { status: 404 });
  }
  const id = Number(matched[1]);
  if (!Number.isSafeInteger(id) || id < 0) {
    return new Response("Not Found", { status: 404 });
  }

  const snapshot = await readSitemapShard(id);
  if (snapshot) {
    return new Response(snapshot, { headers: XML_HEADERS });
  }

  // 已有 manifest 时，超出当前分片数说明该片已随可索引集合收缩而消失 → 404，
  // 避免回退实时查询返回空 urlset（旧缓存 URL 会被爬虫当作「本片已无内容」）。
  const manifest = await readSitemapManifest();
  if (manifest && id >= manifest.noticeShards) {
    return new Response("Not Found", { status: 404 });
  }

  // 冷启动兜底：实时渲染；DB 不可用返回 503（不要用空 sitemap 冒充「没有 URL」）
  const live = await renderLiveNoticeShard(getPool(), id);
  if (!live) {
    return new Response("Service Unavailable", {
      status: 503,
      headers: { "retry-after": "300", "cache-control": "no-store" },
    });
  }
  return new Response(live, { headers: XML_HEADERS });
}
