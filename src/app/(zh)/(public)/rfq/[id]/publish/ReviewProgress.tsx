"use client";

/**
 * 第 6 步：云境核验进度（内联在发布页）
 *
 * @module app/(public)/rfq/[id]/publish/ReviewProgress
 * @description 审计发现第 6 步是整条流程唯一"没有出口"的盲区：授权页与工作台都只在挂载时
 *              读一次，用户签完字后只看到一个永远不变的「待核验」徽章，不知道是在排队、
 *              卡住还是回调失败。这里补三件事：① 每 25 秒静默刷新（仅页面可见时）；
 *              ② 显示「已等待 N 小时/天」；③ 超过 2 天给出联系平台的可行动提示。
 */
import { useEffect, useState } from "react";
import { useLocale } from "@/core/i18n";
import { fetchProject, type ProjectDetail } from "@/features/procurement-demand/api";

const POLL_MS = 25_000;
/** 超过该阈值提示用户联系平台（与人工核验 SLA「1 个工作日」留出缓冲） */
const OVERTIME_HOURS = 48;

export function ReviewProgress({
  detail,
  onStatusChange,
}: {
  detail: ProjectDetail;
  onStatusChange?: () => void;
}) {
  const { t } = useLocale();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // 进度计时：每 60s 走动一次（显示"已等待 N 小时"需要它自己变）
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(timer);
  }, []);

  // 状态轮询：只在 submitted / under_review 期间跑；页面不可见时跳过请求
  useEffect(() => {
    if (detail.status !== "submitted" && detail.status !== "under_review") return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const fresh = await fetchProject(detail.id);
          if (!cancelled && fresh.status !== detail.status) onStatusChange?.();
        } catch {
          /* 轮询失败静默：手动刷新/下一次轮询兜底 */
        }
      })();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [detail.id, detail.status, onStatusChange]);

  const submittedAt = detail.submittedAt;
  const waitedSec = submittedAt ? Math.max(0, now - submittedAt) : 0;
  const waitedHours = Math.floor(waitedSec / 3600);
  const waitedDays = Math.floor(waitedSec / 86400);
  const overdue = waitedHours >= OVERTIME_HOURS;

  const latestNote = detail.reviews.find((r) => r.stage === "requirement" && r.note)?.note ?? "";

  return (
    <section className="rounded-2xl border border-secondary-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-extrabold text-secondary-900">{t("pc_review_title")}</h3>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          {t(`pc_wb_status_${detail.status}`)}
        </span>
      </div>

      <p className="mt-2 text-sm text-secondary-600">{t("pc_review_waiting")}</p>

      {submittedAt != null && (
        <p className="mt-1 text-xs text-secondary-500">
          {waitedDays >= 1 ? t("pc_review_elapsed_days", { days: waitedDays }) : t("pc_review_elapsed", { hours: waitedHours })}
        </p>
      )}

      {overdue && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("pc_review_overtime")}</p>}

      {latestNote && (
        <p className="mt-3 rounded-lg bg-secondary-50 px-3 py-2 text-xs text-secondary-600">
          {t("pc_review_notes")}：{latestNote}
        </p>
      )}

      <p className="mt-3 text-[11px] text-secondary-400">{t("pc_review_autorefresh")}</p>
    </section>
  );
}
