/**
 * 研修班常见问题静态数据
 * Training FAQ Static Data
 *
 * @description 常见问题内容极少变动，直接前端写死以避免数据库查询开销。
 * @module data/training-faqs
 */

export interface StaticFaq {
  id: string;
  question_zh: string;
  question_en: string;
  answer_zh: string;
  answer_en: string;
}

export const TRAINING_FAQS: StaticFaq[] = [
  {
    id: "faq-1",
    question_zh: "没有做过国际公共采购，能学吗？",
    question_en: "Can I learn without prior experience in international public procurement?",
    answer_zh: "可以，课程兼顾入门认知与实操框架，适合0基础或初步了解的学员。",
    answer_en: "Yes. The course covers both introductory cognition and a practical framework, suitable for beginners.",
  },
  {
    id: "faq-2",
    question_zh: "课程更适合个人还是企业？",
    question_en: "Is the course more suitable for individuals or enterprises?",
    answer_zh: "两者都适合，但企业老板带团队一起学习，落地效率通常更高。",
    answer_en: "Both. However, when the boss brings the team, implementation is usually more efficient.",
  },
  {
    id: "faq-3",
    question_zh: "课程结束后有没有后续服务？",
    question_en: "Is there any follow-up service after the course?",
    answer_zh: "有，可根据企业需求衔接会员、咨询、投标陪跑与订单支持。",
    answer_en: "Yes. Membership, consulting, bid accompaniment and order support can be arranged as needed.",
  },
  {
    id: "faq-4",
    question_zh: "课程只讲联合国采购吗？",
    question_en: "Does the course only cover UN procurement?",
    answer_zh: "不仅讲联合国采购，也会帮助理解国际组织与海外政府采购的整体逻辑。",
    answer_en: "No. It also covers the overall logic of international organizations and overseas government procurement.",
  },
  {
    id: "faq-5",
    question_zh: "如何报名和咨询？",
    question_en: "How to enroll and consult?",
    answer_zh: "可在线提交报名信息，或联系顾问获取课程大纲与开课安排。",
    answer_en: "Submit the enrollment form online, or contact a consultant for the syllabus and schedule.",
  },
];
