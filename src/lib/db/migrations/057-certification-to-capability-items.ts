/**
 * 迁移 057 — 证书单一事实源：supplier.certification 存量文本 → enterprise_capability_items
 *
 * @description 背景（2026-11-19）：企业信息页「认证资质」是 varchar(500) 逗号文本，能力档案
 *              里的「证书/资质」是结构化能力项，两套口径互不联动：文本没有有效期（报告只能判
 *              unknown）、AI 匹配/摘要/评分只读文本、能力档案却读不到。产品拍板改为单一事实源
 *              = 能力档案：
 *                - 本迁移把存量文本逐 token 转成 certification 能力项（有效期未知，不编造）；
 *                - 代码侧停写 supplier.certification（表单字段移除、编辑白名单移除、
 *                  API body 不再接收），读侧（门户目录 / AI 画像 / 报告判定）统一改成
 *                  enterprise_capability_items 聚合。
 *
 *              幂等：同企业同证书 code 已存在能力项时跳过（可用重复执行）。
 *              supplier.certification 列暂时保留（历史留档，代码零读写），是否删列另行评估：
 *              102k 行的 supplier 表删列要走影子表重建，不在本次范围。
 */
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { Migration } from "./runner";

/** 与 services/feasibility-report/inputs.ts 的 splitCertificationTokens 同一分隔符口径 */
const SEPARATORS = /[,，、/|;；\n\r]+/;
/** 明显不是证书的占位词：迁移时丢弃，避免把「无 / - / 暂无」写成能力项 */
const JUNK = new Set(["-", "—", "无", "暂无", "没有", "其他", "其它", "n/a", "na", "none", "null"]);

function splitTokens(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(SEPARATORS)) {
    const token = part.trim();
    if (token.length < 2) continue;
    if (JUNK.has(token.toLowerCase())) continue;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

export const migration: Migration = {
  version: 57,
  name: "certification_to_capability_items",
  async up(dbPool: Pool): Promise<void> {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT id, certification FROM supplier
        WHERE certification IS NOT NULL AND TRIM(certification) <> ''`,
    );

    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
      const enterpriseId = Number(row.id);
      for (const token of splitTokens(String(row.certification))) {
        const value = {
          kind: "certification",
          code: token,
          name: token,
          source: "migration",
          // 原文没有有效期：留空按 unknown 处理，不编造
          noExpiry: false,
          validUntil: null,
        };
        const [res] = await dbPool.query<ResultSetHeader>(
          `INSERT INTO enterprise_capability_items
             (enterprise_id, capability_type, name, value_json, evidence_refs_json, confirmation_json)
           SELECT ?, 'certification', ?, ?, NULL, ?
             FROM DUAL
            WHERE NOT EXISTS (
              SELECT 1 FROM enterprise_capability_items c
               WHERE c.enterprise_id = ?
                 AND c.capability_type = 'certification'
                 AND JSON_UNQUOTE(JSON_EXTRACT(c.value_json, '$.code')) = ?
            )`,
          [
            enterpriseId,
            token,
            JSON.stringify(value),
            JSON.stringify({ source: "migration", confirmedBy: null, confirmedAt: new Date().toISOString() }),
            enterpriseId,
            token,
          ],
        );
        if (Number(res.affectedRows) > 0) inserted += 1;
        else skipped += 1;
      }
    }
    console.log(
      `[migration 057] 证书迁入能力档案：供应商 ${rows.length} 家，新增能力项 ${inserted} 条，跳过重复 ${skipped} 条`,
    );
  },
};
