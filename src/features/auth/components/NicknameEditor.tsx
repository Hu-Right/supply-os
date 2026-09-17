/**
 * 昵称编辑行 — 智谱行式（实心圆图标 + 右侧实心按钮）
 * Nickname Editor Row
 *
 * @module features/auth/components/NicknameEditor
 * @description 安全设置行：实心品牌圆图标 + 标题/当前值灰描述 + 右侧实心「修改」；
 *              编辑态行内展开输入与保存/取消。逻辑在 useNicknameEditor。
 */
import { UserPen } from "lucide-react";
import { Input } from "@/shared/ui";
import { useNicknameEditor } from "../hooks/useNicknameEditor";

export function NicknameEditor() {
  const {
    t, view, setView, draft, setDraft, loading, message, isError,
    currentNickname, handleEdit, handleSave,
  } = useNicknameEditor();

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-brand-500 text-white flex items-center justify-center shrink-0">
          <UserPen className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{t("authNicknameTitle") || "昵称"}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {view === "idle" ? (currentNickname || "-") : (t("authNicknameHint") || "昵称是对外展示名")}
          </p>
        </div>
        {view === "idle" && (
          <button
            type="button"
            onClick={handleEdit}
            className="px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors shrink-0"
          >
            {t("authNicknameEdit") || "修改"}
          </button>
        )}
      </div>

      {view === "editing" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in">
          <Input
            type="text"
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("authNicknamePlaceholder") || "请输入昵称（1-40 个字符）"}
            className="bg-white max-w-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={handleSave}
              className="px-4 py-1.5 rounded-md bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? (t("authNicknameSaving") || "保存中…") : (t("authNicknameSave") || "保存")}
            </button>
            <button
              type="button"
              onClick={() => setView("idle")}
              className="px-4 py-1.5 rounded-md bg-white border border-border text-xs font-medium text-foreground hover:bg-secondary-50 transition-colors"
            >
              {t("authNicknameCancel") || "取消"}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={`mt-2 sm:pl-14 text-xs font-medium ${isError ? "text-danger-600" : "text-success-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

NicknameEditor.displayName = "NicknameEditor";
