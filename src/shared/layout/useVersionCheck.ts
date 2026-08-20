/**
 * 前端版本检测 Hook（静默自动刷新）
 * Client-side Version Check Hook (Silent Auto-Refresh)
 *
 * @module shared/layout/useVersionCheck
 * @description 定时轮询 /api/system/version 接口，检测到新版本部署后立即自动刷新页面，
 *              无需用户任何操作，无弹窗提示。
 */
import { useEffect, useRef } from "react";
import { api } from "@/core/http";

/** 轮询间隔（毫秒），默认 3 分钟 */
const CHECK_INTERVAL_MS = 3 * 60 * 1000;

/** 首次检测延迟（毫秒） */
const INITIAL_DELAY_MS = 20 * 1000;

export function useVersionCheck() {
  const initialVersionRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // 页面加载时记录当前版本号（#10 收口：统一请求层，no-store 语义透传）
  useEffect(() => {
    api<{ version?: string }>("/api/system/version", { cache: "no-store" })
      .then((data) => {
        initialVersionRef.current = data.version || "";
      })
      .catch(() => {});
  }, []);

  // 定时轮询：检测到新版本 → 立即静默刷新
  useEffect(() => {
    const check = () => {
      api<{ version?: string }>("/api/system/version", { cache: "no-store" })
        .then((data) => {
          const serverVersion = data.version || "";
          if (
            initialVersionRef.current &&
            serverVersion &&
            serverVersion !== initialVersionRef.current
          ) {
            // 新版本就绪，直接刷新，无需任何提示
            window.location.reload();
          }
        })
        .catch(() => {});
    };

    const delayTimer = setTimeout(() => {
      check();
      timerRef.current = setInterval(check, CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);

    return () => {
      clearTimeout(delayTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);
}
