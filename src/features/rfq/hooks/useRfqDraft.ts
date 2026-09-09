"use client";

/**
 * RFQ 草稿持久化 Hook
 * RFQ Draft Persistence Hook
 *
 * @module features/rfq/hooks/useRfqDraft
 * @description localStorage 草稿：进入页面恢复、填写过程即时保存、成功发布后清除。
 *              服务端草稿同步（30s 节流）为 P1 项，接口就绪后在此扩展。
 */
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_RFQ_FORM, RFQ_DRAFT_KEY } from "../constants";
import type { RfqFormState } from "../types";

interface DraftPayload {
  data: Partial<RfqFormState>;
  savedAt: number;
}

export interface RfqDraftApi {
  /** 草稿读取完成（避免 SSR/首屏恢复时序问题） */
  ready: boolean;
  /** 已保存的草稿数据（无草稿为 null） */
  data: Partial<RfqFormState> | null;
  /** 保存时间戳（无草稿为 null） */
  savedAt: number | null;
  save: (data: RfqFormState) => void;
  clear: () => void;
}

export function useRfqDraft(): RfqDraftApi {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Partial<RfqFormState> | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 进入页面恢复草稿（P2 容错：隐私模式 localStorage 可能抛异常）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RFQ_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DraftPayload;
        if (parsed?.data) {
          setData(parsed.data);
          setSavedAt(parsed.savedAt ?? null);
        }
      }
    } catch {
      console.warn("[rfq] 草稿读取失败，已忽略");
    }
    setReady(true);
  }, []);

  const save = useCallback((next: RfqFormState) => {
    const now = Date.now();
    setData(next);
    setSavedAt(now);
    try {
      window.localStorage.setItem(RFQ_DRAFT_KEY, JSON.stringify({ data: next, savedAt: now } satisfies DraftPayload));
    } catch {
      console.warn("[rfq] 草稿写入失败（存储空间不足或隐私模式）");
    }
  }, []);

  const clear = useCallback(() => {
    setData(null);
    setSavedAt(null);
    try {
      window.localStorage.removeItem(RFQ_DRAFT_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { ready, data, savedAt, save, clear };
}

/** 草稿是否包含有意义的填写进度（空表单不存草稿） */
export function hasDraftProgress(form: RfqFormState): boolean {
  return Boolean(
    form.title.trim() ||
    form.description.trim() ||
    form.quantity.trim() ||
    form.specs.some((s) => s.name.trim() || s.value.trim()) ||
    form.countries.length > 0 ||
    form.attachments.length > 0,
  );
}

/** 合并草稿与默认值（防止旧版本草稿缺字段） */
export function mergeDraftWithDefaults(draft: Partial<RfqFormState> | null): RfqFormState {
  return { ...DEFAULT_RFQ_FORM, ...draft };
}
