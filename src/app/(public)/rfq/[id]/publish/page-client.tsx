"use client";

/**
 * 发布流程状态壳 —— 同一 URL 承载第 2~7 步
 *
 * @module app/(public)/rfq/[id]/publish/page-client
 * @description 2026-11 流程收口（用户口径：「除了主体认证，一直在采购需求发布页」）：
 *              原实现把第 4/5 步放在 `/settings/rfq/{id}/authorization-letter`、
 *              第 6/7 步扔回设置里的工作台，用户在向导里提交后"被送进设置中心"，像被弹回。
 *              现按 **项目状态** 而不是"用户点到第几页"渲染：
 *                draft / need_info → 可编辑表单（第 2/3 步）
 *                submitted / under_review → 摘要 + 内联授权书（第 4/5 步）+ 核验进度（第 6 步）
 *                published → 摘要 + 已发布面板（第 7 步，含广场入口与撤回）
 *                closed → 摘要 + 关闭原因 + 复制为新需求
 *              第 1 步（采购主体认证）仍外跳 /settings/buyer——那是资质配置，不是发布动作。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { FlowStepper } from "@/features/procurement-demand/FlowStepper";
import { ProcurementWizard } from "@/features/procurement-demand/ProcurementWizard";
import { ConfirmDialog } from "@/shared/ui";
import {
  copyProject,
  fetchProject,
  withdrawProject,
  type ProjectDetail,
} from "@/features/procurement-demand/api";
import { AuthorizationPanel } from "./AuthorizationPanel";
import { MatchesPanel } from "./MatchesPanel";
import { ProjectSummary } from "./ProjectSummary";
import { ReviewProgress } from "./ReviewProgress";

const STATUS_CLS: Record<string, string> = {
  draft: "bg-secondary-100 text-secondary-600",
  need_info: "bg-amber-100 text-amber-800",
  submitted: "bg-sky-100 text-sky-800",
  under_review: "bg-sky-100 text-sky-800",
  published: "bg-teal-100 text-teal-800",
  closed: "bg-secondary-200 text-secondary-600",
};

/** 七步流程里用户此刻处在第几步（由项目状态推导，不再写死） */
function currentStep(d: ProjectDetail): number {
  switch (d.status) {
    case "draft":
    case "need_info":
      return 2;
    case "submitted":
      // 授权书已核验 → 已过第 4/5 步，等核验（第 6 步）；否则停在签署（第 4 步）
      return d.authorization?.status === "verified" ? 6 : 4;
    case "under_review":
      return 6;
    case "published":
      return 7;
    case "closed":
      return 7;
    default:
      return 2;
  }
}

export default function PublishFlowPageClient({ projectId }: { projectId: number }) {
  const { t } = useLocale();
  const router = useRouter();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * 加载失败态。区分「目标已不存在」与「临时故障」：
   * 404 重试一万次也还是 404（通知深链指向已撤回/删除的需求就会撞到），
   * 这时只该给「回到我的采购项目」；网络抖动才给「重试」。
   */
  const [loadError, setLoadError] = useState<{ message: string; gone: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  /** 撤回二次确认（用统一 ConfirmDialog，不再 window.confirm） */
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setDetail(await fetchProject(projectId));
    } catch (err) {
      setLoadError({
        message: (err as Error).message || t("pc_load_failed"),
        // 按 status 判而不是 instanceof：ApiError 可能来自不同模块实例
        // （测试替身 / 多份 chunk），instanceof 会漏判成「临时故障」。
        gone: (err as { status?: number }).status === 404,
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const doWithdraw = async () => {
    setBusy(true);
    try {
      await withdrawProject(projectId);
      setConfirmWithdraw(false);
      await load();
    } catch (err) {
      setNotice((err as Error).message || t("pc_err_generic"));
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    setBusy(true);
    try {
      const created = await copyProject(projectId);
      router.push(`/rfq/${created.id}/publish`);
    } catch (err) {
      setNotice((err as Error).message || t("pc_err_generic"));
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-secondary-400">{t("pc_loading")}</div>;
  }

  if (loadError || !detail) {
    const gone = loadError?.gone === true;
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm font-semibold text-secondary-700">
          {gone ? t("pc_gone_title") : loadError?.message || t("pc_load_failed")}
        </p>
        {gone && <p className="mt-1.5 text-xs text-secondary-500">{t("pc_gone_desc")}</p>}
        <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {!gone && (
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              {t("pc_retry")}
            </button>
          )}
          <Link
            href="/settings/rfq"
            className={
              gone
                ? "rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                : "text-sm text-teal-700 underline"
            }
          >
            {t("pc_wb_title")}
          </Link>
        </div>
      </div>
    );
  }

  const editable = detail.status === "draft" || detail.status === "need_info";

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 bg-[#F5F8FB] px-4 py-6 sm:px-6 lg:px-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-5xl space-y-5">
        {/* 页头：编号 + 状态 + 七步进度（按状态推导） */}
        <div className="print:hidden rounded-2xl border border-secondary-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-secondary-400">{detail.reference} · v{detail.versionNo}</p>
              <h1 className="truncate text-base font-extrabold text-secondary-900">
                {detail.titleZh || detail.titleEn || t("pc_summary_title")}
              </h1>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLS[detail.status] ?? "bg-secondary-100"}`}>
              {t(`pc_wb_status_${detail.status}`)}
            </span>
          </div>
          <div className="mt-3">
            <FlowStepper current={currentStep(detail)} compact />
          </div>
          {notice && <p className="mt-2 text-xs text-red-600">{notice}</p>}
        </div>

        {/* 第 2/3 步：可编辑表单（同一组件，提交后由本壳切换到只读视图） */}
        {editable && (
          <div className="print:hidden">
            <h2 className="mb-3 text-lg font-extrabold text-secondary-900">{t("pc_wizard_title")}</h2>
            <ProcurementWizard editId={projectId} onSubmitted={() => void load()} />
          </div>
        )}

        {/* 第 4/5 步：已提交但授权未完成 → 内联签署；授权已核验 → 第 6 步核验进度 */}
        {(detail.status === "submitted" || detail.status === "under_review") && (
          <div className="space-y-5">
            <div className="print:hidden">
              <ProjectSummary detail={detail} />
            </div>
            {detail.authorization?.status === "verified" ? (
              <div className="print:hidden">
                <ReviewProgress detail={detail} onStatusChange={() => void load()} />
              </div>
            ) : (
              <AuthorizationPanel projectId={projectId} detail={detail} onSigned={() => void load()} />
            )}
          </div>
        )}

        {/* 第 7 步：已发布 */}
        {detail.status === "published" && (
          <div className="print:hidden space-y-5">
            <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
              <h2 className="text-base font-extrabold text-teal-900">{t("pc_published_title")}</h2>
              <p className="mt-1 text-sm text-teal-800">{t("pc_published_hint")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/rfq" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">
                  {t("pc_view_plaza")}
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onCopy()}
                  className="rounded-lg border border-teal-300 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
                >
                  {t("pc_copy")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmWithdraw(true)}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {t("pc_wb_withdraw")}
                </button>
              </div>
            </section>
            <ProjectSummary detail={detail} />
            {/* 第 7 步产出：匹配名单（原 /settings/rfq/[id]/matches 独立页，现内联） */}
            <MatchesPanel projectId={projectId} />
          </div>
        )}

        {/* 已关闭 */}
        {detail.status === "closed" && (
          <div className="print:hidden space-y-5">
            <section className="rounded-2xl border border-secondary-200 bg-white p-5">
              <h2 className="text-base font-extrabold text-secondary-900">{t("pc_closed_title")}</h2>
              <p className="mt-1 text-sm text-secondary-600">
                {detail.closeReason ? t(`pc_close_reason_${detail.closeReason}`) : ""}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onCopy()}
                className="mt-3 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {t("pc_copy")}
              </button>
            </section>
            <ProjectSummary detail={detail} />
          </div>
        )}

        {/* 已提交待核验时也允许撤回（授权未签署时） */}
        {(detail.status === "submitted" || detail.status === "under_review") && (
          <div className="print:hidden">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmWithdraw(true)}
              className="text-xs text-secondary-500 underline hover:text-red-600 disabled:opacity-50"
            >
              {t("pc_wb_withdraw")}
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmWithdraw}
        onClose={() => setConfirmWithdraw(false)}
        onConfirm={() => void doWithdraw()}
        title={t("pc_wb_withdraw")}
        description={t("pc_wb_withdraw_confirm")}
        confirmLabel={t("pc_wb_withdraw")}
        variant="danger"
        loading={busy}
      />
    </div>
  );
}
