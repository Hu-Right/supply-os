"use client";
/**
 * 企业信息设置页客户端（独立 tab）
 * @module app/(public)/settings/enterprise/page-client
 * @description 登录守卫 + 企业信息卡（数据源 crm_suppliers 企业表，经
 *              useEnterpriseInfo → GET /api/user/enterprise）。未绑定可打开
 *              供应商注册弹窗完成绑定。
 */
import { useState } from "react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { Button } from "@/shared/ui";
import { EnterpriseInfoCard } from "@/features/auth/components/EnterpriseInfoCard";
import { useEnterpriseInfo } from "@/features/auth/hooks/useEnterpriseInfo";
import { SupplierRegisterModal } from "@/features/supplier/components/SupplierRegisterModal";

export default function EnterpriseSettingsClient() {
  const { authUser } = useAuth();
  const { t } = useLocale();
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const enterprise = useEnterpriseInfo();

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

  return (
    <>
      <div className="space-y-7 w-full">
        <section>
          <h2 className="text-sm font-medium text-foreground mb-3">
            {t("authEnterpriseTitle") || "企业信息"}
          </h2>
          <EnterpriseInfoCard
            enterprise={enterprise.enterprise}
            linkStatus={enterprise.linkStatus}
            loading={enterprise.loading}
            error={enterprise.error}
            onRetry={enterprise.retry}
            onBind={() => setShowRegisterModal(true)}
          />
        </section>
      </div>

      {showRegisterModal && (
        <SupplierRegisterModal
          onClose={() => setShowRegisterModal(false)}
          onRegistered={() => {
            setShowRegisterModal(false);
            enterprise.retry();
          }}
        />
      )}
    </>
  );
}
