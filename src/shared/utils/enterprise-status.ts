/**
 * 企业绑定状态口径（账号侧）
 * Enterprise binding status
 *
 * @module shared/utils/enterprise-status
 * @description 「一个账号同一时间只绑定一家企业」的**唯一判定口径**：服务端换绑闸口
 *              （/api/user/enterprise POST、/api/supplier-claims POST、
 *              /api/user/enterprise/withdraw）与前端状态徽章（ProfileContent /
 *              EnterpriseInfoCard / 企业信息页）共用同一分类器，避免出现「页面说已绑定、
 *              接口却允许再认证」的两套真相。
 *              输入只依赖两项事实：
 *              - verifyStatus：主体资质审核（pending 审核中 / done 已认证 / rejected 已驳回）
 *                ——唯一资质口径，来自 supplier.verify_status（响应侧按红线②以 camelCase 下发）
 *              - hasPendingClaim：是否存在 status='pending' 的认领（认领处理中）
 *                ——**关系派生**，来自 supplier_claims（SupplierClaimRepo.hasPendingClaim）；
 *                供应商行上的 `claim_status` 列已于 2026-11-11 退役（ADR-0017），不再读取。
 */

/** 账号当前绑定状态：none=未绑定 / pending=审核中 / verified=已认证 / rejected=已驳回 / linked=已绑定但无审核状态 */
export type EnterpriseBindState = "none" | "pending" | "verified" | "rejected" | "linked";

/** 判定所需的最小字段集：主体资质标量 + 认领处理中派生事实。
 *  verifyStatus 用 String() 归一，避开空串/null 漂移；hasPendingClaim 只认 true。 */
export type BindStatusSource = {
  verifyStatus?: string | null;
  hasPendingClaim?: boolean;
};

/**
 * 归类绑定状态。
 * 资质结论**只看 verify_status**——认领通过不再靠供应商行上的第二列表达；
 * `claim_status` 已退役（ADR-0017）：后台认领通过仍会连带把 verify_status 写成 done，
 * 归属事实改由 supplier_claims.status='approved' + users.supplier_id 派生。
 * 若遇到「归属已确认但资质列未写」的行，它们会是 linked（已绑定）且可自助换绑，
 * 这是审核端回写不完整的数据问题，应在审核侧修，不在展示层兜底。
 *
 * hasPendingClaim 仍优先于 verify_status='done'：认领一家已过资质审核的公司时，
 * 主体是 done 但**账号自身的绑定仍是临时态**（归属待后台确认），页面与守卫都必须报「审核中」。
 */
export function classifyEnterpriseBindState(row: BindStatusSource | null | undefined): EnterpriseBindState {
  if (!row) return "none";
  const verify = String(row.verifyStatus ?? "").trim();
  if (row.hasPendingClaim === true) return "pending";
  if (verify === "done") return "verified";
  if (verify === "pending") return "pending";
  if (verify === "rejected") return "rejected";
  return "linked";
}

/** 状态 → 文案键（复用六语言包既有键，不新增同义键） */
export function enterpriseBindStateText(state: EnterpriseBindState): { key: string; fallback: string } {
  switch (state) {
    case "verified":
      return { key: "authEnterpriseVerifyApproved", fallback: "已认证" };
    case "pending":
      return { key: "authEnterpriseVerifyProcessing", fallback: "审核中" };
    case "rejected":
      return { key: "authEnterpriseVerifyRejected", fallback: "已驳回" };
    case "linked":
      return { key: "authEnterpriseStatusLinked", fallback: "已绑定" };
    default:
      return { key: "authSupplierPending", fallback: "未绑定" };
  }
}

/**
 * 绑定是否锁死「换主体」：只有**已认证**（资质已过 / 后台已确认归属）不许自助切换，
 * 必须由后台重审或客服处理。审核中/已驳回/认领待核/无状态旧绑定都是**可撤回**的——
 * 它们还没拿下认证，拦住只会把用户逼到「静默覆盖旧绑定」这条暗路上；
 * 给出正当的换绑出口，才能既守住一账号一主体，又不让人被错误的旧绑定锁死。
 */
export function isBindingLockedForSubjectSwitch(state: EnterpriseBindState): boolean {
  return state === "verified";
}
