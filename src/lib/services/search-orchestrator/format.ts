/**
 * 统一搜索编排器 — 结果格式化
 * Unified search orchestrator — result formatting
 *
 * @module server/services/search-orchestrator/format
 * @description 详情行 → 前端 NoticeItem 结构。对齐旧 formatSearchResult（搜索）
 *              与 mapResultItems（行业匹配）的字段口径，所有数据源行为一致。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

import { getAgencyCacheData, getNoticeAgencies } from "../notice-search/agencies/index";
import { classifyAgencyType } from "../agency/index";
import { resolveAgencyDisplay, ensureAgencyDisplaySnapshot } from "../agency/resolve";
import { fromBackbonePathColumn } from "../commodity/backbone-path";
import { countryZhOf } from "../country/display";

/** 匹配分 → 档次标签（2 档分色；分数与 mode-resolver 绝对层级口径对齐：
 *  L4/L5 命中 → 5 → precise；L2/L3 命中 → 2 → relevant） */
export function matchScoreToTierLabel(score: number): string {
  if (score >= 5) return "precise";   // L5/L4 精确匹配 → 绿色徽章
  if (score >= 2) return "relevant";  // L3/L2 行业相关 → 蓝色徽章
  return "unmatched";
}

/** [阶段0 A2] 逐文档匹配分：公告自身 backbone_path（品目树节点码集）与用户画像各档比对，
 *  取最深命中档定分（与 mode-resolver 口径一致：L4/L5 → 5；L2/L3 → 2）。
 *  无命中返回 undefined（降级多表 JOIN 路径的行没有 backbone_path 列，不挂徽章）。
 *  2026-10-13 precise 退役：原先读 precise_backbone_path（candidates 人工审核码派生），
 *  该口径已随候选表删除 ⇒ 现统一按全量 backbone_path 计分，
 *  行业匹配徽章语义待「行业树↔品目树」桥接重建。列值解析只走 fromBackbonePathColumn。 */
function perDocMatchScore(
  row: RowDataPacket,
  profileNodes: Array<{ level: number; node: string }>,
): number | undefined {
  const docNodes = new Set(fromBackbonePathColumn(row.backbone_path));
  if (docNodes.size === 0) return undefined;
  for (let level = 5; level >= 2; level -= 1) {
    const entry = profileNodes.find((e) => e.level === level);
    if (entry && docNodes.has(entry.node)) return level >= 4 ? 5 : 2;
  }
  return undefined;
}

/**
 * 机构展示的同步预热（详情/预览这类不走搜索主管道的单行出口专用，统一中文 2026-10-28）。
 * enrichAgencyI18n 的两层回退都读内存态：① resolveAgencyDisplay 依赖 agency_aliases 快照，
 * 而该快照原先只在 refreshNoticeAgencies（下拉刷新）内部 ensure —— 详情请求不经过下拉，
 * 不显式预热就永远拿不到别名表精名，卡片中文 / 详情英文的漂移由此产生；
 * ② 下拉缓存冷启动时补一次聚合查询（命中则零开销，与 _searchCore 同口径）。
 * 两个入口各自的表查询都带降级，这里统一吞掉异常：预热失败只是少一层翻译，不能让详情 500。
 */
export async function ensureAgencyI18nWarmup(pool: Pool): Promise<void> {
  await ensureAgencyDisplaySnapshot(pool).catch(() => undefined);
  if (!getAgencyCacheData()) await getNoticeAgencies(pool).catch(() => undefined);
}

/**
 * 机构 i18n 回退（共享助手），输入行一律用**服务表原字段**。
 * [统一中文 2026-10-28] 顺序为「精确解析优先」：
 * 1. resolveAgencyDisplay 精确解析（agency_aliases 精名 / 模式合成）——zh 须含汉字才视为翻译，
 *    胜过下拉聚合桶的通用修复标签（否则「黑山各机构」会遮住别名表的「黑山临床中心」）；
 *    纯透传（无汉字，如平台码/外文原名）不算翻译，继续走聚合回退，防露码回归（2026-10-12 红线）。
 * 2. 解析无汉字 → classifyAgencyType 计算聚合 i18n（国家取 country_code，缺省取 country_codes 首码）。
 * 3. 下拉缓存回退：buyer_name 大写 → 精确；buyer_group → 聚合键（与下拉框展示一致的修复标签）。
 * 4. 仍无 → 国家级「XX各机构」兜底（仅 zh）：zh 卡片买家列不露外文原文，真实买家名进详情看。
 * ⚠ 下拉缓存条目自身的键名仍是 `agency`（那是下拉 API 的形状），与公告行字段名无关。
 */
const CJK_RE = /[\u4e00-\u9fff]/;

export function enrichAgencyI18n(
  items: Array<Record<string, unknown>>,
  locale: string,
): Array<Record<string, unknown>> {
  // 机构国际化映射（键统一大写，与 query.ts 缓存构建侧 mergeKey/typeKey 口径对齐）
  const agencyCache = getAgencyCacheData();
  const agencyI18nMap = new Map<string, Record<string, string>>();
  if (agencyCache) {
    for (const item of agencyCache) {
      if (item.i18n) agencyI18nMap.set(String(item.agency || "").toUpperCase(), item.i18n);
    }
  }
  for (const item of items) {
    const agencyUpper = String(item.buyer_name || "").toUpperCase();
    // 国家上下文（供聚合回退）：服务表单码 country_code 优先，其次宽表 country_codes 首码，
    // 最后主表 n.country 英文名（推荐管道行只有它；countryZhOf/classify 均按归一键吃码与英文名）。
    // ⚠ 宽表 country_codes 当前为全空列（2026-10-28 查库 0/757947），仅作前向兼容位保留。
    const countryContext = (item.country_code ? String(item.country_code) : "")
      || String(item.country_codes || "").split(",")[0]
      || (item.country ? String(item.country) : "") || undefined;
    let i18n: Record<string, string> | undefined;
    if (item.buyer_name) {
      const disp = resolveAgencyDisplay(String(item.buyer_name));
      if (disp.i18n && disp.i18n.zh && CJK_RE.test(disp.i18n.zh)) {
        i18n = disp.i18n;
      } else {
        // 透传或无 i18n → 聚合分类计算回退（用解析后的 canonical + 国家上下文）
        const typeInfo = classifyAgencyType(disp.canonical, countryContext);
        if (typeInfo?.i18n) i18n = typeInfo.i18n;
      }
    }
    if (!i18n) {
      i18n = agencyI18nMap.get(agencyUpper)
        || (item.buyer_group ? agencyI18nMap.get(String(item.buyer_group)) : undefined);
    }
    // zh 终兜底：类型桶/缓存都没接住 → 国家级聚合标签，卡片不露外文原名
    if (!i18n && locale === "zh" && item.buyer_name) {
      const countryZh = countryContext ? countryZhOf(countryContext) : null;
      if (countryZh) i18n = { zh: `${countryZh}各机构` };
    }
    item.agency_i18n = i18n?.[locale] || undefined;
  }
  return items;
}

/**
 * 统一列表项主键口径：`notice_pk` 是前端唯一主键字段（NoticeList 的 key、NoticeCard 的收藏/曝光上报均读它）。
 * 服务表直读行天然带 `notice_pk`；而宽表未就绪的降级多表 JOIN 与推荐管道都按主表 `bid_notices.id` 投影，
 * 行里只有 `id`。三表主键同值（见 baseline.sql：notice_public.notice_pk = bid_notices.id，
 * notice_search.id = notice_pk）⇒ 缺 `notice_pk` 时由 `id` 补齐，已有值不覆盖、两者皆无则不凭空造。
 * 各产出层（formatItems / recommend / deadlineFallback）共用本助手，避免 key={undefined} 触发 React 缺失 key 警告。
 */
export function ensureNoticePk(item: Record<string, unknown>): Record<string, unknown> {
  if (item.notice_pk == null && item.id != null) {
    item.notice_pk = Number(item.id);
  }
  return item;
}

/**
 * 格式化搜索结果 items（服务表原字段直出）。
 * 只补三件事：列表侧一律 core_locked=true（详情才由解锁记录定值）+ 机构 i18n + 来源字段裁剪。
 * 不做字段别名、不做布尔归一、不解析附件造计数——那些口径的唯一事实源在服务表行本身。
 * [来源平台 2026-10-28] source_url / platform_name 属解锁后可见信息（用户口径）：
 * 列表卡片不再展示来源，且必须从列表载荷剔除——锁定详情是「列表条目 + /preview 合成」，
 * 留着 source_url 锁定态也能外链原文；解锁后的来源展示由 /detail 独家下发。
 * @param rows 详情行（fetchDetailsByIds 输出）
 * @param locale 界面语言（agency_i18n 取值）
 * @param profileNodes 可选：用户行业画像的节点码序列（prefs 模式；逐文档计算匹配档次）
 */
export function formatItems(
  rows: RowDataPacket[],
  locale: string,
  profileNodes?: Array<{ level: number; node: string }>,
): Array<Record<string, unknown>> {
  const items = rows.map((row) => {
    const item: Record<string, unknown> = {
      ...row,
      core_locked: true,
    };
    delete item.source_url;
    delete item.platform_name;

    // prefs 模式：逐文档计算匹配分与档次标签（[阶段0 A2] 替代旧版整页统一赋分：
    // 放宽到 L2 后，实际命中 L4/L5 精准码的条目仍应显示 precise 绿标）
    if (profileNodes) {
      const score = perDocMatchScore(row, profileNodes);
      if (score !== undefined) {
        item.match_score = score;
        item.match_tier = matchScoreToTierLabel(score);
      }
    }
    return ensureNoticePk(item);
  });
  return enrichAgencyI18n(items, locale);
}


