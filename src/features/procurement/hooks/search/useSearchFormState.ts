/**
 * 搜索表单草稿状态 Hook
 * Search Form Draft State Hook
 *
 * @module features/procurement/hooks/search/useSearchFormState
 */
import { useCallback, useReducer } from "react";
import { useSearchParams } from "next/navigation";
import { searchFormReducer, type SearchFormState } from "../searchFormReducer";
import { parseQ, type TermRow, type TermMode } from "@/shared/utils/advanced-syntax";

export interface SearchFormInputs {
  qInput: string;
  countryInput: string;
  agencyInput: string;
  fromInput: string;
  toInput: string;
  windowInput: string;
  noticeTypeInput: string;
  termRows: TermRow[];
  matchMode: "all" | "any";
}

export interface SearchFormSetters {
  setQInput: (value: string) => void;
  setCountryInput: (value: string) => void;
  setAgencyInput: (value: string) => void;
  setFromInput: (value: string) => void;
  setToInput: (value: string) => void;
  setWindowInput: (value: string) => void;
  setNoticeTypeInput: (value: string) => void;
  addRow: () => void;
  removeRow: (id: number) => void;
  replaceRows: (rows: TermRow[]) => void;
  setRowTerm: (id: number, term: string) => void;
  setRowMode: (id: number, mode: TermMode) => void;
  setMatchMode: (mode: "all" | "any") => void;
}

export function useSearchFormState(): {
  formState: SearchFormState;
  inputs: SearchFormInputs;
  setters: SearchFormSetters;
  syncFromUrl: (params: {
    q: string;
    country: string;
    agency: string;
    from: string;
    to: string;
    window: string;
    noticeType: string;
    matchMode: "all" | "any";
  }) => void;
  clear: () => void;
} {
  const searchParams = useSearchParams();
  // URL q 含高级语法（-排除词 / "短语"）时按 Task 2 共享语法回填为普通词 + 关键词行
  const [formState, dispatchForm] = useReducer(searchFormReducer, (() => {
    const { plain, rows } = parseQ(searchParams.get("q") || "");
    return {
      q: plain,
      country: searchParams.get("country") || "",
      agency: searchParams.get("agency") || "",
      from: searchParams.get("deadline_from") || "",
      to: searchParams.get("deadline_to") || "",
      window: searchParams.get("deadline_within_days") || "",
      noticeType: searchParams.get("notice_type") || "",
      termRows: rows,
      matchMode: (searchParams.get("match_mode") === "any" ? "any" : "all") as "all" | "any",
    };
  })());

  const setQInput = useCallback((v: string) => dispatchForm({ type: "set_q", payload: v }), []);
  const setCountryInput = useCallback((v: string) => dispatchForm({ type: "set_country", payload: v }), []);
  const setAgencyInput = useCallback((v: string) => dispatchForm({ type: "set_agency", payload: v }), []);
  const setFromInput = useCallback((v: string) => dispatchForm({ type: "set_from", payload: v }), []);
  const setToInput = useCallback((v: string) => dispatchForm({ type: "set_to", payload: v }), []);
  const setWindowInput = useCallback((v: string) => dispatchForm({ type: "set_window", payload: v }), []);
  const setNoticeTypeInput = useCallback((v: string) => dispatchForm({ type: "set_notice_type", payload: v }), []);
  const addRow = useCallback(() => dispatchForm({ type: "add_row" }), []);
  const removeRow = useCallback((id: number) => dispatchForm({ type: "remove_row", payload: id }), []);
  const replaceRows = useCallback((rows: TermRow[]) => dispatchForm({ type: "replace_rows", payload: rows }), []);
  const setRowTerm = useCallback((id: number, term: string) => dispatchForm({ type: "set_row_term", payload: { id, term } }), []);
  const setRowMode = useCallback((id: number, mode: TermMode) => dispatchForm({ type: "set_row_mode", payload: { id, mode } }), []);
  const setMatchMode = useCallback((mode: "all" | "any") => dispatchForm({ type: "set_match_mode", payload: mode }), []);

  const syncFromUrl = useCallback((params: {
    q: string;
    country: string;
    agency: string;
    from: string;
    to: string;
    window: string;
    noticeType: string;
    matchMode: "all" | "any";
  }) => {
    // URL q 先过高级语法解析再入草稿：排除词/短语落 termRows，普通词落 q
    const parsed = parseQ(params.q);
    dispatchForm({ type: "sync", payload: { ...params, q: parsed.plain, termRows: parsed.rows } });
  }, []);

  const clear = useCallback(() => {
    dispatchForm({ type: "clear" });
  }, []);

  return {
    formState,
    inputs: {
      qInput: formState.q,
      countryInput: formState.country,
      agencyInput: formState.agency,
      fromInput: formState.from,
      toInput: formState.to,
      windowInput: formState.window,
      noticeTypeInput: formState.noticeType,
      termRows: formState.termRows,
      matchMode: formState.matchMode,
    },
    setters: {
      setQInput,
      setCountryInput,
      setAgencyInput,
      setFromInput,
      setToInput,
      setWindowInput,
      setNoticeTypeInput,
      addRow,
      removeRow,
      replaceRows,
      setRowTerm,
      setRowMode,
      setMatchMode,
    },
    syncFromUrl,
    clear,
  };
}
