/**
 * 公告译文的读侧门控（2026-11-24）
 *
 * 口径（2026-11-24 用户拍板，方案 A+3）：
 *   · 译文（notice_translation）属付费权益：矩阵里免费/个人=0，企业基础及以上=1；
 *   · 没有权益的账号**看到的都是原文** —— 标题、正文一并回退，不允许出现
 *     「标题中文、正文原文」这种半翻译状态；
 *   · 有权益的账号按字段回退：中文列（title_cn / description_cn）优先，缺了回退原文，
 *     详情页再按需触发机翻补齐（/api/notices/:id/translation，命中后回写 title_cn）。
 *
 * 为什么放在路由出口而不是 view mapper：
 *   view.ts 的职责是「改名 + 契约白名单」，其模块注释明确写了「白名单只是兜底裁剪，
 *   不替代付费墙裁剪」。这里做成独立模块，**默认隐藏、显式放行**：路由必须拿权益
 *   判定结果来调用，新增返回公告列表的端点忘了接，结果是少给中文（方向安全），
 *   而不是把付费译文漏给所有人。
 *
 * 公开面例外：带 public 缓存的接口（首页卡片 home-columns）、ISR 页面（SEO 详情页/
 * 国别页）与分享卡（OG 图）无法按账号个性化，也不该把付费译文交给爬虫和未登录用户，
 * 因此这些位置一律原文，不做权益判定。
 */
import { NOTICE_TRANSLATION_BENEFIT } from "../benefit-matrix";

/** 视图里所有「译文派生列」（camelCase，= view.ts 契约字段）。无权益时整组剔除。 */
const TRANSLATION_VIEW_KEYS = [
  "titleCn",
  "descriptionCn",
  "titleI18n",
  "descriptionI18n",
  "titleEn",
  "descriptionEn",
] as const;

/** 权益仓储的最小接口（避免把 repo 类耦合进来，纯函数与单测都能用） */
export interface TranslationBenefitRepo {
  isEntitled(userId: number | null, benefitCode: string): Promise<boolean>;
}

/**
 * 剔除单条视图里的译文派生字段（原地修改并返回同一个对象）。
 * 调用方持有的通常是 toNoticeView/toNoticeListView 新建的对象，不会污染检索结果缓存。
 */
export function maskTranslationFields<T extends object>(item: T): T {
  const row = item as Record<string, unknown>;
  for (const key of TRANSLATION_VIEW_KEYS) {
    if (key in row) delete row[key];
  }
  return item;
}

/** 批量版本：列表端点（搜索/收藏/相似/首页列）出口统一调用 */
export function maskTranslationFieldList<T extends object>(items: readonly T[]): T[] {
  return items.map((item) => (item && typeof item === "object" ? maskTranslationFields(item) : item));
}

/**
 * 当前账号能否读译文。匿名（userId 为空）恒 false；未订阅按 free 档基线判定
 * （free 档 notice_translation=0），与矩阵口径一致。
 */
export async function canReadNoticeTranslation(
  repo: TranslationBenefitRepo,
  userId: number | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  return repo.isEntitled(userId, NOTICE_TRANSLATION_BENEFIT);
}
