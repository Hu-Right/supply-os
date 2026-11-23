/**
 * 迁移 068 · P1c ITB：招标文件包（F10/F14，全量新表，零 ALTER）
 *
 * @module lib/db/migrations/068-procurement-itb-documents
 * @description 设计稿：docs/2026-11-20-采购方式体系与发布流程重设计.md §5.3
 *
 *              红线（用户拍板）：存量表结构变更一律影子表，禁止直接 ALTER —— ITB 所需的
 *              qa_deadline 已在 procurement_tender_configs（066），本次仅新建文件包表：
 *              procurement_tender_documents —— 9 件套核心件 + BOQ/图纸/答疑补遗；
 *              文件字节走既有 attach_ 通道（upload_files），记录带 sha256/上传人/版本，
 *              发布时统一挂版本并置 published=1 冻结（F14：发布后不可改，变更=新版本重传）。
 */
import type { Pool } from "mysql2/promise";
import type { Migration } from "./runner";

const DDL = [
  `CREATE TABLE IF NOT EXISTS \`procurement_tender_documents\` (
    \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
    \`project_id\` INT UNSIGNED NOT NULL COMMENT '采购需求 procurement_projects.id',
    \`version_no\` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '绑定版本（0=草稿期，发布时挂确认版本并冻结）',
    \`doc_kind\` VARCHAR(32) NOT NULL COMMENT '件套类型（TENDER_DOC_KINDS 白名单；9 件套核心件见 ITB_CORE_DOC_KINDS）',
    \`file_name\` VARCHAR(255) NOT NULL COMMENT '原始文件名',
    \`file_key\` VARCHAR(255) NOT NULL COMMENT '存储键（attach_ 通道）',
    \`file_hash\` CHAR(64) NOT NULL COMMENT 'sha256（F14 哈希留痕）',
    \`file_size\` INT UNSIGNED NOT NULL COMMENT '字节数',
    \`visibility\` VARCHAR(16) NOT NULL DEFAULT 'public' COMMENT 'public=公告附件；respondents=仅已响应供应商',
    \`published\` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '发布冻结标记；发布后不可改，变更=重传新记录',
    \`uploaded_by\` BIGINT UNSIGNED DEFAULT NULL COMMENT '上传人 users.id',
    \`created_at\` INT UNSIGNED NOT NULL COMMENT '创建时间（秒）',
    PRIMARY KEY (\`id\`),
    KEY \`idx_tender_documents_project\` (\`project_id\`, \`version_no\`, \`doc_kind\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    COMMENT='F14 招标文件包：9件套核心件齐备方可发布；哈希+上传人+版本留痕；发布后冻结'`,
];

export const migration: Migration = {
  version: 68,
  name: "068-procurement-itb-documents",
  async up(dbPool: Pool): Promise<void> {
    for (const ddl of DDL) {
      await dbPool.query(ddl);
    }
  },
};
