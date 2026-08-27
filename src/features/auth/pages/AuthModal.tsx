/**
 * 认证弹窗页面
 * Authentication Modal Page
 *
 * @module features/auth/pages/AuthModal
 * @description 认证弹窗壳层：深色头部 + 滚动容器，已登录渲染
 *              AccountPanel，未登录渲染 LoginRegisterForm。
 *              使用 FormModal 外壳消除深色头部样板代码。
 */

import { Crown } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { FormModal } from "@/shared/ui";
import { AccountPanel } from "../components/AccountPanel";
import { LoginRegisterForm } from "../components/LoginRegisterForm";

type AuthModalProps = {
  onClose: () => void;
};

export function AuthModal({ onClose }: AuthModalProps) {
  const { t } = useLocale();
  const { authUser } = useAuth();

  return (
    <FormModal
      open
      onClose={onClose}
      className="max-w-2xl"
      headerAlign="start"
      headerClassName="px-5 py-4"
      title={t("authModalTitle")}
      subtitle={t("authModalDesc")}
      headerExtra={
        <div className="inline-flex items-center gap-1.5 text-[10px] font-black text-teal-300 bg-teal-400/10 border border-teal-400/20 rounded-full px-2 py-1 mb-2">
          <Crown className="w-3.5 h-3.5" />
          {t("authModalBadge")}
        </div>
      }
      submitted={false}
      successView={null}
      bodyClassName="overflow-y-auto max-h-[60vh]"
    >
      {authUser ? (
        <AccountPanel onClose={onClose} />
      ) : (
        <LoginRegisterForm onSuccess={onClose} />
      )}
    </FormModal>
  );
}

export default AuthModal;
