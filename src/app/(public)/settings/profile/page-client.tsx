"use client";
/**
 * 个人信息设置页客户端
 * @module app/(public)/settings/profile/page-client
 * @description 登录守卫：未登录展示"请先登录"引导（派发 require-login 打开登录弹窗），
 *              已登录渲染 ProfileContent（原账号弹窗正文的页面化版本）。
 */
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { emitAppEvent } from "@/core/events";
import { Button } from "@/shared/ui";
import { ProfileContent } from "@/features/auth/components/ProfileContent";

export default function ProfileSettingsClient() {
  const { authUser } = useAuth();
  const { t } = useLocale();

  // 未登录：不自动弹窗（避免 SSR/hydration 副作用），仅渲染引导按钮由用户触发
  if (!authUser) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-4">
        <p className="text-sm text-slate-500">
          {t("settingsProfileNeedLogin") || "查看与修改个人信息需要先登录。"}
        </p>
        <Button
          variant="primary"
          onClick={() => emitAppEvent("supply-os:require-login")}
        >
          {t("settingsProfileGoLogin") || "立即登录"}
        </Button>
      </div>
    );
  }

  return <ProfileContent />;
}
