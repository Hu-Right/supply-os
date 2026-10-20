/**
 * 国家展示 · agency i18n 归一查表入口（一切以 crm_country_aliases 为准，无静态字典）
 *
 * @module server/services/country/display
 * @description 供机构名 i18n 聚合按「国家英文名/ISO/重音变体」查中文展示名。走归一唯一入口
 *              loadCountryAliasSnapshot + normalizeCountryKey，不自建 SQL、不回落任何静态映射。
 *              快照引用由异步预热（ensureCountryDisplaySnapshot）在各聚合入口 await 后就绪；
 *              未就绪时 countryZhOf 返回 null（调用方按未命中处理，退回英文原名，不产生错误数据）。
 */
import type { Pool } from "mysql2/promise";
import { loadCountryAliasSnapshot, normalizeCountryKey, type CountryAliasSnapshot } from "./alias-store";

let _snap: CountryAliasSnapshot | null = null;

/** 预热/刷新快照引用（幂等，复用 alias-store 内部缓存）。各 agency 异步聚合入口先 await 它。 */
export async function ensureCountryDisplaySnapshot(pool: Pool): Promise<void> {
  _snap = await loadCountryAliasSnapshot(pool);
}

/** 归一查表取中文名（含别名/ISO/ccTLD/重音变体，同归一键口径）；未命中或快照未就绪 → null。 */
export function countryZhOf(raw: string): string | null {
  const zh = _snap?.byKey.get(normalizeCountryKey(raw))?.zh;
  return zh && zh.trim() ? zh : null;
}

/** 全部可迭代英文名（canonical，供「<国家> <类型>」前缀匹配）。 */
export function countryEnNames(): string[] {
  return _snap ? [..._snap.formsByCanonical.keys()] : [];
}

/** 测试钩子：直接注入/清空快照（单元测试无 DB 时用）。 */
export function __setCountryDisplaySnapshotForTest(s: CountryAliasSnapshot | null): void {
  _snap = s;
}
