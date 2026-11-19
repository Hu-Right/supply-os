/**
 * Schema 迁移入口
 * Schema migration entry point
 *
 * @module server/db/schema
 * @description 迁移机制保留可用，但纪律是**非必要不写迁移**：结构以生产库当前状态为事实源，
 *              只有需要长期保真、可回放、跨环境一致的变更（新表、关键列、约束、值域）才落成
 *              迁移文件。一次性数据修补、临时排查、单字段小默认值调整走运维脚本直接对库执行，
 *              不进本链——迁太多反而没人能判断哪条还在生效。
 *
 *              历史：原 107 个迁移已于 2026-09-29 清空，全库结构快照与历史迁移代码本体都在
 *              docs/数据库设计/_baseline-20260929/（schema-all-tables.sql / migrations-full.zip）。
 *              【账本状态】生产库 schema_migrations 原有的 106 行旧记录已于 2026-10-08 清空
 *              （全量备份：docs/数据库设计/_baseline-20260929/backup-schema-migrations-before-clear
 *              .json / .sql，逐条 INSERT 可回滚），因此**新迁移从 version 001 起写**。
 *              历史 107 个迁移**不回灌**：其中不少表走过影子表切换，用迁移链已推导不出生产现状，
 *              重放只会破库；结构事实源是库本身 + 快照目录。
 *              【基线入库】自 2026-10-10 起，全库终态 DDL 以已跟踪的 db/schema/baseline.sql 为准
 *              （由 scripts/tools/dump-schema-baseline.mjs 从现网结构导出），CI e2e job 直接导入它建表。
 *              （runner 的判定是 pending = 未出现在账本里的版本，撞号仍会被**静默跳过**。）
 */
import type { Pool } from "mysql2/promise";
import { runMigrations, type Migration } from "./migrations/runner";
import { migration as notificationsMigration } from "./migrations/003-notifications";
import { migration as feasibilityReportMigration } from "./migrations/006-feasibility-report";
import { migration as evidenceFilenameMigration } from "./migrations/007-enterprise-evidence-filename";
import { migration as ordersUnifiedMigration } from "./migrations/008-orders-unified";
import { migration as ordersHardeningMigration } from "./migrations/009-orders-hardening";
import { migration as procurementCoreMigration } from "./migrations/011-procurement-core";
import { migration as procurementFlowMigration } from "./migrations/012-procurement-flow";
import { migration as retireRfqMigration } from "./migrations/013-retire-rfq-tables";
import { migration as procurementPublishChainMigration } from "./migrations/014-procurement-publish-chain";
import { migration as buyerVerificationCallbackMigration } from "./migrations/015-buyer-verification-callback";
import { migration as procurementF01F02CompleteMigration } from "./migrations/016-procurement-f01-f02-complete";
import { migration as buyerResubmitMigration } from "./migrations/017-buyer-resubmit";
import { migration as reviewCallbackIdMigration } from "./migrations/018-review-callback-id";
import { migration as notificationsPayloadMigration } from "./migrations/019-notifications-payload";
import { migration as notificationsSoftDeleteMigration } from "./migrations/020-notifications-soft-delete";
import { migration as authorizationCallbackMigration } from "./migrations/021-authorization-callback";
import { migration as buyerFormSlimMigration } from "./migrations/022-buyer-form-slim";
import { migration as procurementInvitationsMigration } from "./migrations/023-procurement-invitations";
import { migration as buyerDropRetiredColumnsMigration } from "./migrations/024-buyer-drop-retired-columns";
import { migration as dropRedundantPbvIndexMigration } from "./migrations/025-drop-redundant-pbv-index";
import { migration as dropProjectDeadColumnsMigration } from "./migrations/026-drop-project-dead-columns";
import { migration as procurementCertRequirementsMigration } from "./migrations/027-procurement-cert-requirements";
import { migration as countryCodesMigration } from "./migrations/028-country-codes";
import { migration as incotermPlaceMigration } from "./migrations/029-incoterm-place";
import { migration as guaranteeConfigMigration } from "./migrations/030-guarantee-config";
import { migration as supplierTypeMigration } from "./migrations/031-supplier-type";
import { migration as contactDisclosureMigration } from "./migrations/032-contact-disclosure-three-levels";
import { migration as dropRetiredProjectFieldsMigration } from "./migrations/033-drop-retired-project-fields";
import { migration as dropProcurementMatchingMigration } from "./migrations/034-drop-procurement-matching";
import { migration as dropSupplierBusinessTypeRemarkMigration } from "./migrations/036-drop-supplier-business-type-remark";
import { migration as dropSupplierSourceEnrichMigration } from "./migrations/037-drop-supplier-source-enrich";
import { migration as dropSupplierDeadFieldsMigration } from "./migrations/038-drop-supplier-dead-fields";
import { migration as dropSupplierRegistrationFieldsMigration } from "./migrations/039-drop-supplier-registration-fields";
import { migration as dropSupplierIntroMigration } from "./migrations/040-drop-supplier-intro";
import { migration as dropUnusedProcurementTendersColumnMigration } from "./migrations/041-drop-unused-procurement-tenders-column";
import { migration as registrationIdTypeMigration } from "./migrations/050-registration-id-type";
import { migration as dropEvidenceFileColumnsMigration } from "./migrations/051-drop-evidence-file-columns";
import { migration as noticePublicTimezoneSourceMigration } from "./migrations/052-notice-public-timezone-source";
import { migration as noticeTimezoneColumnCommentsMigration } from "./migrations/053-notice-timezone-column-comments";
import { migration as noticeAccessGrantsRenameMigration } from "./migrations/054-notice-access-grants-rename";
import { migration as noticePublicIndustryCommentMigration } from "./migrations/055-notice-public-industry-comment";
import { migration as dropEnterpriseEvidenceMigration } from "./migrations/056-drop-enterprise-evidence";
import { migration as certificationToCapabilityItemsMigration } from "./migrations/057-certification-to-capability-items";
import { migration as dropNoticePublicDifficultyMigration } from "./migrations/058-drop-notice-public-difficulty";
import { migration as supplierInquiryMigration } from "./migrations/059-supplier-inquiry";
import { migration as supplierDiagnosisSubmitLogMigration } from "./migrations/060-supplier-diagnosis-submit-log";
import { migration as supplierQualityScore100Migration } from "./migrations/042-supplier-quality-score-100";
import { migration as dropBuyerParentMigration } from "./migrations/043-buyer-drop-parent";
import { migration as searchLogAnonymousMigration } from "./migrations/044-search-log-anonymous";
import { migration as noticePublicOpportunityIndexMigration } from "./migrations/045-notice-public-opportunity-index";
import { migration as noticePublicCountryIndexMigration } from "./migrations/046-notice-public-country-index";
import { migration as noticePublicTypePkIndexMigration } from "./migrations/047-notice-public-type-pk-index";
import { migration as noticePublicHasAttachmentsMigration } from "./migrations/048-notice-public-has-attachments";
import { migration as phoneE164Migration } from "./migrations/049-phone-e164";

/**
 * 迁移清单：非必要不写。新增迁移 = 放进 migrations/ 并 push 到本数组。
 * 导出供 `npm run db:migrate`（scripts/tools/apply-migrations.ts）离线应用——
 * dev server 已启动时 instrumentation 的 schemaPhase 不会重跑，新迁移必须能手动补。
 */
export const ALL_MIGRATIONS: Migration[] = [
  notificationsMigration,
  feasibilityReportMigration,
  evidenceFilenameMigration,
  ordersUnifiedMigration,
  ordersHardeningMigration,
  procurementCoreMigration,
  procurementFlowMigration,
  retireRfqMigration,
  procurementPublishChainMigration,
  buyerVerificationCallbackMigration,
  procurementF01F02CompleteMigration,
  buyerResubmitMigration,
  reviewCallbackIdMigration,
  notificationsPayloadMigration,
  notificationsSoftDeleteMigration,
  authorizationCallbackMigration,
  buyerFormSlimMigration,
  procurementInvitationsMigration,
  buyerDropRetiredColumnsMigration,
  dropRedundantPbvIndexMigration,
  dropProjectDeadColumnsMigration,
  procurementCertRequirementsMigration,
  countryCodesMigration,
  incotermPlaceMigration,
  guaranteeConfigMigration,
  supplierTypeMigration,
  contactDisclosureMigration,
  dropRetiredProjectFieldsMigration,
  dropProcurementMatchingMigration,
  dropSupplierBusinessTypeRemarkMigration,
  dropSupplierSourceEnrichMigration,
  dropSupplierDeadFieldsMigration,
  dropSupplierRegistrationFieldsMigration,
  dropSupplierIntroMigration,
  dropUnusedProcurementTendersColumnMigration,
  supplierQualityScore100Migration,
  dropBuyerParentMigration,
  searchLogAnonymousMigration,
  noticePublicOpportunityIndexMigration,
  noticePublicCountryIndexMigration,
  noticePublicTypePkIndexMigration,
  noticePublicHasAttachmentsMigration,
  phoneE164Migration,
  registrationIdTypeMigration,
  dropEvidenceFileColumnsMigration,
  noticePublicTimezoneSourceMigration,
  noticeTimezoneColumnCommentsMigration,
  noticeAccessGrantsRenameMigration,
  noticePublicIndustryCommentMigration,
  dropEnterpriseEvidenceMigration,
  certificationToCapabilityItemsMigration,
  dropNoticePublicDifficultyMigration,
  supplierInquiryMigration,
  supplierDiagnosisSubmitLogMigration,
];

/**
 * 执行所有待应用的 schema 迁移。
 * @returns 本次实际执行的迁移数量（已应用过的版本会被 runner 跳过）
 */
export async function ensureProcurementSchema(dbPool: Pool): Promise<number> {
  return runMigrations(dbPool, ALL_MIGRATIONS);
}
