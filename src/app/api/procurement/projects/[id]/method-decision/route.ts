/**
 * /api/procurement/projects/[id]/method-decision — 方式判定（GET / POST）
 *
 * @module app/api/procurement/projects/[id]/method-decision/route
 * @description GET = 读最新判定（推荐 + 命中路径 + 待补信息 + 云境复核结果，向导回填用）；
 *              POST = 保存/重判（draft/need_info 可 upsert）：七维输入快照落库 + 引擎推荐 +
 *              采购方确认（可偏离推荐，须留理由）。方式取值仅限当前开放集（P1a = rfq/eoi）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import { EC_FORBIDDEN, EC_INVALID_PARAMS, EC_RFQ_NOT_FOUND, EC_RFQ_STATE_INVALID } from "@/shared/constants/api";
import { getMethodDecision, saveMethodDecision } from "@/lib/services/procurement/method-decision";
import { isProjectOwnedBy } from "@/lib/services/procurement/projects";
import type { MethodAdvisorInput } from "@/shared/utils/procurement-method";

interface Ctx {
  params: Promise<{ id: string }>;
}

function parseProjectId(raw: string): number {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) routeError(400, EC_INVALID_PARAMS, "无效的项目 ID");
  return id;
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);
  const pool = getPool();
  if (!(await isProjectOwnedBy(pool, projectId, auth.userId))) routeError(403, EC_FORBIDDEN, "无权查看该项目");

  const decision = await getMethodDecision(pool, projectId);
  /** 方式判定响应视图 */
  const decisionResponseViewOf = (d: Awaited<ReturnType<typeof getMethodDecision>>) => ({ decision: d });
  return NextResponse.json(decisionResponseViewOf(decision));
});

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }
  const buyerMethod = String(body.buyerMethod ?? body.method ?? "").trim();
  if (!buyerMethod) routeError(400, EC_INVALID_PARAMS, "缺少 buyerMethod");
  const buyerNote = body.buyerNote == null ? null : String(body.buyerNote);
  const rawInputs = (body.inputs ?? {}) as Record<string, unknown>;
  const inputs: MethodAdvisorInput = {
    objectTypes: Array.isArray(rawInputs.objectTypes) ? (rawInputs.objectTypes as string[]) : [],
    specClarity: (rawInputs.specClarity as MethodAdvisorInput["specClarity"]) ?? undefined,
    solutionComparison: rawInputs.solutionComparison === true,
    recurring: rawInputs.recurring === true,
    preSourcing: rawInputs.preSourcing === true,
    budgetKnown: rawInputs.budgetKnown === false ? false : true,
    mandatoryRuleMethod: rawInputs.mandatoryRuleMethod == null ? null : String(rawInputs.mandatoryRuleMethod),
  };

  const result = await saveMethodDecision(getPool(), {
    projectId,
    userId: auth.userId,
    inputs,
    buyerMethod,
    buyerNote,
  });
  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
        break;
      case "not_editable":
        routeError(409, EC_RFQ_STATE_INVALID, "仅草稿或待补充状态可调整采购方式");
        break;
      case "method_not_available":
        routeError(400, EC_INVALID_PARAMS, "该采购方式暂未开放");
        break;
      case "deviation_note_required":
        routeError(400, EC_INVALID_PARAMS, "偏离系统推荐方式时须填写理由");
        break;
      case "base_method_required":
        routeError(400, EC_INVALID_PARAMS, "长期协议（LTA）须绑定底层竞争方式");
        break;
      default:
        routeError(403, EC_FORBIDDEN, "无权操作该项目");
    }
  }

  /** 方式判定视图 */
  const decisionViewOf = (d: Extract<typeof result, { ok: true }>["decision"]) => ({ decision: d });
  return NextResponse.json(decisionViewOf(result.decision));
});
