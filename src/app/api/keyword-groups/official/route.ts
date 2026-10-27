/**
 * GET /api/keyword-groups/official — 官方精选词组（公开只读，无鉴权档位判断）
 *
 * @module app/api/keyword-groups/official/route
 * @description 裸载荷 { groups }；只出 status=1、(sort_order,id) 升序（service 层
 *              进程内 10 分钟缓存）。空表返回空数组不报错（CI 空库可测）。
 *              表由后台维护，本项目无写路径；表缺失以 ER_NO_SUCH_TABLE 上抛交
 *              withRoute 统一处理（一切以表为准，不做容错兼容）。
 */
import { NextResponse } from "next/server";
import { getContext } from "@/lib/db/context";
import { withRoute } from "@/lib/middleware/route-handler";
import { listOfficialKeywordGroups } from "@/lib/services/keyword-groups";

export const GET = withRoute(async () => {
  const groups = await listOfficialKeywordGroups(getContext().officialKeywordGroupsRepo);
  return NextResponse.json({ groups });
});
