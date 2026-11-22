/**
 * /api/procurement/projects/[id]/evaluations/[responseId] — 评审打分（GET / PUT）
 *
 * @module app/api/procurement/projects/[id]/evaluations/[responseId]/route
 * @description GET = 读该响应全部评分行（归属人）；PUT = 保存/覆盖打分（upsert）。
 *              阶段闸：technical 须已收标开封；financial 须该响应商务封已开封（RFP §7.3）。
 *              打分前先全量校验（维度 ∈ 冻结模板、分值 ≤ 权重），避免半批落库。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_EVAL_STAGE_NOT_PERMITTED,
  EC_RFQ_EVAL_TEMPLATE_REQUIRED,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_RESPONSE_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
  EC_RFQ_TENDER_CONFIG_INVALID,
} from "@/shared/constants/api";
import {
  listEvaluations,
  saveEvaluations,
  type EvaluationEntryInput,
} from "@/lib/services/procurement/evaluations";
import { isProjectOwnedBy } from "@/lib/services/procurement/projects";

interface Ctx {
  params: Promise<{ id: string; responseId: string }>;
}

function parseNum(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) routeError(400, EC_INVALID_PARAMS, `无效的 ${label}`);
  return n;
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id, responseId } = await params;
  const projectId = parseNum(id, "项目 ID");
  const respId = parseNum(responseId, "响应 ID");
  const pool = getPool();
  if (!(await isProjectOwnedBy(pool, projectId, auth.userId))) routeError(403, EC_FORBIDDEN, "无权查看该项目");

  /** 评审响应视图 */
  const evaluationResponseViewOf = (rows: Awaited<ReturnType<typeof listEvaluations>>) => ({
    evaluations: rows.map((r) => ({
      stage: r.stage,
      dimensionKey: r.dimension_key,
      score: r.score == null ? null : Number(r.score),
      passFail: r.pass_fail ?? null,
      weight: r.weight == null ? null : Number(r.weight),
      note: r.note ?? null,
      updatedAt: Number(r.updated_at),
    })),
  });
  return NextResponse.json(evaluationResponseViewOf(await listEvaluations(pool, respId)));
});

export const PUT = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id, responseId } = await params;
  const projectId = parseNum(id, "项目 ID");
  const respId = parseNum(responseId, "响应 ID");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }
  const rawEntries = Array.isArray(body.entries) ? (body.entries as Record<string, unknown>[]) : [];
  if (rawEntries.length === 0) routeError(400, EC_INVALID_PARAMS, "entries 不能为空");
  const entries: EvaluationEntryInput[] = rawEntries.map((e) => ({
    stage: String(e.stage ?? ""),
    dimensionKey: String(e.dimensionKey ?? ""),
    score: e.score == null ? null : Number(e.score),
    passFail: e.passFail == null ? null : String(e.passFail),
    note: e.note == null ? null : String(e.note),
  }));

  const result = await saveEvaluations(getPool(), {
    projectId,
    buyerUserId: auth.userId,
    responseId: respId,
    entries,
    evaluator: null, // P1b 采购方单人；多评委 RBAC P2+
  });
  if (!result.ok) {
    switch (result.reason) {
      case "forbidden":
        routeError(403, EC_FORBIDDEN, "无权为该项目打分");
        break;
      case "not_found":
        routeError(404, EC_RFQ_NOT_FOUND, "项目或响应不存在");
        break;
      case "response_invalid":
        routeError(409, EC_RFQ_RESPONSE_NOT_FOUND, "响应状态不允许评审");
        break;
      case "tender_not_open":
        routeError(409, EC_RFQ_STATE_INVALID, "尚未收标开封，不能评审");
        break;
      case "method_invalid":
        routeError(409, EC_RFQ_STATE_INVALID, "当前采购方式不支持该评审操作");
        break;
      case "template_missing":
        routeError(400, EC_RFQ_EVAL_TEMPLATE_REQUIRED, "尚未冻结评分模板");
        break;
      case "dimension_invalid":
        routeError(400, EC_RFQ_TENDER_CONFIG_INVALID, "评分维度不在冻结模板内");
        break;
      case "score_out_of_range":
        routeError(400, EC_INVALID_PARAMS, "分值超出维度权重上限");
        break;
      case "stage_not_permitted":
        routeError(409, EC_RFQ_EVAL_STAGE_NOT_PERMITTED, "未到该评审阶段");
        break;
      default:
        routeError(409, EC_RFQ_STATE_INVALID, "当前状态不允许评审");
    }
  }

  /** 打分结果视图 */
  const savedViewOf = (r: Extract<typeof result, { ok: true }>) => ({ saved: r.saved });
  return NextResponse.json(savedViewOf(result));
});
