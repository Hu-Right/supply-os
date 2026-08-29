/**
 * GET /api/learning/bundles — 获取打包套餐列表
 *
 * @module app/api/learning/bundles/route
 */
import { NextResponse } from "next/server";

/** 打包套餐静态配置（与 crm_learning_materials.material_id 对应） */
const BUNDLES = [
  {
    id: "bundle-4-5",
    labelZh: "资料4-5打包（联采从业人员工作手册 中英双语）",
    labelEn: "Bundle: Items 4-5 (Practitioner's Handbook CN+EN)",
    includesIds: ["training-doc-04", "training-doc-05"],
    price: 12.9,
  },
  {
    id: "bundle-all",
    labelZh: "资料1-8全套打包",
    labelEn: "Bundle: All 8 Materials",
    includesIds: [
      "training-doc-01", "training-doc-02", "training-doc-03", "training-doc-04",
      "training-doc-05", "training-doc-06", "training-doc-07", "training-doc-08",
    ],
    price: 99,
  },
] as const;

export async function GET() {
  return NextResponse.json({ bundles: BUNDLES });
}
