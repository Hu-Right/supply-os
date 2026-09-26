/**
 * GET  /api/user/keyword-groups — 我的词组（含档位标记；无权益返回空数组不报错）
 * POST /api/user/keyword-groups — 新建词组（仅 product_keyword_lib 档位）
 *
 * @module app/api/user/keyword-groups/route
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { listKeywordGroups, createKeywordGroup } from "@/lib/services/keyword-groups";
import { EC_INVALID_PARAMS, EC_INVALID_REQUEST, EC_VIP_ONLY } from "@/shared/constants/api";

export const GET = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const ctx = getContext();
  const data = await listKeywordGroups(ctx.user.keywordGroupsRepo, ctx.benefitSystemRepo, auth.userId);
  return NextResponse.json({ code: 0, message: "ok", data });
});

const createBodySchema = z.object({
  name: z.string(),
  terms: z.array(z.string()),
});

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const body = await parseJson(req, createBodySchema);
  const ctx = getContext();
  const result = await createKeywordGroup(
    ctx.user.keywordGroupsRepo, ctx.benefitSystemRepo, auth.userId, body,
  );
  if (!result.ok) {
    if (result.reason === "forbidden") {
      routeError(403, EC_VIP_ONLY, "产品关键词库为企业版权益", { feature: "product_keyword_lib" });
    }
    if (result.reason === "pool_full") {
      routeError(400, EC_INVALID_PARAMS, "词组数量已达上限（50 组），请删除不用的词组后再创建");
    }
    if (result.reason === "duplicate") {
      routeError(400, EC_INVALID_REQUEST, "已存在同名词组");
    }
    routeError(400, EC_INVALID_PARAMS, "词组名或关键词不合法");
  }
  return NextResponse.json({ code: 0, message: "ok", data: { id: result.id } });
});
