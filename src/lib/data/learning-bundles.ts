/**
 * 学习资料打包套餐静态配置（服务端权威定价源）
 *
 * 打包套餐无数据库表，价格与条目以此处为唯一事实来源；
 * /api/learning/bundles 的展示与 PaymentService 的下单定价共用本模块，
 * 客户端传入的 amount / bundle_items 不参与定价（审查报告 F2）。
 *
 * @module lib/data/learning-bundles
 */

export interface LearningBundle {
  id: string;
  labelZh: string;
  labelEn: string;
  /** 套餐包含的 crm_learning_materials.material_id 列表 */
  includesIds: string[];
  price: number;
}

export const LEARNING_BUNDLES: LearningBundle[] = [
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
];

/** 按 bundle id 查找套餐（未找到返回 null） */
export function findLearningBundle(bundleId: string): LearningBundle | null {
  return LEARNING_BUNDLES.find((b) => b.id === bundleId) ?? null;
}
