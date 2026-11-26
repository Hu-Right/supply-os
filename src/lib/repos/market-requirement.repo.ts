/**
 * 市场要求条目仓储
 *
 * @module lib/repos/market-requirement.repo
 * @description 只读。2026-11-26 起唯一事实源改为 supplier_certifications：
 *              requirement_kind 非空即市场要求；scope 即市场码，scope='global' 对所有市场生效；
 *              is_certificate=0 的是 EPD/I-REC 这类非证书要求（certCode 为 null）。
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
      `SELECT scope AS market, requirement_kind AS kind, code AS standard, name,
              CASE WHEN is_certificate = 1 THEN code ELSE NULL END AS certCode,
              product_scopes AS productScopes,
              COALESCE(requirement_evidence, '') AS evidence,
              COALESCE(requirement_remediation, '') AS remediation,
              requirement_lead_days AS leadTimeDays,
              COALESCE(requirement_source, '') AS source,
              '2026-11' AS version
         FROM supplier_certifications
        WHERE is_active = 1 AND requirement_kind IS NOT NULL
        ORDER BY scope, FIELD(requirement_kind,'legal','scoring','voluntary'), code`,
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
