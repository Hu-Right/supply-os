/**
 * PATCH  /api/user/keyword-groups/:id — 改名/改词
 * DELETE /api/user/keyword-groups/:id — 删除词组
 *
 * @module app/api/user/keyword-groups/[id]/route
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { validateGroupInput } from "@/lib/services/keyword-groups";
import { EC_INVALID_PARAMS, EC_INVALID_REQUEST, EC_VIP_ONLY } from "@/shared/constants/api";

const patchBodySchema = z.object({
  name: z.string().optional(),
  terms: z.array(z.string()).optional(),
});

/** 写操作公共闸门：权益 + 归属校验 */
async function guardWrite(req: NextRequest, idRaw: string) {
  const auth = await requireUserKeyOrThrow(req);
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) routeError(400, EC_INVALID_PARAMS, "无效的词组 ID");
  const ctx = getContext();
  if (!(await ctx.benefitSystemRepo.isEntitled(auth.userId, "product_keyword_lib"))) {
    routeError(403, EC_VIP_ONLY, "产品关键词库为企业版权益", { feature: "product_keyword_lib" });
  }
  return { userId: auth.userId, id, repo: ctx.user.keywordGroupsRepo };
}

export const PATCH = withRoute<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const { userId, id, repo } = await guardWrite(req, (await params).id);
    const body = await parseJson(req, patchBodySchema);
    if (body.name !== undefined) {
      const v = validateGroupInput({ name: body.name, terms: body.terms ?? ["_"] });
      if (!v.ok) routeError(400, EC_INVALID_PARAMS, "词组名不合法");
    }
    if (body.terms !== undefined) {
      const v = validateGroupInput({ name: "_", terms: body.terms });
      if (!v.ok) routeError(400, EC_INVALID_PARAMS, "关键词不合法");
    }
    // KeywordGroupsRepo.update 不捕获 ER_DUP_ENTRY（改名撞同名词组时直接抛错）：
    // 路由层兜底转 400/EC_INVALID_REQUEST，其余错误原样上抛交 withRoute 统一处理。
    let updated: boolean;
    try {
      updated = await repo.update(userId, id, body);
    } catch (err) {
      if ((err as { code?: string })?.code === "ER_DUP_ENTRY") {
        routeError(400, EC_INVALID_REQUEST, "已存在同名词组");
      }
      throw err;
    }
    if (!updated) routeError(404, EC_INVALID_PARAMS, "词组不存在");
    return NextResponse.json({ code: 0, message: "ok" });
  },
);

export const DELETE = withRoute<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const { userId, id, repo } = await guardWrite(req, (await params).id);
    await repo.remove(userId, id);
    return NextResponse.json({ code: 0, message: "ok" });
  },
);
