/**
 * 统一搜索编排器 — 类型定义
 * Unified search orchestrator - type definitions
 *
 * @module server/services/search-orchestrator/types
 * @description 三种搜索模式（default/prefs/recommended）的统一参数与结果类型。
 *              对应《搜索链路架构级统一重构方案》第三节设计。
 *              crm_users.user_key 列退役收尾：身份参数仅保留 userId。
 */

/** 搜索模式：default=全量搜索 / prefs=行业精准匹配 / recommended=行为推荐 */
export type SearchMode = "default" | "prefs" | "recommended";

/** 统一搜索参数（已由 params.ts 校验归一化） */
export interface UnifiedSearchParams {
  mode: SearchMode;
  /** 内部用户 ID（user_id 迁移后为唯一身份锚点；未登录时为 undefined） */
  userId?: number;
  page: number;
  pageSize: number;
  locale: string;
  q: string;
  country: string;
  agency: string;
  deadlineFrom: string;
  deadlineTo: string;
  deadlineWithinDays: number;
  noticeType: string;
  featuredOnly: boolean;
  sort: "deadline" | "latest" | "deadline_farthest";
  /** UNSPSC 旧字典类目 ID（URL code_id / industry_id）。
   *  2026-10-11 起商机页五级下拉不再产生它（下拉已换品目树，见 commodityPath）；
   *  仍保留是因为首页「热门品目」入口与外链按 `?industry_id=<字典 id>` 跳进本页。 */
  codeId: number;
  /** 品目大类码（URL group=UGT-G-xx，32 类之一）；与 codeId AND 叠加，
   *  谓词落在旧字典 level=2（=UNSPSC 段）的 id 集合上：
   *  Meili level2_id OR / MySQL FIND_IN_SET(?, unspsc_level2)。
   *  2026-10-11 M3 双跑对账：全库 606,060 行逐行比对，与宽表 group_codes 集合相等 353,758/
   *  不一致 0，32 个大类逐类命中数 Δ=0 ⇒ 两条谓词可互换，无需重灌 Meili 索引。 */
  groupCode?: string;
  /** 品目骨架树筛选键（URL commodity=UGT-B-01 / -0101 / -010101 / -01010101 / -0101010101）。
   *  谓词落在宽表 backbone_path 的等值节点项 / Meili backbone_node 数组属性：
   *  backbone_path 存的是该公告归属的骨架节点码（含全部祖先，由
   *  lib/services/commodity/backbone-path 换算后灌入），所以「选到哪一层就命中哪一层」。
   *  实测交叉验证：UGT-B-01 命中 49,236 条，与大类 chip 口径（group_codes）完全一致。
   *  与 groupCode AND 叠加（大类→中类→…是同一条链的逐级收窄）。 */
  commodityPath?: string;
  /** 行业墙强制一级类目（industry-scope 服务注入，客户端不可传；与 codeId 叠加 AND） */
  forcedLevel1Id?: string;
  /** 预算范围过滤（USD，estimated_value 列） */
  budgetMin?: number;
  budgetMax?: number;
  /** 关键词匹配模式：all=硬 AND（默认），any=OR（任一命中） */
  matchMode?: "all" | "any";
}

/** 统一搜索结果（与前端 NoticeResponse 对齐） */
export interface UnifiedSearchResult {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  /** 推荐模式 A/B 桶标记 */
  variant?: string;
  /** no_prefs=无行业偏好 / no_match=无匹配 / mysql_degraded=MySQL 应急降级 / none=正常 */
  fallback?: "no_prefs" | "no_match" | "mysql_degraded" | "none";
  /** 硬 AND 零结果时自动放宽为 OR 的标志（仅放宽时出现） */
  match_relaxed?: boolean;
}

/** Meilisearch filter 计划（filter-builder 输出） */
export interface FilterPlan {
  /** Meilisearch filter 数组（数组元素间 AND 连接） */
  meiliFilters: string[];
  /** MySQL 方言 WHERE 片段（降级路径使用，与 meiliFilters 同语义） */
  mysqlWhere: string[];
  /** mysqlWhere 的参数 */
  mysqlParams: unknown[];
  /** FORCE_COUNTRY 矛盾等冲突标记：true 时直接返回空结果 */
  conflictEmpty: boolean;
  /** filter 摘要（结构化日志用） */
  digest: string;
}

/** Meilisearch 查询结果 */
export interface MeiliHitResult {
  ids: number[];
  total: number;
  totalIsPrecise: boolean;
}

/** 检索执行路径（日志/指标用） */
export type SearchPath = "meili" | "mysql" | "ref-exact" | "reco-delegate";
