/**
 * 排队信息轮询 Hook（P1）
 *
 * @module features/crm/hooks/useQueueInfo
 * @description waiting 态下每 10 秒轮询排队位置/在线客服数/预计等待，
 *              会话进入 active 或关闭后自动停止并清零。
 */
import { useState, useEffect, useRef } from "react";
import { api } from "@/core/http";

export interface QueueInfo {
  /** 排队位置（1 = 下一个被接入）；0 表示不在排队中 */
  position: number;
  /** 在线客服数 */
  agentsOnline: number;
  /** 预计等待秒数（基于近期平均接入时长） */
  estimatedSeconds: number | null;
}

const POLL_INTERVAL_MS = 10_000;
/** 兜底预计等待：无历史数据时提示"约 5 分钟" */
const FALLBACK_ETA_SECONDS = 5 * 60;

export function useQueueInfo(sessionId: number | null, enabled: boolean): QueueInfo {
  const [info, setInfo] = useState<QueueInfo>({ position: 0, agentsOnline: 0, estimatedSeconds: null });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId || !enabled) {
      setInfo({ position: 0, agentsOnline: 0, estimatedSeconds: null });
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const data = await api<{
          position: number;
          agentsOnline: number;
          avgAcceptSeconds: number | null;
          status: string;
        }>(`/api/crm/chat/sessions/queue?sessionId=${sessionId}`);
        if (cancelled) return;
        if (data.status !== "waiting") {
          // 已被接入/关闭：清零，父级状态流转由 SSE 负责
          setInfo({ position: 0, agentsOnline: 0, estimatedSeconds: null });
          return;
        }
        setInfo({
          position: data.position,
          agentsOnline: data.agentsOnline,
          estimatedSeconds:
            data.avgAcceptSeconds != null
              ? Math.max(30, Math.round(data.avgAcceptSeconds * data.position))
              : Math.round(FALLBACK_ETA_SECONDS * Math.max(1, data.position)),
        });
      } catch {
        // 轮询失败静默保留上一次数据
      }
    }

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionId, enabled]);

  return info;
}
