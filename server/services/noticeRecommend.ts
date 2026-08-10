/**
 * 公采推荐服务
 * 已拆分至 recommend/ 子目录，本文件为向后兼容的 barrel re-export。
 * @see recommend/index.ts
 */
export { recommendNotices } from "./recommend/index";
export type { NoticeRecommendResult } from "./recommend/index";
