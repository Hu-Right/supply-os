/**
 * PATCH /api/user/supplier-pool/:id — 编辑备注
 * DELETE /api/user/supplier-pool/:id — 移除供应商
 *
 * @module app/api/user/supplier-pool/[id]/route
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getContext } from "@/lib/db/context";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, parseJson } from "@/lib/middleware/route-handler";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { UserSupplierPoolRepo } from "@/lib/repos/user-supplier-pool.repo";

const patchBodySchema = z.object({
  notes: z.string().max(500),
});

/** PATCH: 编辑备注 */
export const PATCH = withRoute<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const poolId = Number(id);
    if (!Number.isFinite(poolId) || poolId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的资源库记录 ID");
    }
    const body = await parseJson(req, patchBodySchema);
    const ctx = getContext();
    const repo = new UserSupplierPoolRepo(ctx.dbPool);
    await repo.updateNotes(auth.userId, poolId, body.notes);
    return NextResponse.json({ code: 0, message: "ok" });
  },
);

/** DELETE: 移除供应商 */
export const DELETE = withRoute<{ params: Promise<{ id: string }> }>(
  async (req: NextRequest, { params }) => {
    const auth = await requireUserKeyOrThrow(req);
    const { id } = await params;
    const poolId = Number(id);
    if (!Number.isFinite(poolId) || poolId <= 0) {
      routeError(400, EC_INVALID_PARAMS, "无效的资源库记录 ID");
    }
    const ctx = getContext();
    const repo = new UserSupplierPoolRepo(ctx.dbPool);
    await repo.remove(auth.userId, poolId);
    return NextResponse.json({ code: 0, message: "ok" });
  },
);
