/**
 * 机构类型规则缓存：唯一读取 crm_agency_types / crm_agency_type_rules 的入口。
 * classifyAgencyType 优先使用这里的规则；表不可用时回退代码内静态规则。
 */
import type { Pool } from "mysql2/promise";

export interface AgencyTypeRule {
  typeKey: string;
  countryCode: string | null;
  regex: RegExp;
  priority: number;
  i18n: Record<string, string>;
}

export interface AgencyTypeAssignment {
  canonical: string;
  countryCode: string | null;
  typeKey: string;
  i18n: Record<string, string>;
}

const TTL_MS = 10 * 60 * 1000;
let _rules: AgencyTypeRule[] | null = null;
let _assignments: Map<string, AgencyTypeAssignment> | null = null;
let _loadedAt = 0;

export async function loadAgencyTypeRules(pool: Pool, force = false): Promise<void> {
  if (!force && _rules && Date.now() - _loadedAt < TTL_MS) return;
  try {
    const [rows] = await pool.query(
      `SELECT r.type_key, r.country_code, r.pattern, r.flags, r.priority, t.name_i18n
         FROM crm_agency_type_rules r
         JOIN crm_agency_types t ON t.type_key = r.type_key
        WHERE r.is_active = 1 AND t.is_active = 1
        ORDER BY r.priority, r.id`,
    );
    const next: AgencyTypeRule[] = [];
    for (const row of rows as Array<Record<string, unknown>>) {
      try {
        const flags = String(row.flags ?? "i");
        const regex = new RegExp(String(row.pattern ?? ""), flags.includes("g") ? flags.replace(/g/g, "") : flags);
        const i18n = typeof row.name_i18n === "string" ? JSON.parse(row.name_i18n) : (row.name_i18n ?? {});
        next.push({
          typeKey: String(row.type_key),
          countryCode: row.country_code == null ? null : String(row.country_code),
          regex,
          priority: Number(row.priority ?? 0),
          i18n: (i18n ?? {}) as Record<string, string>,
        });
      } catch {
        // 单条坏正则跳过，不阻塞整张表
      }
    }
    const [assignmentRows] = await pool.query(
      `SELECT a.canonical, a.country_code, a.type_key, t.name_i18n
         FROM crm_agency_type_assignments a
         JOIN crm_agency_types t ON t.type_key = a.type_key
        WHERE a.is_active = 1 AND t.is_active = 1`,
    );
    const assignments = new Map<string, AgencyTypeAssignment>();
    for (const row of assignmentRows as Array<Record<string, unknown>>) {
      const i18n = typeof row.name_i18n === "string" ? JSON.parse(row.name_i18n) : (row.name_i18n ?? {});
      assignments.set(String(row.canonical).trim().toUpperCase(), {
        canonical: String(row.canonical),
        countryCode: row.country_code == null ? null : String(row.country_code),
        typeKey: String(row.type_key),
        i18n: (i18n ?? {}) as Record<string, string>,
      });
    }
    _rules = next;
    _assignments = assignments;
    _loadedAt = Date.now();
  } catch {
    // 表未就绪时保留旧缓存；没有旧缓存则回退静态规则
  }
}

export function getAgencyTypeRules(): AgencyTypeRule[] | null {
  if (_rules && Date.now() - _loadedAt >= TTL_MS) return _rules; // 过期但可用，后台刷新交给调用方
  return _rules;
}

export function getAgencyTypeAssignment(name: string, country?: string | null): AgencyTypeAssignment | null {
  const key = name.trim().toUpperCase();
  const hit = _assignments?.get(key);
  if (!hit) return null;
  const countryCode = String(country ?? "").trim().toUpperCase();
  if (hit.countryCode && countryCode && hit.countryCode !== countryCode) return null;
  return hit;
}

export function clearAgencyTypeCache(): void {
  _rules = null;
  _assignments = null;
  _loadedAt = 0;
}
