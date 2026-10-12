/**
 * crm_bid_opportunities 精简清单 —— 唯一事实源
 *
 * 阶段一（建影子表改结构）与阶段二（补增量切换）都从本模块派生列集与索引集，
 * 不允许在脚本里各写一份清单（同「SQL 列清单分隔符只能有一个出处」的红线口径）。
 *
 * 判据全部来自 2026-10-12 **云生产库**取证（复跑：node --env-file=.env scripts/tools/opp-slim-evidence.mjs），
 * 每条都注明「为什么可删」。库归属口径同 docs/adr/0012：**列口径以云库为准**，
 * 云端删列不需内网同意（内网列不会因此消失，只是不再流入云端），反之内网多出的列也不得进新代码。
 *
 * 归属 scripts/tools 而非 scripts/ops：兄弟表 crm_bid_notices 三轮回滚脚本因留在
 * ops/（被 gitignore）而失传，本轮起精简作业与证据脚本一律入库持久化。
 */

export const OPP_TABLE = "crm_bid_opportunities";
export const SHADOW_TABLE = `${OPP_TABLE}__new`;
export const OLD_TABLE_PREFIX = `${OPP_TABLE}__old_`;

/**
 * 一档：云端零读写（src/ + scripts/ + tests/ 全域词边界扫描，snake 与 camel 双查均为 0 命中）。
 * 这批列全部由内网 CRM/AI 管道写入云端，云端只落库不消费。
 * 与兄弟表 crm_bid_notices 第 7 节 R1/R3 轮删除的同名列完全一致（那边已验证可删）。
 */
export const DEAD_COLUMNS = [
  // ── 内网 CRM 归属/分派流水（源库在用，云端无读者）──
  "create_user_id", // 有值 13555 行、distinct 18；仅 idx_create_user 挂着
  "assign_user_id", // 有值 10 行；仅 idx_opp_assign_id 挂着
  "assign_time", // 有值 2 行
  "assignment_rule_id", // NOT NULL DEFAULT 0，distinct 2（基本恒 0）
  "last_submit_time", // 有值 9373 行
  "last_submit_user_id", // 有值 9373 行、distinct 12
  "last_edit_user_id", // 有值 3032 行
  "last_edit_time", // 有值 3032 行
  "audit_admin_id", // 有值 11947 行、distinct 7
  "audit_time", // 有值 11947 行
  // ── AI 增强锁与时间戳（外置 worker 2026-09-17 停摆，全库 0 行有值）──
  "ai_analyzed_at", // 有值 209 行但零引用
  "ai_l5_lock_token", // 0 行有值
  "ai_l5_lock_at", // 0 行有值
  // ── 截止时间第四份表达 ──
  "deadline_parsed", // 有值 12471 行，零引用；有效性唯一口径是生成列 deadline_sec
];

/**
 * 二档：被 SELECT 出来但在透出层被丢弃（读了不用），或数据已失真。
 * 删除前必须先在代码侧摘除读取点（见 docs/数据库设计/crm_bid_opportunities-投标商机表.md 第 6 节）。
 */
export const UNREAD_COLUMNS = [
  "thresholds", // featured SELECT 后不进 payload；271 行有真值，其余为 []
  "difficulty", // 同上；UI 显示的是主表 crm_bid_notices.difficulty 那份
  "extra", // 全库无读取点；569 行有真值
  "is_expired", // 无读取点且已失真：5240 行标 1，另 6734 行实际过期仍标 0
];

/**
 * 三档：国际公共采购结构化 17 列（迁移 088）。退役理由：
 *   1) 全库仅 1 行有值（id=19027 / 公告 440730 / 荷兰 tenderned 路牌供货），
 *      而该行的 17 列内容写的是摩洛哥 ONEE 水泵站 EPC（IsDB 融资、卡萨布兰卡递交）
 *      → 唯一一份数据本身贴错了行，且库里不存在那条摩洛哥标；
 *   2) 前端零消费：API 把 17 键打包成 intl_procurement 透出，src/features 无任何读取点；
 *   3) 合计占用 < 1 MB，留着只增加同步白名单与契约维护成本。
 * 恢复前提：先补消费方（前端渲染）+ 修正错位数据，再重新加列。
 */
export const RETIRED_INTL_COLUMNS = [
  "procurement_procedure",
  "prequalification_required",
  "lot_structure",
  "contract_form",
  "consortium_rule",
  "bid_validity_days",
  "submission_mode",
  "submission_requirement",
  "submission_address",
  "funding_agency",
  "evaluation_method",
  "language_requirement",
  "execution_period",
  "local_content",
  "eshs_requirements",
  "eligible_countries",
  "key_dates",
];

/** 本次要删除的全部列（79 → 44）。 */
export const DROP_COLUMNS = [
  ...DEAD_COLUMNS,
  ...UNREAD_COLUMNS,
  ...RETIRED_INTL_COLUMNS,
];

/**
 * 明确不动的列（防止后续误扩清单）：
 * - update_time：daily-sync 的增量水位线列，删了断同步
 * - remark / training_link：名字名不副实，但都是 DOCX 报告正文（内部备注 / 研修班关联点）
 * - status / priority：qualifiedOppWhere 三路 OR 与开放 API 都在读
 * - is_qualified / audit_status / review_status：实测 100% 等价，但合列会同时动
 *   付费详情、精选、宽表、指纹四条路径，且主表另有 is_qualified 镜像 → 单独一轮处理
 */
export const GUARDED_COLUMNS = [
  "update_time",
  "remark",
  "training_link",
  "status",
  "priority",
  "is_qualified",
  "audit_status",
  "review_status",
];

/**
 * 要删的索引（22 → 12），分三类：
 *   P 前缀被覆盖：列序列是另一索引的严格前缀，定义不同名同义
 *   D 建在死列上：列本身在 DROP_COLUMNS 里
 *   T 单租户零过滤力：tenant_id 恒 1（distinct=1）且代码零引用，与 notices 那轮同口径
 * 现存 22 个索引里「定义完全相同」的重复组为 0（2026-10-08 那轮已清）。
 */
export const DROP_INDEXES = [
  { name: "idx_bid_opp_tenant_id", why: "P/T", note: "tenant_id ⊂ idx_opp_tenant_*（4 个）" },
  { name: "idx_review_status", why: "P", note: "review_status ⊂ idx_review_deadline(review_status,deadline_sec)" },
  { name: "idx_source_notice", why: "P", note: "source_notice_id ⊂ idx_opp_source_covering(source_notice_id,...)" },
  { name: "idx_create_user", why: "D", note: "建在死列 create_user_id 上" },
  { name: "idx_opp_assign_id", why: "D", note: "建在死列 assign_user_id 上" },
  { name: "idx_opp_ai_l5_lock", why: "D", note: "两列全 0 行有值" },
  { name: "idx_opp_tenant_id", why: "T", note: "tenant_id 恒 1，等价于 PK 序" },
  { name: "idx_opp_tenant_audit_id", why: "T", note: "首列恒 1 的复合索引" },
  { name: "idx_opp_tenant_create", why: "T", note: "首列恒 1 的复合索引" },
  { name: "idx_opp_tenant_reference", why: "T", note: "首列恒 1，reference 查走 idx_bid_opp_reference" },
];

/** 保留但**待生产库 EXPLAIN 复核**的索引（本轮不删，登记为下一轮 C 桶候选）。 */
export const PENDING_EXPLAIN_INDEXES = [
  "idx_bid_opp_country",
  "idx_bid_opp_platform",
  "idx_bid_opp_reference",
  "idx_bid_opp_status",
  "idx_bid_opp_audit_status",
  "idx_bid_opp_deadline_ts",
  "idx_bid_opp_create_time",
  "idx_opp_deadline_sec",
];

/** 本轮之后确定保留的索引。 */
export const KEPT_INDEXES = [
  "PRIMARY",
  "idx_opp_qualified_id",
  "idx_opp_source_covering",
  "idx_review_deadline",
  ...PENDING_EXPLAIN_INDEXES,
];

/** 回填分批行数（同 notices 轮口径：避免单条大事务与 undo 膨胀）。 */
export const BACKFILL_BATCH = 5000;

/** 取删除后的保留列清单（顺序跟随原表，供 INSERT INTO __new (...) SELECT 拼接）。 */
export function keptColumns(allColumns) {
  const drop = new Set(DROP_COLUMNS);
  return allColumns.filter((c) => !drop.has(c));
}

/** 取需从源同步中忽略的列（daily-sync 交集语义会自动跳过并告警，此处供文档与核对使用）。 */
export const SYNC_NOISE_COLUMNS = DROP_COLUMNS;
