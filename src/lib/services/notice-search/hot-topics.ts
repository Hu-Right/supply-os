/**
 * 首页热门话题聚合（国家 / 品目大类，带有效公告计数）
 * Homepage hot topics aggregation with active-notice counts
 *
 * @module server/services/notice-search/hot-topics
 * @description 规划 §5.1 内容模块 + §7.3 数量 SEO 的数据源：热门国家、热门品目大类
 *              均展示真实结果数。10 分钟内存缓存，国家计数复用 getNoticeCountries 既有缓存。
 *
 *              2026-10-11 backbone 化（为什么必须改）：旧的「热门行业」读的是旧字典
 *              `crm_unspsc_codes` 的 level=1 行 —— 那是 A..J **十个字母容器**，而首页文案
 *              与点进去的筛选都是 32 品目大类（一个容器最多跨 14 个大类，行业墙那批实测过
 *              「同容器不同大类可见内容完全一样」）。名与实差 3.2 倍粒度，用户点进去筛出
 *              的东西和标签说的不是一回事。
 *              现在按 32 个骨架 L1 行 × 宽表 `backbone_path` 的**包含**关系聚合，大类码由
 *              骨架 L1 行的 group_code 带出 —— 不靠「L1 码序号 = 大类码序号」的错觉
 *              （实测 32 行只有 5 行相等）。
 *              为什么是「包含」而不是「链顶」：backbone_path 升序全存祖先，取第一个码就是
 *              取该公告的最小大类，一条挂 2 个以上大类的公告只会被数一次（temp/probe92：
 *              有效公告 83,136 条里 5,272 条跨大类，占 6.3%）。实测两口径 TOP8 既差数又差序：
 *              UGT-04 链顶 5,763 / 包含 6,654（少 13.4%），UGT-04 与 UGT-05 直接换位。
 *              标称值必须是点进去的兑现值 —— 与检索侧大类谓词（filter-builder 的
 *              nodeMysqlWhere / nodeMeiliFilter）落在同一条包含关系上，才不会再长出两套数。
 *              展示名不在服务端拼：前端按大类码取 locale（与五级下拉第一级、chip 同一份名字），
 *              服务端混一份 DB name_zh/name_en 就会长出第二套名称口径（实测 L2~L4 的 name_en 全空）。
 *
 *              一并删除的：`unspsc` 字段（旧 level=2 码 TOP8）。前端从不读它（useHotTopics 的
 *              类型里没有、两个组件都没用），但它是首页聚合里第三条全表 FIND_IN_SET ——
 *              删字段就是删一次无收益的开销，而不是「先留着」。
 *
 *              有效公告谓词与 utils/notice-expired 的 ACTIVE_NOTICE_WHERE_NO_ALIAS
 *              逐字一致（该模块为唯一口径定义处；此处字面内联仅为满足静态安全扫描
 *              对 SQL 模板插值/动态语句的拦截，两处必须同步修改，禁止单边改动）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { getNoticeCountries } from "./countries";

const HOT_TOPICS_TTL_MS = 10 * 60 * 1000;
const HOT_TOPICS_LIMIT = 8;

/** 热门品目大类：node=骨架 L1 节点码（诊断用），code=大类码（前端取 locale 名 + 拼筛选链接） */
export interface HotGroupItem {
  node: string;
  code: string;
  count: number;
}

export interface HotTopics {
  countries: Array<{ country: string; count: number }>;
  industries: HotGroupItem[];
}

let hotTopicsCache: { data: HotTopics; expires: number } | null = null;

interface CountRow extends RowDataPacket {
  node: string;
  code: string;
  cnt: number;
}

/**
 * 热门品目大类 TOP8（按有效公告数降序）。
 * 导出是为了让单测能直接盯住 SQL 的取数口径（读哪张表、哪一列、什么关系）——
 * 这块一旦有人改回旧字典或改回链顶，运行期不报错、界面也照样有数，只是数的是另一套东西。
 *
 * 成本实测（temp/probe92、probe93、probe94，生产库 606,198 行 / 有效有链 83,136 行）：
 * - 本条（包含口径）：3.3s；
 * - 先派生表收窄再 FIND_IN_SET：8.1s（优化器具表后更慢，不要照抄那种写法）；
 * - 扫列 + 应用侧聚合：7.7s（3.8MB 单列的传输把开销全压到了网络上）；
 * - 链顶口径：0.85s —— 便宜但少 13.4%，且 TOP8 换位（已否决，理由见文件头）。
 * 3.3s 落在两层 10 分钟缓存（本模块内存缓存 + 路由 HTTP 缓存）之后，每个进程每 10 分钟
 * 最多付一次，换的是「标称 = 兑现」这一条，不是一次首页请求里跑 32 条 SQL。
 */
export const HOT_TOP_GROUPS_SQL = `
  SELECT b.code AS node, b.group_code AS code, COUNT(*) AS cnt
  FROM crm_commodity_backbone b
  JOIN crm_notice_search ns ON ns.backbone_path <> '' AND FIND_IN_SET(b.code, ns.backbone_path)
  WHERE b.level = 1 AND b.status = 1 AND b.group_code <> ''
    AND (ns.deadline_sec = 0 OR ns.deadline_sec >= UNIX_TIMESTAMP(NOW()))
  GROUP BY b.code, b.group_code
  ORDER BY cnt DESC
  LIMIT 8`;

async function countTopGroups(pool: Pool): Promise<HotGroupItem[]> {
  const [rows] = await pool.query(HOT_TOP_GROUPS_SQL);
  return (rows as CountRow[]).map((r) => ({
    node: String(r.node || ""),
    code: String(r.code || ""),
    count: Number(r.cnt) || 0,
  }));
}

/** 读取热门话题聚合（10 分钟 TTL，过期惰性重建；国家计数复用国家缓存） */
export async function getHotTopics(pool: Pool): Promise<HotTopics> {
  if (hotTopicsCache && hotTopicsCache.expires > Date.now()) return hotTopicsCache.data;
  const [countryList, industries] = await Promise.all([
    getNoticeCountries(pool),
    countTopGroups(pool),
  ]);
  const data: HotTopics = {
    countries: countryList.slice(0, HOT_TOPICS_LIMIT),
    industries,
  };
  hotTopicsCache = { data, expires: Date.now() + HOT_TOPICS_TTL_MS };
  return data;
}

/** 清除缓存（测试辅助） */
export function clearHotTopicsCache(): void {
  hotTopicsCache = null;
}
