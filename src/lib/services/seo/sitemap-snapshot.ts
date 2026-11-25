/**
 * Sitemap 快照构建与读取
 *
 * @module lib/services/seo/sitemap-snapshot
 *
 * @description 公告 sitemap 不再「每请求深 OFFSET 扫库」（实测单片 20–55 s，
 *              爬虫超时即丢片），改为：
 *
 *                定时任务（默认 4 小时）→ 生成 XML 快照写入 runtime/seo/sitemap/
 *                路由（/sitemap/{id}.xml）→ 只读文件，秒回
 *
 *              生成用 **keyset 分页**（`n.id < cursor` + 主键倒序），不用 OFFSET；
 *              内容门槛引用 `indexable.ts` 的单一事实源；
 *              用 digest（有效条数 + 最大 id + 最大更新时间）短路，数据没变就不重写。
 *
 *              [2026-11-25] 曾尝试把候选集物化成 seo_indexable_notice 以避开 longtext
 *              长度计算，但本机经 SSH 隧道重建时连接被服务端反复掐断（PROTOCOL_CONNECTION_LOST），
 *              且单查询 LIMIT 50000 的形态本身可用，故回退为直查 + keyset。
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, RowDataPacket } from "mysql2/promise";
import {
  NOTICE_LASTMOD_EXPR,
  SITEMAP_MAX_SHARDS,
  SITEMAP_NOTICE_WHERE,
  SITEMAP_SHARD_SIZE,
} from "./indexable";
import { renderUrlset, type SitemapEntry } from "./sitemap-xml";
import { SITE_URL } from "./site";

export interface SitemapManifest {
  generatedAt: string;
  digest: string;
  shardSize: number;
  noticeShards: number;
  counts: number[];
  total: number;
}

interface NoticeRow extends RowDataPacket {
  id: number;
  lastmod: number | string | null;
}

const MANIFEST_FILE = "manifest.json";

/** 快照目录：默认 runtime/seo/sitemap（部署持久目录），可用 SEO_SITEMAP_DIR 覆盖 */
export function sitemapDir(): string {
  return process.env.SEO_SITEMAP_DIR || path.join(process.cwd(), "runtime", "seo", "sitemap");
}

function shardFile(id: number): string {
  return path.join(sitemapDir(), `${id}.xml`);
}

function isoOfEpoch(value: number | string | null): string | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(n * 1000).toISOString();
}

/** 读一片快照；不存在返回 null（路由回退实时生成） */
export async function readSitemapShard(id: number): Promise<string | null> {
  try {
    return await readFile(shardFile(id), "utf8");
  } catch {
    return null;
  }
}

/** 读 manifest；不存在返回 null */
export async function readSitemapManifest(): Promise<SitemapManifest | null> {
  try {
    const raw = await readFile(path.join(sitemapDir(), MANIFEST_FILE), "utf8");
    return JSON.parse(raw) as SitemapManifest;
  } catch {
    return null;
  }
}

/** 原子写文件（tmp → rename），避免路由读到半截 XML */
async function writeAtomic(file: string, content: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, file);
}

/** 可索引集合指纹：有效条数 + 最大 id + 最大更新时间 */
async function currentDigest(pool: Pool): Promise<{ digest: string; maxId: number; total: number }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total,
            COALESCE(MAX(n.id), 0) AS max_id,
            COALESCE(MAX(p.updated_at), 0) AS max_updated
       FROM bid_notices n
       STRAIGHT_JOIN notice_public p ON p.notice_pk = n.id
      WHERE ${SITEMAP_NOTICE_WHERE}`,
  );
  const row = rows[0] ?? {};
  const total = Number(row.total ?? 0);
  const maxId = Number(row.max_id ?? 0);
  const maxUpdated = Number(row.max_updated ?? 0);
  const digest = createHash("md5").update(`${total}|${maxId}|${maxUpdated}`).digest("hex");
  return { digest, maxId, total };
}

/**
 * 重建全部公告分片快照。
 *
 * - digest 未变且非 force → 直接跳过（不写盘）；
 * - keyset 分页：`id < cursor` + `ORDER BY id DESC`，每片 5 万；
 * - 任一片失败即抛出，已写好的分片保留（旧 manifest 不更新，路由继续读旧片）。
 */
export async function buildSitemapSnapshots(
  pool: Pool,
  options: { force?: boolean; log?: (msg: string) => void } = {},
): Promise<{ skipped: boolean; manifest: SitemapManifest }> {
  const log = options.log ?? ((m: string) => console.log(`[sitemap-snapshot] ${m}`));
  await mkdir(sitemapDir(), { recursive: true });

  const [{ digest, maxId, total }, previous] = await Promise.all([currentDigest(pool), readSitemapManifest()]);
  if (!options.force && previous?.digest === digest) {
    log(`digest 未变化（${digest.slice(0, 8)}），跳过重建，共 ${previous.total} 条`);
    return { skipped: true, manifest: previous };
  }

  const counts: number[] = [];
  let cursor = maxId + 1;
  const startedAt = Date.now();

  for (let shard = 0; shard < SITEMAP_MAX_SHARDS; shard += 1) {
    const [rows] = await pool.query<NoticeRow[]>(
      `SELECT n.id AS id, ${NOTICE_LASTMOD_EXPR} AS lastmod
         FROM bid_notices n
         STRAIGHT_JOIN notice_public p ON p.notice_pk = n.id
        WHERE ${SITEMAP_NOTICE_WHERE}
          AND n.id < ?
        ORDER BY n.id DESC
        LIMIT ?`,
      [cursor, SITEMAP_SHARD_SIZE],
    );
    if (rows.length === 0) break;

    // 只留 loc + lastmod：Google 明确忽略 changefreq/priority，去掉可让单片体积降 ~35%
    const entries: SitemapEntry[] = rows.map((row) => ({
      loc: `${SITE_URL}/procurement/notice/${row.id}`,
      lastmod: isoOfEpoch(row.lastmod),
    }));
    await writeAtomic(shardFile(shard), renderUrlset(entries));
    counts.push(rows.length);
    cursor = Number(rows[rows.length - 1].id);
    log(`分片 ${shard} 写入 ${rows.length} 条`);

    if (rows.length < SITEMAP_SHARD_SIZE) break;
  }

  const manifest: SitemapManifest = {
    generatedAt: new Date().toISOString(),
    digest,
    shardSize: SITEMAP_SHARD_SIZE,
    noticeShards: counts.length,
    counts,
    total: counts.reduce((sum, n) => sum + n, 0),
  };
  await writeAtomic(path.join(sitemapDir(), MANIFEST_FILE), JSON.stringify(manifest, null, 2));
  log(`完成：${manifest.noticeShards} 片 / ${manifest.total} 条（集合 ${total}），耗时 ${Date.now() - startedAt}ms`);
  return { skipped: false, manifest };
}

/**
 * 冷启动兜底：快照缺失时实时渲染一片（允许 OFFSET，仅用于首次部署/文件丢失）。
 * 返回 null 表示查询失败（调用方返回 503，让爬虫稍后重试）。
 */
export async function renderLiveNoticeShard(pool: Pool, shard: number): Promise<string | null> {
  try {
    const [rows] = await pool.query<NoticeRow[]>(
      `SELECT n.id AS id, ${NOTICE_LASTMOD_EXPR} AS lastmod
         FROM bid_notices n
         STRAIGHT_JOIN notice_public p ON p.notice_pk = n.id
        WHERE ${SITEMAP_NOTICE_WHERE}
        ORDER BY n.id DESC
        LIMIT ? OFFSET ?`,
      [SITEMAP_SHARD_SIZE, shard * SITEMAP_SHARD_SIZE],
    );
    return renderUrlset(
      rows.map((row) => ({
        loc: `${SITE_URL}/procurement/notice/${row.id}`,
        lastmod: isoOfEpoch(row.lastmod),
      })),
    );
  } catch (err) {
    console.error("[sitemap-snapshot] 实时渲染失败:", (err as Error).message);
    return null;
  }
}

/**
 * 定时重建：启动 30 s 后预热一次，之后每 intervalMs 重建。
 * 返回停止函数（测试/关闭用）。定时器 unref，不阻塞进程退出。
 */
export function startSitemapSnapshotScheduler(pool: Pool, intervalMs = 4 * 60 * 60 * 1000): () => void {
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    try {
      await buildSitemapSnapshots(pool);
    } catch (err) {
      console.error("[sitemap-snapshot] 重建失败（保留旧快照）:", (err as Error).message);
    }
  };
  const warmup = setTimeout(() => void run(), 30_000);
  const timer = setInterval(() => void run(), intervalMs);
  warmup.unref?.();
  timer.unref?.();
  return () => {
    stopped = true;
    clearTimeout(warmup);
    clearInterval(timer);
  };
}
