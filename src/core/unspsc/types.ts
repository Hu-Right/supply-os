/**
 * UNSPSC 领域类型
 * UNSPSC domain types
 *
 * @module core/unspsc/types
 */

export interface UnspscOption {
  id: number;
  code: string;
  title_zh?: string;
  title_en?: string;
  /** 界面语言译文（fr/ru/es/ar 请求时后端 JOIN 缓存附带；缺译为 null） */
  title_i18n?: string | null;
  title?: string;
  name?: string;
}
