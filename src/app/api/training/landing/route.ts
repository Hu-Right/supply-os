/**
 * GET /api/training/landing — 培训着陆页动态数据
 *
 * @module app/api/training/landing/route
 * @description 仅返回支付链路所需的动态内容：课程配置与开课期次。
 *              取数与 /training 页面 RSC 直出共用 lib/services/training/landing，
 *              避免「未来期次过滤」两处口径分叉。
 *              讲师/团队/课堂照片为前端静态配置（src/data/training-content.ts），
 *              全部文案走六语言 i18n，本接口不再读取这些内容。
 */
import { NextResponse } from "next/server";
import { withRoute } from "@/lib/middleware/route-handler";
import { loadTrainingLanding } from "@/lib/services/training/landing";

export const GET = withRoute(async () => {
  return NextResponse.json(await loadTrainingLanding());
});
