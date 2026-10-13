/**
 * 统一搜索编排器 — 筛选条件构建器（全系统唯一筛选语义实现点）
 * Unified search orchestrator — filter builder (single source of truth for filter semantics)
 *
 * @module server/services/search-orchestrator/filter-builder
 * @description 每个筛选条件同时输出 Meilisearch filter 与 MySQL WHERE 两种方言，
 *              从根源上杜绝双轨语义漂移（历史 BUG：deadlineWithinDays / countryVariants
 *              在两条路径实现不一致）。对应重构方案 §3.4。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { UnifiedSearchParams, FilterPlan } from "./types";
import { expandCountryAllForms, expandCountryAliases } from "../notice-search/countries";
import { getAgencyCacheData } from "../notice-search/agencies/index";
import { l1NodesOfGroup, isCommodityNodeKey } from "../commodity/tree";
// N7 收敛（2026-08-20）：normalizeNoticeType 直连 utils/notice-type 权威端口
import { normalizeNoticeType } from "../../utils/notice-type";
import { toBeijingUnixTs } from "../../utils/notice-expired";

/** 转义 Meilisearch filter 字符串中的双引号和反斜杠 */
function escapeFilter(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ── 采购类型全集缓存（MySQL 方言归一化匹配用）──
let _noticeTypesCache: { types: string[]; expires: number } | null = null;
const NOTICE_TYPES_TTL = 10 * 60 * 1000;

async function getAllNoticeTypes(pool: Pool): Promise<string[]> {
  if (_noticeTypesCache && _noticeTypesCache.expires > Date.now()) return _noticeTypesCache.types;
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT notice_type FROM crm_bid_notices WHERE notice_type IS NOT NULL AND notice_type != '' LIMIT 500",
    );
    const types = (rows as RowDataPacket[]).map((r) => String(r.notice_type));
    _noticeTypesCache = { types, expires: Date.now() + NOTICE_TYPES_TTL };
    return types;
  } catch {
    return [];
  }
}

// ── 品目大类 → 所辖 L1 节点码：取数与缓存均在 commodity/tree 的 loadGroupL1NodeMap（一份）──
// 2026-10-11 backbone 化：旧的「大类 → 旧字典 level=2 段行 id」翻译链整条删掉（不再读 crm_unspsc_codes）。
// 等价性实测：temp/probe75 逐类对拍 32 个大类，旧段 id 谓词与新 L1 节点码谓词命中数 Δ=0、不一致 0/32。
// 为什么必须映射而不能切片：32 个 L1 行里只有 5 个的码序号等于大类码序号（`UGT-01` 的 group_code
// 是 `UGT-G-11`），所以「大类码 ↔ L1 节点码」只能回表取 backbone 自己的 group_code 列。

/**
 * L1/各级节点码 → 两种方言的类目谓词（大类 / 五级下拉 / 可见性判定共用这一份形状）。
 * 单值不加括号，多值必须整体括号：EXISTS 子查询里写成 `ns.id = n.id AND A OR B` 会被解析为
 * `(ns.id = n.id AND A) OR B`，B 不再与外层行相关 ⇒ EXISTS 对全表恒真，筛选静默失效
 * （2026-10-11 端到端实测：双段大类 UGT-G-14 降级路径返回 190,041 条未筛结果、
 * 首页 10 条全部不属于该类；当时单段大类无 OR 所以未暴露）。
 */
function nodeMeiliFilter(attr: string, nodes: string[]): string {
  if (nodes.length === 1) return `${attr} = "${escapeFilter(nodes[0])}"`;
  return `(${nodes.map((v) => `${attr} = "${escapeFilter(v)}"`).join(" OR ")})`;
}

function nodeMysqlWhere(nodes: string[], col = "backbone_path"): string {
  const one = `FIND_IN_SET(?, ns.${col})`;
  const inner = nodes.length === 1 ? one : `(${nodes.map(() => one).join(" OR ")})`;
  return `EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND ${inner})`;
}

/** 机构扩展解析结果（两种方言共用） */
interface AgencyExpansion {
  meiliAgencyGroup?: string;
  meiliAgencies?: string[];
  /** MySQL 方言机构子句 */
  mysqlClause: string;
  mysqlParams: unknown[];
  /** FORCE_COUNTRY 强制国家（机构隐含国家归属） */
  forceCountry?: string;
  /** sqlPattern 类机构：Meilisearch 无法 LIKE，主路径退化为精确匹配标记 */
  hasSqlPattern: boolean;
}

/**
 * 生成机构 MySQL 子查询：通过宽表 agency_std 列匹配。
 *
 * 根因：mysqlFallback 查 crm_bid_notices（主表原始值），但缓存中的机构名
 * 是规范名（经别名映射/模式翻译），两者可能不同（如 "EU" vs "EUROPEAN UNION"）。
 * 改用宽表子查询确保匹配规范后的 agency_std 列（与 UNSPSC 端口一致）。
 */
function agencyStdSubquery(values: string[], useLike?: string): { mysqlClause: string; mysqlParams: unknown[] } {
  if (useLike) {
    return {
      mysqlClause: "EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND ns.agency_std LIKE ?)",
      mysqlParams: [useLike],
    };
  }
  if (values.length === 1) {
    return {
      mysqlClause: "EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND ns.agency_std = ?)",
      mysqlParams: [values[0]],
    };
  }
  return {
    mysqlClause: `EXISTS (SELECT 1 FROM crm_notice_search ns WHERE ns.id = n.id AND ns.agency_std IN (${values.map(() => "?").join(",")}))`,
    mysqlParams: [...values],
  };
}

/** 解析机构缓存扩展（FORCE_COUNTRY / sqlPattern / originalAgencies） */
function expandAgency(agency: string): AgencyExpansion {
  const items = getAgencyCacheData() || [];
  const cached = items.find((item) => item.agency === agency);

  if (cached?.agencyGroup?.startsWith("FORCE_COUNTRY_")) {
    const forceCountry = cached.agencyGroup.slice(14);
    const variants = expandCountryAliases(forceCountry);
    if (variants.length > 1) {
      return {
        forceCountry,
        hasSqlPattern: false,
        // [阶段0 T3] 去 UPPER() 包裹：utf8mb4_0900_ai_ci 本就大小写不敏感，
        // 函数作用于列会使 country/agency 索引全部失效（降级路径退化为全表扫描）
        mysqlClause: `n.country IN (${variants.map(() => "?").join(",")})`,
        mysqlParams: variants.map((c) => c.toUpperCase()),
      };
    }
    return {
      forceCountry,
      hasSqlPattern: false,
      mysqlClause: "n.country = ?",
      mysqlParams: [forceCountry.toUpperCase()],
    };
  }
  if (cached?.sqlPattern) {
    // Meilisearch: 用 agency_group 字段（存 typeKey）过滤
    // MySQL: 用宽表 agency_std LIKE 子查询（主表无 LIKE 规范名）
    return {
      hasSqlPattern: true,
      meiliAgencyGroup: cached.agencyGroup || agency,
      ...agencyStdSubquery([], cached.sqlPattern),
    };
  }
  if (cached?.agencyGroup && !cached.agencyGroup.startsWith("ORPHAN_")) {
    // Meilisearch 用 agency_group 聚合字段
    // MySQL 用宽表 agency_std 子查询（确保匹配规范名而非主表原始名）
    return {
      hasSqlPattern: false,
      meiliAgencyGroup: cached.agencyGroup,
      ...agencyStdSubquery(cached.originalAgencies?.length ? cached.originalAgencies : [agency]),
    };
  }
  if (cached?.originalAgencies && cached.originalAgencies.length > 0) {
    return {
      hasSqlPattern: false,
      meiliAgencies: cached.originalAgencies,
      ...agencyStdSubquery(cached.originalAgencies),
    };
  }
  return {
    hasSqlPattern: false,
    meiliAgencies: [agency],
    ...agencyStdSubquery([agency]),
  };
}

/**
 * 构建双方言 filter 计划。
 * @param category 可选类目条件（mode-resolver 给出）：node = 品目树节点码；
 *               precise=true 落 precise_backbone_path（prefs 模式，approved 候选码），
 *               precise=false 落 backbone_path（default 模式，全量归属）
 */
export async function buildFilterPlan(
  pool: Pool,
  p: UnifiedSearchParams,
  category?: { node: string; precise: boolean } | null,
): Promise<FilterPlan> {
  const meiliFilters: string[] = [];
  const mysqlWhere: string[] = [];
  const mysqlParams: unknown[] = [];
  const digestParts: string[] = [];

  // ── 机构扩展（需先于国家处理：FORCE_COUNTRY 覆盖国家）──
  let agencyExp: AgencyExpansion | null = null;
  let effectiveCountry = p.country;
  if (p.agency) {
    agencyExp = expandAgency(p.agency);
    if (agencyExp.forceCountry) {
      // FORCE_COUNTRY 与用户所选国家矛盾 → 空结果
      if (p.country && p.country.toUpperCase() !== agencyExp.forceCountry.toUpperCase()
        && !expandCountryAliases(agencyExp.forceCountry).some((v) => v.toUpperCase() === p.country.toUpperCase())) {
        return { meiliFilters: [], mysqlWhere: [], mysqlParams: [], conflictEmpty: true, digest: "FORCE_COUNTRY_CONFLICT" };
      }
      effectiveCountry = agencyExp.forceCountry;
    }
  }

  // ── 国家 ──
  if (effectiveCountry) {
    const variants = expandCountryAllForms(effectiveCountry);
    if (variants.length > 1) {
      const orParts = variants.map((v) => `country = "${escapeFilter(v)}"`).join(" OR ");
      meiliFilters.push(`(${orParts})`);
      // [阶段0 T3] 同 expandAgency：去 UPPER() 包裹，恢复索引可用性（collation 为 ai_ci）
      mysqlWhere.push(`n.country IN (${variants.map(() => "?").join(",")})`);
      mysqlParams.push(...variants.map((v) => v.toUpperCase()));
    } else {
      meiliFilters.push(`country = "${escapeFilter(effectiveCountry)}"`);
      mysqlWhere.push("n.country = ?");
      mysqlParams.push(effectiveCountry.toUpperCase());
    }
    digestParts.push(`country:${effectiveCountry}`);
  }

  // ── 机构（FORCE_COUNTRY 机构已转为国家条件，不再叠加机构条件）──
  if (p.agency && agencyExp && !agencyExp.forceCountry) {
    if (agencyExp.meiliAgencyGroup) {
      meiliFilters.push(`agency_group = "${escapeFilter(agencyExp.meiliAgencyGroup)}"`);
    } else if (agencyExp.meiliAgencies && agencyExp.meiliAgencies.length > 1) {
      const orParts = agencyExp.meiliAgencies.map((o) => `agency = "${escapeFilter(o)}"`).join(" OR ");
      meiliFilters.push(`(${orParts})`);
    } else if (agencyExp.meiliAgencies?.length === 1) {
      meiliFilters.push(`agency = "${escapeFilter(agencyExp.meiliAgencies[0])}"`);
    }
    mysqlWhere.push(agencyExp.mysqlClause);
    mysqlParams.push(...agencyExp.mysqlParams);
    digestParts.push(`agency:${p.agency}`);
  }

  // ── 截止日期范围（deadlineFrom 自然排除 deadline_sec=0：0 < fromTs）──
  if (p.deadlineFrom) {
    const ts = toBeijingUnixTs(p.deadlineFrom, "00:00:00");
    meiliFilters.push(`deadline_sec >= ${ts}`);
    mysqlWhere.push("n.deadline_sec >= ?");
    mysqlParams.push(ts);
    digestParts.push(`from:${p.deadlineFrom}`);
  }
  if (p.deadlineTo) {
    const ts = toBeijingUnixTs(p.deadlineTo, "23:59:59");
    meiliFilters.push(`deadline_sec <= ${ts}`);
    mysqlWhere.push("n.deadline_sec <= ?");
    mysqlParams.push(ts);
    digestParts.push(`to:${p.deadlineTo}`);
  }
  // ── 全部截止期限（★ 双方言同语义：排除无截止日期文档）──
  if (p.deadlineWithinDays > 0) {
    const futureTs = Math.floor(Date.now() / 1000) + p.deadlineWithinDays * 86400;
    meiliFilters.push(`deadline_sec > 0 AND deadline_sec <= ${futureTs}`);
    mysqlWhere.push("n.deadline_sec > 0 AND n.deadline_sec <= ?");
    mysqlParams.push(futureTs);
    digestParts.push(`within:${p.deadlineWithinDays}d`);
  }

  // ── 采购类型 ──
  if (p.noticeType) {
    const normalized = normalizeNoticeType(p.noticeType);
    meiliFilters.push(`notice_type_normalized = "${escapeFilter(normalized)}"`);
    // MySQL 方言：归一化等价集合匹配（与旧 search-pipeline 行为一致）
    const allTypes = await getAllNoticeTypes(pool);
    const matching = allTypes.filter((t) => normalizeNoticeType(t) === normalized);
    if (matching.length > 0) {
      mysqlWhere.push(`n.notice_type IN (${matching.map(() => "?").join(",")})`);
      mysqlParams.push(...matching);
    } else {
      mysqlWhere.push("1 = 0");
    }
    digestParts.push(`type:${normalized}`);
  }

  // ── 精选 ──
  if (p.featuredOnly) {
    meiliFilters.push("is_featured = 1");
    mysqlWhere.push("n.is_featured = 1");
    digestParts.push("featured");
  }

  // ── 类目条件（default 的 code_id / prefs 的渐进放宽档都从这里出去）──
  // 键 = 品目树节点码，列 = backbone_path（precise=false）/ precise_backbone_path（precise=true）。
  // 两条列都存「自身 + 全部祖先」，所以选到哪一层就命中哪一层，运行期不判层级也不查字典；
  // 形状与大类 chip、五级下拉、可见性判定共用 nodeMeiliFilter / nodeMysqlWhere（一份形状）。
  // 2026-10-11 换口径：这里原本拼的是 `level{N}_id = <旧字典行 id>` 与
  // `FIND_IN_SET(?, ns.unspsc_level{N})` —— 两套键在同一请求里并存就是分叉温床。
  // 脏键（非 UGT-*）：整块跳过、不报错、不 conflictEmpty（与旧实现「解析失败就忽略行业过滤」
  // 逐字一致），但在 digest 里留下 rejected 痕迹，否则排查时看不到这一条被吞了。
  if (category) {
    if (isCommodityNodeKey(category.node)) {
      const precise = category.precise;
      meiliFilters.push(nodeMeiliFilter(precise ? "precise_backbone_node" : "backbone_node", [category.node]));
      mysqlWhere.push(nodeMysqlWhere([category.node], precise ? "precise_backbone_path" : "backbone_path"));
      mysqlParams.push(category.node);
      digestParts.push(`cat:${category.node}${precise ? ":precise" : ""}`);
    } else {
      digestParts.push(`cat:rejected:${category.node}`);
    }
  }

  // ── 品目大类（32 类 chip，URL group=UGT-G-xx）──
  // 谓词 = 该大类所辖骨架 L1 节点码（当前恰一个）存在在宽表 backbone_path 里。
  // 与五级下拉、行业墙落在同一条列：backbone_path 存节点码及其全部祖先，L1 码就在链顶，
  // 所以命中大类 = 命中该大类下任何深度的公告（不需要枚举 212 个 L2，也不需要 group_codes 列）。
  // 不读 group_codes：Meili 索引里没这个属性，两条方言必须同一谓词（本文件存在的意义）。
  if (p.groupCode) {
    const nodes = await l1NodesOfGroup(pool, p.groupCode);
    if (nodes.length === 0) {
      // 大类在库内挂不上任何 L1 行（常量与库漂移/新类未灌）：直接空结果，不静默放宽
      return {
        meiliFilters: [], mysqlWhere: [], mysqlParams: [], conflictEmpty: true,
        digest: `GROUP_NO_L1_NODE:${p.groupCode}`,
      };
    }
    meiliFilters.push(nodeMeiliFilter("backbone_node", nodes));
    mysqlWhere.push(nodeMysqlWhere(nodes));
    mysqlParams.push(...nodes);
    digestParts.push(`group:${p.groupCode}`);
  }

  // ── 品目骨架五级下拉（URL commodity=UGT- 节点码）──
  // 谓词 = 宽表 backbone_path 里等值存在该节点码。backbone_path 存的是公告归属的骨架节点码
  // 及其全部祖先（lib/services/commodity/backbone-path 换算后灌入），所以选到哪一层就命中哪一层。
  // 两边同口径是前提：旧写法拿 UNSPSC 前缀去筛 code_path，现在键、列、树是同一套码，
  // 不再存在「键形制与列形制不同序」那一类陷阱（旧骨架树的坑，见 temp/probe52）。
  // 实测：UGT-01 命中 49,258 条 = 大类 chip 口径；中类 UGT-0101 命中 7,616（temp/probe64，
  // 2026-10-11 全量重灌后 Meili 与 MySQL 逐码对拍相等，temp/probe91）。
  // 两条方言的形状与大类共用 nodeMeiliFilter / nodeMysqlWhere（一份形状，两处不分开错）。
  // Meili 侧需索引有 backbone_node 属性（sync.ts 由 backbone_path 拆数组）；
  // 索引未重灌前该属性不存在，Meili 会报未知属性错并整体降级到下面的 MySQL 方言（结果仍正确）。
  // MySQL 方言实测 738ms（606,060 行全表扫，FIND_IN_SET 走不了索引）——与旧 code_path 方言同量级。
  if (p.commodityPath) {
    meiliFilters.push(nodeMeiliFilter("backbone_node", [p.commodityPath]));
    mysqlWhere.push(nodeMysqlWhere([p.commodityPath]));
    mysqlParams.push(p.commodityPath);
    digestParts.push(`commodity:${p.commodityPath}`);
  }

  // ── 行业墙强制大类（industry-scope 注入，客户端不可传）──
  // 与用户自选条件 AND 叠加：被墙用户即使在 URL 里换类目/翻页，也翻不出订阅大类外。
  // 2026-10-11 backbone 化：旧的 `level1_id = <旧字典行 id>` 比的是 A..J 十个字母容器（实测
  // temp/probe78：UGT-G-25 与 UGT-G-17 两个用户 level1_id 都是 109⇒ 可见内容逐行相同），
  // 现在与 chip、五级下拉共用同一对形状（nodeMeiliFilter / nodeMysqlWhere）。
  // 仍旧取全量口径而非 precise：墙是数据口径，不依赖人工审核候选码（同旧实现取 levelN 不取 precise_levelN）。
  if (p.wall) {
    if (p.wall.nodes.length === 0) {
      // 大类挂不上骨架 L1（门禁 BB12 断言不该发生）：这一句是防止它退化成「不拼谓词=放开全量」
      return {
        meiliFilters: [], mysqlWhere: [], mysqlParams: [], conflictEmpty: true,
        digest: "WALL_NO_L1_NODE",
      };
    }
    meiliFilters.push(nodeMeiliFilter("backbone_node", p.wall.nodes));
    mysqlWhere.push(nodeMysqlWhere(p.wall.nodes));
    mysqlParams.push(...p.wall.nodes);
    digestParts.push(`wall:${p.wall.nodes.join("+")}`);
  }

  // ── 预算范围（estimated_value 为 VARCHAR 存数值字符串，CAST 为 DECIMAL 比较）──
  if (p.budgetMin != null || p.budgetMax != null) {
    if (p.budgetMin != null) {
      meiliFilters.push(`estimated_value_num >= ${p.budgetMin}`);
      mysqlWhere.push("CAST(n.estimated_value AS DECIMAL(20,2)) >= ?");
      mysqlParams.push(p.budgetMin);
      digestParts.push(`budgetMin:${p.budgetMin}`);
    }
    if (p.budgetMax != null) {
      meiliFilters.push(`estimated_value_num <= ${p.budgetMax}`);
      mysqlWhere.push("CAST(n.estimated_value AS DECIMAL(20,2)) <= ?");
      mysqlParams.push(p.budgetMax);
      digestParts.push(`budgetMax:${p.budgetMax}`);
    }
  }

  return {
    meiliFilters,
    mysqlWhere,
    mysqlParams,
    conflictEmpty: false,
    digest: digestParts.join(",") || "none",
  };
}
