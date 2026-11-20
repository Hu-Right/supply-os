/**
 * /api/procurement/projects/[id]/tender-config — 采购规则（GET / PUT）
 *
 * @module app/api/procurement/projects/[id]/tender-config/route
 * @description GET = 读配置草稿 + 按方式派生的生效配置（采购规则确认区展示）；
 *              PUT = 保存草稿（draft/need_info；发布后冻结）。派生口径见
 *              tender-config.derivePublishConfig：rfq 无覆盖 = P0 值（行为零变化）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError } from "@/lib/middleware/route-handler";
import {
  EC_FORBIDDEN,
  EC_INVALID_PARAMS,
  EC_RFQ_NOT_FOUND,
  EC_RFQ_STATE_INVALID,
  EC_RFQ_TENDER_CONFIG_INVALID,
} from "@/shared/constants/api";
import { derivePublishConfig, getTenderConfig, saveTenderConfig } from "@/lib/services/procurement/tender-config";
import { isProjectOwnedBy } from "@/lib/services/procurement/projects";

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

  const config = await getTenderConfig(pool, projectId);
  // 生效配置预览（草稿覆盖优先，无草稿按方式缺省）
  const methodRows = await pool.query("SELECT method, version_no FROM procurement_projects WHERE id = ? LIMIT 1", [
    projectId,
  ]);
  const method = String((methodRows[0] as Array<{ method: string }>)[0]?.method ?? "rfq");
  const effective = derivePublishConfig(method, config as never);
  /** 采购规则响应视图 */
  const configResponseViewOf = (
    c: Awaited<ReturnType<typeof getTenderConfig>>,
    e: ReturnType<typeof derivePublishConfig>,
  ) => ({ config: c, effective: e });
  return NextResponse.json(configResponseViewOf(config, effective));
});

export const PUT = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const auth = await requireUserKeyOrThrow(req);
  const { id } = await params;
  const projectId = parseProjectId(id);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    routeError(400, EC_INVALID_PARAMS, "请求数据格式错误");
  }

  const result = await saveTenderConfig(getPool(), {
    projectId,
    userId: auth.userId,
    config: {
      publishMode: body.publishMode == null ? undefined : String(body.publishMode),
      awardMethod: body.awardMethod == null ? null : String(body.awardMethod),
      qaDeadlineAt: body.qaDeadlineAt == null ? null : Number(body.qaDeadlineAt),
      envelopePolicy: body.envelopePolicy == null ? null : String(body.envelopePolicy),
      evalTemplate: body.evalTemplate ?? null,
      ltaBaseMethod: body.ltaBaseMethod == null ? null : String(body.ltaBaseMethod),
    },
  });
  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        routeError(404, EC_RFQ_NOT_FOUND, "项目不存在");
        break;
      case "not_editable":
        routeError(409, EC_RFQ_STATE_INVALID, "仅草稿或待补充状态可调整采购规则");
        break;
      case "invalid_publish_mode":
        routeError(400, EC_RFQ_TENDER_CONFIG_INVALID, "发布模式必须是 public/targeted/prequalified");
        break;
      case "invalid_award_method":
        routeError(400, EC_RFQ_TENDER_CONFIG_INVALID, "评标法与采购方式不匹配（EOI 仅资格筛选、RFQ 仅最低价）");
        break;
      case "invalid_envelope":
        routeError(400, EC_RFQ_TENDER_CONFIG_INVALID, "信封策略必须是 none 或 tech_fin_split");
        break;
      default:
        routeError(403, EC_FORBIDDEN, "无权操作该项目");
    }
  }

  return NextResponse.json({ config: result.ok ? result.config : null });
});
