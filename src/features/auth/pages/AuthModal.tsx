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
import { useScrollLock } from "@/shared/ui";
import { AccountPanel } from "../components/AccountPanel";
import { LoginRegisterForm } from "../components/LoginRegisterForm";

type AuthModalProps = {
  onClose: () => void;
};

export function AuthModal({ onClose }: AuthModalProps) {
  const { t } = useLocale();
  const { authUser } = useAuth();
  // 弹窗打开期间锁定背景滚动
  useScrollLock();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-start">
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
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[calc(90vh-88px)]">
          {authUser ? (
            <AccountPanel onClose={onClose} />
          ) : (
            <LoginRegisterForm onSuccess={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthModal;
