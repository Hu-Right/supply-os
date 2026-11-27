/**
 * 机构路径 → 候选键（层级路径归一）
 *
 * @module lib/services/buyer/name-variants
 * @description 2026-11-27：ES/US 等源把「机构在政府层级里的位置」拼成一串当买家名
 *              （`ENTIDADES LOCALES>Andalucía>Almería>Ayuntamientos>Almería`），
 *              整串既不是机构名、也不会被登记进 buyer_alias，于是永远匹配不上实体，
 *              页面只能回退显示原文（实测未匹配 9,100 条）。
 *
 *              本模块只做一件事：给原始名产出**候选匹配键序列**（整串 → 末段 → 上一段…），
 *              由 `entity-index.resolveBuyerEntity` 依次尝试。规则刻意保守：
 *              - 只跳过**明确的层级词**（`AYUNTAMIENTOS`、`DEPT OF DEFENSE` 这类整段就是层级名的），
 *                「Ayuntamiento de Almería」「Defense Logistics Agency」这种带专名的段一律保留；
 *              - 最多再取 3 个末段候选，避免长路径在尾部拼出错误归属；
 *              - 不在这里做任何归一化改写：键仍是 `normalizeBuyerKey` 的输出，唯一口径不变。
 *
 *              注意与 `organization` 列的 `A||B||C` 区别：那边既有代码取**首段**当买家名，
 *              这里取末段作为候选，两者不冲突——都只是候选键，命中与否仍由 buyer_alias 决定。
 */
import { normalizeBuyerKey } from "./normalize";

/** 路径分隔符：`>`（含全角）、`»`、`||`；不切单个 `|` 与 `/`，避免误伤机构名本身 */
const PATH_SEP = /\s*(?:[>＞»]+|\|\|)\s*/;

/** 整段就是层级名（没有专名信息）的分隔段；只收实测出现过的，宁少勿多 */
const HIERARCHY_SEGMENTS = new Set([
  "ENTIDADES LOCALES",
  "ENTITATS",
  "ENTITATS DE L'ADMINISTRACIO LOCAL",
  "AYUNTAMIENTOS",
  "COMUNIDADES AUTONOMAS",
  "COMUNITATS AUTONOMES",
  "OTRAS ENTIDADES DEL SECTOR PUBLICO",
  "ADMINISTRACION GENERAL DEL ESTADO",
  "DEPARTAMENTS",
  "DEPARTAMENTS I SECTOR PUBLIC DE LA GENERALITAT DE CATALUNYA",
  "SECTOR PUBLIC",
  "SECTOR PUBLICO",
  "DEPT OF DEFENSE",
  "DEPARTMENT OF DEFENSE",
  "DEPARTMENT OF THE ARMY",
  "DEPARTMENT OF THE NAVY",
  "DEPARTMENT OF THE AIR FORCE",
]);

/** 末段候选的最多条数（不含整串本身） */
const MAX_TAIL_KEYS = 3;

/** 按路径分隔符拆段（保留顺序、去掉空白段） */
export function orgPathSegments(raw: unknown): string[] {
  const s = String(raw ?? "").normalize("NFKC").trim();
  if (!s) return [];
  return s
    .split(PATH_SEP)
    .map((seg) => seg.trim())
    .filter(Boolean);
}

/** 该段是否只是层级名（没有机构专名） */
export function isHierarchySegment(segment: unknown): boolean {
  const key = normalizeBuyerKey(segment);
  if (!key) return true;
  return HIERARCHY_SEGMENTS.has(key);
}

/**
 * 原始机构名 → 候选匹配键（有序：整串优先，其次末段向上回溯）。
 *
 * 单段名（普通机构名）返回长度 1 的数组，行为与改造前完全一致；
 * 路径名返回整串 + 最多 3 个末段（跳过层级段、跳过 <3 字符的碎片）。
 */
export function buyerNameKeys(raw: unknown): string[] {
  const full = normalizeBuyerKey(raw);
  if (!full) return [];

  const segments = orgPathSegments(raw);
  if (segments.length <= 1) return [full];

  const keys = [full];
  for (let i = segments.length - 1; i >= 0 && keys.length <= MAX_TAIL_KEYS; i -= 1) {
    const seg = segments[i];
    if (isHierarchySegment(seg)) continue;
    const key = normalizeBuyerKey(seg);
    if (key.length < 3 || keys.includes(key)) continue;
    keys.push(key);
  }
  return keys;
}
