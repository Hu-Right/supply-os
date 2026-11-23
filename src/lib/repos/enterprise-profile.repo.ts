/**
 * 企业能力档案 —— 数据访问层（v0.3）
 *
 * @module lib/repos/enterprise-profile.repo
 * @description 企业侧 `enterprise_capability_items` 的读写；
 *              企业主体解析 = 账号绑定的已认证 supplier。
 *              2026-11-19 摘除 enterprise_evidence（证据资料与能力档案重复，见迁移 056）。
 */
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

export interface VerifiedEnterpriseRow {
  id: number;
  company: string | null;
  certification: string | null;
  certification_tags: unknown;
  country: string | null;
}

export interface CapabilityRow {
  id: number;
  enterprise_id: number;
  capability_type: string;
  name: string;
  value_json: unknown;
  evidence_refs_json: unknown;
  confirmation_json: unknown;
}

/**
 * `value_json` 兼容两种驱动形态：JSON 列返对象，或老数据/文本列返字符串。
 * 解析失败一律返回 null（调用方按「没有该字段」处理），不抛错——
 * 资质分级不该因为一条脏能力项把整个诊断提交打崩。
 */
function parseValueJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

export class EnterpriseProfileRepo {
  constructor(private pool: Pool) {}

  async findVerifiedEnterprise(userId: number): Promise<VerifiedEnterpriseRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.id, s.company, s.country
         FROM users u JOIN supplier s ON s.id = u.supplier_id
        WHERE u.id = ? AND u.supplier_link_status = 'verified' LIMIT 1`,
      [userId],
    );
    return rows[0] ? (rows[0] as unknown as VerifiedEnterpriseRow) : null;
  }

  async listCapabilities(enterpriseId: number): Promise<CapabilityRow[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, enterprise_id, capability_type, name, value_json, evidence_refs_json, confirmation_json
         FROM enterprise_capability_items WHERE enterprise_id = ? ORDER BY id DESC`,
      [enterpriseId],
    );
    return rows as unknown as CapabilityRow[];
  }

  /**
   * 该企业已持有的认证 code 清单（V3 资质分级求差集用）。
   * 只取 `capability_type='certification'`；`value_json.code` 是字典快照锚点（迁移 031 起不存外键），
   * 手工录入的证书 code 可能为空——空值直接丢掉，否则「缺 0 项」会被空串占位算成「已持」。
   * 返回去重后的原值（不做大小写归一，归一是评分侧 normalizeCertCode 的职责，避免两处各归一次）。
   */
  async listCertificationCodes(enterpriseId: number): Promise<string[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT value_json FROM enterprise_capability_items
        WHERE enterprise_id = ? AND capability_type = 'certification'`,
      [enterpriseId],
    );
    const codes = new Set<string>();
    for (const row of rows) {
      const raw = (row as { value_json?: unknown }).value_json;
      const parsed = parseValueJson(raw);
      const code = String(parsed?.code ?? "").trim();
      if (code) codes.add(code);
    }
    return [...codes];
  }

  /**
   * V3 资质裁剪用：主营范围信号（迁移 071 起认证字典有「适用产品」维，需要把企业归到同一套桶）。
   *
   * @description 只读三处：供应商主档（公司名 / 主营产品文本 / 行业码）、能力档案里的品目名称。
   *              不猜：一个都取不到时返回空串，由调用方标记「未识别主营范围」。
   */
  async getScopeSignals(enterpriseId: number): Promise<{
    company: string;
    products: string;
    industryCode: string;
    capabilityLabels: string[];
  }> {
    const [supRows] = await this.pool.query<RowDataPacket[]>(
      "SELECT company, products, industry_code FROM supplier WHERE id = ? LIMIT 1",
      [enterpriseId],
    );
    const sup = (supRows[0] ?? {}) as { company?: unknown; products?: unknown; industry_code?: unknown };

    const [itemRows] = await this.pool.query<RowDataPacket[]>(
      "SELECT name FROM enterprise_capability_items WHERE enterprise_id = ? ORDER BY id DESC LIMIT 40",
      [enterpriseId],
    );

    return {
      company: String(sup.company ?? "").trim(),
      products: String(sup.products ?? "").trim(),
      industryCode: String(sup.industry_code ?? "").trim(),
      capabilityLabels: itemRows
        .map((r) => String((r as { name?: unknown }).name ?? "").trim())
        .filter(Boolean),
    };
  }

  async insertCapability(params: {
    enterpriseId: number;
    capabilityType: string;
    name: string;
    value: unknown;
    evidenceRefs: unknown;
    confirmation: unknown;
  }): Promise<number> {
    const [res] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO enterprise_capability_items
         (enterprise_id, capability_type, name, value_json, evidence_refs_json, confirmation_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.enterpriseId,
        params.capabilityType,
        params.name,
        JSON.stringify(params.value),
        JSON.stringify(params.evidenceRefs),
        JSON.stringify(params.confirmation),
      ],
    );
    return Number(res.insertId);
  }

  async deleteCapability(enterpriseId: number, id: number): Promise<boolean> {
    const [res] = await this.pool.execute<ResultSetHeader>(
      "DELETE FROM enterprise_capability_items WHERE id = ? AND enterprise_id = ?",
      [id, enterpriseId],
    );
    return res.affectedRows > 0;
  }
}
