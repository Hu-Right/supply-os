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

const STRATEGY_HINT: Record<PreviewData["strategy"], string> = {
  category: "按品目匹配到以下供应商",
  region: "未匹配到精确品目，按地域粗筛出以下供应商",
  explicit: "按指定名单",
};

export function InvitePanel({ rfqId, visibility }: { rfqId: number; visibility: string }) {
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
      setError((err as Error).message || "预览失败");
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
      setError((err as Error).message || "邀约失败");
      setPhase("preview");
    }
  };

  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-secondary-800">邀约匹配供应商报价</p>
          <p className="text-xs text-secondary-400 mt-0.5">
            按品目与地域匹配认证供应商，邮件邀约{visibility === "targeted" ? "并加入定向白名单" : "触达"}（发送前可先预览）
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
            {phase === "loading" ? "匹配中…" : phase === "preview" ? "已预览" : "预览可邀约供应商"}
          </Button>
        )}
      </div>

      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

      {(phase === "preview" || phase === "sending") && preview && (
        <div className="mt-4 rounded-xl border border-secondary-100 bg-secondary-50/50 p-3 space-y-3">
          <p className="text-xs text-secondary-600">
            {STRATEGY_HINT[preview.strategy]}：<span className="font-bold">{preview.total}</span> 家
            {preview.total === 0 && "（暂无可邀约的匹配供应商，可稍后再试或调整需求品类）"}
          </p>
          {preview.candidates.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {preview.candidates.map((c, i) => (
                <li
                  key={`${c.company}-${i}`}
                  className="px-2.5 py-1 rounded-lg bg-white border border-secondary-100 text-xs text-secondary-700"
                >
                  {c.company || "未命名供应商"}
                  {preview.strategy === "category" && c.matchCount > 0 && (
                    <span className="ml-1 text-primary-600 font-semibold">· 匹配 {c.matchCount}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {preview.total > 0 && (
            <Button size="sm" onClick={doSend} disabled={phase === "sending"}>
              {phase === "sending" ? "发送中…" : `确认邀约 ${preview.total} 家`}
            </Button>
          )}
        </div>
      )}

      {phase === "done" && result && (
        <p className="mt-3 text-xs text-teal-700">
          已发出邀约 {result.emailed} 家
          {result.skipped > 0 && `（${result.skipped} 家此前已触达，跳过）`}
          {visibility === "targeted" && `，已加入定向白名单 ${result.invited} 家`}
        </p>
      )}
    </Card>
  );
}
