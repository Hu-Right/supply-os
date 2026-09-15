/**
 * 表单草稿持久化 Hook
 * Form Draft Persistence Hook
 *
 * @module shared/hooks/usePersistedFormState
 * @description 将表单状态同步到 localStorage，弹窗意外关闭后重新打开可自动恢复草稿。
 *              适用于注册、展厅申请、供应商入驻等长表单场景。
 *              提交成功后调用 clear() 清除草稿。
 */
import { useState, useCallback, useEffect, useRef } from "react";

/**
 * 带草稿持久化的表单状态
 * @param key - localStorage 存储键名（需全局唯一，如 "draft:auth_register"）
 * @param initialValue - 表单初始值
 * @param options.excludeKeys - 不持久化的字段（如密码）
 * @param options.debounceMs - 写入 localStorage 的防抖间隔（默认 300ms）
 */
export function usePersistedFormState<T extends object>(
  key: string,
  initialValue: T,
  options: { excludeKeys?: (keyof T)[]; debounceMs?: number } = {},
) {
  const { excludeKeys = [], debounceMs = 300 } = options;

  // 从 localStorage 恢复草稿，无草稿则用初始值
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<T>;
        return { ...initialValue, ...parsed };
      }
    } catch {
      // localStorage 读取失败（隐私模式/存储满），静默降级
    }
    return initialValue;
  });

  // 防抖写入 localStorage
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const persist = useCallback(
    (value: T) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          // 排除敏感字段后写入
          const toSave = { ...value };
          for (const k of excludeKeys) {
            delete toSave[k];
          }
          // 如果所有字段都被排除或值为空，不写入
          const hasContent = Object.values(toSave).some((v) => {
            if (typeof v === "string") return v.trim().length > 0;
            if (Array.isArray(v)) return v.length > 0;
            return v !== null && v !== undefined;
          });
          if (hasContent) {
            window.localStorage.setItem(key, JSON.stringify(toSave));
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

  // state 变化时持久化
  useEffect(() => {
    persist(state);
    return () => clearTimeout(timerRef.current);
  }, [state, persist]);

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
