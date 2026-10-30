/**
 * 投标可行性报告面板（详情页「投标材料」Tab）
 *
 * @module features/procurement/components/NoticeDetail/FeasibilityReportPanel
 * @description 读取/生成报告：
 *              - GET 已有报告（不触发生成）；无报告时给「生成」按钮；
 *              - POST 生成（BYOK，30~60s），展示结论/缺口/要求矩阵/待确认项；
 *              - 未认证企业 → 引导去企业认证；未配置 Key / 抽取失败 → 展示错误并允许重试。
 *              报告里「确定性判定」与「AI 建议」分区展示（v0.1 aiAdvice 为空）。
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { api, getAuthToken } from "@/core/http";
import { useLocale } from "@/core/i18n";
import type { Decision, FeasibilityReport, RuleStatus } from "@/lib/services/feasibility-report/types";

interface ReportResponse {
  report: FeasibilityReport | null;
  enterprise: { id: number; name: string } | null;
  stale?: boolean;
}

interface GenerateResponse {
  report: FeasibilityReport;
  cached: boolean;
  enterprise: { id: number; name: string };
  stale?: boolean;
}

const STATUS_TONE: Record<string, string> = {
  satisfied: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  missing: "bg-rose-50 text-rose-700 border-rose-200",
  expired: "bg-rose-50 text-rose-700 border-rose-200",
  unknown: "bg-slate-50 text-slate-600 border-slate-200",
  not_applicable: "bg-slate-50 text-slate-500 border-slate-200",
};

function decisionTone(decision: Decision): string {
  if (decision === "go") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (decision === "no_go") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function statusLabelKey(status: RuleStatus): string {
  switch (status) {
    case "missing":
      return "feasibilityStatusMissing";
    case "expired":
      return "feasibilityStatusExpired";
    case "partial":
      return "feasibilityStatusPartial";
    case "satisfied":
      return "feasibilityStatusSatisfied";
    default:
      return "feasibilityStatusUnknown";
  }
}

export interface FeasibilityReportPanelProps {
  noticePk: number;
  /** 权益已含（bid_feasibility_report）且已解锁时才渲染 */
  enabled: boolean;
}

export function FeasibilityReportPanel({ noticePk, enabled }: FeasibilityReportPanelProps) {
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<FeasibilityReport | null>(null);
  const [enterprise, setEnterprise] = useState<{ id: number; name: string } | null>(null);
  const [stale, setStale] = useState(false);
  const [history, setHistory] = useState<Array<{ id: number; generatedAt: string | null; decision: string | null; score: number | null }> | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<ReportResponse>(`/api/notices/${noticePk}/feasibility-report`);
      setReport(data.report);
      setEnterprise(data.enterprise);
      setStale(data.stale === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load_failed");
    } finally {
      setLoading(false);
    }
  }, [enabled, noticePk]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = useCallback(async (regenerate = false) => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const data = await api<GenerateResponse>(`/api/notices/${noticePk}/feasibility-report`, {
        method: "POST",
        body: regenerate ? { regenerate: true } : undefined,
      });
      setReport(data.report);
      setEnterprise(data.enterprise);
      setStale(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "generate_failed");
    } finally {
      setGenerating(false);
    }
  }, [generating, noticePk]);

  /** 历史版本：按需拉取（不同输入快照/模型版本） */
  const loadHistory = useCallback(async () => {
    if (historyLoading) return;
    setHistoryLoading(true);
    try {
      const data = await api<{ versions: Array<{ id: number; generatedAt: string | null; decision: string | null; score: number | null }> }>(
        `/api/notices/${noticePk}/feasibility-report/history`,
      );
      setHistory(data.versions);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyLoading, noticePk]);

  /** 导出 Word：鉴权路由回 docx 字节，浏览器下载 */
  const exportWord = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/notices/${noticePk}/feasibility-report/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`导出失败（${res.status}）`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `投标可行性报告-${noticePk}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "export_failed");
    } finally {
      setExporting(false);
    }
  }, [exporting, noticePk]);

  if (!enabled) return null;

  return (
    <div className="rounded-2xl border border-teal-100 bg-white p-4 space-y-3" data-testid="feasibility-report">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-900">{t("feasibilityTitle")}</p>
        {report && (
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded border text-2xs font-black ${decisionTone(report.verdict.decision)}`} data-testid="feasibility-decision">
              {t(
                report.verdict.decision === "go"
                  ? "feasibilityDecisionGo"
                  : report.verdict.decision === "no_go"
                    ? "feasibilityDecisionNoGo"
                    : "feasibilityDecisionConditional",
              )}
            </span>
            <button
              type="button"
              onClick={() => void exportWord()}
              disabled={exporting}
              data-testid="feasibility-export"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-2xs font-bold text-slate-600 hover:border-teal-300 hover:text-teal-700 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              {t("feasibilityExportWord")}
            </button>
          </div>
        )}
      </div>

      {loading && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t("feasibilityLoading")}
        </p>
      )}

      {!loading && error && (
        <div className="space-y-2">
          <p className="text-xs text-rose-600 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {t("feasibilityLoadFailed")}
            <span className="text-rose-400 break-all">{error}</span>
          </p>
          <button type="button" onClick={() => void load()} className="text-xs font-bold text-teal-700 hover:underline">
            {t("feasibilityRetry")}
          </button>
        </div>
      )}

      {!loading && !error && !enterprise && (
        <p className="text-xs text-slate-500">
          {t("feasibilityNeedEnterprise")}
          <a href="/settings/enterprise" className="ml-1 font-bold text-teal-700 hover:underline">
            {t("feasibilityGoEnterprise")}
          </a>
        </p>
      )}

      {!loading && !error && enterprise && !report && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            {t("feasibilityEnterpriseHint", { name: enterprise.name }) || `基于「${enterprise.name}」企业档案生成。`}
          </p>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            data-testid="feasibility-generate"
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-black text-white hover:bg-teal-700 disabled:bg-slate-300"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? t("feasibilityGenerating") : t("feasibilityGenerate")}
          </button>
        </div>
      )}

      {!loading && !error && report && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-2xs text-slate-500">
            <span className="font-bold text-slate-700">
              {t("feasibilityScore")}：{Math.round(report.verdict.score * 100)} / 100
            </span>
            <span>
              {t("feasibilityCompleteness")}：{report.meta.dataCompleteness.requirementItems} 项要求 / {report.meta.dataCompleteness.capabilities} 项能力
            </span>
            {report.deterministic.rulesUnknown > 0 && (
              <span className="text-amber-600">
                {t("feasibilityUnknownCount", { count: report.deterministic.rulesUnknown }) || `${report.deterministic.rulesUnknown} 项待确认`}
              </span>
            )}
          </div>

          {stale && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-2xs text-amber-700" data-testid="feasibility-stale">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">{t("feasibilityStale")}</span>
              <button
                type="button"
                onClick={() => void generate(true)}
                disabled={generating}
                data-testid="feasibility-regenerate"
                className="shrink-0 font-black underline underline-offset-2 hover:text-amber-800 disabled:opacity-50"
              >
                {t("feasibilityRegenerate")}
              </button>
            </div>
          )}

          {report.verdict.reasons.length > 0 && (
            <ul className="space-y-1">
              {report.verdict.reasons.map((reason, index) => (
                <li key={index} className="flex items-start gap-1.5 text-xs text-slate-700">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-teal-600 mt-0.5" />
                  <span>{reason.text}</span>
                </li>
              ))}
            </ul>
          )}

          {report.gaps.length > 0 && (
            <div>
              <p className="text-xs font-black text-slate-700 mb-1">{t("feasibilityGaps")}</p>
              <ul className="space-y-1.5">
                {report.gaps.map((gap) => (
                  <li key={gap.requirementId} className="flex items-start gap-2 text-xs">
                    <span className={`shrink-0 px-1.5 py-0.5 rounded border text-2xs font-bold ${STATUS_TONE[gap.status] ?? STATUS_TONE.unknown}`}>
                      {t(statusLabelKey(gap.status))}
                    </span>
                    <span className="text-slate-700 break-words">
                      {gap.title}
                      <span className="text-slate-400"> · {gap.suggest}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.matrix.length > 0 && (
            <div>
              <p className="text-xs font-black text-slate-700 mb-1">{t("feasibilityMatrix")}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-2xs border-collapse" data-testid="feasibility-matrix">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left font-bold py-1 pr-2">{t("feasibilityColRequirement")}</th>
                      <th className="text-left font-bold py-1 pr-2">{t("feasibilityColCapability")}</th>
                      <th className="text-left font-bold py-1">{t("feasibilityColStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.matrix.map((row) => (
                      <tr key={row.requirementId} className="border-t border-slate-100">
                        <td className="py-1 pr-2 text-slate-700">{row.requirement}</td>
                        <td className="py-1 pr-2 text-slate-500">{row.capability}</td>
                        <td className="py-1">
                          <span className={`px-1.5 py-0.5 rounded border font-bold ${STATUS_TONE[row.status] ?? STATUS_TONE.unknown}`}>
                            {t(statusLabelKey(row.status))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.unknowns.length > 0 && (
            <div>
              <p className="text-xs font-black text-amber-700 mb-1 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                {t("feasibilityUnknowns")}
              </p>
              <ul className="space-y-1">
                {report.unknowns.map((item) => (
                  <li key={item.requirementId} className="text-2xs text-amber-700">
                    {item.title}：{item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => void (history === null ? loadHistory() : setHistory(null))}
              data-testid="feasibility-history-toggle"
              className="text-2xs font-bold text-slate-500 hover:text-teal-700"
            >
              {t("feasibilityHistory")}
              {historyLoading ? " …" : ""}
            </button>
            {history !== null && (
              <ul className="mt-1 space-y-1">
                {history.length === 0 && <li className="text-2xs text-slate-400">{t("feasibilityHistoryEmpty")}</li>}
                {history.map((version) => (
                  <li key={version.id} className="flex items-center justify-between gap-2 text-2xs text-slate-500">
                    <span>{version.generatedAt ? version.generatedAt.slice(0, 19).replace("T", " ") : "—"}</span>
                    <span>
                      {version.decision ?? "—"} · {version.score == null ? "—" : `${Math.round(version.score * 100)} / 100`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-2xs text-slate-400 border-t border-slate-100 pt-2">{report.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
