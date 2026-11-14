/**
 * POST /api/procurement/items/parse — 解析产品清单（F02：上传 Excel 产品清单）
 *
 * @module app/api/procurement/items/parse/route
 * @description 接收 .xlsx / .csv / .tsv / .txt（≤5MB），解析为明细行返回，不落库——
 *              采购方在向导里确认后再整体保存（与"AI 提取须逐项确认"同一口径）。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { parseProductList } from "@/lib/services/procurement/spreadsheet";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXT = [".xlsx", ".csv", ".tsv", ".txt"];

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const rl = checkRateLimit(
    req,
    { windowMs: 60_000, maxAttempts: 30 },
    () => `procurement-items-parse:${auth.userId}`,
  );
  if (rl) return rl;

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 multipart/form-data 格式上传");
  }
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) routeError(400, EC_INVALID_PARAMS, "请选择要导入的清单文件");
  if (file.size > MAX_SIZE) routeError(400, EC_INVALID_PARAMS, "文件不能超过 5MB");
  const lower = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
    routeError(400, EC_INVALID_PARAMS, "仅支持 .xlsx / .csv / .tsv / .txt");
  }

  try {
    const parsed = await parseProductList(Buffer.from(await file.arrayBuffer()), file.name);
    if (parsed.items.length === 0) routeError(400, EC_INVALID_PARAMS, "未从文件中识别出任何产品行");
    /** 解析结果视图（不落库，待采购方确认） */
    const parsedItemsViewOf = (items: typeof parsed.items, skipped: number) => ({ items, skipped });
    return NextResponse.json(parsedItemsViewOf(parsed.items, parsed.skipped));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/items/parse] failed:", (err as Error).message);
    routeError(400, EC_INVALID_PARAMS, "清单解析失败，请检查文件格式");
  }
});
