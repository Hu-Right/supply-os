/**
 * 研修班学员反馈静态数据
 * Training Testimonials Static Data
 *
 * @description 学员反馈内容极少变动，直接前端写死以避免数据库查询开销。
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
    quote_zh: "以前只知道外贸接单，第一次系统理解国际公共采购的规则，收获非常大。",
    quote_en: "For the first time I systematically understand the rules of international public procurement. A huge gain.",
    author_name: "外贸企业负责人",
    author_title: "Foreign trade enterprise owner",
  },
  {
    id: "t2",
    quote_zh: "课程最大的价值是把\u201c信息\u201d变成了\u201c判断方法\u201d，知道怎么筛订单了。",
    quote_en: "The biggest value is turning information into a judgement method; now I know how to screen orders.",
    author_name: "制造企业业务经理",
    author_title: "Manufacturing enterprise business manager",
  },
  {
    id: "t3",
    quote_zh: "老师讲得很接地气，不空泛，课后也知道下一步该怎么准备。",
    quote_en: "The teaching is practical and grounded; I know exactly how to prepare next after class.",
    author_name: "团队创业者",
    author_title: "Team entrepreneur",
  },
];
