/**
 * POST /api/procurement/extract/pdf — 从 PDF 提取需求信息（F02）
 *
 * @module app/api/procurement/extract/pdf/route
 * @description 上传需求 PDF（≤10MB），服务端抽文本并用规则抽取标题/背景/用途/标准/交付/
 *              截止/预算/明细，附每条来源行返回；不落库、不覆盖现有需求——采购方在向导里
 *              逐项勾选确认后才写入（全案：AI/规则提取结果必须由采购方逐项确认）。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUserKeyOrThrow } from "@/lib/middleware/auth";
import { withRoute, routeError, RouteError } from "@/lib/middleware/route-handler";
import { checkRateLimit } from "@/lib/middleware/rateLimiter";
import { EC_INVALID_PARAMS } from "@/shared/constants/api";
import { extractPdfText, extractRequirementFields } from "@/lib/services/procurement/pdf-extract";

const MAX_SIZE = 10 * 1024 * 1024;

export const POST = withRoute(async (req: NextRequest) => {
  const auth = await requireUserKeyOrThrow(req);
  const rl = checkRateLimit(
    req,
    { windowMs: 60_000, maxAttempts: 20 },
    () => `procurement-pdf-extract:${auth.userId}`,
  );
  if (rl) return rl;

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    routeError(400, EC_INVALID_PARAMS, "请使用 multipart/form-data 格式上传");
  }
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) routeError(400, EC_INVALID_PARAMS, "请选择要提取的 PDF 文件");
  if (file.size > MAX_SIZE) routeError(400, EC_INVALID_PARAMS, "PDF 不能超过 10MB");
  if (!file.name.toLowerCase().endsWith(".pdf")) routeError(400, EC_INVALID_PARAMS, "仅支持 PDF 文件");

  try {
    const text = await extractPdfText(Buffer.from(await file.arrayBuffer()));
    if (!text.trim()) routeError(400, EC_INVALID_PARAMS, "PDF 未提取到文本（可能是扫描件，请手工填写）");
    const extracted = extractRequirementFields(text);
    /** 提取结果视图（含来源行，未落库） */
    const pdfExtractViewOf = (data: typeof extracted, textLength: number) => ({ ...data, textLength });
    return NextResponse.json(pdfExtractViewOf(extracted, text.length));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    console.warn("[api/procurement/extract/pdf] failed:", (err as Error).message);
    routeError(400, EC_INVALID_PARAMS, "PDF 解析失败，请确认文件未加密且包含文本");
  }
});
