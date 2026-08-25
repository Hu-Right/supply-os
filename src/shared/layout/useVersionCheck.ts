/**
 * 前端版本检测 Hook（静默自动刷新）
 * Client-side Version Check Hook (Silent Auto-Refresh)
 *
 * @module shared/layout/useVersionCheck
 * @description 定时轮询 /api/system/version 接口，检测到新版本部署后立即自动刷新页面。
 *              三重检测策略：
 *              1) 页面加载后 10s 首次检测
 *              2) 每 2 分钟定时轮询
 *              3) 用户切回标签页时立即检测（Page Visibility API）
 */
import { useEffect, useRef } from "react";
import { api } from "@/core/http";

/** 轮询间隔（毫秒） */
const CHECK_INTERVAL_MS = 2 * 60 * 1000;

/** 首次检测延迟（毫秒） */
const INITIAL_DELAY_MS = 10 * 1000;

export function useVersionCheck() {
  const serverVersionRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  /** 请求版本接口并比对，检测到新版本时自动刷新 */
  const checkVersion = () => {
    api<{ version?: string }>("/api/system/version", { cache: "no-store" })
      .then((data) => {
        const version = data.version || "";
        if (!version) return;

        if (!serverVersionRef.current) {
          // 首次检测：记录版本号作为基准
          serverVersionRef.current = version;
          return;
        }

        if (version !== serverVersionRef.current) {
          // 新版本就绪，直接刷新，无需任何提示
          window.location.reload();
        }
      })
      .catch(() => {
        // 网络异常静默忽略，下次轮询再试
      });
  };

  useEffect(() => {
    // 首次延迟检测
    const delayTimer = setTimeout(() => {
      checkVersion();
      timerRef.current = setInterval(checkVersion, CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);

    // Page Visibility API：用户切回标签页时立即检测版本
    // 场景：用户早上打开页面切走做其他事，中午回来时已有新版本 → 立即刷新
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkVersion();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(delayTimer);
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
