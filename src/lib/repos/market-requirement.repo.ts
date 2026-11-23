/**
 * 市场要求条目仓储（迁移 072）
 *
 * @module lib/repos/market-requirement.repo
 * @description 只读：判定与报告都引用同一份条目，写维护留给后台（后续再加管理页）。
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface MarketRequirementRow {
  market: string;
  kind: "legal" | "scoring" | "voluntary";
  standard: string;
  name: string;
  certCode: string | null;
  productScopes: string[];
  evidence: string;
  remediation: string;
  leadTimeDays: number | null;
  source: string;
  version: string;
}

function parseScopes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export class MarketRequirementRepo {
  constructor(private readonly pool: Pool) {}

  async listActive(): Promise<MarketRequirementRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT market, kind, standard, name, cert_code AS certCode, product_scopes AS productScopes,
              evidence, remediation, lead_time_days AS leadTimeDays, source, version
         FROM market_requirement WHERE is_active = 1 ORDER BY market, FIELD(kind,'legal','scoring','voluntary'), standard`,
    );
    return rows.map((r) => ({
      market: String(r.market),
      kind: String(r.kind) as MarketRequirementRow["kind"],
      standard: String(r.standard),
      name: String(r.name),
      certCode: r.certCode == null ? null : String(r.certCode),
      productScopes: parseScopes(r.productScopes),
      evidence: String(r.evidence ?? ""),
      remediation: String(r.remediation ?? ""),
      leadTimeDays: r.leadTimeDays == null ? null : Number(r.leadTimeDays),
      source: String(r.source ?? ""),
      version: String(r.version ?? ""),
    }));
  }
}
