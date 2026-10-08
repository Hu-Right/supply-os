/**
 * 企业绑定排他与换绑编排服务
 * Enterprise binding guard & switch
 *
 * @module lib/services/enterprise-binding
 * @description 把「一个账号同一时间只绑定一家企业」这条不变量从前端隐式约定
 *              （`enterprise.bound ? PUT : POST`）收口成服务端闸口，并按状态给出口：
 *              - 未拿下认证的旧绑定（审核中/已驳回/认领待核/无状态）→ 允许换绑，
 *                由本服务**显式撤回**旧绑定（解绑 + 作废旧申请），不再静默覆盖；
 *              - 已认证的旧绑定 → 400 拒绝，变更主体只能走后台/客服。
 *              共用入口：
 *              - POST /api/user/enterprise（新建/复用绑定）
 *              - POST /api/supplier-claims（认领并临时绑定）
 *              - POST /api/user/enterprise/withdraw（自助撤回当前绑定）
 *              状态口径取自 shared/utils/enterprise-status（与前端徽章同一份判定），
 *              避免「页面显示已绑定、接口却放行新认证」的两套真相。
 */
import type { AppContext } from "../db/context";
import type { BoundSubjectRow } from "../repos/suppliers/index";
import { getPool } from "../db/pool";
import { routeError } from "../middleware/route-handler";
import { EC_DUPLICATE } from "@/shared/constants/api";
import {
  classifyEnterpriseBindState,
  isBindingLockedForSubjectSwitch,
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

/**
 * 已认证主体的拒绝文案：它同时是「为什么不能自助换绑」与「那到底怎么办」的答案，
 * 必须带客服/后台出口，否则用户只能反复重试。
 */
export function describeBindingConflict(binding: CurrentBinding, action: BindingConflictAction): string {
  const name = `「${binding.companyName}」`;
  if (action === "claim") {
    return `企业${name}已认证，一个账号只能认领一家企业；如需变更主体请联系客服，由后台重新审核。`;
  }
  return `企业${name}已认证，一个账号只能认证一家企业；如需修改资料请在企业信息页编辑，如需变更主体请联系客服由后台重新审核。`;
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
 * 撤回当前绑定：解绑账号 + 作废该用户对此主体的待核认领 + 清掉主体的「认领处理中」标记。
 *
 * 三条写语句的顺序是故意定的：
 * ① 先解绑账号——「一账号一主体」分叉立即成立，调用方紧接着绑新主体时不会
 *    出现两个绑定同时存在；即使后续两条失败，残留的 pending 认领也会被
 *    releaseExpiredClaims 到期扫干（它只清仍无人绑定的 pending 记录）。
 * ② 只作废 status='pending' 的认领：已过审/已驳回是终态审计记录，不能重写。
 * ③ supplier.claim_status 仅在它确实是 'pending' 且已无任何有效认领时清回 NULL，
 *    不碰别人的排他期、也不抹掉后台确认过的归属。
 * 数据保留原则：不删 supplier 行、不动诊断/资源库记录。
 */
export async function withdrawBinding(userId: number, binding: CurrentBinding): Promise<void> {
  if (isBindingLockedForSubjectSwitch(binding.state)) {
    routeError(400, EC_DUPLICATE, describeBindingConflict(binding, "certify"));
  }
  const pool = getPool();
  await pool.execute(
    "UPDATE crm_users SET supplier_id = NULL, supplier_link_status = 'none' WHERE id = ? AND supplier_id = ?",
    [userId, binding.supplierId],
  );
  await pool.execute(
    `UPDATE crm_supplier_claims SET status = 'cancelled', updated_at = NOW()
      WHERE user_id = ? AND supplier_id = ? AND status = 'pending'`,
    [userId, binding.supplierId],
  );
  await pool.execute(
    `UPDATE supplier SET claim_status = NULL
      WHERE id = ? AND claim_status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM crm_supplier_claims c
           WHERE c.supplier_id = supplier.id AND c.status IN ('approved', 'pending')
        )`,
    [binding.supplierId],
  );
}

/**
 * 撤回账号自己的当前绑定（/api/user/enterprise/withdraw 的唯一入口）。
 * 只接受 userId：主体 id 从账号自己的绑定行取，不能由请求体指定，
 * 否则这个端点就变成「拆掉任意绑定」的口子。无绑定时幂等返回 null。
 */
export async function withdrawCurrentBinding(
  ctx: AppContext,
  userId: number,
): Promise<CurrentBinding | null> {
  const binding = await readCurrentBinding(ctx, userId);
  if (!binding) return null;
  await withdrawBinding(userId, binding);
  return binding;
}

/**
 * 账号侧换绑闸口（分状态）：
 * - 目标即当前绑定行 → 放行（那是「重复保存自己的资料」，不是新的认证/认领）；
 * - 已认证 → 400，一个账号只能认证/认领一家企业；
 * - 其余已绑定状态 → 先显式撤回旧绑定再放行，把旧行为（静默把 crm_users.supplier_id
 *   从 A 覆盖成 B）换成有记录、有提示的正当切换。
 * @returns 被切换掉的旧绑定（未发生切换时为 null，供调用方按需提示）
 */
export async function assertBindingAllowsSubject(
  ctx: AppContext,
  userId: number,
  binding: CurrentBinding | null,
  targetSupplierId: number,
  action: BindingConflictAction,
): Promise<CurrentBinding | null> {
  if (!binding || binding.supplierId === targetSupplierId) return null;
  if (isBindingLockedForSubjectSwitch(binding.state)) {
    routeError(400, EC_DUPLICATE, describeBindingConflict(binding, action));
  }
  await withdrawBinding(userId, binding);
  return binding;
}
