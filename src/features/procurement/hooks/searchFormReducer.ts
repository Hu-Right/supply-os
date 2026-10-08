/**
 * 搜索表单 reducer + 类型
 * Search form state reducer and types
 *
 * @module features/procurement/hooks/searchFormReducer
 */

// Task 8 高级关键词行：消费 Task 2 共享语法工具（composeQ/parseQ 的状态载体）
import { MAX_KEYWORD_ROWS, type TermRow, type TermMode } from "@/shared/utils/advanced-syntax";

// PERF 优化：关键词最大长度——与服务端 parseOptionalString(q, 200) 对齐，
// 前端截断避免发送超长字符串导致 Meilisearch/MySQL FULLTEXT 解析开销激增
const MAX_Q_LENGTH = 200;

// 关键词行单词条最大长度
const MAX_TERM_LENGTH = 50;

export interface SearchFormState {
  q: string;
  country: string;
  agency: string;
  from: string;
  to: string;
  window: string;
  noticeType: string;
  termRows: TermRow[];
  /** 关键词匹配模式：all=硬 AND（默认），any=OR（任一命中） */
  matchMode: "all" | "any";
}

export type SearchFormAction =
  | { type: "set_q" | "set_country" | "set_agency" | "set_from" | "set_to" | "set_window" | "set_notice_type"; payload: string }
  | { type: "set_match_mode"; payload: "all" | "any" }
  | { type: "sync"; payload: SearchFormState }
  | { type: "clear" }
  | { type: "add_row" }
  | { type: "remove_row"; payload: number }
  | { type: "replace_rows"; payload: TermRow[] }
  | { type: "set_row_term"; payload: { id: number; term: string } }
  | { type: "set_row_mode"; payload: { id: number; mode: TermMode } };

export function searchFormReducer(state: SearchFormState, action: SearchFormAction): SearchFormState {
  switch (action.type) {
    case "set_q": return { ...state, q: action.payload.slice(0, MAX_Q_LENGTH) };
    case "set_country": return { ...state, country: action.payload };
    case "set_agency": return { ...state, agency: action.payload };
    case "set_from": return { ...state, from: action.payload };
    case "set_to": return { ...state, to: action.payload };
    case "set_window": return { ...state, window: action.payload };
    case "set_notice_type": return { ...state, noticeType: action.payload };
    case "set_match_mode": return { ...state, matchMode: action.payload };
    case "sync": return { ...action.payload };
    case "clear": return { q: "", country: "", agency: "", from: "", to: "", window: "", noticeType: "", termRows: [], matchMode: "all" };
    case "add_row": {
      if (state.termRows.length >= MAX_KEYWORD_ROWS) return state;
      const nextId = state.termRows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      return { ...state, termRows: [...state.termRows, { id: nextId, term: "", mode: "include" }] };
    }
    case "remove_row":
      return { ...state, termRows: state.termRows.filter((r) => r.id !== action.payload) };
    case "replace_rows":
      return { ...state, termRows: action.payload.slice(0, MAX_KEYWORD_ROWS) };
    case "set_row_term":
      return {
        ...state,
        termRows: state.termRows.map((r) =>
          r.id === action.payload.id ? { ...r, term: action.payload.term.slice(0, MAX_TERM_LENGTH) } : r),
      };
    case "set_row_mode":
      return {
        ...state,
        termRows: state.termRows.map((r) =>
          r.id === action.payload.id ? { ...r, mode: action.payload.mode } : r),
      };
    default: return state;
  }
}
