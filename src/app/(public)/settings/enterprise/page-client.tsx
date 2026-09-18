"use client";
/**
 * 企业信息设置页客户端（独立 tab）
 * @module app/(public)/settings/enterprise/page-client
 * @description 登录守卫 + 企业信息「展示表格 ↔ 表格式编辑」切换。
 *              数据源 supplier 企业表（GET /api/user/enterprise）；
 *              编辑保存 PUT（已绑定更新该行）/ POST（未绑定新建并绑定）。
 *              与诊断/审核链路（SupplierRegisterModal）完全剥离。
 */
import { useState, useEffect } from "react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { api } from "@/core/http";
import { Button } from "@/shared/ui";
import { Clock, AlertTriangle } from "lucide-react";
import { EnterpriseInfoCard } from "@/features/auth/components/EnterpriseInfoCard";
import { EnterpriseEditForm } from "@/features/auth/components/EnterpriseEditForm";
import { useEnterpriseInfo } from "@/features/auth/hooks/useEnterpriseInfo";

const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0";

export default function EnterpriseSettingsClient() {
  const { authUser } = useAuth();
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const enterprise = useEnterpriseInfo();

  // 认领过期倒计时
  const [claimExpiry, setClaimExpiry] = useState<string | null>(null);
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    // 获取当前用户的认领过期时间
    if (!authUser?.id || !enterprise.bound || !enterprise.enterprise?.id) return;
    (async () => {
      try {
        const res: { data?: { expires_at?: string } } = await api("/api/supplier-claims?supplier_id=" + enterprise.enterprise!.id);
        if (res.data?.expires_at) {
          setClaimExpiry(res.data.expires_at);
        }
      } catch {
        // 忽略
      }
    })();
  }, [authUser?.id, enterprise.bound, enterprise.enterprise?.id]);

  useEffect(() => {
    if (!claimExpiry) return;
    const timer = setInterval(() => {
      const diff = new Date(claimExpiry).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown("已过期");
        clearInterval(timer);
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setCountdown(`${days}天 ${hours}小时 ${mins}分钟`);
    }, 60000);
    // 立即执行一次
    const diff = new Date(claimExpiry).getTime() - Date.now();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    setCountdown(`${days}天 ${hours}小时 ${mins}分钟`);
    return () => clearInterval(timer);
  }, [claimExpiry]);

  // 未登录：登录引导
  if (!authUser) {
    return (
      <div className="bg-secondary-50 border border-border rounded-xl p-10 text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("settingsProfileNeedLogin") || "查看企业信息需要先登录。"}
        </p>
        <Button variant="primary" onClick={() => emitAppEvent("supply-os:require-login")}>
          {t("settingsProfileGoLogin") || "立即登录"}
        </Button>
      </div>
    );
  }

  const handleSubmit = async (values: Record<string, string>) => {
    setSaving(true);
    setMessage(null);
    try {
      if (enterprise.bound) {
        await api("/api/user/enterprise", { method: "PUT", body: values });
      } else {
        await api("/api/user/enterprise", { method: "POST", body: values });
      }
      setEditing(false);
      enterprise.retry();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : (t("authEnterpriseSaveFailed") || "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 w-full">
      {/* 头部：标题 + 操作按钮（视图态） */}
      {!editing && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-foreground">
            {t("authEnterpriseTitle") || "企业信息"}
          </h2>
          <button type="button" className={btnBlue} onClick={() => setEditing(true)}>
            {enterprise.bound
              ? (t("authEnterpriseEdit") || "编辑")
              : (t("authEnterpriseFill") || "填写企业信息")}
          </button>
        </div>
      )}

      {message && (
        <p className="text-xs font-medium text-danger-600 bg-danger-50 border border-danger-200 rounded-lg p-3">
          {message}
        </p>
      )}

      {/* 认领过期倒计时横幅 */}
      {claimExpiry && countdown && countdown !== "已过期" && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-medium">认领待完善</span>
          <span className="text-xs text-amber-600">请在 <strong>{countdown}</strong> 内完善企业信息并上传营业执照，逾期将自动解除绑定</span>
        </div>
      )}
      {countdown === "已过期" && (
        <div className="flex items-center gap-2 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700">
          <Clock className="w-4 h-4 shrink-0" />
          <span>认领已过期，绑定已自动解除。如需绑定请重新认领。</span>
        </div>
      )}

      {editing ? (
        <EnterpriseEditForm
          initial={enterprise.enterprise}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(false)}
          licenseUrl={enterprise.enterprise?.license_url ? String(enterprise.enterprise.license_url) : null}
        />
      ) : (
        <EnterpriseInfoCard
          enterprise={enterprise.enterprise}
          linkStatus={enterprise.linkStatus}
          loading={enterprise.loading}
          error={enterprise.error}
          onRetry={enterprise.retry}
          onBind={() => setEditing(true)}
        />
      )}
    </div>
  );
}
