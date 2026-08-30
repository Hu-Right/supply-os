/**
 * 学习中心类型
 * Learning Center Types
 *
 * @module types/learning
 * @description 学习资料（可含付费/下载）与常见问题（FAQ）实体
 *              Learning materials (with premium/download support) and FAQ items
 */

export interface LearningMaterial {
  id: string;
  titleZh: string;
  titleEn: string;
  categoryZh: string;
  categoryEn: string;
  summaryZh: string;
  summaryEn: string;
  contentZh: string;
  contentEn: string;
  isPremium: boolean;
  downloadsCount: number;
  fileUrl?: string;
  fileName?: string;
  price?: number;
  /** 资料编号（用于卡片左上角编号徽章，与数组顺序一致） */
  number?: number;
}

export interface FAQItem {
  id: string;
  questionZh: string;
  questionEn: string;
  answerZh: string;
  answerEn: string;
  category: "ungm" | "exhibition" | "general";
}
