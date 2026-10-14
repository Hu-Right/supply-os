/**
 * 统一搜索编排器 — 模式解析器
 * Unified search orchestrator — mode resolver
 *
 * @module server/services/search-orchestrator/mode-resolver
 * @description mode → filter 计划的映射：
 *              - default:      URL 筛选参数
 *              - prefs:        用户行业画像 → 渐进放宽的节点码序列（替代旧 T0-T3 分层架构）
 *              - recommended:  委托既有推荐服务（行为评分语义无法 filter 化，文档 §1 已论证）
 *
 *              2026-10-11 backbone 化：类目谓词统一为**骨架节点码**，不再碰 levelN 列。
 *              UNSPSC 字典退役（2026-10-13）：偏好表直接存 `commodity_code`，
 *              prefs 模式取画像的最深节点码直接放宽；旧 `code_id`（字典行 id）外链
 *              兼容分支随之删除——老链接丢类目过滤、其余参数照常（优雅降级）。
 *              换不出节点 = 忽略类目过滤（与旧实现"解析失败就不过滤"逐字一致，不放开全量语义）。
 */
import type { Pool } from "mysql2/promise";
import type { UnifiedSearchParams } from "./types";
import { resolveUserIndustryProfile } from "../industry-profile/resolve";
import { commodityNodeChain, commodityNodeLevel, isCommodityNodeKey } from "../commodity/tree";

/** 类目条件（骨架节点码口径） */
export interface CategoryFilter {
  /** 骨架节点码 UGT-*（2/4/6/8/10 位） */
  node: string;
}

/** prefs 放宽序列的一档：节点码 + 它的层级 + 匹配分（分数口径见 format.matchScoreToTierLabel） */
export interface ProfileNode {
  node: string;
  level: number;
  score: number;
}

export interface ModeResolution {
  /** search=走统一检索管道 / delegate-recommended=委托推荐服务 / no-prefs=无行业偏好 */
  kind: "search" | "delegate-recommended" | "no-prefs";
  /** default 模式：URL 品目参数换出的类目条件（无 = null） */
  category: CategoryFilter | null;
  /** prefs 模式：渐进放宽序列（最深在前） */
  profileNodes: ProfileNode[] | null;
}

// 工厂而不是共享常量对象：本函数出口会一路传到 index.ts 改写局部变量，
// 共享一个对象实例就是给「下游顺手改一下」留出污染全局常量的口子
const noCategory = (): ModeResolution => ({ kind: "search", category: null, profileNodes: null });
const noPrefs = (): ModeResolution => ({ kind: "no-prefs", category: null, profileNodes: null });

/**
 * 解析模式的 filter 计划。
 */
export async function resolveMode(pool: Pool, p: UnifiedSearchParams): Promise<ModeResolution> {
  // ── recommended：委托既有推荐服务 ──
  if (p.mode === "recommended") {
    return { kind: "delegate-recommended", category: null, profileNodes: null };
  }

  // ── prefs：用户行业画像 → 节点码祖先链的放宽序列 ──
  if (p.mode === "prefs") {
    if (!p.userId) return noPrefs();
    const profile = await resolveUserIndustryProfile(pool, p.userId);
    if (!profile) return noPrefs();
    if (!isCommodityNodeKey(profile.commodityCode)) return noPrefs();

    // 从最深节点向上放宽，底线 L2（L1 大类过于宽泛，放宽到 L1 会引入跨行业误报）。
    // 祖先由码长纯切片得出（门禁 BB1 钉住「父码 = 自身码去掉末两位」），不再查库取各级 id。
    // 分数按绝对层级取值，与 format.matchScoreToTierLabel 阈值对齐：
    // L4/L5 命中 → 5（precise 绿徽章）；L2/L3 命中 → 2（relevant 蓝徽章）。
    // 注意不能用「相对最深级的偏移」计分：用户只选到 L2 时其最深级也应有 relevant 档。
    const node = profile.commodityCode;
    const chain = commodityNodeChain(node);
    const deepest = commodityNodeLevel(node);
    const nodes: ProfileNode[] = [];
    for (let lvl = Math.min(deepest, 5); lvl >= 2; lvl -= 1) {
      const n = chain[lvl - 1];
      if (!n) continue;
      nodes.push({ node: n, level: lvl, score: lvl >= 4 ? 5 : 2 });
    }
    if (nodes.length === 0) return noPrefs();
    return { kind: "search", category: null, profileNodes: nodes };
  }

  return noCategory();
}
