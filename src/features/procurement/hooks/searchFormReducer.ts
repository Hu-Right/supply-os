/**
 * 搜索表单 reducer + 类型
 * Search form state reducer and types
 *
 * @module features/procurement/hooks/searchFormReducer
 */

export const PAGE_SIZE = 9;

export interface SearchFormState {
  q: string;
  country: string;
  agency: string;
  from: string;
  to: string;
  window: string;
  type: string;
}

export type SearchFormAction =
  | { type: "set_q" | "set_country" | "set_agency" | "set_from" | "set_to" | "set_window" | "set_type"; payload: string }
  | { type: "sync"; payload: SearchFormState }
  | { type: "clear" };

export function searchFormReducer(state: SearchFormState, action: SearchFormAction): SearchFormState {
  switch (action.type) {
    case "set_q": return { ...state, q: action.payload };
    case "set_country": return { ...state, country: action.payload };
    case "set_agency": return { ...state, agency: action.payload };
    case "set_from": return { ...state, from: action.payload };
    case "set_to": return { ...state, to: action.payload };
    case "set_window": return { ...state, window: action.payload };
    case "set_type": return { ...state, type: action.payload };
    case "sync": return { ...action.payload };
    case "clear": return { q: "", country: "", agency: "", from: "", to: "", window: "", type: "" };
    default: return state;
  }
}
