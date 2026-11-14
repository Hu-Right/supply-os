"use client";

/**
 * /settings/rfq — 采购方工作台（新发布域）
 * @module app/(public)/settings/rfq/page-client
 * @description 我的项目列表：编号/版本/状态/授权态/核验态 + 操作（编辑/授权书/匹配名单/撤回）。
 *              七步流程的位置感：每行展示项目卡在哪一步。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/core/i18n";
import { api } from "@/core/http";
import { copyProject, fetchMyProjects, withdrawProject, type ProjectSummary } from "@/features/procurement-demand/api";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-secondary-100 text-secondary-600",
  submitted: "bg-amber-100 text-amber-800",
  need_info: "bg-red-100 text-red-700",
  under_review: "bg-blue-100 text-blue-700",
  published: "bg-teal-100 text-teal-800",
  closed: "bg-secondary-100 text-secondary-400",
};

interface AuthStatus {
  letterHash: string;
  versionNo: number;
  status: "none" | "pending" | "verified" | "rejected";
}

function PageClientInner() {
  const { t } = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<ProjectSummary[]>([]);
  const [authMap, setAuthMap] = useState<Record<number, AuthStatus | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchMyProjects();
      setItems(r.items);
      setError("");
      // 并行拉每行的授权状态（列表页最多 20 行，量级可控）
      const entries = await Promise.all(
        r.items.map(async (p) => {
          try {
            const a = await api<AuthStatus>(`/api/procurement/projects/${p.id}/authorization`);
            return [p.id, a] as const;
          } catch {
            return [p.id, null] as const;
          }
        }),
      );
      setAuthMap(Object.fromEntries(entries));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onWithdraw = async (id: number) => {
    if (!window.confirm(t("pc_wb_withdraw_confirm"))) return;
    try {
      await withdrawProject(id);
      await load();
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  const onCopy = async (id: number) => {
    try {
      const r = await copyProject(id);
      router.push(`/settings/rfq/${r.id}/edit`);
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  const authBadge = (p: ProjectSummary) => {
    if (p.status === "draft") return <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-xs text-secondary-500">{t("pc_wb_auth_na")}</span>;
    const a = authMap[p.id];
    const label =
      a?.status === "verified" ? t("pc_wb_auth_verified")
      : a?.status === "pending" ? t("pc_wb_auth_pending")
      : a?.status === "rejected" ? t("pc_wb_auth_rejected")
      : t("pc_wb_auth_unsigned");
    const cls =
      a?.status === "verified" ? "bg-teal-100 text-teal-800"
      : a?.status === "pending" ? "bg-amber-100 text-amber-800"
      : a?.status === "rejected" ? "bg-red-100 text-red-700"
      : "bg-secondary-100 text-secondary-500";
    return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
  };

  /** 需求/资金核验态（F05 三态口径：主体已核验 / 需求待核验 / 资金未核验） */
  const verifyBadges = (p: ProjectSummary) => {
    if (p.status === "draft") return null;
    const rv = p.requirementVerify || "pending";
    const fv = p.fundVerify || "unverified";
    const rvCls =
      rv === "pass" ? "bg-teal-100 text-teal-800"
      : rv === "risk" || rv === "reject" ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-800";
    const fvCls = fv === "verified" ? "bg-teal-100 text-teal-800" : "bg-secondary-100 text-secondary-500";
    return (
      <>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rvCls}`}>{t("pc_wb_rv")}：{t(`pc_verify_${rv}`)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${fvCls}`}>{t("pc_wb_fv")}：{t(fv === "verified" ? "pc_fv_verified" : "pc_fv_unverified")}</span>
      </>
    );
  };

  return (
    <div className="rounded-2xl border border-secondary-200 bg-white p-6 shadow-xs">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-extrabold text-secondary-900">{t("pc_wb_title")}</h1>
        <Link className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white" href="/rfq">
          {t("pc_wb_new")}
        </Link>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      {loading ? (
        <div className="py-10 text-center text-sm text-secondary-400">…</div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-secondary-400">{t("pc_wb_empty")}</div>
      ) : (
        <div className="grid gap-3">
          {items.map((p) => (
            <div key={p.id} className="rounded-xl border border-secondary-200 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <Link href={`/rfq/${p.id}`} className="text-sm font-bold text-secondary-900 hover:text-teal-700">{p.titleZh}</Link>
                  <div className="mt-1 text-xs text-secondary-400">{p.reference} · v{p.versionNo}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[p.status] ?? ""}`}>{t(`pc_wb_status_${p.status}`)}</span>
                  {authBadge(p)}
                  {verifyBadges(p)}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {(p.status === "draft" || p.status === "need_info") && (
                  <Link className="rounded-lg border border-secondary-300 px-3 py-1.5 font-semibold text-secondary-600" href={`/settings/rfq/${p.id}/edit`}>
                    {t("pc_wb_edit")}
                  </Link>
                )}
                {(p.status === "submitted" || p.status === "under_review" || p.status === "published") && (
                  <Link className="rounded-lg border border-teal-500 px-3 py-1.5 font-semibold text-teal-700" href={`/settings/rfq/${p.id}/authorization-letter`}>
                    {t("pc_wb_letter")}
                  </Link>
                )}
                {p.status === "published" && (
                  <Link className="rounded-lg border border-secondary-300 px-3 py-1.5 font-semibold text-secondary-600" href={`/settings/rfq/${p.id}/matches`}>
                    {t("pc_wb_matches")}
                  </Link>
                )}
                {p.status !== "closed" && (
                  <button type="button" onClick={() => onWithdraw(p.id)} className="rounded-lg border border-red-200 px-3 py-1.5 font-semibold text-red-600">
                    {t("pc_wb_withdraw")}
                  </button>
                )}
                <button type="button" onClick={() => void onCopy(p.id)} className="rounded-lg border border-secondary-300 px-3 py-1.5 font-semibold text-secondary-600">
                  {t("pc_copy")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PageClient() {
  return <PageClientInner />;
}
