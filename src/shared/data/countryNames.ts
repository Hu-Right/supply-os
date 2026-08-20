/**
 * 英文国家名 → 中文名映射（运行时从服务端获取，消除前后端数据漂移）
 * English Country Name → Chinese Name Mapping (fetched from server at runtime)
 *
 * @module shared/data/countryNames
 * @description E3 优化（详见《深度技术分析报告》§E3）：
 *   服务端 `server/data/countryNames.ts` 为唯一事实来源，
 *   前端通过 `/api/catalog/country-name-map` 端点获取映射数据并缓存。
 *   应用启动时调用 `initCountryNames()` 预加载，未初始化时函数优雅降级（返回原文）。
 */

import { api } from "@/core/http";

// ── 运行时缓存（由 initCountryNames 填充）──
let _countryNameZh: Record<string, string> = {};
let _regionNameZh: Record<string, string> = {};
let _zhToEn: Record<string, string> = {};
let _initialized = false;

/**
 * 初始化国家名映射数据（应用启动时调用一次）
 * 从服务端 API 获取 COUNTRY_NAME_ZH / REGION_NAME_ZH / ZH_TO_EN 并缓存。
 * 失败时静默降级——后续函数调用返回英文原文，不影响功能可用性。
 */
export async function initCountryNames(): Promise<void> {
  if (_initialized) return;
  try {
    const data = await api<{
      countryNameZh: Record<string, string>;
      regionNameZh: Record<string, string>;
      zhToEn: Record<string, string>;
    }>("/api/catalog/country-name-map");
    _countryNameZh = data.countryNameZh || {};
    _regionNameZh = data.regionNameZh || {};
    _zhToEn = data.zhToEn || {};
    _initialized = true;
  } catch {
    // 静默降级：映射为空，函数返回英文原文
  }
}

// ── 工具函数（纯逻辑，不依赖映射数据）──

/**
 * 清理国家名原始值中的常见脏数据前缀
 *
 * @description 数据库中存在 "/，Basilan" 等含非法前缀的值，
 *              此函数在归一化之前调用，剥离非国家名垃圾字符。
 */
export function cleanCountryRaw(raw: string): string {
  let cleaned = raw.trim();
  // 剥离 "/"、"/，"、"/, " 等前缀（数据源格式错误）
  cleaned = cleaned.replace(/^[/]+\s*[，,]?\s*/, "");
  // 剥离前导标点（逗号、分号、冒号、竖线等）
  cleaned = cleaned.replace(/^[,;:|]+\s*/, "");
  return cleaned.trim();
}

// ── 内部辅助函数 ──

/** 按国家名查中文（先精确、后大小写不敏感），未命中返回 null */
function matchCountryZh(name: string): string | null {
  if (_countryNameZh[name]) return _countryNameZh[name];
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(_countryNameZh)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

/** 按区域名查中文（大小写不敏感），未命中返回 null */
function matchRegionZh(region: string): string | null {
  if (_regionNameZh[region]) return _regionNameZh[region];
  const lower = region.toLowerCase();
  for (const [key, val] of Object.entries(_regionNameZh)) {
    if (key.toLowerCase() === lower) return val;
  }
  return null;
}

/**
 * 解析 "国家, 区域" 形式的区域值（如 "Canada, British Columbia"）。
 * 兼容国家在前与区域在前后两种顺序；国家部分必须可译，否则返回 null 回退原文。
 * 区域未收录时保留英文置于括号内，保证不再整条纯英文展示。
 */
function resolveRegionDisplayName(value: string): string | null {
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // 国家在前："Canada, British Columbia"
  const countryFirst = matchCountryZh(parts[0]);
  if (countryFirst) {
    const region = parts.slice(1).join(", ");
    return `${countryFirst}（${matchRegionZh(region) ?? region}）`;
  }
  // 区域在前："British Columbia, Canada"
  const last = parts[parts.length - 1];
  const countryLast = matchCountryZh(last);
  if (countryLast) {
    const region = parts.slice(0, -1).join(", ");
    return `${countryLast}（${matchRegionZh(region) ?? region}）`;
  }
  return null;
}

// ── 导出函数（接口不变，实现改为使用运行时缓存）──

/**
 * 获取国家的显示名
 * @param englishName 英文国家名（数据库原始值）
 * @param locale 当前语言环境
 * @returns 中文环境下返回中文名（含区域值解析），其他语言回退英文原名
 */
export function getCountryDisplayName(englishName: string, locale: string): string {
  if (locale !== "zh") return englishName;
  // 先精确匹配
  if (_countryNameZh[englishName]) return _countryNameZh[englishName];
  // 大小写不敏感匹配（处理 "america" → "美国" 等）
  const matched = matchCountryZh(englishName);
  if (matched) return matched;
  // "国家, 区域" 值拆分解析（如 "Canada, British Columbia" → "加拿大（不列颠哥伦比亚）"）
  return resolveRegionDisplayName(englishName) ?? englishName;
}

/**
 * 获取国家的英文原名（用于中文环境下显示英文辅助信息）
 * 当数据库已存储中文名时，反向查找英文原名
 */
export function getCountryEnglishName(rawName: string): string {
  // 如果已经是英文（不在中文映射表中），直接返回
  if (!_countryNameZh[rawName]) return rawName;
  // 如果中文名在反向映射表中，返回英文
  return _zhToEn[rawName] ?? rawName;
}
