/**
 * 企业能力档案 —— 数据访问层（v0.4）
 *
 * @module lib/repos/enterprise-profile.repo
 * @description 企业侧能力档案的读写。
 *              企业主体解析 = 账号绑定的已认证 supplier。
 *
 *              2026-11-26 资质收口：**证书类能力项唯一事实源 = 150 条认证字典**
 *              （`supplier.certification_tags` + `supplier.certification_meta`）。
 *              本仓储不再把证书写进 `enterprise_capability_items`：
 *                - 读：证书从 tags/meta + 字典拼装（合成行 id = -字典 id）；
 *                - 写：证书直接改 supplier 的 tags/meta；
 *                - 删：负 id 即字典 id，按 code 从 tags/meta 移除；
 *              `enterprise_capability_items` 只承载非证书能力项（业绩/财务/人员…）。
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

/** JSON 数组列（tags）→ 去空字符串数组；脏数据按空处理 */
function parseStringArray(raw: unknown): string[] {
  const arr = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => String(v ?? "").trim()).filter(Boolean);
}

/** certification_meta 行：{ CODE: { noExpiry, validUntil } } */
type CertMeta = Record<string, { noExpiry?: boolean; validUntil?: string | null }>;

function parseCertMeta(raw: unknown): CertMeta {
  const obj = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  return obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as CertMeta) : {};
}

interface CatalogCertRow {
  id: number;
  code: string;
  name: string;
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

  /** 企业主档上的证书 tags/meta（证书唯一事实源） */
  private async loadCertState(enterpriseId: number): Promise<{ tags: string[]; meta: CertMeta }> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT certification_tags, certification_meta FROM supplier WHERE id = ? LIMIT 1",
      [enterpriseId],
    );
    const row = (rows[0] ?? {}) as { certification_tags?: unknown; certification_meta?: unknown };
    return { tags: parseStringArray(row.certification_tags), meta: parseCertMeta(row.certification_meta) };
  }

  /** 按 code 查 150 字典条目（case-insensitive；仅 is_active 证书） */
  private async findCatalogCert(code: string): Promise<CatalogCertRow | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, code, name FROM supplier_certifications
        WHERE is_active = 1 AND is_certificate = 1 AND UPPER(code) = UPPER(?) LIMIT 1`,
      [code],
    );
    return (rows[0] as CatalogCertRow | undefined) ?? null;
  }

  private async saveCertState(enterpriseId: number, tags: string[], meta: CertMeta): Promise<void> {
    await this.pool.execute(
      "UPDATE supplier SET certification_tags = ?, certification_meta = ? WHERE id = ?",
      [JSON.stringify(tags), JSON.stringify(meta), enterpriseId],
    );
  }

  /**
   * 能力档案列表：证书行由 tags/meta + 150 字典合成，非证书行读能力表。
   * 合成行 id 取 **负的字典 id**，删除时据此反查 code（无需额外映射表）。
   */
  async listCapabilities(enterpriseId: number): Promise<CapabilityRow[]> {
    const { tags, meta } = await this.loadCertState(enterpriseId);
    const certRows: CapabilityRow[] = [];
    if (tags.length > 0) {
      const [catalog] = await this.pool.query<RowDataPacket[]>(
        `SELECT id, code, name FROM supplier_certifications
          WHERE is_active = 1 AND is_certificate = 1 AND code IN (?)`,
        [tags],
      );
      // tags 里可能有大小写不一致的旧值：按大写建索引兜底匹配
      const byUpper = new Map<string, CatalogCertRow>();
      for (const c of catalog as unknown as CatalogCertRow[]) byUpper.set(String(c.code).toUpperCase(), c);
      for (const tag of tags) {
        const c = byUpper.get(tag.toUpperCase());
        if (!c) continue; // 已从字典下线的 code 不再出现在档案里
        const m = meta[c.code] ?? meta[tag] ?? {};
        certRows.push({
          id: -Number(c.id),
          enterprise_id: enterpriseId,
          capability_type: "certification",
          name: String(c.name),
          value_json: {
            kind: "certification",
            code: String(c.code),
            noExpiry: m.noExpiry === true,
            validUntil: m.validUntil ?? null,
          },
          evidence_refs_json: null,
          confirmation_json: null,
        });
      }
    }

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, enterprise_id, capability_type, name, value_json, evidence_refs_json, confirmation_json
         FROM enterprise_capability_items
        WHERE enterprise_id = ? AND capability_type <> 'certification'
        ORDER BY id DESC`,
      [enterpriseId],
    );
    return [...certRows, ...(rows as unknown as CapabilityRow[])];
  }

  /**
   * 该企业已持有的认证 code 清单（V3 资质分级求差集用）。
   * 唯一事实源 = supplier.certification_tags；空值直接丢掉。
   */
  async listCertificationCodes(enterpriseId: number): Promise<string[]> {
    const { tags } = await this.loadCertState(enterpriseId);
    return [...new Set(tags)];
  }

  /**
   * V3 资质裁剪用：主营范围信号。
   *
   * @description 只读：供应商主档（公司名 / 主营产品文本 / 行业码）、
   *              证书 tags（经 150 字典取中文名）、非证书能力项名称。
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

    const { tags } = await this.loadCertState(enterpriseId);
    const certNames: string[] = [];
    if (tags.length > 0) {
      const [certRows] = await this.pool.query<RowDataPacket[]>(
        `SELECT name FROM supplier_certifications
          WHERE is_active = 1 AND is_certificate = 1 AND code IN (?)`,
        [tags],
      );
      for (const r of certRows as unknown as Array<{ name?: unknown }>) {
        const name = String(r.name ?? "").trim();
        if (name) certNames.push(name);
      }
    }

    const [itemRows] = await this.pool.query<RowDataPacket[]>(
      "SELECT name FROM enterprise_capability_items WHERE enterprise_id = ? ORDER BY id DESC LIMIT 40",
      [enterpriseId],
    );

    return {
      company: String(sup.company ?? "").trim(),
      products: String(sup.products ?? "").trim(),
      industryCode: String(sup.industry_code ?? "").trim(),
      capabilityLabels: [
        ...certNames,
        ...itemRows.map((r) => String((r as { name?: unknown }).name ?? "").trim()).filter(Boolean),
      ],
    };
  }

  /**
   * 新增能力项：证书类写 supplier.certification_tags / certification_meta（只认 150 字典），
   * 返回合成 id（-字典 id）；非证书类仍写能力表。
   */
  async insertCapability(params: {
    enterpriseId: number;
    capabilityType: string;
    name: string;
    value: unknown;
    evidenceRefs: unknown;
    confirmation: unknown;
  }): Promise<number> {
    if (params.capabilityType === "certification") {
      const value = (params.value ?? {}) as Record<string, unknown>;
      const code = String(value.code ?? "").trim();
      const cert = code ? await this.findCatalogCert(code) : null;
      if (!cert) {
        throw new Error(`证书编码「${code || params.name}」未收录在认证字典，请从 150 项中选择`);
      }
      const { tags, meta } = await this.loadCertState(params.enterpriseId);
      if (!tags.some((t) => t.toUpperCase() === String(cert.code).toUpperCase())) tags.push(String(cert.code));
      meta[String(cert.code)] = {
        noExpiry: value.noExpiry === true,
        validUntil: value.noExpiry === true ? null : (value.validUntil == null ? null : String(value.validUntil)),
      };
      await this.saveCertState(params.enterpriseId, tags, meta);
      return -Number(cert.id);
    }

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

  /** 删除能力项：负 id 视为证书（从 tags/meta 移除），否则删能力表行 */
  async deleteCapability(enterpriseId: number, id: number): Promise<boolean> {
    if (id < 0) {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        "SELECT code FROM supplier_certifications WHERE id = ? LIMIT 1",
        [-id],
      );
      const code = String((rows[0] as { code?: unknown } | undefined)?.code ?? "").trim();
      if (!code) return false;
      const { tags, meta } = await this.loadCertState(enterpriseId);
      const nextTags = tags.filter((t) => t.toUpperCase() !== code.toUpperCase());
      if (nextTags.length === tags.length) return false;
      for (const key of Object.keys(meta)) {
        if (key.toUpperCase() === code.toUpperCase()) delete meta[key];
      }
      await this.saveCertState(enterpriseId, nextTags, meta);
      return true;
    }
    const [res] = await this.pool.execute<ResultSetHeader>(
      "DELETE FROM enterprise_capability_items WHERE id = ? AND enterprise_id = ?",
      [id, enterpriseId],
    );
    return res.affectedRows > 0;
  }
}
