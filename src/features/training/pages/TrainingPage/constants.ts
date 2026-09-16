/**
 * 研修班常量
 * @module features/training/pages/TrainingPage/constants
 */
import {
  BookOpen, Target, Layers, Shield, FileCheck, AlertTriangle, Handshake, Truck,
} from "lucide-react";

/* ── 课程模块 8 项 ── */
export const COURSE_MODULES = [
  { num: 1, icon: BookOpen, title: "平台规则", desc: "联合国及主要国际公采平台规则解读" },
  { num: 2, icon: Target, title: "商机筛选", desc: "需求分析与商机识别方法" },
  { num: 3, icon: Layers, title: "UNSPSC", desc: "分类体系与编码实操应用" },
  { num: 4, icon: Shield, title: "供应商资质", desc: "注册路径与资质文件准备" },
  { num: 5, icon: FileCheck, title: "投标文件", desc: "投标文件结构与撰写要点" },
  { num: 6, icon: AlertTriangle, title: "风险控制", desc: "合规要求与风险识别规避" },
  { num: 7, icon: Handshake, title: "商务谈判", desc: "谈判策略与价格条款处理" },
  { num: 8, icon: Truck, title: "中标后履约", desc: "合同执行、验收与持续合作管理" },
];

/* ── 讲师 4 位 ── */
export const INSTRUCTORS = [
  { title: "联合国采购顾问", exp: "10年+ 联合国采购项目经验，熟悉UN流程与规则" },
  { title: "国际公采实战导师", exp: "15年+ 国际公采投标实战经验，擅长策略与落地" },
  { title: "投标拆标导师", exp: "精通标书拆解与评分逻辑，助力提升中标率" },
  { title: "本地履约顾问", exp: "多国本地履约与合规经验，保障合同执行落地" },
];

/* ── 报名权益 ── */
export const ENROLLMENT_BENEFITS = [
  "课程资料：全套课件与学习手册",
  "模板清单：标书模板、清单与工具包",
  "课后答疑：60天内讲师答疑服务",
  "社群交流：学员社群，资源与经验分享",
  "报名后可预约顾问沟通：1对1需求诊断与方案建议",
];
