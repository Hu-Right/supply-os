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
    <div className="px-5 py-4">
      {/* 行头：图标 + 标题/当前值 + 右侧操作 */}
      <div className="flex items-center gap-4">
        <span className="w-10 h-10 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
          <UserPen className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{t("authNicknameTitle") || "昵称"}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {view === "idle" ? (currentNickname || "-") : t("authNicknameHint") || "昵称是对外展示名"}
          </p>
        </div>
        {view === "idle" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleEdit}
            className="text-primary-600 hover:text-primary-700 hover:bg-primary-50 gap-1"
          >
            <UserPen className="w-3.5 h-3.5" />
            {t("authNicknameEdit") || "修改"}
          </Button>
        )}
      </div>

      {/* 编辑态：行内展开 */}
      {view === "editing" && (
        <div className="mt-3 sm:pl-14 space-y-2 animate-fade-in">
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
        <p className={`mt-2 sm:pl-14 text-xs font-medium ${isError ? "text-danger-600" : "text-success-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
