/**
 * 表单草稿持久化 Hook
 * Form Draft Persistence Hook
 *
 * @module shared/hooks/usePersistedFormState
 * @description 将表单状态同步到 localStorage，弹窗意外关闭后重新打开可自动恢复草稿。
 *              适用于注册、展厅申请、供应商入驻等长表单场景。
 *              提交成功后调用 clear() 清除草稿。
 *              支持 TTL 过期自动清理，避免废弃草稿长期残留。
 */
import { useState, useCallback, useEffect, useRef } from "react";

/** 草稿存储信封：附带写入时间戳，用于 TTL 过期判断 */
interface DraftEnvelope<T> {
  _ts: number;
  data: Partial<T>;
}

/**
 * 带草稿持久化的表单状态
 * @param key - localStorage 存储键名（需全局唯一，如 "draft:auth_register"）
 * @param initialValue - 表单初始值
 * @param options.excludeKeys - 不持久化的字段（如密码）
 * @param options.debounceMs - 写入 localStorage 的防抖间隔（默认 100ms）
 * @param options.ttlMs - 草稿过期时间（毫秒），超过后自动删除并不再恢复
 */
export function usePersistedFormState<T extends object>(
  key: string,
  initialValue: T,
  options: { excludeKeys?: (keyof T)[]; debounceMs?: number; ttlMs?: number } = {},
) {
  const { excludeKeys = [], debounceMs = 100, ttlMs } = options;

  // 从 localStorage 恢复草稿，无草稿 / 已过期则用初始值
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const envelope = JSON.parse(saved) as DraftEnvelope<T>;
        // TTL 过期检查：草稿超龄则自动清除，不再恢复
        if (ttlMs && envelope._ts && Date.now() - envelope._ts > ttlMs) {
          window.localStorage.removeItem(key);
          return initialValue;
        }
        if (envelope.data) {
          return { ...initialValue, ...envelope.data };
        }
        // 兼容旧格式（无信封包裹的裸对象）
        return { ...initialValue, ...(envelope as unknown as Partial<T>) };
      }
    } catch {
      // localStorage 读取失败（隐私模式/存储满），静默降级
    }
    return initialValue;
  });

  // 用 ref 追踪最新 state，确保 cleanup 刷写时能拿到最新值
  const stateRef = useRef(state);
  stateRef.current = state;

  // 防抖写入 localStorage
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 同步刷写（组件卸载时调用，确保数据不丢失）
  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    try {
      const toSave = { ...stateRef.current };
      for (const k of excludeKeys) {
        delete toSave[k];
      }
      const hasContent = Object.values(toSave).some((v) => {
        if (typeof v === "string") return v.trim().length > 0;
        if (Array.isArray(v)) return v.length > 0;
        return v !== null && v !== undefined;
      });
      if (hasContent) {
        const envelope: DraftEnvelope<T> = { _ts: Date.now(), data: toSave };
        window.localStorage.setItem(key, JSON.stringify(envelope));
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // 写入失败静默降级
    }
  }, [key, excludeKeys]);

  // 防抖写入（正常输入时使用）
  const persist = useCallback(
    (value: T) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          const toSave = { ...value };
          for (const k of excludeKeys) {
            delete toSave[k];
          }
          const hasContent = Object.values(toSave).some((v) => {
            if (typeof v === "string") return v.trim().length > 0;
            if (Array.isArray(v)) return v.length > 0;
            return v !== null && v !== undefined;
          });
          if (hasContent) {
            const envelope: DraftEnvelope<T> = { _ts: Date.now(), data: toSave };
            window.localStorage.setItem(key, JSON.stringify(envelope));
          } else {
            window.localStorage.removeItem(key);
          }
        } catch {
          // 写入失败静默降级
        }
      }, debounceMs);
    },
    [key, excludeKeys, debounceMs],
  );

  // state 变化时防抖持久化；组件卸载时立即刷写，防止数据丢失
  useEffect(() => {
    persist(state);
    return () => flush();
  }, [state, persist, flush]);

  // 清除草稿（提交成功后调用）
  const clear = useCallback(() => {
    clearTimeout(timerRef.current);
    setState(initialValue);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 静默降级
    }
  }, [key, initialValue]);

  return [state, setState, clear] as const;
}
