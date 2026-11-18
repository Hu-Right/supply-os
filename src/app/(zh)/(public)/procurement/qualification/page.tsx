/**
 * /procurement/qualification — 旧版初筛问卷地址（已退役，301 到 v2 诊断页）
 *
 * @description 地址保留并重定向，避免已分发的二维码/链接失效；URL 里的 query 不透传 ——
 *              v1 的 notice_id / poolId 参数在新版没有对应语义（透传反而误导），
 *              新版按"登录用户 + 公司主体"定位诊断记录。
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyQualificationPage() {
  redirect("/procurement/diagnosis");
}
