/**
 * 企业绑定排他编排服务
 * Enterprise binding guard
 *
 * @module lib/services/enterprise-binding
 * @description 把「一个账号同一时间只绑定一家企业」这条不变量从前端隐式约定
 *              （`enterprise.bound ? PUT : POST`）收口成服务端闸口，供两个会写
 *              crm_users.supplier_id 的入口共用：
 *              - POST /api/user/enterprise（新建/复用绑定）
 *              - POST /api/supplier-claims（认领并临时绑定）
 *              状态口径取自 shared/utils/enterprise-status（与前端徽章同一份判定），
 *              避免「页面显示已绑定、接口却放行新认证」的两套真相。
 */
import type { AppContext } from "../db/context";
import type { BoundSubjectRow } from "../repos/suppliers/index";
import { routeError } from "../middleware/route-handler";
import { EC_DUPLICATE } from "@/shared/constants/api";
import {
  classifyEnterpriseBindState,
  isBindingLockedForNewSubject,
  type EnterpriseBindState,
} from "@/shared/utils/enterprise-status";

/** 触发闸口的动作：决定拒绝文案的措辞（认证=自行提交新主体，认领=绑定平台已有主体） */
export type BindingConflictAction = "certify" | "claim";

/** 账号当前绑定（null=未绑定任何主体） */
export interface CurrentBinding {
  supplierId: number;
  companyName: string;
  state: EnterpriseBindState;
}

/** 公司名进文案前先截断：错误响应会被前端整段渲染，长名称会撑爆提示条 */
function shortName(row: BoundSubjectRow): string {
  const name = String(row.name_confirmed || row.company || "").trim();
  if (!name) return "已绑定企业";
  return name.length > 24 ? `${name.slice(0, 24)}…` : name;
}

/**
 * 读取账号当前绑定的主体及其状态。
 * supplier_id 指向已不存在的行（历史孤儿数据 / 认领过期解绑的中间态）按未绑定处理，
 * 与 GET /api/user/enterprise 的 bound=false 口径保持一致。
 */
export async function readCurrentBinding(ctx: AppContext, userId: number): Promise<CurrentBinding | null> {
  const row = await ctx.supplier.directoryRepo.findBoundSubjectByUserId(userId);
  if (!row) return null;
  return {
    supplierId: Number(row.id),
    companyName: shortName(row),
    state: classifyEnterpriseBindState(row),
  };
}

/** 按状态与动作组装拒绝文案（后端返回准确错误信息，前端只做展示） */
export function describeBindingConflict(binding: CurrentBinding, action: BindingConflictAction): string {
  const { state, companyName } = binding;
  const name = `「${companyName}」`;
  if (action === "claim") {
    switch (state) {
      case "pending":
        return `已绑定企业${name}正在审核中，一个账号只能认领一家企业；请等待审核完成后再试。`;
      case "verified":
        return `企业${name}已认证，一个账号只能认领一家企业。`;
      case "rejected":
        return `企业${name}认证已被驳回，请先在企业信息页修改原资料重新送审，暂不能认领其他企业。`;
      default:
        return `该账号已绑定企业${name}，一个账号只能认领一家企业。`;
    }
  }
  switch (state) {
    case "pending":
      return `已绑定企业${name}正在审核中，一个账号只能认证一家企业；如需补充或修改资料请在企业信息页编辑。`;
    case "verified":
      return `企业${name}已认证，一个账号只能认证一家企业；如需修改资料请在企业信息页编辑。`;
    case "rejected":
      return `企业${name}认证已被驳回，请在企业信息页修改原资料后重新提交，暂不能认证另一家企业。`;
    default:
      return `该账号已绑定企业${name}，一个账号只能绑定一家企业；如需修改资料请在企业信息页编辑。`;
  }
}

/** 认证主体身份三要素：改写它们 = 把已通过的认证挪到另一家公司 */
const IDENTITY_KEYS = ["company", "name_confirmed", "credit_code"] as const;

/** 身份字段归一：信用代码大小写不敏感，公司名剔除空白差异（表单回传常带尾部空格） */
function normalizeIdentity(key: (typeof IDENTITY_KEYS)[number], value: unknown): string {
  const v = String(value ?? "").trim();
  return key === "credit_code" ? v.toUpperCase() : v.replace(/\s+/g, "");
}

/** body 是否触碰身份三要素（不触碰就不必回查当前行） */
function touchesIdentityKeys(body: Record<string, unknown>): boolean {
  return IDENTITY_KEYS.some((k) => k in body);
}

/**
 * 已认证主体的身份三要素是否被改写（只比较 body 里出现的键）。
 * 企业表单每次全量回传，原值不算改写。
 */
function identitySubjectChanged(
  current: Record<string, unknown> | null,
  body: Record<string, unknown>,
): boolean {
  if (!current) return false;
  for (const key of IDENTITY_KEYS) {
    if (!(key in body)) continue;
    if (normalizeIdentity(key, body[key]) !== normalizeIdentity(key, current[key])) return true;
  }
  return false;
}

/**
 * 编辑闸口：认证已通过的主体不得通过 PUT 改写公司名/统一社会信用代码——
 * 那是「换主体」的最后一条暗道（POST 与认领侧已被账号排他拦死，而编辑侧
 * 历史上无条件接受全量字段）。审核中/已驳回仍可补正，那正是审核期的正当路径。
 */
export async function assertVerifiedSubjectIdentityStable(
  ctx: AppContext,
  supplierId: number,
  body: Record<string, unknown>,
): Promise<void> {
  if (!touchesIdentityKeys(body)) return;
  const current = await ctx.supplier.directoryRepo.findFullById(supplierId);
  if (classifyEnterpriseBindState(current) !== "verified") return;
  if (identitySubjectChanged(current, body)) {
    routeError(
      400,
      EC_DUPLICATE,
      "企业已通过认证，一个账号只能认证一家企业；如需变更主体名称或统一社会信用代码，请联系客服由后台重新审核",
    );
  }
}

/**
 * 账号侧排他闸口：已绑定主体且目标不是当前绑定行时，按业务错误拒绝。
 * 目标即当前绑定行时放行——那是「重复保存自己的资料」，不是新的认证/认领。
 * @returns 未拦截时返回当前绑定（供调用方复用，避免二次查询）
 */
export function assertBindingAllowsSubject(
  binding: CurrentBinding | null,
  targetSupplierId: number,
  action: BindingConflictAction,
): CurrentBinding | null {
  if (!binding) return null;
  if (binding.supplierId === targetSupplierId) return binding;
  if (isBindingLockedForNewSubject(binding.state)) {
    routeError(400, EC_DUPLICATE, describeBindingConflict(binding, action));
  }
  return binding;
}
