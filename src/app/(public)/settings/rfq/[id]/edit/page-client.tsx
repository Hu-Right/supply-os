"use client";

/**
 * /settings/rfq/[id]/edit — 编辑需求（新发布域）
 * @module app/(public)/settings/rfq/[id]/edit/page-client
 * @description 编辑=同向导回填；重新提交即新版本（version_no+1），旧授权自动失效须重签
 *              （流程闭环：改稿 → 重提 → 重签授权 → 重新核验）。
 */
import { useParams } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { ProcurementWizard } from "@/features/procurement-demand/ProcurementWizard";

export default function PageClient() {
  const params = useParams<{ id: string }>();
  const { t } = useLocale();
  const id = params?.id ? Number(params.id) : null;
  if (!id || !Number.isFinite(id)) {
    return <div className="py-10 text-center text-sm text-secondary-500">{t("pc_err_invalid_id")}</div>;
  }
  return (
    <div className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <h1 className="mb-4 text-lg font-extrabold text-secondary-900">{t("pc_edit_title")}</h1>
      <ProcurementWizard editId={id} />
    </div>
  );
}
