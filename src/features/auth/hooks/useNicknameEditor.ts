/**
 * 昵称编辑 Hook
 * Nickname Editor Hook
 *
 * @module features/auth/hooks/useNicknameEditor
 * @description 对外展示名（nickname）的自定义入口：校验 → PUT /api/auth/profile → 刷新认证状态。
 *              真实姓名（display_name）不在此修改（实名一致性走客服通道）。
 */
import { useState } from "react";
import { useLocale } from "@/core/i18n";
import { useAuth } from "@/core/auth";
import { api, ApiError } from "@/core/http";

export type NicknameView = "idle" | "editing";

export interface UseNicknameEditorReturn {
  t: ReturnType<typeof useLocale>["t"];
  view: NicknameView;
  setView: (view: NicknameView) => void;
  draft: string;
  setDraft: (draft: string) => void;
  loading: boolean;
  message: string;
  isError: boolean;
  currentNickname: string;
  handleEdit: () => void;
  handleSave: () => Promise<void>;
}

export function useNicknameEditor(): UseNicknameEditorReturn {
  const { t } = useLocale();
  const { authUser, refreshAuth } = useAuth();

  const [view, setView] = useState<NicknameView>("idle");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const currentNickname = authUser?.nickname || "";

  const handleEdit = () => {
    setDraft(currentNickname);
    setMessage("");
    setIsError(false);
    setView("editing");
  };

  const handleSave = async () => {
    const value = draft.trim();
    if (!value || value.length > 40 || /[<>"'&\\]/.test(value)) {
      setMessage(t("authNicknameInvalid") || "昵称需为 1-40 个字符，且不含特殊符号");
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      await api("/api/auth/profile", {
        method: "PUT",
        body: { nickname: value },
      });
      await refreshAuth();
      setMessage(t("authNicknameSaved") || "昵称已更新");
      setIsError(false);
      setView("idle");
    } catch (err) {
      // 服务端 message 为固定中文（API 错误文案现状不随语言），这里按错误类别
      // 映射为本地化文案，避免英文/俄语等环境透出中文
      if (err instanceof ApiError && err.status === 400) {
        setMessage(t("authNicknameInvalid") || "昵称需为 1-40 个字符，且不含特殊符号");
      } else {
        setMessage(t("authNicknameSaveFailed") || "昵称保存失败，请稍后重试");
      }
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return {
    t,
    view,
    setView,
    draft,
    setDraft,
    loading,
    message,
    isError,
    currentNickname,
    handleEdit,
    handleSave,
  };
}
