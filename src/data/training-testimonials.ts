/**
 * 研修班学员反馈静态数据
 * Training Testimonials Static Data
 *
 * @description 学员反馈内容极少变动，直接前端写死以避免数据库查询开销。
 *              TODO: 填入实际学员反馈内容
 * @module data/training-testimonials
 */

export interface StaticTestimonial {
  id: string;
  quote_zh: string;
  quote_en: string;
  author_name: string;
  author_title: string;
}

export const TESTIMONIALS: StaticTestimonial[] = [
  {
    id: "t1",
    quote_zh: "（待补充 — 学员反馈内容 1）",
    quote_en: "(TODO — Testimonial quote 1)",
    author_name: "（待补充）",
    author_title: "（待补充）",
  },
  {
    id: "t2",
    quote_zh: "（待补充 — 学员反馈内容 2）",
    quote_en: "(TODO — Testimonial quote 2)",
    author_name: "（待补充）",
    author_title: "（待补充）",
  },
  {
    id: "t3",
    quote_zh: "（待补充 — 学员反馈内容 3）",
    quote_en: "(TODO — Testimonial quote 3)",
    author_name: "（待补充）",
    author_title: "（待补充）",
  },
];
