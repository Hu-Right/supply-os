/**
 * /api/user/enterprise/withdraw — 自助撤回当前账号的企业绑定
 *
 * @module app/api/user/enterprise/withdraw/route
 * @description 路线三给「绑错主体」一条正路：还没拿下认证的绑定（审核中/已驳回/认领待核/
 *              无状态）可以自助撤回，撤回后即可重新为另一家企业提交认证或认领。
 *              已认证的主体**不允许**自助撤回（400），变更主体只能由后台重审或客服处理——
 *              认证结论是平台资产，不能被账号单方面抹掉。
 *              端点不接收 supplierId：作用对象只能是当前账号自己的绑定行，
 *              否则就变成「拆掉别人绑定」的口子。重复调用幂等。
 */
import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { withdrawCurrentBinding } from "@/lib/services/enterprise-binding";

/** POST — 撤回当前绑定（无请求体；解绑后由前端重取状态并引导重新填写） */
export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);

  // 换绑是低频救济动作：24 小时内最多 3 次，挡住「反复建主体刷审核队列」的用法
  const rl = checkRateLimit(req, { windowMs: 24 * 60 * 60_000, maxAttempts: 3 }, () => `enterprise-withdraw:${auth.userId}`);
  if (rl) return rl;

  const withdrawn = await withdrawCurrentBinding(getContext(), auth.userId);

  return NextResponse.json({
    code: 0,
    message: "ok",
    data: {
      withdrawn: !!withdrawn,
      company: withdrawn?.companyName ?? null,
      state: withdrawn?.state ?? null,
    },
  });
});
