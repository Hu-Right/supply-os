/**
 * UNSPSC 领域类型
 * UNSPSC domain types
 *
 * @module core/unspsc/types
 */

/** 字典项（认证/类目下拉通用形状，原 features/training/api 收敛至此） */
export interface DictionaryItem {
  id: number;
  code?: string;
  title_zh?: string;
  title_en?: string;
  name?: string;
}

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
