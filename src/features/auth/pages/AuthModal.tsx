/**
 * 认证弹窗页面
 * Authentication Modal Page
 *
 * @module features/auth/pages/AuthModal
 * @description 认证弹窗壳层：遮罩 + Header + 滚动容器，已登录渲染
 *              AccountPanel，未登录渲染 LoginRegisterForm。
 *              Auth modal shell: overlay + header + scrollable body,
 *              delegating to AccountPanel or LoginRegisterForm.
 */

import { Crown, X } from "lucide-react";
import { useAuth } from "@/core/auth";
import { useLocale } from "@/core/i18n";
import { Modal } from "@/shared/ui";
import { AccountPanel } from "../components/AccountPanel";
import { LoginRegisterForm } from "../components/LoginRegisterForm";

type AuthModalProps = {
  onClose: () => void;
};

export function AuthModal({ onClose }: AuthModalProps) {
  const { t } = useLocale();
  const { authUser } = useAuth();

  return (
    <Modal open onClose={onClose} showClose={false} className="max-w-2xl">
      {/* Header */}
      <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-start -mx-4 md:-mx-6 -mt-4 md:-mt-6 mb-4 md:mb-6 rounded-t-2xl">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black text-teal-300 bg-teal-400/10 border border-teal-400/20 rounded-full px-2 py-1 mb-2">
            <Crown className="w-3.5 h-3.5" />
            {t("authModalBadge")}
          </div>
          <h3 className="text-lg font-extrabold">{t("authModalTitle")}</h3>
          <p className="text-xs text-slate-400 mt-1">
            {t("authModalDesc")}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white ml-2">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="overflow-y-auto max-h-[60vh]">
        {authUser ? (
          <AccountPanel onClose={onClose} />
        ) : (
          <LoginRegisterForm onSuccess={onClose} />
        )}
      </div>
    </Modal>
  );
}

export default AuthModal;
