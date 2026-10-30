"use client";

/**
 * 采购方「邀约匹配供应商报价」面板
 *
 * @module features/rfq/components/InvitePanel
 * @description 仅创建者在已发布需求上可见。两步式（外发需人工放行）：
 *              预览→展示将触达的策略与供应商名单（脱敏，仅公司名+匹配度）；
 *              确认发送→邮件邀约，targeted 需求同时写入报价白名单。
 *              沿用详情页中文直写风格（非 t() 命名空间）。
 */
import { useState } from "react";
import { api } from "@/core/http";
import { useLocale } from "@/core/i18n";
import { Button, Card } from "@/shared/ui";

interface Candidate {
  company: string;
  matchCount: number;
}
interface PreviewData {
  strategy: "category" | "region" | "explicit";
  total: number;
  candidates: Candidate[];
}
interface SendData {
  emailed: number;
  skipped: number;
  invited: number;
}

/** 策略提示文案的 i18n 键（按匹配策略） */
const STRATEGY_HINT: Record<PreviewData["strategy"], string> = {
  category: "rfqInviteStrategyCategory",
  region: "rfqInviteStrategyRegion",
  explicit: "rfqInviteStrategyExplicit",
};

export function InvitePanel({ rfqId, visibility }: { rfqId: number; visibility: string }) {
  const { t } = useLocale();
  const [phase, setPhase] = useState<"idle" | "loading" | "preview" | "sending" | "done">("idle");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<SendData | null>(null);
  const [error, setError] = useState("");

  const loadPreview = async () => {
    setPhase("loading");
    setError("");
    try {
      const res = await api<PreviewData>(`/api/rfq/${rfqId}/invite`, {
        method: "POST",
        body: { action: "preview" },
      });
      setPreview(res);
      setPhase("preview");
    } catch (err) {
      setError((err as Error).message || t("rfqInviteErrPreview"));
      setPhase("idle");
    }
  };

  const doSend = async () => {
    setPhase("sending");
    setError("");
    try {
      const res = await api<SendData>(`/api/rfq/${rfqId}/invite`, {
        method: "POST",
        body: { action: "send" },
      });
      setResult(res);
      setPhase("done");
    } catch (err) {
      setError((err as Error).message || t("rfqInviteErrSend"));
      setPhase("preview");
    }
  };

  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-secondary-800">{t("rfqInviteTitle")}</p>
          <p className="text-xs text-secondary-400 mt-0.5">
            {visibility === "targeted" ? t("rfqInviteDescTargeted") : t("rfqInviteDescPublic")}
          </p>
        </div>
        {phase !== "done" && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={loadPreview}
            disabled={phase === "loading" || phase === "preview" || phase === "sending"}
          >
            {phase === "loading" ? t("rfqInvitePreviewing") : phase === "preview" ? t("rfqInvitePreviewed") : t("rfqInvitePreview")}
          </Button>
        )}
      </div>

      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

      {(phase === "preview" || phase === "sending") && preview && (
        <div className="mt-4 rounded-xl border border-secondary-100 bg-secondary-50/50 p-3 space-y-3">
          <p className="text-xs text-secondary-600">
            {t("rfqInviteMatchedPrefix", { hint: t(STRATEGY_HINT[preview.strategy]) })}<span className="font-bold">{preview.total}</span>{t("rfqInviteMatchedSuffix")}
            {preview.total === 0 && t("rfqInviteNoCandidates")}
          </p>
          {preview.candidates.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {preview.candidates.map((c, i) => (
                <li
                  key={`${c.company}-${i}`}
                  className="px-2.5 py-1 rounded-lg bg-white border border-secondary-100 text-xs text-secondary-700"
                >
                  {c.company || t("rfqUnnamedSupplier")}
                  {preview.strategy === "category" && c.matchCount > 0 && (
                    <span className="ml-1 text-primary-600 font-semibold">{t("rfqInviteMatchCount", { count: c.matchCount })}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {preview.total > 0 && (
            <Button size="sm" onClick={doSend} disabled={phase === "sending"}>
              {phase === "sending" ? t("rfqInviteSending") : t("rfqInviteConfirm", { count: preview.total })}
            </Button>
          )}
        </div>
      )}

      {phase === "done" && result && (
        <p className="mt-3 text-xs text-teal-700">
          {t("rfqInviteDoneMain", { count: result.emailed })}
          {result.skipped > 0 && t("rfqInviteDoneSkipped", { count: result.skipped })}
          {visibility === "targeted" && t("rfqInviteDoneWhitelisted", { count: result.invited })}
        </p>
      )}
    </Card>
  );
}
