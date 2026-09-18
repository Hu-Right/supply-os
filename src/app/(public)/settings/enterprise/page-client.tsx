"use client";
/**
 * 企业信息设置页客户端（独立 tab）
 * @module app/(public)/settings/enterprise/page-client
 * @description 登录守卫 + 企业信息「展示表格 ↔ 表格式编辑」切换。
 *              数据源 supplier 企业表（GET /api/user/enterprise）；
 *              编辑保存 PUT（已绑定更新该行）/ POST（未绑定新建并绑定）。
 *              与诊断/审核链路（SupplierRegisterModal）完全剥离。
 */
import { useState } from "react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { api } from "@/core/http";
import { Button } from "@/shared/ui";
import { Clock, AlertTriangle, ShieldAlert } from "lucide-react";
import { useClaimExpiry } from "@/shared/hooks/useClaimExpiry";
import { EnterpriseInfoCard } from "@/features/auth/components/EnterpriseInfoCard";
import { EnterpriseEditForm } from "@/features/auth/components/EnterpriseEditForm";
import { useEnterpriseInfo } from "@/features/auth/hooks/useEnterpriseInfo";
import { useHasSupplierPool } from "@/features/procurement/hooks/useHasSupplierPool";

const btnBlue = "px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0";

export default function EnterpriseSettingsClient() {
  const { authUser } = useAuth();
  const { t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const enterprise = useEnterpriseInfo();
  const { hasPool, loading: poolLoading } = useHasSupplierPool(authUser?.id);
  const { claimExpiry, countdown } = useClaimExpiry(
    authUser?.id,
    enterprise.enterprise?.id ? Number(enterprise.enterprise.id) : undefined,
    enterprise.bound,
  );

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

  // 互斥锁定：已添加供应商到资源库 → 企业信息页不可访问
  if (!poolLoading && hasPool && !enterprise.bound) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-bold text-amber-800 mb-1">
          {t("enterprisePoolDenied") || "您已建立供应商资源库，企业信息页不再可用"}
        </p>
        <p className="text-2xs text-amber-600">
          {t("enterprisePoolDeniedHint") || "外贸员身份与企业身份互斥。如需切换，请先清空供应商资源库。"}
        </p>
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
