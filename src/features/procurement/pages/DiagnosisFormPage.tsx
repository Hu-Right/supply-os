/**
 * 供应商投标能力诊断 v2 —— 独立表单页
 * Supplier Bid-Capability Diagnosis v2 — standalone form page
 *
 * @module features/procurement/pages/DiagnosisFormPage
 * @description 登录后填写；已有记录先列出来让人选一条改（规范 N5 的回显侧），
 *              而不是再填一份新的。提交成功直接出 10 维度报告，并挂「补全企业资料并认领」
 *              的去设置页钩子（规范 N2：企业资料不在本页编辑）。
 *              未登录时本页只出示登录引导——真正的写入闸门在 API（规范 N4），这里只是体验。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { emitAppEvent } from "@/core/events";
import { CheckCircle2, Download, Loader2, Pencil, Send } from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { Button, Input } from "@/shared/ui";
import { downloadDiagnosisReport, fetchMyDiagnoses, type DiagnosisCandidate, type MyDiagnosis } from "@/shared/api/diagnosis";
import { useDiagnosisForm } from "@/shared/forms/useDiagnosisForm";
import { DiagnosisFormFields } from "@/shared/forms/DiagnosisFormFields";
import { DiagnosisCompanyDialog } from "@/shared/forms/DiagnosisCompanyDialog";

function Gate({ t, onLogin }: { t: (k: string) => string; onLogin: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-black text-slate-900">{t("diagGateTitle")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{t("diagGateDesc")}</p>
      <Button className="mt-5" onClick={onLogin}>{t("diagGateCta")}</Button>
    </div>
  );
}

function ResultView({
  t, form, onEditAnother,
}: {
  t: (k: string) => string;
  form: ReturnType<typeof useDiagnosisForm>;
  onEditAnother: () => void;
}) {
  const r = form.result;
  const [downloading, setDownloading] = useState(false);
  if (!r) return null;
  const download = async () => {
    setDownloading(true);
    try {
      await downloadDiagnosisReport(r.id, form.form.company || "company");
    } catch {
      toast.error(t("diagErrorNetwork"));
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-5 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-teal-600" />
        <p className="mt-2 text-base font-black text-slate-900">{t("diagSuccessTitle")}</p>
        <p className="mt-1 text-sm font-bold text-teal-700">
          {r.score_total} / 100 · {r.grade_label}
        </p>
        {r.override_gate.triggered && (
          <p className="mt-2 text-xs text-amber-700">{r.override_gate.reason}</p>
        )}
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {r.dimensions.map((d) => (
          <li key={d.no} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-2xs font-bold text-slate-600">
              {d.no}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800">
                {t(`diagDim${d.no}`)}
              </p>
              <p dir="ltr" className="mt-0.5 text-2xs leading-relaxed text-slate-500">{d.scoringBasis}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-bold text-slate-800">{t("diagNextStepTitle")}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {r.claim_required ? t("diagNextStepClaim") : t("diagNextStepProfile")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="cta" loading={downloading} onClick={download}>
            <Download className="h-3.5 w-3.5" /> {t("diagDownloadReport")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.location.assign("/settings/enterprise")}>
            {t("diagGoEnterprise")}
          </Button>
          <Button size="sm" variant="outline" onClick={onEditAnother}>{t("diagEditAnother")}</Button>
        </div>
      </div>
    </div>
  );
}

export default function DiagnosisFormPage() {
  const { t } = useLocale();
  const { authUser, authReady, isAuthLoading } = useAuth();
  const form = useDiagnosisForm();
  const [mine, setMine] = useState<MyDiagnosis[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  const goLogin = useCallback(() => {
    // 本项目没有登录路由（全站登录是 (public)/layout-shell 里的全局 AuthModal 弹窗），
    // 而 router.push("/auth/login") 会直接 404。改派 require-login 事件开弹窗：
    // 登录成功后 AuthContext 的 user 变化会让本页面重渲染，Gate 自动切到表单，
    // 用户全程没离开过诊断页——不需要也不存在 redirect 参数回跳机制。
    emitAppEvent("supply-os:require-login");
  }, []);

  useEffect(() => {
    if (!authReady || !authUser) return;
    let cancelled = false;
    setLoadingMine(true);
    fetchMyDiagnoses()
      .then((list) => { if (!cancelled) setMine(list); })
      .catch(() => { /* 列表拉取失败不阻断新填报 */ })
      .finally(() => { if (!cancelled) setLoadingMine(false); });
    return () => { cancelled = true; };
  }, [authReady, authUser]);

  const missingSet = useMemo(() => new Set(form.missingRequired), [form.missingRequired]);

  const startEdit = (item: MyDiagnosis) => {
    form.loadForEdit({ company: item.company_name, supplierId: item.supplier_id, answers: item.answers });
    toast.success(t("diagLoadedForEdit"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    const data = await form.submit();
    if (data) toast.success(t("diagSuccessTitle"));
  };

  if (!authReady || isAuthLoading) {
    return (
      <div className="flex items-center justify-center px-4 py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!authUser) return <Gate t={t} onLogin={goLogin} />;

  if (form.result) return <div className="mx-auto max-w-3xl px-4 py-8"><ResultView t={t} form={form} onEditAnother={form.reset} /></div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-black text-slate-900">{t("diagTitle")}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{t("diagDesc")}</p>

      {/* 已有诊断：优先引导"改现有的"，这正是止住同主体重复堆积的地方 */}
      {mine.length > 0 && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-bold text-slate-800">{t("diagMineTitle")}</p>
          <ul className="mt-2.5 space-y-2">
            {mine.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p dir="ltr" className="truncate text-sm font-semibold text-slate-700">{item.company_name}</p>
                  <p className="text-2xs text-slate-500">
                    {item.score_total ?? "-"} / 100 · {new Date(item.submitted_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("diagDownloadReport")}
                    onClick={() => {
                      downloadDiagnosisReport(item.id, item.company_name).catch(() => toast.error(t("diagErrorNetwork")));
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => startEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" /> {t("diagEdit")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {loadingMine && <p className="mt-2 text-2xs text-slate-400">{t("diagLoading")}</p>}
        </section>
      )}

      {/* 主体确认区 */}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-2 block text-sm font-bold text-slate-700" htmlFor="diag-company">
          {t("diagCompanyLabel")}<span className="ml-0.5 text-rose-500">*</span>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="diag-company"
            value={form.form.company}
            onChange={(e) => form.setCompany(e.target.value)}
            placeholder={t("diagCompanyPh")}
            className="flex-1"
          />
          <Button variant="secondary" onClick={form.checkCompany} loading={form.checking}>
            {t("diagCheckCompany")}
          </Button>
        </div>
        {form.form.supplierId && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1.5 text-2xs font-semibold text-teal-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("diagSubjectConfirmed")}：{form.form.company}
          </p>
        )}
        {form.noMatch && !form.form.supplierId && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-2xs leading-relaxed text-amber-700">
            {t("diagNoMatch")}
          </p>
        )}
      </section>

      <div className="mt-5">
        <DiagnosisFormFields
          answers={form.form.answers}
          missing={form.missingRequired}
          t={t}
          onSingle={form.setAnswer}
          onToggleMulti={form.toggleMulti}
        />
      </div>

      {form.error && (
        <p className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700" dir="ltr">
          {form.error.i18nKey ? t(form.error.i18nKey) : form.error.message}
          {form.error.missing?.length ? `（${form.error.missing.length}）` : ""}
        </p>
      )}
      {missingSet.size > 0 && form.error?.missing && (
        <p className="mt-2 text-2xs text-slate-500">{t("diagMissingCount")} {form.error.missing.length}</p>
      )}

      <div className="sticky bottom-0 mt-6 border-t border-slate-200 bg-white/95 py-4 backdrop-blur">
        <Button className="w-full gap-2" size="lg" onClick={handleSubmit} loading={form.submitting}>
          <Send className="h-4 w-4" /> {t("diagSubmit")}
        </Button>
        <p className="mt-2 text-center text-2xs text-slate-400">{t("diagSubmitHint")}</p>
      </div>

      <DiagnosisCompanyDialog
        open={form.dialogOpen}
        candidates={form.candidates}
        t={t}
        onClose={form.closeDialog}
        onConfirm={(c: DiagnosisCandidate) => form.confirmCandidate(c)}
        onNotMine={form.declareNotMine}
      />
    </div>
  );
}
