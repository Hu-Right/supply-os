/**
 * 昵称编辑组件
 * Nickname Editor Component
 *
 * @module features/auth/components/NicknameEditor
 * @description 账号面板中的对外展示名（昵称）管理块：展示当前昵称 + 行内编辑保存。
 *              与 PhoneBinding/EmailBinding 同构（逻辑在 useNicknameEditor hook）。
 */
import { UserPen } from "lucide-react";
import { Button, Input } from "@/shared/ui";
import { useNicknameEditor } from "../hooks/useNicknameEditor";

export function NicknameEditor() {
  const {
    t, view, setView, draft, setDraft, loading, message, isError,
    currentNickname, handleEdit, handleSave,
  } = useNicknameEditor();

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <UserPen className="w-4 h-4 text-teal-600" />
        <h4 className="text-sm font-extrabold text-slate-900">{t("authNicknameTitle") || "昵称"}</h4>
      </div>

      {view === "idle" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            {t("authNicknameCurrent") || "当前昵称"}: <span className="font-bold text-slate-900">{currentNickname || "-"}</span>
          </p>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {t("authNicknameHint") || "昵称是对外展示名，不会公开您的真实姓名"}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            className="bg-white gap-1"
          >
            <UserPen className="w-3 h-3" />
            {t("authNicknameEdit") || "修改昵称"}
          </Button>
        </div>
      )}

      {view === "editing" && (
        <div className="space-y-3">
          <Input
            type="text"
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("authNicknamePlaceholder") || "请输入昵称（1-40 个字符）"}
            className="bg-white"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={loading}
              onClick={handleSave}
              className="py-2 text-xs font-black"
            >
              {loading ? (t("authNicknameSaving") || "保存中…") : (t("authNicknameSave") || "保存")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setView("idle")}
              className="bg-white"
            >
              {t("authNicknameCancel") || "取消"}
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p className={`text-xs font-bold rounded-lg p-2.5 border ${isError ? "text-rose-700 bg-rose-50 border-rose-200" : "text-emerald-700 bg-emerald-50 border-emerald-200"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
