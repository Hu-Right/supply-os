// i18n-allow-file: 两步验证设置（一期仅中文，后续接入 i18n 7 语）
/**
 * 两步验证（TOTP 验证器）设置行 + 绑定/关闭弹窗
 *
 * 账号级开关，不做多租户/组织策略：一个账号一行 user_mfa。
 * 开启流程：生成密钥 → 扫码/手动输入 → 输入 6 位动态码验证 → 展示一次性恢复码。
 * 关闭流程：当前动态码或一枚恢复码。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Copy, KeyRound, Loader2 } from "lucide-react";
import { api } from "@/core/http";
import { Badge, Button, Input, Modal } from "@/shared/ui";

type MfaStatus = { enabled: boolean; recoveryCodesLeft: number };
type SetupResult = { secret: string; otpauthUri: string; qrDataUrl: string };

export function MfaSettings() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"setup" | "recovery" | "disable" | null>(null);
  const [setup, setSetup] = useState<SetupResult | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<MfaStatus>("/api/auth/mfa/status");
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const openSetup = async () => {
    setError("");
    setCode("");
    setSubmitting(true);
    try {
      const data = await api<SetupResult>("/api/auth/mfa/setup", { method: "POST" });
      setSetup(data);
      setModal("setup");
    } catch {
      setError("发起绑定失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEnable = async () => {
    setError("");
    if (!/^\d{6}$/.test(code.trim())) {
      setError("请输入验证器 App 中的 6 位动态码");
      return;
    }
    setSubmitting(true);
    try {
      const data = await api<{ success: boolean; recoveryCodes: string[] }>("/api/auth/mfa/enable", {
        method: "POST",
        body: { code: code.trim() },
      });
      setRecoveryCodes(data.recoveryCodes);
      setModal("recovery");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证失败，请确认动态码");
    } finally {
      setSubmitting(false);
    }
  };

  const submitDisable = async () => {
    setError("");
    if (code.trim().length < 6) {
      setError("请输入动态码或恢复码");
      return;
    }
    setSubmitting(true);
    try {
      await api("/api/auth/mfa/disable", { method: "POST", body: { code: code.trim() } });
      setModal(null);
      setCode("");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "关闭失败，请确认动态码");
    } finally {
      setSubmitting(false);
    }
  };

  const copyRecovery = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    } catch {
      /* 复制失败不阻断 */
    }
  };

  return (
    <>
      {/* 设置行 */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600"><KeyRound className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            两步验证
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <Badge variant={status?.enabled ? "soft-success" : "soft-neutral"} shape="tag">
                {status?.enabled ? "已开启" : "未开启"}
              </Badge>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {status?.enabled
              ? `登录时需要验证器 App 的动态码；恢复码剩余 ${status.recoveryCodesLeft} 个`
              : "使用 Google / Microsoft Authenticator 等验证器 App，登录时除密码外再验一次动态码。"}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {status?.enabled ? (
            <Button variant="outline" size="sm" onClick={() => { setCode(""); setError(""); setModal("disable"); }}>
              关闭两步验证
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => void openSetup()} disabled={submitting || loading}>
              开启两步验证
            </Button>
          )}
        </div>
      </div>

      {/* 绑定流程 */}
      <Modal open={modal === "setup"} onClose={() => setModal(null)} title="绑定验证器 App" className="max-w-md">
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            1. 用验证器 App 扫描下方二维码（或手动输入密钥）；<br />
            2. 输入 App 中显示的 6 位动态码完成绑定。
          </p>
          {setup && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-white p-3">
              <img src={setup.qrDataUrl} alt="两步验证二维码" width={200} height={200} />
              <p className="break-all text-center font-mono text-[11px] text-muted-foreground">密钥：{setup.secret}</p>
            </div>
          )}
          <label className="block text-xs">
            <span className="mb-1 block font-semibold text-foreground">6 位动态码</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="例如 123456" autoFocus />
          </label>
          {error && <p className="rounded-lg bg-danger-50 px-2 py-1.5 text-[11px] font-semibold text-danger-700">{error}</p>}
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => void submitEnable()} disabled={submitting}>
              {submitting ? "验证中…" : "验证并开启"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setModal(null)}>取消</Button>
          </div>
        </div>
      </Modal>

      {/* 恢复码 */}
      <Modal open={modal === "recovery"} onClose={() => setModal(null)} title="两步验证已开启" className="max-w-md">
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-success-700"><BadgeCheck className="h-4 w-4" />请保存以下恢复码（仅显示一次）</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">手机丢失或换设备时，用其中任意一枚恢复码登录；每枚只能使用一次。</p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-secondary-50 p-3">
            {recoveryCodes.map((c) => (
              <code key={c} className="rounded-md bg-white px-2 py-1 text-center font-mono text-xs text-foreground">{c}</code>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => void copyRecovery()}><Copy className="h-4 w-4" />复制恢复码</Button>
            <Button variant="primary" className="flex-1" onClick={() => setModal(null)}>我已保存</Button>
          </div>
        </div>
      </Modal>

      {/* 关闭 */}
      <Modal open={modal === "disable"} onClose={() => setModal(null)} title="关闭两步验证" className="max-w-md">
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted-foreground">关闭后登录只校验密码，账号安全性会下降。请输入当前动态码或一枚恢复码确认。</p>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 位动态码或恢复码" autoFocus />
          {error && <p className="rounded-lg bg-danger-50 px-2 py-1.5 text-[11px] font-semibold text-danger-700">{error}</p>}
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => void submitDisable()} disabled={submitting}>
              {submitting ? "提交中…" : "确认关闭"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setModal(null)}>取消</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

