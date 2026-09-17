/**
 * 认证弹窗页面
 * Authentication Modal Page
 *
 * @module features/auth/pages/AuthModal
 * @description 认证弹窗壳层：深色头部 + 滚动容器。账户管理已迁移至
 *              /settings/profile 页面，本弹窗仅承载未登录态的登录/注册
 *              （LoginRegisterForm）。已登录用户不应再打开本弹窗（守卫返回 null）。
 *              使用 FormModal 外壳消除深色头部样板代码。
 */

import { Crown } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { FormModal } from "@/shared/ui";
import { LoginRegisterForm } from "../components/LoginRegisterForm";

type AuthModalProps = {
  onClose: () => void;
  /** 登录/注册成功回调（默认同 onClose；设置中心场景可传入"关闭+重定向"） */
  onSuccess?: () => void;
  /** 初始模式：扫码推广场景直接落在注册 Tab */
  initialMode?: "login" | "register";
  /** 是否允许点击遮罩层关闭（默认 true） */
  closeOnBackdrop?: boolean;
};

export function AuthModal({ onClose, onSuccess, initialMode, closeOnBackdrop }: AuthModalProps) {
  const { t } = useLocale();
  const { authUser } = useAuth();

  // 守卫：已登录用户不再通过弹窗管理账户（应跳转 /settings/profile）
  if (authUser) return null;

  return (
    <FormModal
      open
      onClose={onClose}
      closeOnBackdrop={closeOnBackdrop}
      className="max-w-2xl"
      headerAlign="start"
      headerClassName="px-5 py-4"
      title={t("authModalTitle")}
      subtitle={t("authModalDesc")}
      headerExtra={
        <div className="inline-flex items-center gap-1.5 text-2xs font-black text-teal-300 bg-teal-400/10 border border-teal-400/20 rounded-full px-2 py-1 mb-2">
          <Crown className="w-3.5 h-3.5" />
          {t("authModalBadge")}
        </div>
      }
      submitted={false}
      successView={null}
      bodyClassName="overflow-y-auto max-h-[60vh]"
    >
      <LoginRegisterForm onSuccess={onSuccess ?? onClose} initialMode={initialMode} />
    </FormModal>
  );
}

export default AuthModal;
