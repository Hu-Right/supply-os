/**
 * 统一搜索编排器 — 模式解析器
 * Unified search orchestrator — mode resolver
 *
 * @module server/services/search-orchestrator/mode-resolver
 * @description mode → filter 计划的映射：
 *              - default:      URL 筛选参数（+ code_id 换出骨架节点码作类目过滤）
 *              - prefs:        用户行业画像 → 渐进放宽的节点码序列（替代旧 T0-T3 分层架构）
 *              - recommended:  委托既有推荐服务（行为评分语义无法 filter 化，文档 §1 已论证）
 *
 *              2026-10-11 backbone 化：本模块原先直接产出「旧字典行 id + level」，
 *              由 filter-builder 拼成 `level{N}_id` / `precise_level{N}_id` 谓词。
 *              公告归属改由宽表 `backbone_path` 表达后，两套键在同一请求里并存就是分叉温床，
 *              所以这里统一换成**骨架节点码**：
 *              - default：`code_id` → 旧字典取码 → `resolveUnspscIdsToCommodityPath` 换节点
 *                （旧字典仍是"账号偏好/外链存的是字典 id"的既有事实，这层翻译留着；
 *                被翻译出来的是节点码，谓词再也不碰 levelN 列）；
 *              - prefs：取画像里能换出的**最深节点**，放宽序列由它的祖先链逐层得出
 *                （`commodityNodeChain`，码长即层级，不查库），底线仍是 L2。
 *              换不出节点 = 忽略类目过滤（与旧实现"解析失败就不过滤"逐字一致，不放开全量语义）。
 */
import type { Pool } from "mysql2/promise";
import type { UnifiedSearchParams } from "./types";
import { resolveUserIndustryProfile } from "../industry-profile/resolve";
import { commodityNodeChain, commodityNodeLevel, resolveUnspscIdsToCommodityPath } from "../commodity/tree";

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
  /** default 模式：code_id 换出的类目条件（换不出 = null） */
  category: CategoryFilter | null;
  /** prefs 模式：渐进放宽序列（最深在前） */
  profileNodes: ProfileNode[] | null;
}

// 工厂而不是共享常量对象：本函数出口会一路传到 index.ts 改写局部变量，
// 共享一个对象实例就是给「下游顺手改一下」留出污染全局常量的口子
const noCategory = (): ModeResolution => ({ kind: "search", category: null, profileNodes: null });
const noPrefs = (): ModeResolution => ({ kind: "no-prefs", category: null, profileNodes: null });

/**
 * 旧字典五级行 id → 能换出的**最深**骨架节点码；一个都换不出返回 null。
 * 取最深而不是取第一个：`options` 的顺序按字典行的 level 升序，浅层先出就会把
 * 「用户其实选到了品目」降级成「只选了大类」，命中量差两个数量级。
 */
async function deepestNodeOf(pool: Pool, levelIds: Array<number | null | undefined>): Promise<string | null> {
  const { options } = await resolveUnspscIdsToCommodityPath(pool, levelIds);
  let best: string | null = null;
  let bestLevel = 0;
  for (const opt of options) {
    const lv = commodityNodeLevel(opt.key);
    if (lv > bestLevel) {
      bestLevel = lv;
      best = opt.key;
    }
  }
  return best;
}

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
    const node = await deepestNodeOf(pool, profile.levelIds);
    if (!node) return noPrefs(); // 偏好落在映射不到的层：交前端引导，不静默按全量搜

    // 从最深节点向上放宽，底线 L2（L1 大类过于宽泛，放宽到 L1 会引入跨行业误报）。
    // 祖先由码长纯切片得出（门禁 BB1 钉住「父码 = 自身码去掉末两位」），不再查库取各级 id。
    // 分数按绝对层级取值，与 format.matchScoreToTierLabel 阈值对齐：
    // L4/L5 命中 → 5（precise 绿徽章）；L2/L3 命中 → 2（relevant 蓝徽章）。
    // 注意不能用「相对最深级的偏移」计分：用户只选到 L2 时其最深级也应有 relevant 档。
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

  // ── default：code_id（旧字典行 id）→ 骨架节点码 ──
  if (p.codeId > 0) {
    try {
      const node = await deepestNodeOf(pool, [p.codeId]);
      if (node) return { kind: "search", category: { node }, profileNodes: null };
    } catch {
      /* code_id 解析失败：忽略行业过滤（与旧实现一致，不报错也不放开全量） */
    }
  }
  return noCategory();
}
