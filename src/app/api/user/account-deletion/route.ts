/**
 * 账号注销申请
 *
 * GET  /api/user/account-deletion — 查询最近一次申请进度（含冷静期、阻塞项）
 * POST /api/user/account-deletion — 提交注销申请（需验证码；有未结清事项返回 409 + blockers）
 *
 * @module app/api/user/account-deletion/route
 * @description 提交即进入冷静期（默认 7 天）；冷静期内重新登录自动撤销。
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, parseJson } from "@/lib/middleware/route-handler";
import { accountDeletionStatusViewOf, submitAccountDeletion } from "@/lib/services/account-deletion";

const submitSchema = z.object({
  /** 注销身份验证码（先调 /api/user/account-deletion/code 获取） */
  code: z.string().min(4).max(8),
  reason: z.string().max(500).optional(),
  contact: z.string().max(200).optional(),
});

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const request = await accountDeletionStatusViewOf(getContext().dbPool, auth.userId);
  return NextResponse.json({ request });
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const body = await parseJson(req, submitSchema);
  const result = await submitAccountDeletion(getContext().dbPool, {
    userId: auth.userId,
    code: body.code,
    reason: body.reason,
    contact: body.contact,
  });

  if (!result.ok) {
    // 阻塞项属于业务前置条件：用 200 + blocked 返回，便于前端直接列出待处理事项
    return NextResponse.json({ blocked: true, blockers: result.blockers });
  }

  return NextResponse.json(
    {
      request: {
        id: result.id,
        status: result.status,
        coolingUntil: result.coolingUntil,
        duplicate: result.duplicate,
      },
    },
    { status: result.duplicate ? 200 : 201 },
  );
});
