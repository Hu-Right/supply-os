/**
 * bid-report 常量与工具函数
 * Constants and utility functions for bid report generation
 */
import "server-only";
import { safeJson } from "../../utils/json";

// ── 平台标签映射（与 PHP 版 PLATFORMS 一致）──
export const PLATFORMS: Record<string, string> = {
  ungm: "UNGM (ungm.org)",
  undp: "UNDP Procurement",
  unops: "UNOPS eSourcing",
  wfp: "WFP eSourcing",
  unicef: "UNICEF Supply Division",
  who: "WHO eTendering",
  worldbank: "World Bank",
  dgmarket: "DG Market",
  idb: "IDB (Americas)",
  afdb: "AfDB",
  adb: "ADB",
  ted: "TED (EU)",
  sam: "SAM.gov (US Federal)",
  other: "其他",
};

// ── 行业标签映射（与 PHP 版 INDUSTRY_MAP 一致）──
export const INDUSTRY_MAP: Record<string, string> = {
  agriculture: "农业/粮食",
  building: "建筑/基础设施",
  chemicals: "化工/材料",
  education: "教育/培训",
  electrical: "电气/电子",
  engineering: "工程/技术",
  food: "食品/营养",
  furniture: "家具/办公",
  it: "信息技术",
  laboratory: "实验室/检测",
  logistics: "物流/仓储",
  medical: "医疗/卫生",
  printing: "印刷/出版",
  safety: "安全/防护",
  shelter: "庇护所/住房",
  textile: "纺织/服装",
  vehicles: "车辆/运输",
  water: "水务/环境",
  other: "其他",
};

// ── 字体 / 颜色常量（PhpWord 样式对照）──
export const SONG = { ascii: "宋体", eastAsia: "宋体", hAnsi: "宋体" };
export const HEI = { ascii: "黑体", eastAsia: "黑体", hAnsi: "黑体" };
export const NAVY = "1F3864";
export const BLUE2 = "2E74B5";
export const GREEN3 = "375623";
export const TABLE_BLUE = "2E4099";
export const BORDER_GREY = "D8D8D8";

export type Row = Record<string, any>;

/** 安全字符串（对应 PHP safe()）：null/false/undefined 归空串 */
export function safe(v: unknown): string {
  if (v === null || v === undefined || v === false || v === "") return "";
  return String(v);
}

/** 对象型 JSON 字段解码（ai_analysis 等）：对象直通、字符串解析、其余回退 {} */
export function safeObj(value: any): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      /* 忽略坏 JSON */
    }
  }
  return {};
}

// re-export for downstream
export { safeJson };
