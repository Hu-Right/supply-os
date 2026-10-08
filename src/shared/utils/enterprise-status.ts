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
 *              输入只依赖 supplier 行的两个状态列：
 *              - verify_status：主体资质审核（pending 审核中 / done 已认证 / rejected 已驳回）——唯一资质口径
 *              - claim_status：认领归属（仅 pending 参与判定：认领待核时账号侧仍为临时态）
 */

/** 账号当前绑定状态：none=未绑定 / pending=审核中 / verified=已认证 / rejected=已驳回 / linked=已绑定但无审核状态 */
export type EnterpriseBindState = "none" | "pending" | "verified" | "rejected" | "linked";

/** 判定所需的最小字段集：入参按整行透传（supplier 行 / GET 接口的 snake_case 字典），
 *  取数时用 String() 归一，避开接口列序/空串漂移 */
export type BindStatusSource = Record<string, unknown>;

/**
 * 归类绑定状态。
 * 资质结论**只看 verify_status**——不再把 claim_status='verified' 视同已认证：
 * 后台认领审核历史上只写归属列、不写资质列，造成 14 行两列长期矛盾，前端只能靠
 * 兼容判定掩盖；那批数据已于 2026-10-08 一次性对齐（见 runtime/backfill-verify-status.mjs），
 * 今后审核端两列一起写，这里不再留掩盖分支。
 * 若遇到「归属已确认但资质列未写」的行，它们会是 linked（已绑定）且可自助换绑，
 * 这是审核端回写不完整的数据问题，应在审核侧修，不在展示层兜底。
 *
 * claim_status='pending' 仍优先于 verify_status='done'：认领一家已过资质审核的公司时，
 * 主体是 done 但**账号自身的绑定仍是临时态**（归属待后台确认），页面与守卫都必须报「审核中」。
 */
export function classifyEnterpriseBindState(row: BindStatusSource | null | undefined): EnterpriseBindState {
  if (!row) return "none";
  const verify = String(row.verify_status ?? "").trim();
  const claim = String(row.claim_status ?? "").trim();
  if (claim === "pending") return "pending";
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
