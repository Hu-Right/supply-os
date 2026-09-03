/**
 * 研修班往期课堂现场分类静态数据
 * Training Gallery Category Static Data
 *
 * @description 往期课堂现场的分类名称与描述文案极少变动，直接前端写死以避免数据库查询开销；
 *              课堂照片仍为动态内容，由 /api/training/landing 按 category_id 从
 *              training_gallery_images 表读取后挂到对应分类下。
 * @module data/training-gallery
 */

export interface StaticGalleryCategory {
  /** 与 training_gallery_images.category_id 对应，图片按此关联 */
  id: number;
  name_zh: string;
  name_en: string;
  description_zh: string;
  description_en: string;
}

export const TRAINING_GALLERY_CATEGORIES: StaticGalleryCategory[] = [
  {
    id: 1,
    name_zh: "课堂讲解",
    name_en: "Classroom Teaching",
    description_zh: "从概念到规则，建立完整认知框架",
    description_en: "From concepts to rules, building a complete cognitive framework",
  },
  {
    id: 2,
    name_zh: "案例拆标",
    name_en: "Case Bid Analysis",
    description_zh: "现场拆真实标讯，练习判断逻辑",
    description_en: "Analyzing real tenders on site to practice judgement logic",
  },
  {
    id: 3,
    name_zh: "学员交流",
    name_en: "Student Networking",
    description_zh: "跨行业链接资源，彼此启发合作",
    description_en: "Cross-industry resource networking and cooperation",
  },
  {
    id: 4,
    name_zh: "课后答疑",
    name_en: "After-class Q&A",
    description_zh: "围绕企业问题给到方向建议",
    description_en: "Directional advice around enterprise questions",
  },
];
