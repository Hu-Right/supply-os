/**
 * 可索引公告口径（GEO/SEO 单一事实源）
 *
 * @module lib/services/seo/indexable
 * @description 决定「哪些公告值得被搜索引擎/AI 收录并写进 sitemap」。
 *
 *              有效公告（ACTIVE_NOTICE_WHERE，n. 别名）只回答「过没过期」；
 *              本模块在此之上再加内容门槛，把 37 万条收敛到可引用子集：
 *                - 必须有国别与采购类型（否则标题无法回答「哪国、什么类型」）；
 *                - 正文分级必须是 thin/substantive（empty/echo 是抓取残缺）；
 *                - 标题/摘要要有最小长度（中文译文优先，缺失时用原文）。
 *
 *              为什么需要它：
 *                1) sitemap 只提交这个集合 —— 全量提交薄页会稀释整站质量分；
 *                2) 翻译流水线只翻这个集合 —— 控制成本；
 *                3) 周报用它算「可索引占比」，是收录进度的分母。
 *
 *              口径一旦改动，sitemap 分片数、翻译队列、周报会同时变化，
 *              所以只允许在这里改，禁止业务代码另写一套 WHERE。
 */
import { ACTIVE_NOTICE_WHERE, PLATFORM_PUBLISHED_ONLY } from "../../utils/notice-expired";

/** sitemap 单片 URL 上限（协议上限 5 万） */
export const SITEMAP_SHARD_SIZE = 50_000;
/** 分片数硬上限（indexable 集合异常增长时防止无限写盘） */
export const SITEMAP_MAX_SHARDS = 12;

/**
 * 内容门槛（notice_public 别名 p）。
 *
 * 与 ACTIVE_NOTICE_WHERE 的分工：那边管「时间有效」，这边管「内容够格」。
 *
 * [2026-11-25 放宽] 原来要求 `content_level IN ('substantive','thin')`，把 5.5 万条
 * 正文完整的公告挡在 sitemap 外。实测：
 *   - `content_level='echo'` 且正文 ≥200 字的 55,652 条，抽样都是真实采购描述
 *     （西班牙 ELISA 试剂、巴西电力服务等），不是模板噪声；
 *   - `content_level='empty'` 且 ≥200 字的只有 2 条，且是 5120 个空格（core_len=0）。
 * 因此改为：**排除 empty（空白正文）+ 用去空白后的长度判定**，不再依赖会过期的分级标签。
 *
 * 注意：`title_cn` / `description_cn` 是稀疏译文列，COALESCE 后取中文优先参与长度判定。
 */
export const INDEXABLE_NOTICE_WHERE = `(
  (p.deadline_ts IS NULL OR p.deadline_ts = 0 OR p.deadline_ts >= UNIX_TIMESTAMP())
  AND p.country_code IS NOT NULL
  AND p.notice_type_code IS NOT NULL
  AND p.content_level <> 'empty'
  AND CHAR_LENGTH(COALESCE(NULLIF(p.title_cn, ''), NULLIF(p.title, ''))) >= 8
  AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(
        COALESCE(NULLIF(p.description_cn, ''), NULLIF(p.description, '')),
        '\\r', ''), '\\n', ''))) >= 200
)`;

/**
 * sitemap 公告查询的完整 WHERE（需要 `bid_notices n JOIN notice_public p`）。
 *
 * `PLATFORM_PUBLISHED_ONLY` 排除平台用户未过审的 RFQ，避免把草稿提交给搜索引擎。
 */
export const SITEMAP_NOTICE_WHERE = `${ACTIVE_NOTICE_WHERE} AND ${PLATFORM_PUBLISHED_ONLY} AND ${INDEXABLE_NOTICE_WHERE}`;

/**
 * lastmod 唯一口径：入库时间与行刷新水位取较大者。
 *
 * 入库后被 reconcile 改写的公告（截止时间更正、正文补齐）必须触发重抓，
 * 只取 create_time 会让这类更新永远不被发现。
 */
export const NOTICE_LASTMOD_EXPR = "GREATEST(COALESCE(n.create_time, 0), COALESCE(p.updated_at, 0))";
