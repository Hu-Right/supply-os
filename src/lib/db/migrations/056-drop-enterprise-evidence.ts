/**
 * 迁移 056 — 删除 enterprise_evidence（证据资料与能力档案重复）
 *
 * @description 背景（2026-11-19）：企业设置页「证据资料」只登记「类目 + 标题 + 有效期」，
 *              字段是能力档案（enterprise_capability_items）的真子集：
 *                - 证书类目的有效期在能力项 value.validUntil 里已有，且报告规则只读能力项，
 *                  证据行的 valid_until / no_expiry 从未被任何判定逻辑消费；
 *                - 证据唯一贡献是给报告挂一条 kind=upload_file 的引用标签（文件早已不存），
 *                  反而让报告出现指向不存在文件的「证据」；
 *                - 迁移 051 删除文件列后遗留的 SELECT 仍引用 upload_file_id，报告接口实际会报
 *                  Unknown column（本次一并摘除该读取方法）。
 *              生产库 enterprise_evidence 已确认 0 行（2026-11-19 COUNT(*) 实查），无数据迁移负担，
 *              故直接 DROP TABLE。代码侧证据链路（UI / API / service / repo / 报告挂载）同步删除。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

export const migration: Migration = {
  version: 56,
  name: "drop_enterprise_evidence",
  async up(dbPool: Pool): Promise<void> {
    await dbPool.query("DROP TABLE IF EXISTS `enterprise_evidence`");
    console.log("[migration 056] 已删除 enterprise_evidence（证据资料并入企业能力档案）");
  },
};
