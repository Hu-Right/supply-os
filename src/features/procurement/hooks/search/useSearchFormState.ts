/**
 * 搜索表单草稿状态 Hook
 * Search Form Draft State Hook
 *
 * @module features/procurement/hooks/search/useSearchFormState
 */
import { useCallback, useReducer, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { searchFormReducer, type SearchFormState } from "../searchFormReducer";

export interface SearchFormInputs {
  qInput: string;
  countryInput: string;
  agencyInput: string;
  fromInput: string;
  toInput: string;
  windowInput: string;
  noticeTypeInput: string;
}

export interface SearchFormSetters {
  setQInput: (value: string) => void;
  setCountryInput: (value: string) => void;
  setAgencyInput: (value: string) => void;
  setFromInput: (value: string) => void;
  setToInput: (value: string) => void;
  setWindowInput: (value: string) => void;
  setNoticeTypeInput: (value: string) => void;
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
  }) => void;
  clear: () => void;
} {
  const searchParams = useSearchParams();
  const [formState, dispatchForm] = useReducer(searchFormReducer, {
    q: searchParams.get("q") || "",
    country: searchParams.get("country") || "",
    agency: searchParams.get("agency") || "",
    from: searchParams.get("deadline_from") || "",
    to: searchParams.get("deadline_to") || "",
    window: searchParams.get("deadline_within_days") || "",
    noticeType: searchParams.get("notice_type") || "",
  });

  const setQInput = useCallback((v: string) => dispatchForm({ type: "set_q", payload: v }), []);
  const setCountryInput = useCallback((v: string) => dispatchForm({ type: "set_country", payload: v }), []);
  const setAgencyInput = useCallback((v: string) => dispatchForm({ type: "set_agency", payload: v }), []);
  const setFromInput = useCallback((v: string) => dispatchForm({ type: "set_from", payload: v }), []);
  const setToInput = useCallback((v: string) => dispatchForm({ type: "set_to", payload: v }), []);
  const setWindowInput = useCallback((v: string) => dispatchForm({ type: "set_window", payload: v }), []);
  const setNoticeTypeInput = useCallback((v: string) => dispatchForm({ type: "set_notice_type", payload: v }), []);

  const syncFromUrl = (params: {
    q: string;
    country: string;
    agency: string;
    from: string;
    to: string;
    window: string;
    noticeType: string;
  }) => {
    dispatchForm({ type: "sync", payload: params });
  };

  const clear = () => {
    dispatchForm({ type: "clear" });
  };

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
    },
    setters: {
      setQInput,
      setCountryInput,
      setAgencyInput,
      setFromInput,
      setToInput,
      setWindowInput,
      setNoticeTypeInput,
    },
    syncFromUrl,
    clear,
  };
}
